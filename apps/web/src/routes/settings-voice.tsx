import { useQuery } from '@tanstack/react-query';
import { useId } from 'react';

import type { ConsentPurpose } from '@meeshy/shared/types/consents';

import { Glyph, GlyphSvg } from '@/components/glyph';
import type { GlyphName } from '@/components/glyphs';
import { SETTINGS_GLYPHS } from '@/components/glyphs-settings';
import { GroupedSection, RowIcon, SECTION_BRAND_INK, SECTION_INK, SECTION_INK_2 } from '@/components/grouped-section';
import { consentsQueryOptions, effectiveConsent, type GrantedConsents } from '@/lib/api/consents';
import { performConsentEdit, type ConsentEditOutcome } from '@/lib/api/consents-actions';
import { apiDeps } from '@/lib/api/deps';
import { appQueryClient } from '@/lib/api/query-client';
import { translateVoice, type VoiceCatalogKey } from '@/lib/i18n-voice-catalog';
import { useVoiceCatalog } from '@/lib/use-voice-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { Switch } from '@/routes/settings-sections';

/**
 * **RÉGLAGES › VOIX** (#16419) — miroir des sections « Profil vocal » et
 * « Transcription » de `SettingsView.swift` et de la bascule de clonage de
 * `VoiceProfileManageView`. Trois droits, trois consentements de la chaîne
 * vocale que la passerelle horodate (`GET`/`PUT /me/consents`,
 * `ConsentValidationService`) :
 *  - TRANSCRIRE ⇒ `voice-data` (`canTranscribeAudio`) ;
 *  - TRADUIRE ⇒ `voice-profile` — le consentement vocal dont l'absence pose
 *    la note sous mon propre vocal (`VoiceConsentGate`, iOS) ;
 *  - CLONER ⇒ `voice-cloning` (`canUseVoiceCloning`).
 *
 * Une bascule montre l'état EFFECTIF (le droit ET sa chaîne) ; l'octroi pose
 * les ancêtres manquants, le retrait ne retire que lui — exactement la route.
 * Les bascules sont optimistes (`performConsentEdit`) et grisées hors ligne.
 *
 * La section est PURE (`VoiceSectionView`) ; `VoiceSection` la branche sur le
 * cache des consentements, déjà relu à la connexion (`main.tsx`). Ses
 * libellés vivent hors du catalogue d'interface : la section attend le sien.
 */

export type VoiceView = { readonly kind: 'ready'; readonly granted: GrantedConsents } | { readonly kind: 'loading' } | { readonly kind: 'error' };

type VoiceRight = {
  readonly purpose: ConsentPurpose;
  readonly label: VoiceCatalogKey;
  readonly caption: VoiceCatalogKey;
  readonly icon: { readonly set: 'socle'; readonly name: GlyphName } | { readonly set: 'ecran'; readonly name: 'chatText' };
  readonly tint: string;
};

export const VOICE_RIGHTS: readonly VoiceRight[] = [
  { purpose: 'voice-data', label: 'voice.transcription', caption: 'voice.transcription.info', icon: { set: 'ecran', name: 'chatText' }, tint: 'var(--ios-indigo-400)' },
  { purpose: 'voice-profile', label: 'voice.translation', caption: 'voice.translation.info', icon: { set: 'socle', name: 'translate' }, tint: 'var(--color-success)' },
  { purpose: 'voice-cloning', label: 'voice.cloning', caption: 'voice.cloning.info', icon: { set: 'socle', name: 'microphone' }, tint: 'var(--color-warning)' },
];


function RightRow({
  language,
  right,
  checked,
  disabled,
  onToggle,
}: {
  readonly language: InterfaceLanguage;
  readonly right: VoiceRight;
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly onToggle: (purpose: ConsentPurpose, granted: boolean) => void;
}) {
  const captionId = useId();
  const label = translateVoice(language, right.label);
  return (
    <div className="flex items-center gap-3 px-3.5 py-2.5" style={{ minHeight: 52 }}>
      <RowIcon tint={right.tint}>
        {right.icon.set === 'socle' ? <Glyph name={right.icon.name} size={15} /> : <GlyphSvg glyph={SETTINGS_GLYPHS[right.icon.name]} size={15} />}
      </RowIcon>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="break-words text-body font-medium" style={{ color: SECTION_INK }}>
          {label}
        </span>
        <span id={captionId} className="text-caption" style={{ color: SECTION_INK_2 }}>
          {translateVoice(language, right.caption)}
        </span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        aria-describedby={captionId}
        data-setting={right.purpose}
        disabled={disabled}
        onClick={() => onToggle(right.purpose, !checked)}
        className="grid shrink-0 place-items-center rounded-chip focus-visible:outline-2"
        style={{ minWidth: 56, minHeight: 44, outlineColor: 'var(--color-ios-brand)', opacity: disabled ? 0.5 : 1 }}
      >
        <Switch checked={checked} />
      </button>
    </div>
  );
}

export function VoiceSectionView({
  language,
  view,
  disabled,
  onToggle,
  onRetry,
}: {
  readonly language: InterfaceLanguage;
  readonly view: VoiceView;
  readonly disabled: boolean;
  readonly onToggle: (purpose: ConsentPurpose, granted: boolean) => void;
  readonly onRetry: () => void;
}) {
  if (!useVoiceCatalog(language)) return null;
  return (
    <GroupedSection id="settings-voice" title={translateVoice(language, 'voice.title').toLocaleUpperCase(language)} icon={<Glyph name="microphone" size={12} />}>
      <p className="px-3.5 pt-2.5 text-caption" style={{ color: SECTION_INK_2 }}>
        {translateVoice(language, 'voice.intro')}
      </p>
      {view.kind === 'loading' ? (
        <p aria-busy="true" data-voice-loading className="px-3.5 py-2.5 text-caption" style={{ color: SECTION_INK_2 }}>
          {translateVoice(language, 'voice.loading')}
        </p>
      ) : view.kind === 'error' ? (
        <div data-voice-error className="flex items-center gap-3 px-3.5 py-2.5" style={{ minHeight: 52 }}>
          <span aria-hidden="true" style={{ color: 'var(--color-error)' }}>
            <Glyph name="warningCircle" size={18} />
          </span>
          <span className="min-w-0 flex-1 text-body" style={{ color: SECTION_INK }}>
            {translateVoice(language, 'voice.unavailable')}
          </span>
          <button
            type="button"
            data-voice-retry
            onClick={onRetry}
            className={`grid shrink-0 place-items-center rounded-chip px-3 text-caption font-semibold focus-visible:outline-2 ${SECTION_BRAND_INK}`}
            style={{ minHeight: 44, outlineColor: 'var(--color-ios-brand)' }}
          >
            {translateVoice(language, 'voice.retry')}
          </button>
        </div>
      ) : (
        VOICE_RIGHTS.map((right) => (
          <RightRow
            key={right.purpose}
            language={language}
            right={right}
            checked={effectiveConsent(view.granted, right.purpose)}
            disabled={disabled}
            onToggle={onToggle}
          />
        ))
      )}
    </GroupedSection>
  );
}

export function VoiceSection({
  language,
  enabled,
  online,
  onOutcome,
}: {
  readonly language: InterfaceLanguage;
  readonly enabled: boolean;
  readonly online: boolean;
  readonly onOutcome: (outcome: ConsentEditOutcome) => void;
}) {
  const query = useQuery({ ...consentsQueryOptions(apiDeps), enabled }, appQueryClient);
  const view: VoiceView =
    query.data !== undefined ? { kind: 'ready', granted: query.data } : query.status === 'error' ? { kind: 'error' } : { kind: 'loading' };
  const toggle = (purpose: ConsentPurpose, granted: boolean) => {
    void performConsentEdit({
      purpose,
      granted,
      deps: { ...apiDeps, queryClient: appQueryClient, isOnline: () => navigator.onLine },
    }).then(onOutcome);
  };
  return <VoiceSectionView language={language} view={view} disabled={!online} onToggle={toggle} onRetry={() => void query.refetch()} />;
}
