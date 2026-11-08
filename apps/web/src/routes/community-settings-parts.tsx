import { Glyph } from '@/components/glyph';
import { GroupedSection, SECTION_CARD_STYLE, SECTION_INK, SECTION_INK_2 } from '@/components/grouped-section';
import { translateCommunitySettings } from '@/lib/i18n-community-settings-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * Les pièces dessinées de l'écran Réglages d'une communauté (#6377) — miroir
 * `CommunitySettingsScreen.swift` : « Enregistrer », la zone dangereuse et le
 * refus d'un lecteur qui ne l'a pas créée.
 */

const ERROR_INK = 'var(--color-error)';
const BRAND = 'var(--color-ios-brand)';

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
