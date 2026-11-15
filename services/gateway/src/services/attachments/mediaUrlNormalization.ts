/**
 * NORMALISER UNE ADRESSE DE MÉDIA VERS SA CLÉ DE STOCKAGE (#7022).
 *
 * #4324 a tranché ce qui se persiste : « la clé de stockage, jamais une
 * adresse : ni hôte, ni préfixe d'API, ni version. Ce sont des décisions de
 * déploiement, et une donnée qui les porte devient fausse dès que l'une
 * d'elles change. » La base ne l'a jamais appliqué rétroactivement — mesuré le
 * 2026-09-18 sur `meeshy-database` :
 *
 * | forme                                                   | MessageAttachment | PostMedia |
 * |---------------------------------------------------------|-------------------|-----------|
 * | `https://gate.meeshy.me/api/v1/attachments/file/<clé>`   | 964               | 636       |
 * | `/api/attachments/file/<clé percent-encodée>`            | 539               | 35        |
 * | `<clé nue>` — la seule forme voulue                      | 673               | 65        |
 *
 * 1600 références sur 2912 (55 %) gravent donc `gate.meeshy.me` dans la
 * donnée. Elles répondent `200` EN PRODUCTION, et c'est ce qui les a tenues
 * invisibles : l'hôte gravé y est le bon. Partout ailleurs — staging, local,
 * les deux coques Capacitor — la base configurée n'est jamais consultée.
 *
 * CE MODULE NE PORTE QUE LA DÉCISION. Il ne lit ni la base ni le disque : les
 * deux lui sont REMIS. C'est ce qui le rend interrogeable ligne à ligne sans
 * environnement, et c'est aussi ce qui garde le script de migration honnête —
 * la règle qu'il applique est celle que les témoins jouent, pas une seconde
 * rédigée dans un fichier de `scripts/`.
 *
 * ET IL NE RÉÉCRIT PAS LA LECTURE DE LA CLÉ : `storageKeyOf` lui est injectée,
 * et le script lui remet `MediaService.relativePathFromUrl` — le site que la
 * passerelle emploie DÉJÀ pour retrouver les octets d'une adresse
 * (`deleteMedia`, `duplicateMedia`). Une seconde lecture divergerait de celle
 * qui EFFACE les fichiers ; c'est la divergence qu'une migration ne peut pas
 * se permettre.
 */

/**
 * LA FORME D'UNE CLÉ DE STOCKAGE — l'arborescence DATÉE que les deux
 * producteurs écrivent : `tus-handler` (`path.join(year, month, userId, nom)`)
 * et `UploadProcessor.generateFilePath`.
 *
 * Elle EXCLUT délibérément les trois arborescences voisines de `/app/uploads`
 * qui ne sont pas des médias d'utilisateur — `translated/` (les pistes TTS de
 * `MessageTranslationService`), `snapshots/` (`MediaService.duplicateMedia`)
 * et `avatars/`. Aucune n'est datée, aucune n'a jamais porté d'adresse absolue,
 * et les réécrire ferait passer une migration pour un ménage.
 *
 * `[^/]` sur chaque segment INTERDIT le remontage (`2026/09/../../etc/passwd`)
 * : la garde de la route de flux existe déjà (`download.ts`), mais un script
 * qui ÉCRIT en base ne doit pas dépendre d'une garde posée en LECTURE — c'est
 * elle qu'on contourne en servant la ligne à un autre consommateur.
 */
export const STORAGE_KEY_SHAPE = /^\d{4}\/\d{2}\/[^/]+\/[^/]+$/;

/**
 * CE QU'IL ADVIENT D'UNE LIGNE. Quatre des cinq verdicts n'écrivent RIEN, et
 * c'est voulu : un script de migration qui devine est un script qui perd des
 * médias. Chaque refus porte sa raison pour que le `--check` la COMPTE plutôt
 * que de la taire.
 */
export type MediaUrlVerdict =
  | { readonly kind: 'déjà-normalisée' }
  | { readonly kind: 'à-normaliser'; readonly key: string }
  | { readonly kind: 'forme-inconnue' }
  | { readonly kind: 'hors-arborescence'; readonly key: string }
  | { readonly kind: 'octets-absents'; readonly key: string };

export function planMediaUrlNormalization(options: {
  readonly value: string;
  readonly storageKeyOf: (value: string) => string | null;
  readonly hasBytes: (key: string) => boolean;
}): MediaUrlVerdict {
  const { value, storageKeyOf, hasBytes } = options;

  const key = storageKeyOf(value);
  if (key === null || key === '') return { kind: 'forme-inconnue' };
  if (!STORAGE_KEY_SHAPE.test(key)) {
    // Une clé HORS arborescence datée peut rester un fichier légitime
    // (`translated/…`, `snapshots/…`) : on la NOMME pour que le `--check` la
    // compte, et on n'y touche pas. Ce qui remonte l'arborescence, en revanche,
    // n'est pas une clé du tout — et lui donner un nom de dossier reviendrait à
    // annoncer un fichier là où il y a une tentative de sortie.
    return isSafeRelativeKey(key) ? { kind: 'hors-arborescence', key } : { kind: 'forme-inconnue' };
  }
  if (key === value) return { kind: 'déjà-normalisée' };
  if (!hasBytes(key)) return { kind: 'octets-absents', key };
  return { kind: 'à-normaliser', key };
}

/** Un chemin RELATIF qui ne sort pas de la racine des dépôts. */
function isSafeRelativeKey(key: string): boolean {
  if (key.startsWith('/') || key.includes('://')) return false;
  return key.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

/**
 * LES DEUX COLONNES QUI PORTENT UNE ADRESSE. La vignette souffre du même mal
 * que le fichier — mesuré le 2026-09-18 : 1184 `thumbnailUrl` absolues et 323
 * en route relative, sur les deux collections. La normaliser dans le même
 * passage évite la migration « à moitié faite » dont personne ne se souvient.
 */
export const MEDIA_URL_FIELDS = ['fileUrl', 'thumbnailUrl'] as const;

export type MediaUrlField = (typeof MEDIA_URL_FIELDS)[number];

export type MediaUrlRow = {
  readonly id: string;
  readonly fileUrl: string;
  readonly thumbnailUrl: string | null;
};

/**
 * LE PORT — trois méthodes, et RIEN de Prisma. Le balayage ne sait pas d'où
 * viennent les lignes ; le script le sait, et c'est là que `tsc` valide les
 * `select`. Un faux Prisma, lui, accepterait n'importe quelle forme de requête
 * et ferait verdir un témoin sur un `select` qui ne compile pas.
 *
 * `list` prend le dernier id rendu et pagine par id croissant — un curseur
 * STABLE, contrairement à un `skip` qui glisserait sous les écritures du
 * passage lui-même.
 */
export type MediaUrlStore = {
  readonly name: string;
  readonly list: (cursor: string | null) => Promise<readonly MediaUrlRow[]>;
  readonly write: (id: string, patch: Readonly<Partial<Record<MediaUrlField, string>>>) => Promise<void>;
};

export type MediaUrlTally = {
  readonly scanned: number;
  readonly alreadyNormalized: number;
  readonly normalized: number;
  readonly missingBytes: number;
  readonly outsideTree: number;
  readonly unknownShape: number;
};

export type MediaUrlSweepReport = MediaUrlTally & {
  readonly parCollection: Readonly<Record<string, MediaUrlTally>>;
  readonly exemples: readonly string[];
};

const TALLY_VIDE: MediaUrlTally = {
  scanned: 0,
  alreadyNormalized: 0,
  normalized: 0,
  missingBytes: 0,
  outsideTree: 0,
  unknownShape: 0,
};

/** Combien d'exemples le `--check` montre — assez pour juger, jamais 3681 lignes. */
const EXEMPLES_MAX = 12;

/**
 * BALAIE LES DEUX COLLECTIONS ET REND LE COMPTE. N'écrit QUE si `apply` est
 * vrai : le mode à blanc est le DÉFAUT, et il parcourt exactement le même
 * chemin — c'est la seule façon que le compte annoncé soit celui qu'une
 * exécution produirait.
 *
 * Les deux colonnes d'une même ligne partent en UNE écriture : deux `update`
 * sur le même document doubleraient le trafic pour rien, et laisseraient une
 * fenêtre où la ligne porte une vignette normalisée sous un fichier qui ne
 * l'est pas.
 */
export async function sweepMediaUrls(options: {
  readonly stores: readonly MediaUrlStore[];
  readonly apply: boolean;
  readonly storageKeyOf: (value: string) => string | null;
  readonly hasBytes: (key: string) => boolean;
  readonly onVerdict?: (entry: { readonly collection: string; readonly id: string; readonly field: MediaUrlField; readonly verdict: MediaUrlVerdict }) => void;
}): Promise<MediaUrlSweepReport> {
  const { stores, apply, storageKeyOf, hasBytes, onVerdict } = options;

  const parCollection: Record<string, MediaUrlTally> = {};
  const exemples: string[] = [];

  for (const store of stores) {
    let tally = TALLY_VIDE;
    let cursor: string | null = null;

    for (;;) {
      const rows: readonly MediaUrlRow[] = await store.list(cursor);
      if (rows.length === 0) break;

      for (const row of rows) {
        tally = { ...tally, scanned: tally.scanned + 1 };
        const patch: Partial<Record<MediaUrlField, string>> = {};

        for (const field of MEDIA_URL_FIELDS) {
          const value = row[field];
          if (value === null || value === '') continue;

          const verdict = planMediaUrlNormalization({ value, storageKeyOf, hasBytes });
          onVerdict?.({ collection: store.name, id: row.id, field, verdict });
          tally = compter(tally, verdict);

          if (verdict.kind === 'à-normaliser') {
            patch[field] = verdict.key;
            if (exemples.length < EXEMPLES_MAX) exemples.push(`${store.name}.${field}  ${value}\n    → ${verdict.key}`);
          }
        }

        if (apply && Object.keys(patch).length > 0) await store.write(row.id, patch);
      }

      const dernier = rows[rows.length - 1];
      if (dernier === undefined) break;
      cursor = dernier.id;
    }

    parCollection[store.name] = tally;
  }

  return { ...Object.values(parCollection).reduce(additionner, TALLY_VIDE), parCollection, exemples };
}

function compter(tally: MediaUrlTally, verdict: MediaUrlVerdict): MediaUrlTally {
  switch (verdict.kind) {
    case 'déjà-normalisée':
      return { ...tally, alreadyNormalized: tally.alreadyNormalized + 1 };
    case 'à-normaliser':
      return { ...tally, normalized: tally.normalized + 1 };
    case 'octets-absents':
      return { ...tally, missingBytes: tally.missingBytes + 1 };
    case 'hors-arborescence':
      return { ...tally, outsideTree: tally.outsideTree + 1 };
    case 'forme-inconnue':
      return { ...tally, unknownShape: tally.unknownShape + 1 };
  }
}

function additionner(a: MediaUrlTally, b: MediaUrlTally): MediaUrlTally {
  return {
    scanned: a.scanned + b.scanned,
    alreadyNormalized: a.alreadyNormalized + b.alreadyNormalized,
    normalized: a.normalized + b.normalized,
    missingBytes: a.missingBytes + b.missingBytes,
    outsideTree: a.outsideTree + b.outsideTree,
    unknownShape: a.unknownShape + b.unknownShape,
  };
}
