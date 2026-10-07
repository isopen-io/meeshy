/**
 * Les ADRESSES SERVIES d'une pièce jointe protégée, signées pour leur lecteur
 * (#9600).
 *
 * Un site qui sert une pièce jointe À UN LECTEUR CONNU (la liste de messages,
 * la synchronisation) passe la pièce ici en dernier : chacune de ses adresses
 * de fichier — l'original, la miniature, les variantes WebP, les pistes
 * traduites — devient l'adresse signée de ce lecteur
 * (`readerFileSignature.ts`). La route qui la sert rejoue alors l'échéance de
 * CE lecteur, ce que la route par chemin ne peut pas faire.
 *
 * ─── CE QUI EST SIGNÉ ───────────────────────────────────────────────────────
 *
 * La pièce d'un contenu qui DISPARAÎT : la nature de la loi de sortie (#9572),
 * lue sur les colonnes du message porteur et sur CETTE pièce — vue unique,
 * flamme à durée, flamme après lecture, copie transférée d'une flamme. Par
 * `contentExitLawOfSource` : une colonne que le site n'a pas chargée ferme,
 * donc signe. Ce n'est pas la loi du message ENTIER (toutes ses pièces) mais
 * celle que la route par chemin rejoue sur ce fichier, pour que la bascule de
 * refus ne puisse jamais refuser une adresse que ce module aurait laissée nue.
 *
 * ─── CE QUI NE L'EST PAS ────────────────────────────────────────────────────
 *
 *  - Le contenu ORDINAIRE, et le flou seul : l'objet est rendu TEL QUEL (même
 *    référence). Le flou ne disparaît pour personne, et une adresse qui change
 *    chaque heure coûterait aux caches clients, clés sur l'adresse complète.
 *  - Toute valeur qui ne désigne pas un fichier de la passerelle : adresse par
 *    identifiant (déjà authentifiée et jugée par lecteur, #9589), hôte tiers,
 *    magasin statique. Seules les clés DATÉES et les pistes `translated/` sont
 *    réécrites.
 *  - Sans lecteur ou sans clé de signature : l'adresse d'avant ce lot.
 */
import { contentExitLawOfSource, type ContentExitProjection } from '@meeshy/shared/utils/content-exit-law';

import { STORAGE_KEY_SHAPE } from './mediaUrlNormalization';
import { storageKeyFromMediaUrl } from './mediaStorageKey';
import type { ReaderFileUrlSigner } from './readerFileSignature';

type MessageProtection = Omit<ContentExitProjection, 'attachments'>;

/**
 * Les colonnes de protection du message porteur, telles qu'un site les a
 * chargées. Toutes sont nécessaires pour prouver l'ordinaire : une colonne
 * ABSENTE ferme (la pièce est signée), elle ne vaut jamais `null`.
 */
export type ReaderBoundMessage = { readonly [K in keyof MessageProtection]?: MessageProtection[K] | undefined };

/** Une pièce telle qu'un site la sert : les champs sont lus, jamais présumés. */
export type SignableAttachment = {
  readonly id?: unknown;
  readonly fileUrl?: unknown;
  readonly thumbnailUrl?: unknown;
  readonly imageVariants?: unknown;
  readonly translations?: unknown;
  readonly isViewOnce?: unknown;
  readonly isBlurred?: unknown;
  readonly effectFlags?: unknown;
};

export type ReaderSigningContext = {
  readonly message: ReaderBoundMessage;
  readonly readerParticipantId: string | null | undefined;
  readonly signer: ReaderFileUrlSigner | null | undefined;
};

const TRANSLATED_TRACK = /^translated\/[0-9a-f]{24}_[^/]+$/;

const signableKeyOf = (url: string): string | null => {
  const key = storageKeyFromMediaUrl(url);
  return key !== null && (STORAGE_KEY_SHAPE.test(key) || TRANSLATED_TRACK.test(key)) ? key : null;
};

/** Le fichier de CETTE pièce se lit-il par lecteur ? Vrai sur toute nature non ordinaire. */
export function attachmentIsReaderBound(message: ReaderBoundMessage, attachment: SignableAttachment): boolean {
  // Une colonne non chargée reste `undefined` à l'exécution : la loi la lit
  // comme une preuve manquante et ferme. L'assertion ne fait que la laisser
  // passer jusqu'à elle — c'est `contentExitLawOfSource` qui juge.
  const source = {
    ...message,
    attachments: [{ isViewOnce: attachment.isViewOnce, isBlurred: attachment.isBlurred, effectFlags: attachment.effectFlags }],
  } as ContentExitProjection;
  return contentExitLawOfSource(source).nature !== 'ordinary';
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function signReaderAttachmentUrls<T extends SignableAttachment>(attachment: T, context: ReaderSigningContext): T {
  const { signer, readerParticipantId } = context;
  const attachmentId = attachment.id;
  if (!signer || !readerParticipantId || typeof attachmentId !== 'string' || attachmentId === '') return attachment;
  if (!attachmentIsReaderBound(context.message, attachment)) return attachment;

  const sign = <V>(url: V): V => {
    if (typeof url !== 'string') return url;
    const storageKey = signableKeyOf(url);
    return storageKey === null ? url : (signer.sign({ storageKey, attachmentId, readerParticipantId }) as V);
  };
  const signUrlField = (entry: unknown): unknown => (isRecord(entry) && 'url' in entry ? { ...entry, url: sign(entry.url) } : entry);

  const variants = attachment.imageVariants;
  const translations = attachment.translations;
  return {
    ...attachment,
    fileUrl: sign(attachment.fileUrl),
    thumbnailUrl: sign(attachment.thumbnailUrl),
    ...(Array.isArray(variants) ? { imageVariants: variants.map(signUrlField) } : {}),
    ...(isRecord(translations)
      ? { translations: Object.fromEntries(Object.entries(translations).map(([lang, entry]) => [lang, signUrlField(entry)])) }
      : {}),
  };
}

/** La même règle sur la liste d'un message ; `null`/absent traversent tels quels. */
export function signReaderAttachmentsIn<T extends SignableAttachment>(
  attachments: readonly T[] | null | undefined,
  context: ReaderSigningContext
): readonly T[] | null | undefined {
  return attachments ? attachments.map((attachment) => signReaderAttachmentUrls(attachment, context)) : attachments;
}
