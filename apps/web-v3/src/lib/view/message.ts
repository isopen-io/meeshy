import { messageTypeFromMimeTypes } from '@meeshy/shared/utils/attachment-message-type';
import { transcriptTranslationTexts } from '@meeshy/shared/types/attachment-audio';

import { servedTranscript, type Served } from '@/lib/api/prism';
import type { Attachment, Message } from '@/lib/api/types';

/**
 * CE QUE LA VUE DÉRIVE D'UN MESSAGE.
 *
 * Le POC portait `isMine` et `status` comme des CHAMPS du message. Ni l'un ni
 * l'autre n'existe dans le domaine, et pour deux raisons différentes :
 *
 * · `isMine` dépend de QUI REGARDE. Le graver dans la charge la rendrait
 *   incorrecte dès qu'un second lecteur la lit — un cache partagé, une
 *   pré-hydratation, un test.
 * · `status` n'est pas un état mais une LECTURE de compteurs. Le serveur sert
 *   `deliveredCount`, `readCount` et les deux horloges « à tous » ; la coche
 *   unique de l'interface est ce que l'on en conclut.
 */

/** La coche du pied de bulle — quatre paliers, dans l'ordre. */
export type Delivery = 'pending' | 'sent' | 'delivered' | 'read';

/**
 * L'état d'un envoi DE CE CLIENT, tant que le transport n'a pas tranché.
 *
 * Il ne vit pas sur `Message` et n'y vivra jamais : le serveur ne sert pas
 * « échoué », il ne le connaît pas. C'est une opinion locale sur une charge
 * qui, elle, est partageable — les confondre ferait voyager l'échec d'un
 * appareil jusqu'à l'écran d'un autre.
 */
export type LocalDelivery = 'pending' | 'failed';

export const isMineOf = (message: Message, viewerId: string): boolean => message.senderId === viewerId;

/**
 * TOUT OU RIEN, comme iOS : la double coche bleue ne s'allume que lorsque le
 * message est lu par TOUS les destinataires actifs. Une lecture partielle
 * affiche `delivered` — annoncer « lu » sur un groupe de dix parce qu'une
 * personne a ouvert le fil serait un mensonge d'interface, et le dépôt tient
 * `recipientCount` précisément pour l'éviter.
 *
 * `recipientCount` ABSENT (charge construite par socket) ⇒ on retombe sur les
 * horloges dénormalisées, seule source qui ne suppose pas de dénominateur.
 */
export const deliveryOf = (message: Message): Delivery => {
  if (message.readByAllAt !== undefined) return 'read';
  if (message.deliveredToAllAt !== undefined) return 'delivered';

  const recipients = message.recipientCount;
  if (recipients !== undefined && recipients > 0) {
    if (message.readCount >= recipients) return 'read';
    if (message.deliveredCount >= recipients) return 'delivered';
  }
  return message.deliveredCount > 0 ? 'delivered' : 'sent';
};

/**
 * L'ACCUSÉ QU'UNE PEAU A LE DROIT DE PEINDRE — le SITE UNIQUE qui compose
 * l'opinion LOCALE (`LocalDelivery`) et l'accusé SERVI (`deliveryOf`). Les
 * deux peaux l'appellent ; aucune ne recompose la règle chez elle.
 *
 * `null` ⇒ NE RIEN PEINDRE. Un envoi ÉCHOUÉ porte `deliveredCount: 0`, que
 * `deliveryOf` lit — à raison — comme « envoyé » : la coche ✓ s'affichait
 * donc à côté de la bande « Non envoyé · Réessayer », avec
 * `title="envoyé"`. Deux affirmations contraires sur le MÊME message, dont
 * l'une est fausse ; iOS ne peint jamais l'accusé d'un `.sendFailed`
 * (`BubbleFooter.swift:186-197`). L'échec a déjà sa bande, qui le dit en
 * toutes lettres et porte le geste de reprise : la colonne méta se tait.
 */
export const checkStatusOf = (message: Message, local: LocalDelivery | undefined): Delivery | null => {
  if (local === 'failed') return null;
  if (local === 'pending') return 'pending';
  return deliveryOf(message);
};

/**
 * La CATÉGORIE d'une pièce jointe, déduite de son type MIME par la fonction du
 * dépôt — la même que celle qui décide du `messageType` à l'envoi. La déduire
 * ici avec un `startsWith('image/')` de plus produirait deux classements pour
 * une même pièce, et c'est le genre d'écart qui ne se voit que sur un format
 * rare.
 */
export const kindOf = (attachment: Attachment): 'image' | 'audio' | 'video' | 'file' =>
  messageTypeFromMimeTypes([attachment.mimeType]) ?? 'file';

/** Les traductions d'un message, ramenées à ce qu'une puce de langue affiche. */
export const translationsOf = (
  message: Message,
): readonly { readonly language: string; readonly text: string }[] =>
  message.translations.map((t) => ({ language: t.targetLanguage, text: t.translatedContent }));

/**
 * Une onde de vocal DÉTERMINISTE, dérivée de l'identifiant de la pièce.
 *
 * Le domaine ne porte pas de forme d'onde — la passerelle ne la calcule pas, et
 * la fabriquer au hasard ferait bouger la barre à chaque rendu. Dérivée de
 * l'id, elle est stable pour une pièce donnée, différente d'une pièce à
 * l'autre, et ne prétend RIEN sur le contenu audio : c'est une décoration
 * honnête, à remplacer le jour où le serveur sert la vraie.
 */
export const waveformOf = (attachment: Attachment, bars = 22): readonly number[] => {
  const seed = [...attachment.id].reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) % 9973, 7);
  return Array.from({ length: bars }, (_, i) => 6 + ((seed * (i + 3)) % 17));
};

/**
 * LES LANGUES DANS LESQUELLES UN MESSAGE A UNE TRADUCTION — texte ET pièces
 * jointes (#5805), miroir `BubbleContentBuilder.buildAvailableFlags`
 * (`:376-379`) : iOS compte l'audio traduit dans la même bande que le texte,
 * pas une bande à part. Avant ce lot, `languageBand` (`reading-mode/meta.ts`)
 * n'était nourrie QUE par `translationsOf` (le texte) — un vocal traduit
 * SANS traduction texte ne montrait donc AUCUN drapeau (`targets/bulle.md`
 * § 3.11, écart « audio traduit : ignoré »).
 *
 * `transcriptTranslationTexts` (site UNIQUE du dépouillement, `@meeshy/shared`)
 * est la MÊME fonction que `servedTranscript` (`api/prism.ts`) — pas une
 * seconde boucle. Ordre STABLE (texte d'abord, puis chaque pièce dans
 * l'ordre), sans doublon.
 */
export const translatedLanguagesOf = (message: Message): readonly string[] => {
  const seen = new Set<string>();
  const languages: string[] = [];
  const push = (language: string): void => {
    if (seen.has(language)) return;
    seen.add(language);
    languages.push(language);
  };

  for (const t of message.translations) push(t.targetLanguage);
  for (const attachment of message.attachments ?? []) {
    // AUDIO SEULEMENT — `translatedAudios`, jamais « toute pièce traduite »
    // (revue #5805). `buildAvailableFlags` prend DEUX sources et deux
    // seulement : `translations` (le texte) et `translatedAudios`. Compter
    // aussi la carte d'une IMAGE ferait monter un drapeau dont le seul effet
    // serait de changer l'`alt` — invisible à l'écran, donc un contrôle qui
    // n'a pas d'effet OBSERVABLE (loi 4). L'`alt` descend le Prisme quoi
    // qu'il arrive (`ImageTile`, `attachment-blocks.tsx`) : c'est la BANDE
    // qui n'a rien à en dire, pas la résolution.
    if (kindOf(attachment) !== 'audio') continue;
    for (const language of Object.keys(transcriptTranslationTexts(attachment.translations))) push(language);
  }
  return languages;
};

/**
 * LA LANGUE QUE LA RANGÉE SERT VRAIMENT — le TEXTE quand il y en a, sinon la
 * PIÈCE JOINTE (revue #5805).
 *
 * `served(message.content).language` décrit le TEXTE, et lui seul. Sur un
 * message MÉDIA-SEUL (`content: ''`, `translations: []` — la forme nominale
 * d'une photo ou d'un vocal, `fixtures-media.ts`) cette langue est TOUJOURS
 * l'originale, alors que le seul contenu à l'écran — la transcription — est
 * servi, lui, dans la langue du lecteur. Le pied lisait donc la mauvaise
 * moitié du message : `languageBand` retirait la langue du TEXTE au lieu de
 * celle du CONTENU SERVI, si bien que le drapeau proposé était celui de la
 * traduction DÉJÀ affichée. Cliquer dessus ne changeait rien — un contrôle
 * INERTE (loi 4), mesuré au navigateur : ni le texte, ni la piste, ni
 * `aria-pressed` ne bougeaient. Pire, `aria-pressed="false"` niait la langue
 * effectivement servie.
 *
 * Avec cette règle, la bande d'un vocal traduit propose l'ORIGINAL — et le
 * clic a un effet : la transcription ET la piste repassent à l'original
 * (`resolveAudioTrack` suit la langue du texte servi, cycle 128).
 *
 * `servedTranscript` est le MÊME résolveur que celui du widget
 * (`attachment-blocks.tsx`), jamais une seconde descente.
 */
export const servedRowLanguage = (params: {
  readonly served: Served;
  readonly preferredLanguages: readonly string[];
  readonly attachments: readonly Attachment[] | undefined;
  readonly fallbackLanguage: string;
}): string => {
  if (params.served.text !== '') return params.served.language;
  for (const attachment of params.attachments ?? []) {
    if (kindOf(attachment) !== 'audio') continue;
    const transcript = servedTranscript({
      preferredLanguages: params.preferredLanguages,
      attachment,
      fallbackLanguage: params.fallbackLanguage,
    });
    if (transcript.text !== '') return transcript.language;
  }
  return params.served.language;
};
