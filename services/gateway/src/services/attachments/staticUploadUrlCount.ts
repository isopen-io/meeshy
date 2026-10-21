/**
 * COMPTER LES LIGNES QUI GRAVENT `static.<domaine>/uploads` (#11256).
 *
 * Le nginx statique servait les uploads de la passerelle sous
 * `static.<domaine>/uploads/<clé>`. Le fermer casse toute ligne dont UNE
 * colonne porte cette adresse en dur — pièce jointe, vignette, mais aussi
 * avatar, bannière ou piste d'un post : c'est une MIGRATION DE DONNÉES (feu
 * vert du porteur, #9223), pas un retrait de compose. Ce module ne porte que
 * la décision et le balayage ; il ne lit pas la base (le port lui est remis,
 * `staticUploadUrlStores.ts`) et il ne peut pas écrire, son port n'a pas de
 * `write`.
 */
import { parseMediaRef } from '@meeshy/shared/api/media-ref';

/**
 * Une valeur de colonne : une chaîne (adresse, référence), ou un document JSON
 * (variantes d'image, pistes TTS de `translations`, scènes de story) que le
 * balayage fouille en profondeur.
 */
export type StaticUploadUrlRow = {
  readonly id: string;
  readonly values: Readonly<Record<string, unknown>>;
};

export type StaticUploadUrlStore = {
  readonly name: string;
  readonly fields: readonly string[];
  readonly list: (cursor: string | null) => Promise<readonly StaticUploadUrlRow[]>;
};

export type StaticUploadUrlTally = {
  readonly scanned: number;
  readonly parColonne: Readonly<Record<string, number>>;
};

export type StaticUploadUrlReport = {
  readonly total: number;
  readonly parCollection: Readonly<Record<string, StaticUploadUrlTally>>;
  readonly exemples: readonly string[];
};

const STATIC_HOST_PREFIX = 'static.';
const UPLOADS_PATH_PREFIX = '/uploads/';
const UPLOADS_KEY_PREFIX = 'uploads/';
const WEB_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:']);

/** Combien d'exemples le compte montre — assez pour juger, jamais la table entière. */
const EXEMPLES_MAX = 12;

/**
 * Une référence qui se résout sur `static.<domaine>/uploads/…` :
 *
 *  - une adresse ABSOLUE (ou relative au protocole, `//hôte/…`) dont l'hôte est
 *    un sous-domaine `static.*` et dont le chemin COMMENCE par `/uploads/` ;
 *  - une référence DÉCLARÉE du magasin statique (`static:uploads/…`), que la
 *    migration 017 écrit à partir d'une adresse absolue `static.*` QUELLE QUE
 *    SOIT sa clé — un avatar `…/uploads/…` y est devenu `static:uploads/…`, et
 *    les clients le résolvent sur le domaine statique.
 *
 * Le magasin legacy (`/u/…`, `static:u/…`) n'en est pas, il reste servi ; une
 * clé nue, un chemin relatif ou la route de la passerelle non plus.
 */
export function isStaticUploadUrl(value: string): boolean {
  const ref = parseMediaRef(value);
  if (ref?.kind === 'key' && ref.store === 'static') return ref.key.startsWith(UPLOADS_KEY_PREFIX);
  const absolue = value.startsWith('//') ? `https:${value}` : value;
  try {
    const { protocol, hostname, pathname } = new URL(absolue);
    return WEB_PROTOCOLS.has(protocol) && hostname.startsWith(STATIC_HOST_PREFIX) && pathname.startsWith(UPLOADS_PATH_PREFIX);
  } catch {
    return false;
  }
}

/** Assez pour toute scène de story réelle ; borne une donnée cyclique ou pathologique. */
const PROFONDEUR_MAX = 32;

function parsedJsonText(value: string): unknown {
  const debut = value.trimStart()[0];
  if (debut !== '{' && debut !== '[') return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

/**
 * La PREMIÈRE adresse `static.<domaine>/uploads` que porte une valeur de
 * colonne, ou rien. Une colonne JSON est fouillée en profondeur — tableaux,
 * objets, et un JSON stocké en texte —, parce qu'une variante d'image, une
 * piste TTS ou un média de scène y grave son adresse aussi sûrement qu'un
 * `fileUrl` : un compte limité aux colonnes texte rendrait 0 pendant que ces
 * médias cassent au retrait.
 */
export function firstStaticUploadUrl(value: unknown, profondeur = 0): string | null {
  if (profondeur > PROFONDEUR_MAX) return null;
  if (typeof value === 'string') {
    if (isStaticUploadUrl(value)) return value;
    const json = parsedJsonText(value);
    return json === undefined ? null : firstStaticUploadUrl(json, profondeur + 1);
  }
  if (value === null || typeof value !== 'object') return null;
  const enfants: readonly unknown[] = Array.isArray(value) ? value : Object.values(value);
  for (const enfant of enfants) {
    const trouvee = firstStaticUploadUrl(enfant, profondeur + 1);
    if (trouvee !== null) return trouvee;
  }
  return null;
}

type StoreScan = { readonly tally: StaticUploadUrlTally; readonly exemples: readonly string[] };

async function scanStore(store: StaticUploadUrlStore, exemplesRestants: number): Promise<StoreScan> {
  let scanned = 0;
  let parColonne: Readonly<Record<string, number>> = Object.fromEntries(store.fields.map((field) => [field, 0]));
  let exemples: readonly string[] = [];
  let cursor: string | null = null;

  for (;;) {
    const rows = await store.list(cursor);
    if (rows.length === 0) break;

    for (const row of rows) {
      scanned += 1;
      const touchees = store.fields.flatMap((field) => {
        const adresse = firstStaticUploadUrl(row.values[field]);
        return adresse === null ? [] : [{ field, adresse }];
      });
      parColonne = touchees.reduce((acc, { field }) => ({ ...acc, [field]: (acc[field] ?? 0) + 1 }), parColonne);
      exemples = [
        ...exemples,
        ...touchees.map(({ field, adresse }) => `${store.name}.${field}  ${row.id}  ${adresse}`),
      ].slice(0, exemplesRestants);
    }
    cursor = rows[rows.length - 1]!.id;
  }
  return { tally: { scanned, parColonne }, exemples };
}

export async function countStaticUploadUrls(options: {
  readonly stores: readonly StaticUploadUrlStore[];
}): Promise<StaticUploadUrlReport> {
  let parCollection: Readonly<Record<string, StaticUploadUrlTally>> = {};
  let exemples: readonly string[] = [];

  for (const store of options.stores) {
    const scan = await scanStore(store, EXEMPLES_MAX - exemples.length);
    parCollection = { ...parCollection, [store.name]: scan.tally };
    exemples = [...exemples, ...scan.exemples];
  }

  const total = Object.values(parCollection)
    .flatMap((tally) => Object.values(tally.parColonne))
    .reduce((somme, n) => somme + n, 0);
  return { total, parCollection, exemples };
}
