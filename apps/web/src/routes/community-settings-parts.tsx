import { Glyph } from '@/components/glyph';
import { GroupedSection, SECTION_CARD_STYLE, SECTION_INK, SECTION_INK_2 } from '@/components/grouped-section';
import type { CommunityImageKind } from '@/lib/api/community-settings';
import { communityAccent } from '@/lib/communities/view';
import { translateCommunitySettings } from '@/lib/i18n-community-settings-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { CommunityBanner, EntityAvatar } from '@/routes/communities-parts';

/**
 * Les pièces dessinées de l'écran Réglages d'une communauté (#6377) — miroir
 * `CommunitySettingsScreen.swift` : la bannière et l'avatar qui la chevauche,
 * « Enregistrer », la zone dangereuse et le refus d'un lecteur qui ne l'a pas
 * créée.
 */

const ERROR_INK = 'var(--color-error)';
const BRAND = 'var(--color-ios-brand)';
const ON_MEDIA = 'var(--color-on-media)';
const BANNER_HEIGHT = 120;

export type ShownImages = { readonly avatar: string | null; readonly banner: string | null };
export type UploadingImages = Readonly<Partial<Record<CommunityImageKind, true>>>;

function UploadVeil({ language, round }: { readonly language: InterfaceLanguage; readonly round: boolean }) {
  return (
    <span
      data-community-settings-uploading=""
      className="absolute inset-0 grid place-items-center"
      style={{ backgroundColor: 'var(--color-scrim)', borderRadius: round ? 18 : 16 }}
    >
      <span className="sr-only">{translateCommunitySettings(language, 'community.settings.image.uploading')}</span>
    </span>
  );
}

/**
 * Miroir `CommunitySettingsScreen.visualSection` : la bannière (120 pt,
 * « Modifier » en bas à droite) et l'avatar qui la chevauche (crayon), puis le
 * nom. Chaque bouton ouvre le sélecteur de fichier de l'écran ; pendant un
 * envoi, l'image choisie s'affiche sous un voile et son bouton se tait.
 */
export function SettingsImages({
  language,
  name,
  shown,
  uploading,
  disabled,
  onPick,
}: {
  readonly language: InterfaceLanguage;
  readonly name: string;
  readonly shown: ShownImages;
  readonly uploading: UploadingImages;
  readonly disabled: boolean;
  readonly onPick: (kind: CommunityImageKind) => void;
}) {
  const accent = communityAccent(name);
  const bannerBusy = uploading.banner === true;
  const avatarBusy = uploading.avatar === true;
  return (
    <div data-community-settings-images className="grid justify-items-center">
      <div className="relative w-full overflow-hidden" style={{ height: BANNER_HEIGHT, borderRadius: 16 }} aria-busy={bannerBusy || undefined}>
        <CommunityBanner accent={accent} banner={shown.banner} />
        {bannerBusy ? <UploadVeil language={language} round={false} /> : null}
        <button
          type="button"
          data-community-settings-pick="banner"
          aria-label={translateCommunitySettings(language, 'community.settings.banner.change')}
          disabled={disabled || bannerBusy}
          aria-disabled={disabled || bannerBusy}
          onClick={() => onPick('banner')}
          className="absolute bottom-0 end-0 grid place-items-center focus-visible:outline-2 focus-visible:-outline-offset-4"
          style={{ minWidth: 44, minHeight: 44, padding: 8, color: ON_MEDIA, outlineColor: ON_MEDIA, opacity: disabled || bannerBusy ? 0.55 : 1 }}
        >
          <span className="flex items-center gap-1.5 rounded-chip px-2.5 py-1.5 text-chip font-semibold" style={{ backgroundColor: 'var(--color-scrim-strong)' }}>
            <span aria-hidden="true">
              <Glyph name="image" size={12} />
            </span>
            {translateCommunitySettings(language, 'community.settings.banner.edit')}
          </span>
        </button>
      </div>
      <div className="relative" style={{ marginTop: -40 }} aria-busy={avatarBusy || undefined}>
        <EntityAvatar name={name} avatar={shown.avatar} accent={accent} />
        {avatarBusy ? <UploadVeil language={language} round /> : null}
        <button
          type="button"
          data-community-settings-pick="avatar"
          aria-label={translateCommunitySettings(language, 'community.settings.avatar.change')}
          disabled={disabled || avatarBusy}
          aria-disabled={disabled || avatarBusy}
          onClick={() => onPick('avatar')}
          className="absolute grid place-items-center rounded-chip focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ insetInlineEnd: -14, bottom: -14, width: 44, height: 44, color: BRAND, outlineColor: BRAND, opacity: disabled || avatarBusy ? 0.55 : 1 }}
        >
          <span
            aria-hidden="true"
            className="grid place-items-center rounded-chip"
            style={{ width: 30, height: 30, backgroundColor: 'var(--color-ios-card)', boxShadow: '0 0 0 2px var(--color-ios-card)' }}
          >
            <Glyph name="image" size={16} />
          </span>
        </button>
      </div>
      <p data-community-settings-name className="mt-2 max-w-full truncate text-body font-bold" style={{ color: 'var(--color-ios-ink)' }}>
        {name}
      </p>
    </div>
  );
}

export function SettingsSaveButton({
  language,
  saving,
  disabled,
}: {
  readonly language: InterfaceLanguage;
  readonly saving: boolean;
  readonly disabled: boolean;
}) {
  return (
    <button
      type="submit"
      data-community-settings-save
      disabled={disabled}
      aria-disabled={disabled}
      aria-busy={saving}
      className="flex w-full items-center justify-center rounded-card text-body font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{
        minHeight: 50,
        backgroundColor: 'var(--ios-indigo-600)',
        color: 'var(--color-ios-on-brand)',
        outlineColor: BRAND,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {translateCommunitySettings(language, saving ? 'community.settings.saving' : 'community.settings.save')}
    </button>
  );
}

export function SettingsDangerZone({
  language,
  disabled,
  onDelete,
}: {
  readonly language: InterfaceLanguage;
  readonly disabled: boolean;
  readonly onDelete: () => void;
}) {
  return (
    <GroupedSection id="community-settings-danger" title={translateCommunitySettings(language, 'community.settings.section.danger')} icon={<Glyph name="warningCircle" size={14} />}>
      <button
        type="button"
        data-community-settings-delete
        disabled={disabled}
        aria-disabled={disabled}
        onClick={onDelete}
        className="flex items-center gap-3 px-3.5 text-start text-body font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2"
        style={{ minHeight: 52, color: ERROR_INK, outlineColor: ERROR_INK, opacity: disabled ? 0.55 : 1 }}
      >
        <span aria-hidden="true">
          <Glyph name="x" size={18} />
        </span>
        <span className="flex-1">{translateCommunitySettings(language, 'community.settings.delete.label')}</span>
      </button>
    </GroupedSection>
  );
}

export function SettingsCreatorOnly({ language }: { readonly language: InterfaceLanguage }) {
  return (
    <div role="alert" data-community-settings-refused className="grid justify-items-center gap-2 rounded-card px-6 py-8 text-center" style={SECTION_CARD_STYLE}>
      <span aria-hidden="true" style={{ color: SECTION_INK_2 }}>
        <Glyph name="lock" size={28} />
      </span>
      <p className="text-body font-semibold" style={{ color: SECTION_INK }}>
        {translateCommunitySettings(language, 'community.settings.refused.title')}
      </p>
      <p className="text-caption" style={{ color: SECTION_INK_2 }}>
        {translateCommunitySettings(language, 'community.settings.refused.body')}
      </p>
    </div>
  );
}
