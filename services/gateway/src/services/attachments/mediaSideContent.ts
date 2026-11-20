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
 * **CE QUE CETTE LOI NE TOUCHE PAS : la carte des pistes traduites** — et la
 * raison est mesurée, pas prudentielle (#19978, audit adversarial).
 *
 * La première rédaction de ce lot en retirait les MOTS (`transcription`,
 * `segments`) en gardant le MÉDIUM (`url`, `durationMs`). Deux mesures l'ont
 * interdit :
 *
 * 1. **Le contrat partagé déclare `transcription` REQUISE** sur chaque entrée
 *    (`messageAttachmentSchema.translations.additionalProperties.required`,
 *    `packages/shared/types/api-schemas/message-attachment.ts`), et
 *    `fast-json-stringify` LÈVE sur une clé requise absente — mesuré à nu en
 *    7.2.1 : `Error: "transcription" is required!`. Retirer la clé rendait donc
 *    `GET /conversations/:id/messages` et `GET /sync` en **500**, la PAGE
 *    ENTIÈRE et non la pièce. Sur `/sync`, la pagination par curseur ramenant
 *    la même ligne à chaque tentative, le rattrapage delta était bloqué
 *    DÉFINITIVEMENT pour ce lecteur. Un correctif de confidentialité qui casse
 *    la lecture de toute une page est pire que la fuite qu'il ferme.
 * 2. **La piste est élue par la langue du TEXTE SERVI** (loi du cycle 128,
 *    `CLAUDE.md` § Prisme). Vider les mots sans vider la carte fait retomber le
 *    web sur la piste ORIGINALE — donc les `url` qu'on croyait « garder »
 *    deviennent inatteignables — pendant qu'iOS, qui élit sur les langues
 *    DISPONIBLES, joue la piste traduite sans aucun texte. Deux clients
 *    divergents sur la même charge.
 *
 * Le texte traduit d'une pièce protégée reste donc servi aujourd'hui, et c'est
 * une DETTE ÉCRITE, pas un oubli : la fermer demande de trancher le contrat
 * partagé (retirer `transcription` de `required`, ce qui touche les trois
 * clients) et le comportement produit du Prisme audio. Suivi : #20015.
 */
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
 * **`servedDescription` n'a plus AUCUN appelant de production** — mesuré, et
 * c'est une correction : la première rédaction de ce lot affirmait le contraire
 * (« il a des appelants qui ne servent QUE la description »), et ses seules
 * occurrences restantes hors tests étaient des COMMENTAIRES. C'est la règle du
 * dépôt « compter les appelants du helper » appliquée à l'envers : un helper à
 * zéro appelant ne documente rien, il ATTEND qu'on l'utilise.
 *
 * Il reste exporté pour sa propre suite (`media-description-served.test.ts`),
 * qui garde la moitié description de la loi — et un cliquet interdit qu'un
 * fichier de PRODUCTION l'importe à nouveau
 * (`__tests__/side-content-single-door.test.ts`) : toute nouvelle surface
 * appelle `servedSideContent`, sans quoi elle gagne la moitié de la loi en
 * croyant l'appliquer.
 */
export function servedSideContent<R extends SideContentRow>(row: R): ServedSideContent<R> {
  const mayTravel = mediaSideContentMayTravel(row, row.message ?? null);
  return {
    ...servedDescription(row),
    // Le seul effacement de ce module : `?? null` élargit le type déclaré par
    // l'appelant, et TypeScript ne sait pas en déduire que la valeur est soit
    // la sienne soit `null`. Borné à cette ligne.
    transcription: (mayTravel ? (row.transcription ?? null) : null) as R['transcription'] | null,
    // INCHANGÉE — voir le bloc ci-dessus. `servedAttachmentTranslations` retire
    // la clé disque, comme avant ce lot, et rien d'autre.
    translations: servedAttachmentTranslations(row.translations ?? null) as R['translations'] | null,
  };
}
