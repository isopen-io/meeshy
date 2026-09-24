/**
 * **LA CARTE DES TYPES QU'UN EXPORT SAIT SERVIR** (#7116) — miroir EXACT de
 * `EXTENSION_BY_MIME` (`services/gateway/src/routes/posts/media-export.ts:39-46`) :
 * la passerelle répond 404 à tout autre type (`:139-142`). Un média hors de
 * cette carte n'est donc PAS téléchargeable, et le bouton qui le promettrait
 * serait un contrôle sans effet (loi 4).
 *
 * UNE ENTRÉE de plus que la passerelle, et une seule : le stand-in SVG des
 * fixtures (`STORY_PHOTO_STAND_IN`, `fixtures-stories.ts`), que la passerelle
 * réelle ne sert jamais — sans elle, la recette sur fixtures n'aurait rien à
 * enregistrer.
 *
 * SITE UNIQUE, lu par la décision d'OFFRIR le geste (`storyDownloadableMedia`,
 * `lib/api/story-export.ts`, chunk du lecteur) et par le nom de repli du
 * fichier (`fileNameOf`, `lib/media/download-file.ts`, chunk à la demande) —
 * deux copies de cette carte finiraient par ne plus dire la même chose.
 */
export const EXPORT_EXTENSION_BY_MIME: Readonly<Record<string, string>> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
  'image/svg+xml': '.svg',
};
