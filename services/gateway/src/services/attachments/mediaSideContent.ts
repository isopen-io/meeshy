/**
 * Ce qui voyage À CÔTÉ d'un média (#11329, #12333) — sa transcription en
 * sous-titres, sa description textuelle et ses traductions — et la loi UNIQUE
 * qui décide s'il en a le droit.
 *
 * Une pièce protégée — vue unique, floutée, effet masquant, chiffrée, au
 * niveau de la PIÈCE ; vue unique, floutée, effet masquant, éphémère (échéance
 * POSÉE, pas seulement échue), supprimée, chiffrée, au niveau du MESSAGE qui la
 * porte — ne transporte rien de cela : une description dit ce que le flou
 * cache. Fail-closed : un drapeau absent du `select` ne lève pas la garde
 * qu'il porterait, puisque `maskedAttachment` ne regarde que les drapeaux
 * présents — d'où `MESSAGE_SIDE_PROTECTION_SELECT`, à charger avec la pièce.
 */
import { maskedAttachment } from '@meeshy/shared/utils/attachment-protection';

import { servedAttachmentTranslations } from './servedAttachmentTranslations';

export const MESSAGE_SIDE_PROTECTION_SELECT = {
  isViewOnce: true,
  isBlurred: true,
  effectFlags: true,
  expiresAt: true,
  deletedAt: true,
  isEncrypted: true,
  encryptionMode: true,
} as const;

type Protection = {
  readonly isViewOnce?: boolean | null;
  readonly isBlurred?: boolean | null;
  readonly effectFlags?: number | null;
  readonly isEncrypted?: boolean | null;
  readonly encryptionMode?: string | null;
};

export type SideContentCarrier = Protection & {
  readonly expiresAt?: Date | string | null;
  readonly deletedAt?: Date | string | null;
};

const encrypted = (p: Protection): boolean => p.isEncrypted === true || Boolean(p.encryptionMode);

export function mediaSideContentMayTravel(attachment: Protection, carrier: SideContentCarrier | null | undefined): boolean {
  if (maskedAttachment(attachment) || encrypted(attachment)) return false;
  if (!carrier) return true;
  return !maskedAttachment(carrier) && !encrypted(carrier) && !carrier.expiresAt && !carrier.deletedAt;
}

export type ServedDescription = {
  readonly alt: string | null;
  readonly altLanguage: string | null;
  readonly altTranslations: unknown;
};

/**
 * La description SERVIE d'une pièce chargée avec son message porteur
 * (`message: { select: MESSAGE_SIDE_PROTECTION_SELECT }`) : telle quelle, ou
 * tout à `null` sous protection.
 */
export function servedDescription(row: Protection & {
  readonly alt?: string | null;
  readonly altLanguage?: string | null;
  readonly altTranslations?: unknown;
  readonly message?: SideContentCarrier | null;
}): ServedDescription {
  if (!mediaSideContentMayTravel(row, row.message ?? null)) return { alt: null, altLanguage: null, altTranslations: null };
  return { alt: row.alt ?? null, altLanguage: row.altLanguage ?? null, altTranslations: row.altTranslations ?? null };
}

/**
 * **LES MOTS d'une piste traduite, et eux seuls** (#19978).
 *
 * Une piste traduite porte deux choses de nature différente : le MÉDIUM
 * (`url`, `durationMs`, `format`, `voiceModelId`…) et les MOTS
 * (`transcription`, `segments`). La loi de contenu latéral retient les
 * seconds ; le premier a déjà sa propre loi, et elle est plus forte —
 * `signReaderAttachmentUrls` signe `translations[].url` pour le lecteur
 * nommé, donc l'adresse d'une piste protégée est une CAPACITÉ, pas une fuite.
 *
 * Les retirer tous les deux serait plus simple et plus faux : on perdrait la
 * durée qu'une bulle affiche et l'adresse que la route sert légitimement.
 */
const WORDS_OF_A_TRACK = ['transcription', 'segments'] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const withoutWords = (map: unknown): unknown => {
  if (!isRecord(map)) return map;
  return Object.fromEntries(
    Object.entries(map).map(([language, entry]) => {
      if (!isRecord(entry)) return [language, entry];
      const kept = Object.fromEntries(
        Object.entries(entry).filter(([key]) => !(WORDS_OF_A_TRACK as readonly string[]).includes(key)),
      );
      return [language, kept];
    }),
  );
};

export type SideContentRow = Protection & {
  readonly alt?: string | null;
  readonly altLanguage?: string | null;
  readonly altTranslations?: unknown;
  readonly transcription?: unknown;
  readonly translations?: unknown;
  readonly message?: SideContentCarrier | null;
};

/**
 * Ce que la loi rend, **dans les types de la LIGNE qu'on lui donne** : un
 * appelant dont le contrat déclare `transcription: TranscriptionBlob` le
 * retrouve, nullable. Rendre `unknown` obligerait chaque appelant à caster —
 * c'est-à-dire à réaffirmer à la main ce que la loi vient de garantir.
 */
export type ServedSideContent<R extends SideContentRow = SideContentRow> = ServedDescription & {
  readonly transcription: R['transcription'] | null;
  readonly translations: R['translations'] | null;
};

/**
 * **TOUT ce qui voyage à côté d'un média, sous la loi qui le nomme** — le site
 * UNIQUE que l'en-tête de ce module décrit depuis #11329, et qui n'existait
 * pas (#19978).
 *
 * La loi était appliquée à `alt` (`servedDescription`), aux sous-titres
 * (`servedSubtitles`) et aux deux projections d'administration. Elle ne l'était
 * PAS sur les deux chemins les plus fréquentés, qui répandaient la ligne brute
 * — `serializeAttachmentForSocket` (`message:new`, `message:edited`,
 * `message:attachment-updated`) et `cleanAttachmentsForApi` (la liste REST).
 * Les deux composaient `{ ...ligne, ...servedDescription(ligne) }` : la
 * description était gardée, et `transcription` passait juste à côté.
 *
 * > C'est la leçon 275 — « une protection de CONTENU se mesure sur tout ce que
 * > la charge TRANSPORTE, jamais sur sa seule chaîne » — appliquée au module
 * > qui la cite. La garde existait, bien écrite, et elle gardait UN champ sur
 * > trois parce que c'est celui pour lequel elle avait été ajoutée.
 *
 * `servedDescription` reste exporté : il a des appelants qui ne servent QUE la
 * description, et leur faire rendre `transcription: null` leur ajouterait une
 * clé qu'ils ne portent pas.
 */
export function servedSideContent<R extends SideContentRow>(row: R): ServedSideContent<R> {
  const mayTravel = mediaSideContentMayTravel(row, row.message ?? null);
  const translations = servedAttachmentTranslations(row.translations ?? null);
  return {
    ...servedDescription(row),
    // Le seul effacement de ce module, et il est inévitable : TypeScript ne
    // sait pas exprimer « la même carte, chaque entrée privée de deux clés
    // OPTIONNELLES » sur un générique. Il est borné à ces deux lignes, et la
    // forme qu'il affirme est celle que les témoins mesurent.
    transcription: (mayTravel ? (row.transcription ?? null) : null) as R['transcription'] | null,
    translations: (mayTravel ? translations : withoutWords(translations)) as R['translations'] | null,
  };
}
