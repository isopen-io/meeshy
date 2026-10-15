import { maskedAttachment } from '@meeshy/shared/utils/attachment-protection';
import type { ConversationAppearance } from '@meeshy/shared/types/conversation-appearance';
import { PHOTO_BLUR_MAX, PHOTO_VEIL_MAX, PHOTO_VEIL_STEP } from '@meeshy/shared/types/conversation-appearance';

import type { ConversationsDeps } from '@/lib/api/conversations';
import { attachmentSrc } from '@/lib/api/media-url';
import { appearanceText } from '@/lib/i18n-appearance-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { type AppearanceChange, photoBackground, withBackground } from '@/lib/appearance/picker-model';
import { useMediaHubIndex } from '@/lib/view/use-media-hub-index';
import type { MediaHubAttachmentItem } from '@/lib/view/media-hub';

import { ChoiceGroup, PickerSection, type ChoiceItem } from './appearance-picker-parts';

/**
 * **« PHOTO DE LA CONVERSATION »** (#10631, § 9 rangée 4) — la galerie visuelle
 * de CETTE conversation (cache d'abord : la même clé que l'écran des médias),
 * jamais une image d'ailleurs. Ne sont proposées que des images lisibles par
 * tous les membres : ni vue unique, ni floutée, ni éphémère — la passerelle les
 * refuserait de toute façon (404 `ATTACHMENT_NOT_AVAILABLE`). Ni CHIFFRÉE
 * (#10665) : le web n'a aucune clé de pièce, le fond ne la peindrait jamais.
 */
const isPickable = (item: MediaHubAttachmentItem): boolean =>
  item.attachment.mimeType.toLowerCase().startsWith('image/') &&
  !maskedAttachment(item.attachment) &&
  item.attachment.isEncrypted !== true &&
  (item.message as { readonly expiresAt?: unknown }).expiresAt == null;

export function PhotoSection({
  appearance,
  conversationId,
  deps,
  language,
  rtl,
  onChoose,
  onDraft,
  onCommitDraft,
}: {
  readonly appearance: ConversationAppearance;
  readonly conversationId: string;
  readonly deps: ConversationsDeps;
  readonly language: InterfaceLanguage;
  readonly rtl: boolean;
  readonly onChoose: (change: AppearanceChange) => void;
  /** Le curseur bouge : l'aperçu suit, rien n'est envoyé. */
  readonly onDraft: (next: ConversationAppearance) => void;
  /** Le curseur est relâché : le dernier brouillon part. */
  readonly onCommitDraft: () => void;
}) {
  const { query, items } = useMediaHubIndex({ deps, conversationId, kind: 'visual', term: null });
  const photos = (items ?? []).filter((item): item is MediaHubAttachmentItem => item.kind === 'visual' && isPickable(item));
  const { background } = appearance;
  const t = (key: Parameters<typeof appearanceText>[1], params?: Readonly<Record<string, string>>): string => appearanceText(language, key, params);

  const choices: readonly ChoiceItem[] = photos.map((item, index) => {
    const thumb = item.attachment.thumbnailUrl;
    const src = attachmentSrc(thumb !== undefined && thumb !== '' ? thumb : item.attachment.fileUrl);
    return {
      key: item.attachment.id,
      label: t('appearance.photo_item', { index: String(index + 1) }),
      selected: background.kind === 'photo' && background.attachmentId === item.attachment.id,
      onSelect: () => onChoose((current) => withBackground(current, photoBackground(current.background, item.attachment.id))),
      content: <img src={src} alt="" aria-hidden width={56} height={56} loading="lazy" className="rounded-chip" style={{ width: 56, height: 56, objectFit: 'cover' }} />,
    };
  });

  return (
    <PickerSection title={t('appearance.photo')} marker="data-appearance-photo">
      {photos.length === 0 && query.isError ? (
        <p className="px-4 text-caption" style={{ color: 'var(--color-ios-ink-2)' }} data-appearance-photo-unavailable>
          {t('appearance.photo_unavailable')}
        </p>
      ) : photos.length === 0 && !query.isPending ? (
        <p className="px-4 text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
          {t('appearance.photo_empty')}
        </p>
      ) : (
        <ChoiceGroup label={t('appearance.photo')} items={choices} rtl={rtl} size={60} marker="data-appearance-photo-group" />
      )}
      {query.hasNextPage === true ? (
        <button
          type="button"
          onClick={() => void query.fetchNextPage()}
          className="mx-4 self-start rounded-chip px-3 text-caption font-semibold"
          style={{ minHeight: 44, color: 'var(--accent)' }}
        >
          {t('appearance.photo_more')}
        </button>
      ) : null}
      {background.kind === 'photo' ? (
        <div className="flex flex-col gap-1 px-4">
          <Slider
            label={t('appearance.veil')}
            min={0}
            max={PHOTO_VEIL_MAX}
            step={PHOTO_VEIL_STEP}
            value={background.veil}
            marker="data-appearance-veil"
            onInput={(veil) => onDraft({ ...appearance, background: { ...background, veil } })}
            onRelease={onCommitDraft}
          />
          <Slider
            label={t('appearance.blur')}
            min={0}
            max={PHOTO_BLUR_MAX}
            step={1}
            value={background.blur}
            marker="data-appearance-blur"
            onInput={(blur) => onDraft({ ...appearance, background: { ...background, blur } })}
            onRelease={onCommitDraft}
          />
        </div>
      ) : null}
    </PickerSection>
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  marker,
  onInput,
  onRelease,
}: {
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly value: number;
  readonly marker: `data-${string}`;
  readonly onInput: (value: number) => void;
  readonly onRelease: () => void;
}) {
  return (
    <label className="flex items-center gap-3" style={{ minHeight: 44, color: 'var(--color-ios-ink)' }}>
      <span className="text-body" style={{ minWidth: 72 }}>
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(event) => onInput(Number(event.currentTarget.value))}
        onPointerUp={onRelease}
        onKeyUp={onRelease}
        onBlur={onRelease}
        className="flex-1"
        style={{ accentColor: 'var(--accent)', minHeight: 44 }}
        {...{ [marker]: '' }}
      />
    </label>
  );
}
