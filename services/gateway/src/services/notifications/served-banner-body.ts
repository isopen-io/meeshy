/**
 * Le CORPS servi d'une bannière de message — extrait de `NotificationService.ts`
 * (#8857) avant d'y ajouter le détail du contenu. Fonctions PURES ; les
 * doc-comments des cycles 122 et 125 bis voyagent avec le code qu'ils gardent.
 */

import type { NotificationContentDetail } from '@meeshy/shared/types/notification-content-detail';

import { buildMessageNotificationBodyI18n, type NotificationBannerMedia } from './notification-preview';
import { detailedBannerBody } from './content-detail';

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
 * Le corps AFFICHÉ d'une bannière de message — cycle 125 bis.
 *
 * Deux compositions en une, et c'est leur ORDRE qui compte : le texte servi
 * par le Prisme ({@link servedPreview}), puis le passage par
 * `buildMessageNotificationBodyI18n`, qui remplace un texte ABSENT par le
 * libellé de la première pièce jointe et suffixe les badges des suivantes.
 *
 * **Site UNIQUE pour les trois éventails**, et la raison est mesurée :
 * `createMessageNotification` était le seul des trois à composer, si bien que
 * la bannière d'une RÉPONSE ou d'une MENTION portant un vocal ou une photo
 * sans légende arrivait avec un corps VIDE — le symptôme « deux textes pour
 * un même message » (cycles 121-124) dans sa forme extrême, le second étant
 * vide. C'est la leçon 271 : une règle écrite une fois par site finit par
 * manquer à l'un d'eux.
 *
 * Sans média (`media` absent ou vide), le résultat est exactement le texte
 * servi — les deux éventails qui n'en portaient pas gardent leur corps au
 * caractère près.
 */
export function servedBannerBody(params: {
  lang: string;
  preview: string;
  translation: { readonly text: string } | null;
  media?: NotificationBannerMedia;
  /** #8857 — position, contact, invitation, lien, sticker, réponse à une story : cf. `content-detail.ts`. */
  detail?: NotificationContentDetail;
  readerId: string;
}): string {
  return detailedBannerBody(params.lang, {
    text: servedPreview({ preview: params.preview, translation: params.translation }),
    detail: params.detail,
    readerId: params.readerId,
    compose: (text) => buildMessageNotificationBodyI18n(params.lang, {
      messagePreview: text,
      attachments: params.media?.attachments,
      firstAttachmentFileSize: params.media?.firstAttachmentFileSize,
      firstAttachmentDuration: params.media?.firstAttachmentDuration,
      firstAttachmentWidth: params.media?.firstAttachmentWidth,
      firstAttachmentHeight: params.media?.firstAttachmentHeight,
    }),
  });
}
