import { resolvePrismTranslation } from '@meeshy/shared/utils/conversation-helpers';
import type { AttachmentTranslationTrack } from '@meeshy/shared/types/attachment-audio';

import { langueServie } from '@/lib/a11y/langue-servie';

/**
 * CE QUI SE PEINT DANS LA GALERIE — le modèle, avant le pixel (planche `media`,
 * `cible/media.png`, matrice ordre 7).
 *
 * Il est ici, sous la surface qui le rend (règle de placement (B)), et il est
 * PUR : ni fetch, ni horloge, ni DOM. C'est ce qui permet aux trois lois qu'il
 * porte d'être gagées sans navigateur, là où l'écran exige un serveur, un lien
 * et un jeton.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LE POIDS EST UNE DONNÉE, PAS UNE MESURE
 * ────────────────────────────────────────────────────────────────────────────
 *
 * `fileSize` voyage avec la LISTE : la tuile connaît donc le coût du média
 * avant qu'un seul de ses octets ne parte. C'est ce qui permet à cet écran de
 * tenir l'énoncé de la mission — « très faible consommation de données » — sans
 * rien précharger : la grille ne rend AUCUN `<img>`, chaque tuile est une
 * ADRESSE que le visiteur décide d'ouvrir, et le chiffre qu'elle affiche est ce
 * qu'il paiera s'il l'ouvre.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LE CHEMIN EST SERVI, L'ORIGINE EST DONNÉE — et ce n'est pas la même chose
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Le § 5.1 est explicite sur les médias distants : « ne jamais reconstruire
 * l'URL côté client » — une signature `?exp=&sig=` viendra dans la valeur
 * servie, et un écran qui recomposerait le CHEMIN la perdrait en silence le
 * jour de sa livraison.
 *
 * Cela n'autorise pas à servir la valeur BRUTE : `fileUrl` est un CHEMIN
 * (`/api/v1/attachments/file/…`, écrit par `UploadProcessor.getAttachmentPath`),
 * et sans origine il se résout contre l'apex, où aucun routeur `/api` n'existe.
 * L'origine est donnée par `adresseDuMedia()` (`lib/api/passerelle.ts`), dans la
 * PROJECTION — le modèle et la vue reçoivent une adresse déjà joignable et n'ont
 * rien à composer.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LE PRISME N'EST PAS RÉÉCRIT ICI, ET LA PISTE SUIT LE TEXTE
 * ────────────────────────────────────────────────────────────────────────────
 *
 * La descente est UNE fonction — `resolvePrismTranslation()` — et ce module
 * l'APPELLE (§ 3.2 corollaire 3). Le dépouillement de `MessageAttachment.
 * translations` en `langue → texte` et en `langue → piste` a lui aussi son site
 * unique : `transcriptTranslationTexts()` et sa jumelle
 * `transcriptTranslationTracks()` (`packages/shared/types/attachment-audio.ts`),
 * appelées par la projection (`lib/api/medias.ts`).
 *
 * Et la piste est élue par la langue du TEXTE SERVI, jamais par une descente
 * indépendante (cycle 128) : deux descentes parallèles serviraient une
 * transcription française au-dessus d'une piste yoruba — un défaut PIRE que
 * l'absence de traduction, parce qu'il a l'air d'une traduction ratée.
 */

export type MediaServi = {
  readonly id: string;
  /** Le nom d'ORIGINE quand la passerelle le porte — c'est lui que le visiteur reconnaît. */
  readonly nom: string;
  /** `fileUrl` — le chemin SERVI, muni de l'origine publique de la passerelle (§ 5.1). */
  readonly url: string;
  readonly mimeType: string;
  /** `null` quand la passerelle ne l'a pas dit : un poids ne s'invente pas. */
  readonly octets: number | null;
  readonly dureeMs: number | null;
  readonly transcription: { readonly texte: string; readonly langue: string } | null;
  /** `langue → texte`, la forme que la descente attend. */
  readonly traductions: Readonly<Record<string, string>>;
  /** `langue → piste TTS` — le MÉDIUM du texte traduit, jamais son substitut. */
  readonly pistes: Readonly<Record<string, AttachmentTranslationTrack>>;
  readonly instantMs: number;
};

/**
 * CE QU'UNE LECTURE SERVIE PORTE — la liste, ET l'aveu qu'elle est incomplète.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POURQUOI `partielle` VOYAGE AVEC LA LISTE, ET PAS À CÔTÉ
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Une famille peut être servie par PLUSIEURS portes (« Fichiers » interroge
 * `document` et `text`). Quand l'une tombe, la galerie garde ce que l'autre a
 * servi — « erreur réseau ≠ 401 ». Mais « ce qui est lu reste lu » ne dit pas
 * « ce qui est lu est TOUT » : sans cet aveu, une liste amputée se peint comme
 * une liste complète, et le compte sous le titre l'annonce comme un total.
 *
 * Le cas limite le montre mieux que le cas moyen : si la porte survivante sert
 * une liste VIDE, l'écran affichait mot pour mot « Aucun média dans cette
 * conversation pour l'instant » — le mensonge sur une coupure que le doc-tête
 * de `etats.ts` déclare refuser. `arbitre` rend alors franchement
 * `indisponible` : une liste vide n'a rien à garder.
 *
 * Le drapeau est porté par la VALEUR SERVIE plutôt que par un cinquième état de
 * `Verdict` : la lecture a bien réussi, ce qu'elle rend est simplement moins que
 * ce qui existe. Un état de plus obligerait chaque appelant de `Verdict` à le
 * connaître, alors que seule la galerie lit plusieurs portes.
 */
export type GalerieServie = {
  readonly medias: readonly MediaServi[];
  /** Au moins une porte de cette famille n'a pas répondu : la liste est AMPUTÉE. */
  readonly partielle: boolean;
};

/** Les quatre puces de la cible, dans l'ordre où elle les dessine. */
export const FAMILLES = ['images', 'videos', 'audio', 'fichiers'] as const;

export type Famille = (typeof FAMILLES)[number];

export const LIBELLE_DE_FAMILLE: Readonly<Record<Famille, string>> = {
  images: 'Images',
  videos: 'Vidéos',
  audio: 'Audio',
  fichiers: 'Fichiers',
};

/**
 * La puce demandée par l'URL, réduite à une union FERMÉE.
 *
 * Le paramètre est le seul que cet écran lise, et il vient d'une adresse
 * partageable : il n'indexe donc rien tant qu'il n'appartient pas à la liste
 * ci-dessus. Une valeur étrangère ne rend pas une erreur — elle rend la
 * première puce, celle que la cible montre ouverte.
 */
export const familleDemandee = (brut: string | null): Famille =>
  FAMILLES.find((famille) => famille === brut) ?? FAMILLES[0];

const PREFIXE_DE_FAMILLE: readonly (readonly [string, Famille])[] = [
  ['image/', 'images'],
  ['video/', 'videos'],
  ['audio/', 'audio'],
];

/**
 * Un type MIME inconnu tombe dans « Fichiers » : c'est la seule puce qui ne
 * promette rien de la FORME du contenu, donc la seule où un média non reconnu
 * reste honnête plutôt que d'être perdu.
 */
export const familleDuMime = (mimeType: string): Famille =>
  PREFIXE_DE_FAMILLE.find(([prefixe]) => mimeType.toLowerCase().startsWith(prefixe))?.[1] ??
  'fichiers';

const GLYPHE_DE_FAMILLE: Readonly<Record<Famille, string>> = {
  images: 'ph-image',
  videos: 'ph-play-circle',
  audio: 'ph-microphone',
  fichiers: 'ph-file',
};

/**
 * LES UNITÉS SONT DÉCIMALES — 1 Ko = 1000 o.
 *
 * Le symbole « Ko » désigne le kilo-octet du SI, et c'est aussi ce que rend
 * `ByteCountFormatter` dans l'app iOS : servir 1024 sous le même symbole ferait
 * annoncer deux chiffres différents pour un même fichier sur deux clients du
 * même produit.
 */
const ECHELLE: readonly (readonly [number, string, number])[] = [
  [1_000_000_000, 'Go', 1],
  [1_000_000, 'Mo', 1],
  [1_000, 'Ko', 0],
  [1, 'o', 0],
];

export const poidsLisible = ({
  octets,
  langue,
}: {
  readonly octets: number | null;
  readonly langue: string;
}): string | null => {
  if (octets === null || !Number.isFinite(octets) || octets < 0) return null;

  const [seuil, unite, decimales] = ECHELLE.find(([borne]) => octets >= borne) ?? [1, 'o', 0];
  const valeur = octets / seuil;

  return `${new Intl.NumberFormat(langue, { maximumFractionDigits: decimales }).format(valeur)} ${unite}`;
};

/** « 0:23 » de la cible — jamais un nombre de millisecondes servi tel quel. */
export const dureeLisible = (dureeMs: number | null): string | null => {
  if (dureeMs === null || !Number.isFinite(dureeMs) || dureeMs < 0) return null;

  const secondes = Math.round(dureeMs / 1000);
  return `${Math.floor(secondes / 60)}:${String(secondes % 60).padStart(2, '0')}`;
};

export type Tuile = {
  readonly id: string;
  /** L'adresse que le visiteur ouvre — un contrôle existe s'il a un effet (loi 4). */
  readonly url: string;
  readonly glyphe: string;
  /** Le chiffre AFFICHÉ, avant tout octet. `null` quand la passerelle s'est tue. */
  readonly poids: string | null;
  readonly nom: string;
  /**
   * Le nom ACCESSIBLE du lien. La tuile n'affiche que le poids ; sans cette
   * étiquette, un lecteur d'écran annoncerait six liens nommés « 420 Ko »,
   * indistinguables. Elle CONTIENT le libellé visible — c'est ce qu'exige le
   * critère 2.5.3, et c'est pourquoi le poids y est répété plutôt que remplacé.
   */
  readonly etiquette: string;
};

export const tuileDuMedia = ({
  media,
  langueDuDocument,
}: {
  readonly media: MediaServi;
  readonly langueDuDocument: string;
}): Tuile => {
  const poids = poidsLisible({ octets: media.octets, langue: langueDuDocument });

  return {
    id: media.id,
    url: media.url,
    glyphe: GLYPHE_DE_FAMILLE[familleDuMime(media.mimeType)],
    poids,
    nom: media.nom,
    etiquette: poids === null ? media.nom : `${media.nom} · ${poids}`,
  };
};

export type CarteAudio = {
  readonly id: string;
  readonly nom: string;
  /** La piste ÉLUE par la langue du texte servi (cycle 128), l'original à défaut. */
  readonly url: string;
  readonly mimeType: string | null;
  readonly poids: string | null;
  readonly duree: string | null;
  /** La transcription descendue au Prisme — `null` quand rien n'a été transcrit. */
  readonly texte: string | null;
  /** `lang` du nœud qui porte ce texte, quand il diffère du document — `null` sinon. */
  readonly langue: string | null;
  /** « Transcrit · yo → fr » de la cible : d'où vient le texte, et où il a été porté. */
  readonly mention: string | null;
};

export const carteAudio = ({
  media,
  prisme,
  langueDuDocument,
}: {
  readonly media: MediaServi;
  readonly prisme: readonly string[];
  readonly langueDuDocument: string;
}): CarteAudio => {
  const origine = media.transcription?.langue ?? null;

  const resolue = resolvePrismTranslation({
    translations: media.traductions,
    originalLanguage: origine,
    preferredLanguages: prisme,
  });

  const texte = resolue?.text ?? media.transcription?.texte ?? null;
  const servie = resolue?.language ?? origine;

  /**
   * `pistes[servie]` — la piste de la langue du TEXTE, jamais une élection
   * parallèle. Une entrée sans `url` ne concourt pas (`transcriptTranslationTracks`
   * les écarte), ce qui fait retomber sur le fichier ORIGINAL plutôt que sur une
   * URL vide.
   */
  const piste = servie === null ? undefined : media.pistes[servie];

  return {
    id: media.id,
    nom: media.nom,
    url: piste?.url ?? media.url,
    mimeType: piste?.mimeType ?? media.mimeType,
    poids: poidsLisible({ octets: media.octets, langue: langueDuDocument }),
    duree: dureeLisible(media.dureeMs),
    texte,
    langue: texte === null ? null : langueServie(servie, langueDuDocument),
    mention:
      origine === null
        ? null
        : servie === null || servie === origine
          ? `Transcrit · ${origine}`
          : `Transcrit · ${origine} → ${servie}`,
  };
};
