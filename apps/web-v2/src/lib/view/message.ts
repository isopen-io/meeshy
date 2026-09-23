import { messageTypeFromMimeTypes } from '@meeshy/shared/utils/attachment-message-type';
import { transcriptTranslationTexts } from '@meeshy/shared/types/attachment-audio';

import { servedTranscript, type Served } from '@/lib/api/prism';
import type { Attachment, Message } from '@/lib/api/types';
import type { InterfaceCatalogKey } from '@/lib/i18n-catalog';

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
 *
 * **L'ORDRE EST CELUI DES PALIERS, PAS CELUI DES SOURCES (#7223).** Chaque
 * palier consulte SES DEUX preuves — l'horloge « à tous » et les compteurs —
 * avant que le palier du dessous soit seulement regardé, exactement comme le
 * résolveur qui fait foi (D-1, `DeliveryStatusResolver.resolve`,
 * `packages/MeeshySDK/Sources/MeeshySDK/Models/DeliveryStatusResolver.swift` :
 * `readByAllAt != nil || readCount >= recipientCount`, PUIS `deliveredToAllAt
 * != nil || delivered >= recipientCount`).
 *
 * Ranger `deliveredToAllAt` avant tout compteur — ce que faisait ce site —
 * COURT-CIRCUITAIT la lecture : `GET /conversations/:id/messages` sert cette
 * horloge CALCULÉE dès que la distribution est complète
 * (`routes/conversations/messages-list-query.ts:663`), donc tout message du
 * fil la porte bien avant d'être lu, et les compteurs qu'un
 * `read-status:updated` vient de poser n'atteignaient plus aucun pixel. Les
 * deux sources ne se contredisent jamais quand elles viennent de la même
 * lecture REST ; quand elles divergent, c'est que les compteurs sont les plus
 * FRAIS — ce sont eux que le temps réel rafraîchit.
 */
export const deliveryOf = (message: Message): Delivery => {
  const recipients = message.recipientCount ?? 0;
  const countsAreConclusive = recipients > 0;

  if (message.readByAllAt !== undefined || (countsAreConclusive && message.readCount >= recipients)) return 'read';
  if (message.deliveredToAllAt !== undefined || (countsAreConclusive && message.deliveredCount >= recipients)) {
    return 'delivered';
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
 * LE TYPE D'UNE PIÈCE → SA CLÉ DE CATALOGUE (#7337) — le libellé d'un
 * substitut de pièce protégée. SITE UNIQUE, partagé par la tuile
 * (`MaskedAttachment`) et par la page plein cadre (`ViewerMaskedPage`,
 * `media-viewer.tsx`) : les deux disaient la même chose en dur, en français,
 * et « un second vocabulaire ferait dire deux choses différentes à l'œil et à
 * l'oreille pour un même état » (doc-comment de `PROTECTED_LABEL_KEY`).
 *
 * Il vit ICI, à côté de `kindOf` qui l'indexe, et non chez l'un des deux
 * composants : un `import` de l'un vers l'autre ferait entrer la tuile et ses
 * dépendances dans le chunk de la visionneuse, pour une table de quatre
 * chaînes.
 */
export const PROTECTED_ATTACHMENT_KEY = {
  image: 'attachment.protected.image',
  video: 'attachment.protected.video',
  audio: 'attachment.protected.audio',
  file: 'attachment.protected.file',
} as const satisfies Readonly<Record<'image' | 'audio' | 'video' | 'file', InterfaceCatalogKey>>;

/**
 * La CATÉGORIE d'une pièce jointe, déduite de son type MIME par la fonction du
 * dépôt — la même que celle qui décide du `messageType` à l'envoi. La déduire
 * ici avec un `startsWith('image/')` de plus produirait deux classements pour
 * une même pièce, et c'est le genre d'écart qui ne se voit que sur un format
 * rare.
 */
export const kindOf = (attachment: Pick<Attachment, 'mimeType'>): 'image' | 'audio' | 'video' | 'file' =>
  messageTypeFromMimeTypes([attachment.mimeType]) ?? 'file';

/**
 * Les traductions d'un message, ramenées à ce qu'une puce de langue affiche —
 * et LE SEUL LECTEUR de `Message.translations` de cette couche (#7526).
 *
 * La garde `?? []` tient MALGRÉ le type `required`, pour la raison que
 * `decodeMessage` porte déjà (`api/decode.ts`, #5650) : `@meeshy/shared`
 * décrit le message COMPLET de `GET …/messages`, pas les formes ALLÉGÉES que
 * la passerelle sert ailleurs, et le cache du fil tient ce que chaque
 * écrivain y pose. Ici la conséquence n'est pas un champ manquant mais un
 * `TypeError` à la PEINTURE : `bubble.tsx` et `focal-row.tsx` appellent
 * `translatedLanguagesOf` sur CHAQUE rangée, donc le fil entier tombe avant
 * qu'un `message:translation` n'arrive — le symptôme que `realtime-apply.ts`
 * garde de son côté (`mergeMessageTranslations`).
 */
export const translationsOf = (
  /** LE CHAMP EST DÉCLARÉ OPTIONNEL ICI (#7527) — `Message.translations` est
   * requis dans `@meeshy/shared`, mais les formes ALLÉGÉES du cache ne le
   * portent pas. Le déclarer ici est ce qui permet aux appelants d'accepter
   * la forme allégée SANS assertion de type : une garde annoncée par une
   * assertion n'en est pas une. */
  message: { readonly translations?: Message['translations'] },
): readonly { readonly language: string; readonly text: string }[] =>
  (message.translations ?? []).map((t) => ({ language: t.targetLanguage, text: t.translatedContent }));

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

  // `translationsOf`, jamais une seconde lecture du champ (#7526) : un
  // deuxième `message.translations` ici serait une deuxième réponse à « ce
  // champ peut-il manquer ? », et c'est cette duplication qui laisse un site
  // en arrière au lot suivant.
  for (const t of translationsOf(message)) push(t.language);
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
