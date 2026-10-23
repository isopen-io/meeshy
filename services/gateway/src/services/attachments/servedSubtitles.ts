/**
 * Les sous-titres SERVIS d'une pièce jointe (#11329) : la transcription d'une
 * vidéo ou d'un vocal en WebVTT, dans la langue du lecteur.
 *
 * Deux lois, une par question :
 * - QUELLE langue : le Prisme, délégué à `prismSubtitleLanguage`
 *   (`@meeshy/shared/utils/subtitles`), qui descend `resolvePrismTranslation`
 *   rang par rang ; jamais la première traduction venue.
 * - le DROIT de voyager : une pièce protégée — vue unique, floutée, effet
 *   masquant, éphémère, chiffrée, au niveau de la PIÈCE comme du MESSAGE qui
 *   la porte — ne transporte pas sa transcription à côté du média qu'on a
 *   caché. L'éphémère est refusé dès que l'échéance est POSÉE, pas seulement
 *   échue : c'est la règle de l'aperçu de notification (`protectedPreview`).
 */
import { mediaSideContentMayTravel, type SideContentCarrier } from './mediaSideContent';
import { prismSubtitleLanguage, subtitleCuesFor, webVtt } from '@meeshy/shared/utils/subtitles';

export const SUBTITLE_AUTO = 'auto';

export const SUBTITLE_LANG_PATTERN = '^(auto|[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*)$';

export const subtitleSourceSelect = {
  id: true,
  messageId: true,
  uploadedBy: true,
  transcription: true,
  translations: true,
  isViewOnce: true,
  isBlurred: true,
  effectFlags: true,
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

export type SubtitleCarrier = SideContentCarrier;

export type SubtitleSource = Protection & {
  readonly transcription: unknown;
  readonly translations: unknown;
};

export const subtitlesMayTravel = mediaSideContentMayTravel;

export type ServedSubtitles = { readonly language: string; readonly vtt: string };

export function servedSubtitles(params: {
  readonly attachment: SubtitleSource;
  readonly carrier: SubtitleCarrier | null;
  readonly requested: string;
  readonly readerLanguages: readonly string[];
}): ServedSubtitles | null {
  const { attachment, carrier, requested, readerLanguages } = params;
  if (!subtitlesMayTravel(attachment, carrier)) return null;
  const language = requested === SUBTITLE_AUTO
    ? prismSubtitleLanguage({
        transcription: attachment.transcription,
        translations: attachment.translations,
        preferredLanguages: readerLanguages,
      })
    : requested;
  if (!language) return null;
  const cues = subtitleCuesFor({ transcription: attachment.transcription, translations: attachment.translations, language });
  return cues && cues.length > 0 ? { language, vtt: webVtt(cues) } : null;
}
