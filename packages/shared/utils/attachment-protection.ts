/**
 * LA PROTECTION DÉCLARÉE SUR LA PIÈCE JOINTE ELLE-MÊME — cycle 125, #6189.
 *
 * `MessageAttachment` porte ses PROPRES `isViewOnce` / `isBlurred` /
 * `effectFlags`, **indépendants de ceux du message qui la porte**. Le gateway
 * compose depuis toujours le verdict des deux niveaux par un OU
 * (`routes/posts/core.ts` : `protectedPreview(message) !== null ||
 * maskedAttachment(attachment)`), et son commentaire dit pourquoi : « une garde
 * qui ne lisait que la pièce jointe laissait tout cela sortir EN CLAIR ».
 *
 * **Cette loi vivait dans `services/gateway/.../NotificationService.ts`, donc
 * hors de portée des clients** — et `apps/web-v2` ne la lisait nulle part :
 * sonde du 2026-09-12, une pièce `isViewOnce: true` sur un message non protégé
 * rendait son `<img>` et l'URL du fichier en clair (`url_en_clair=true
 * img=true voile=false`), pendant qu'iOS la lit
 * (`apps/ios/.../Focal/Row/FocalAttachmentBlock.swift:130`). Une loi qui
 * gouverne trois clients ne peut pas habiter un service : c'est le § Single
 * Source of Truth, et c'est ce déménagement qui rend la garde web possible.
 *
 * Ne lit PAS `isEncrypted` : le chiffrement d'une pièce jointe est un mode de
 * TRANSPORT (le chemin de téléchargement le dénoue), pas un masque d'affichage.
 * Le message chiffré, lui, est bien retenu — par la quatrième branche de
 * `protectedPreview`, au niveau MESSAGE.
 *
 * `effectFlags` est lu bien qu'il soit, selon
 * `packages/shared/utils/last-message-protection.ts:9-12`, un bitfield
 * RECOMPOSÉ serveur depuis les mêmes colonnes : la redondance est délibérée et
 * fail-closed — une charge qui ne porterait que le bitfield est retenue quand
 * même. Les trois canaux sont donc un OU, jamais une cascade.
 */

// L'extension `.js` est EXIGÉE par `__tests__/esm-relative-imports.test.ts` :
// sous le runtime ESM de `dist`, un import relatif sans extension ne résout pas.
// La garde a rougi sur ce fichier neuf alors que ses neuf témoins passaient —
// un fichier NEUF est soumis aux gardes STRUCTURELLES de son paquet, qu'aucun
// test de son sujet ne mesure.
import { MESSAGE_EFFECT_FLAGS } from '../types/message-effect-flags.js';

export interface AttachmentProtectionFlags {
  isViewOnce?: boolean | null;
  isBlurred?: boolean | null;
  effectFlags?: number | null;
}

/**
 * L'INVENTAIRE — le SEUL endroit du dépôt qui NOMME les champs dont dépend le
 * verdict de `maskedAttachment` (#7014).
 *
 * Il existe parce qu'un relais qui RECOPIE champ par champ est un inventaire à
 * tenir à jour, et qu'il ne l'est jamais : `serializeAttachmentForSocket`
 * (gateway) énumérait trente champs à la main, sans ces trois-là, et une pièce
 * à vue unique reçue en TEMPS RÉEL s'affichait donc en clair. Le `select`
 * Prisma du gateway (`attachmentProtectionSelect`) et la projection de fil
 * (`attachmentProtectionOf`, ci-dessous) en DÉRIVENT tous les deux : un
 * quatrième canal de protection s'ajoute ICI, et il les atteint sans qu'aucun
 * site n'ait à s'en souvenir.
 */
export const ATTACHMENT_PROTECTION_FIELDS = ['isViewOnce', 'isBlurred', 'effectFlags'] as const;

export type AttachmentProtectionField = (typeof ATTACHMENT_PROTECTION_FIELDS)[number];

type Equals<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;

/**
 * Le CLIQUET de l'inventaire, au compilateur : ajouter un champ à
 * `AttachmentProtectionFlags` sans l'ajouter à `ATTACHMENT_PROTECTION_FIELDS`
 * (ou l'inverse) rend ce type `false`, et `Assert` échoue en TS2344. Une
 * assertion d'assignabilité, jamais une ligne exécutable — même dispositif que
 * `ServerEmitRatchet` (`services/gateway/src/socketio/serverEmit.ts`), et pour
 * la même raison : un cliquet doit être ATTEIGNABLE par le compilateur.
 */
export type AttachmentProtectionInventoryCoversTheLaw = Assert<
  Equals<AttachmentProtectionField, keyof AttachmentProtectionFlags>
>;

/**
 * Ce que vaut un canal dont la ligne ne PROUVE rien — et le type RUNTIME
 * attendu de ce canal, puisqu'un `typeof` sur cette valeur le donne sans qu'on
 * ait à écrire un second inventaire.
 *
 * Type MAPPÉ sur l'inventaire, à dessein : un quatrième canal ne peut pas
 * arriver sans que son auteur DISE ce qui le masque — la seule chose qui ne se
 * dérive pas. C'est un inventaire que le compilateur tient, pas un inventaire
 * qu'on oublie.
 */
const MASQUE_SI_ABSENT: {
  readonly [K in AttachmentProtectionField]-?: NonNullable<AttachmentProtectionFlags[K]>;
} = {
  isViewOnce: true,
  isBlurred: true,
  effectFlags: MESSAGE_EFFECT_FLAGS.VIEW_ONCE | MESSAGE_EFFECT_FLAGS.BLURRED,
};

function chargeConforme<K extends AttachmentProtectionField>(
  champ: K,
  brute: unknown
): brute is NonNullable<AttachmentProtectionFlags[K]> {
  return typeof brute === typeof MASQUE_SI_ABSENT[champ];
}

/**
 * Projette une ligne QUELCONQUE sur l'inventaire ci-dessus — la forme que tout
 * relais (fil Socket.IO, charge push, projection d'administration) doit
 * REMETTRE pour que `maskedAttachment` puisse décider en aval.
 *
 * FAIL-CLOSED sur l'absence, et c'est ce qui la distingue de `maskedAttachment`
 * lui-même, qui doit rester fail-open : les trois colonnes sont NON NULLABLES
 * et à défaut (`schema.prisma`, `MessageAttachment` — `isViewOnce Boolean
 * @default(false)`, `isBlurred Boolean @default(false)`, `effectFlags Int
 * @default(0)`). Une colonne SÉLECTIONNÉE n'est donc JAMAIS `undefined` :
 * l'absence PROUVE que la requête ne l'a pas chargée, elle ne dit jamais « cette
 * pièce est ordinaire ». C'est la distinction `gone` / `unknown` du
 * § « Un verdict de garde a TROIS états » (`services/gateway/CLAUDE.md`), et sur
 * un SECRET, `unknown` se tranche FERMÉ.
 *
 * Une valeur du mauvais TYPE relève du même verdict : elle ne vient pas de
 * Prisma, donc elle ne prouve rien non plus.
 *
 * Le seul cast du module : `Object.fromEntries` rend `{ [k: string]: … }` et
 * ne sait pas que ses clés viennent d'un tuple `as const`. Il ne peut RIEN
 * produire d'autre que les champs de l'inventaire, dont le cliquet ci-dessus
 * prouve qu'ils sont exactement ceux de `AttachmentProtectionFlags`.
 */
export function attachmentProtectionOf(
  row: Readonly<Record<string, unknown>> | null | undefined
): AttachmentProtectionFlags {
  return Object.fromEntries(
    ATTACHMENT_PROTECTION_FIELDS.map((champ) => {
      const brute = row?.[champ];
      return [champ, chargeConforme(champ, brute) ? brute : MASQUE_SI_ABSENT[champ]];
    })
  ) as AttachmentProtectionFlags;
}

/**
 * `true` ⇒ la pièce est MASQUÉE : ni son fichier, ni son URL, ni sa vignette ne
 * doivent atteindre un destinataire — bannière, post, ou DOM d'un fil.
 *
 * Une entrée absente rend `false` : c'est le seul défaut sûr ici, parce qu'une
 * pièce sans déclaration est une pièce ordinaire. Le fail-closed de ce domaine
 * vit dans l'appelant, qui doit poser la question pour CHAQUE pièce et non pour
 * la première.
 */
export function maskedAttachment(input: AttachmentProtectionFlags | null | undefined): boolean {
  if (!input) return false;
  const flags = input.effectFlags ?? 0;
  const maskingFlags = MESSAGE_EFFECT_FLAGS.VIEW_ONCE | MESSAGE_EFFECT_FLAGS.BLURRED;
  return input.isViewOnce === true
    || input.isBlurred === true
    || (flags & maskingFlags) !== 0;
}
