/**
 * Le CORPS servi d'une bannière de message — extrait de `NotificationService.ts`
 * (#8857) avant d'y ajouter le détail du contenu. Fonctions PURES ; les
 * doc-comments des cycles 122 et 125 bis voyagent avec le code qu'ils gardent.
 */

import type { NotificationContentDetail } from '@meeshy/shared/types/notification-content-detail';

import { notificationString } from '@meeshy/shared/utils/notification-strings';

import type {
  NotificationAttachmentSummary,
  NotificationBannerMedia,
  PreviewPrismBasis,
} from './notification-preview';
import { contentSynthesis, type SynthesisAttachment } from './content-synthesis';

/**
 * Le texte que la bannière AFFICHE — cycle 122.
 *
 * Le Prisme ne s'arrête pas aux champs `translatedContent` /
 * `translatedLanguage` du fil push : ils voyagent depuis le cycle 121 et
 * AUCUN client ne les lit — ni la NSE iOS, ni l'application, ni Android, ni
 * le service worker web. Le seul texte que les trois plateformes rendent est
 * `payload.body`, composé depuis ce `content` : tant qu'il portait l'aperçu
 * ORIGINAL, la bannière restait dans la langue de l'expéditeur pendant que la
 * ligne de liste de la même application servait la traduction. Un contenu
 * RÉSOLU n'est pas un contenu SERVI.
 *
 * La condition de substitution vit en amont, dans le choix de la SOURCE
 * (`previewPrismSource`) : `Message.translations` ne traduit que
 * `Message.content`, un placeholder de protection n'a pas de source, et une
 * transcription a la sienne. Ici il ne reste qu'à servir ce qui a été élu.
 */
export function servedPreview(params: {
  preview: string;
  translation: { readonly text: string } | null;
}): string {
  if (!params.translation) return params.preview;
  // Un aperçu VIDE n'a rien à substituer : le corps se compose alors
  // entièrement des badges de pièce jointe, localisés dans la langue de
  // CADRAGE. Y injecter la traduction remplacerait « 📷 Foto » par un texte
  // dont `Message.content` — vide — n'est pas la source.
  if (params.preview.trim() === '') return params.preview;
  return params.translation.text;
}

/**
 * Le corps AFFICHÉ d'une bannière de message — #14309 (décision porteur du
 * 2026-11-01) : sa SYNTHÈSE, jamais son contenu.
 *
 * **Site UNIQUE pour les trois éventails** (cycle 125 bis : une règle écrite
 * une fois par site finit par manquer à l'un d'eux). Le corps dit la longueur
 * du texte et la nature des pièces jointes, dans la langue de CADRAGE du
 * lecteur ; il ne porte ni le texte, ni sa traduction, ni un nom de fichier, de
 * contact, de lieu ou de lien.
 *
 * Deux exceptions, et elles ne montrent rien non plus :
 *  - un aperçu PROTÉGÉ (vue unique, éphémère, flouté, chiffré) garde son
 *    placeholder d'icônes — il dit déjà la protection et le type ;
 *  - un aperçu qui est la TRANSCRIPTION d'un vocal n'est pas un texte du
 *    message : il ne compte pour aucun mot, la pièce jointe dit « Vocal ».
 *
 * `translation` reste reçu : il élit toujours la piste audio servie
 * (`servedAttachmentMedia`), il ne compose plus le corps.
 */
export function servedBannerBody(params: {
  lang: string;
  preview: string;
  translation: { readonly text: string } | null;
  media?: NotificationBannerMedia;
  /** #8857 — position, contact, invitation, lien, sticker, réponse à une story : cf. `content-detail.ts`. */
  detail?: NotificationContentDetail;
  readerId: string;
  /** Ce que `preview` EST — cf. `PreviewPrismBasis`. */
  basis?: PreviewPrismBasis;
  /** `notificationLocKey` posé : l'aperçu est un placeholder de protection. */
  protectedByLocKey?: boolean;
}): string {
  if (params.protectedByLocKey || params.basis?.kind === 'protected-placeholder') return params.preview;
  const isTranscript = params.basis?.kind === 'transcript';
  const attachments = (params.media?.attachments ?? []).map(synthesisAttachmentOf);
  const synthesis = contentSynthesis(params.lang, {
    text: isTranscript ? '' : params.preview,
    // Une transcription PROUVE une parole : sans inventaire de pièces jointes,
    // c'est un vocal qui se décrit — jamais un corps vide.
    attachments: isTranscript && attachments.length === 0 ? [SPOKEN_AUDIO] : attachments,
    detail: params.detail,
  });
  return storyReplyFramed(params.lang, synthesis, params.detail, params.readerId);
}

const SPOKEN_AUDIO: SynthesisAttachment = { mimeType: 'audio/*', fileName: 'voice.m4a' };

const MIME_OF_TYPE: Readonly<Record<NotificationAttachmentSummary['type'], string>> = {
  image: 'image/*',
  video: 'video/*',
  audio: 'audio/*',
  document: 'application/octet-stream',
  contact: 'text/vcard',
};

function synthesisAttachmentOf(summary: NotificationAttachmentSummary): SynthesisAttachment {
  return {
    mimeType: summary.type === 'contact' ? 'text/vcard' : summary.mimeType ?? MIME_OF_TYPE[summary.type],
    fileName: summary.filename,
    originalName: summary.originalName,
    pageCount: summary.pageCount,
    lineCount: summary.lineCount,
  };
}

function storyReplyFramed(
  lang: string,
  body: string,
  detail: NotificationContentDetail | undefined,
  readerId: string,
): string {
  if (!detail?.storyReply) return body;
  const prefix = notificationString(
    lang,
    detail.storyReply.authorId === readerId ? 'content.storyReply.yours' : 'content.storyReply.other',
  );
  return body ? `${prefix} · ${body}` : prefix;
}
