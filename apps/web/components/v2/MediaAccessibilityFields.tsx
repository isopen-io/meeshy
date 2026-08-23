'use client';

import { useI18n } from '@/hooks/use-i18n';
import { cn } from '@/lib/utils';
import { isVideoMimeType, type UploadedAttachmentResponse } from '@meeshy/shared/types/attachment';

/**
 * Collecte, PAR média uploadé, le texte alternatif d'accessibilité — et,
 * quand au moins une vidéo est présente, l'opt-in `allowSoundExtraction`.
 *
 * Les deux champs traversent déjà le transport (`CreatePostRequest.mediaAlt`
 * / `.allowSoundExtraction`, `apps/web/services/posts.service.ts`) mais rien
 * ne les collectait côté UI avant ce composant — parité C7-UI avec le
 * composer iOS (`MediaAccessibilityStore` + `MediaAltTextField` +
 * `SoundExtractionToggle`, `packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/`).
 *
 * `allowSoundExtraction` est un flag UNIQUE sur le post entier
 * (`Post.allowSoundExtraction`, `schema.prisma:3125`), pas un champ par
 * média : un seul interrupteur pour toute la liste, jamais un par ligne.
 */
export interface MediaAccessibilityFieldsProps {
  readonly attachments: readonly UploadedAttachmentResponse[];
  readonly altById: Readonly<Record<string, string>>;
  readonly onAltChange: (mediaId: string, text: string) => void;
  readonly allowSoundExtraction: boolean;
  readonly onAllowSoundExtractionChange: (allowed: boolean) => void;
  readonly className?: string;
}

const ALT_MAX_LENGTH = 1000;

function MediaAccessibilityFields({
  attachments,
  altById,
  onAltChange,
  allowSoundExtraction,
  onAllowSoundExtractionChange,
  className,
}: MediaAccessibilityFieldsProps) {
  const { t } = useI18n('common');

  if (attachments.length === 0) return null;

  const hasVideo = attachments.some((att) => isVideoMimeType(att.mimeType));

  return (
    <div
      className={cn('mt-3 flex flex-col gap-2 rounded-lg border border-[var(--gp-border)] p-3', className)}
      data-testid="media-accessibility-fields"
    >
      {attachments.map((attachment) => (
        <div key={attachment.id} className="flex flex-col gap-1">
          <label
            htmlFor={`media-alt-${attachment.id}`}
            className="text-xs font-medium text-[var(--gp-text-secondary)]"
          >
            {t('postComposer.mediaAlt.label')} — {attachment.originalName}
          </label>
          <input
            id={`media-alt-${attachment.id}`}
            data-testid={`media-alt-input-${attachment.id}`}
            type="text"
            value={altById[attachment.id] ?? ''}
            onChange={(e) => onAltChange(attachment.id, e.target.value.slice(0, ALT_MAX_LENGTH))}
            placeholder={t('postComposer.mediaAlt.placeholder')}
            maxLength={ALT_MAX_LENGTH}
            aria-label={`${t('postComposer.mediaAlt.label')} — ${attachment.originalName}`}
            className={cn(
              'w-full rounded-md border border-[var(--gp-border)] bg-transparent px-2 py-1 text-sm outline-none',
              'text-[var(--gp-text-primary)] placeholder:text-[var(--gp-text-muted)]',
              'focus:border-[var(--gp-terracotta)]',
            )}
          />
        </div>
      ))}

      {hasVideo && (
        <label className="mt-1 flex items-start gap-2 text-xs text-[var(--gp-text-secondary)]">
          <input
            type="checkbox"
            data-testid="media-sound-extraction-checkbox"
            checked={allowSoundExtraction}
            onChange={(e) => onAllowSoundExtractionChange(e.target.checked)}
            className="mt-0.5"
            aria-describedby="media-accessibility-sound-extraction-caption"
          />
          <span className="flex flex-col gap-0.5">
            <span className="font-medium text-[var(--gp-text-primary)]">
              {t('postComposer.soundExtraction.label')}
            </span>
            <span id="media-accessibility-sound-extraction-caption">
              {t('postComposer.soundExtraction.caption')}
            </span>
          </span>
        </label>
      )}
    </div>
  );
}

MediaAccessibilityFields.displayName = 'MediaAccessibilityFields';
export { MediaAccessibilityFields };
