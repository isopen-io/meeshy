import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useState } from 'react';

import {
  CIRCLE_NOTIFY_FAMILIES,
  RELATION_AUDIENCE_CHOICES,
  RELATION_LEVEL_LABELS,
  circleNotifyKey,
  type CircleNotifyAction,
  type CircleNotifyFamily,
  type CircleNotifyKey,
  type RelationAudienceChoice,
  type RelationLabelLanguage,
} from '@meeshy/shared/utils/relation-levels';

import { Glyph, GlyphSvg } from '@/components/glyph';
import { SETTINGS_GLYPHS } from '@/components/glyphs-settings';
import { GroupedSection, SECTION_BRAND_INK, SECTION_INK, SECTION_INK_2 } from '@/components/grouped-section';
import {
  circleNotifyQueryOptions,
  performCircleNotifyEdit,
  type CircleNotifyEditOutcome,
  type CircleNotifyPreferences,
} from '@/lib/api/circle-notify-preferences';
import { apiDeps } from '@/lib/api/deps';
import { appQueryClient } from '@/lib/api/query-client';
import {
  isCircleNotifyCatalogLoaded,
  loadCircleNotifyCatalog,
  translateCircleNotify,
  type CircleNotifyCatalogKey,
} from '@/lib/i18n-circle-notify-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **« QUI EST PRÉVENU »** (#14063) — Réglages › Notifications. Trois
 * familles (`CIRCLE_NOTIFY_FAMILIES`, `@meeshy/shared`), une rangée chacune,
 * qui se déplie par action ; chaque action porte un sélecteur NATIF des sept
 * crans (Personne · Sang · Proche · Ami · Connaissance · Communauté · Public) :
 * le clavier et le lecteur d'écran le parcourent sans rien réinventer.
 *
 * Le défaut est montré tel que la passerelle le sert (Proche, Proche, Sang),
 * sans configuration préalable ; une famille dont les actions diffèrent le
 * dit. Sous Communauté et Public, une phrase dit en clair qui sera prévenu —
 * Public n'envoie jamais à tout Meeshy (ADR gateway #13929, point 4).
 *
 * La section est PURE (`CircleNotifySectionView`) ; `CircleNotifySection`
 * la branche sur sa requête et sur l'écriture optimiste
 * (`performCircleNotifyEdit`). Ses libellés vivent hors du catalogue
 * d'interface : la section attend le sien.
 */

export type CircleNotifyView =
  | { readonly kind: 'ready'; readonly preferences: CircleNotifyPreferences }
  | { readonly kind: 'loading' }
  | { readonly kind: 'error' };

const FAMILIES = Object.keys(CIRCLE_NOTIFY_FAMILIES) as readonly CircleNotifyFamily[];

const LABEL_LANGUAGE: Readonly<Record<InterfaceLanguage, RelationLabelLanguage>> = {
  fr: 'fr',
  en: 'en',
  es: 'es',
  pt: 'pt-BR',
  de: 'de',
  it: 'it',
  ar: 'ar',
};

const t = (language: InterfaceLanguage, key: CircleNotifyCatalogKey): string => translateCircleNotify(language, key);

function choiceLabel(language: InterfaceLanguage, choice: RelationAudienceChoice): string {
  return choice === 'NOBODY' ? t(language, 'circleNotify.choice.NOBODY') : RELATION_LEVEL_LABELS[LABEL_LANGUAGE[language]][choice];
}

function explanationKey(choice: RelationAudienceChoice): CircleNotifyCatalogKey | null {
  if (choice === 'NOBODY') return 'circleNotify.explain.NOBODY';
  if (choice === 'COMMUNITY') return 'circleNotify.explain.COMMUNITY';
  if (choice === 'PUBLIC') return 'circleNotify.explain.PUBLIC';
  return null;
}

const familyKeys = (family: CircleNotifyFamily): ReadonlyArray<readonly [CircleNotifyAction<CircleNotifyFamily>, CircleNotifyKey]> =>
  CIRCLE_NOTIFY_FAMILIES[family].actions.map((action) => [action, circleNotifyKey(family, action as CircleNotifyAction<typeof family>)] as const);

function familySummary(language: InterfaceLanguage, family: CircleNotifyFamily, preferences: CircleNotifyPreferences): string {
  const values = new Set(familyKeys(family).map(([, key]) => preferences[key]));
  const [only] = [...values];
  return values.size === 1 && only !== undefined ? choiceLabel(language, only) : t(language, 'circleNotify.summary.mixed');
}

function useCircleNotifyCatalog(language: InterfaceLanguage): boolean {
  const [, setLoaded] = useState<InterfaceLanguage | null>(null);
  useEffect(() => {
    if (isCircleNotifyCatalogLoaded(language)) return undefined;
    let live = true;
    loadCircleNotifyCatalog(language).then(
      () => {
        if (live) setLoaded(language);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [language]);
  return isCircleNotifyCatalogLoaded(language);
}

function ActionRow({
  language,
  action,
  circleKey,
  value,
  disabled,
  onChoose,
}: {
  readonly language: InterfaceLanguage;
  readonly action: string;
  readonly circleKey: CircleNotifyKey;
  readonly value: RelationAudienceChoice;
  readonly disabled: boolean;
  readonly onChoose: (key: CircleNotifyKey, value: RelationAudienceChoice) => void;
}) {
  const selectId = useId();
  const explainId = useId();
  const explanation = explanationKey(value);
  return (
    <div className="grid gap-1 px-3.5 py-2" style={{ minHeight: 52 }}>
      <div className="flex items-center gap-3">
        <label htmlFor={selectId} className="min-w-0 flex-1 text-body" style={{ color: SECTION_INK }}>
          {t(language, `circleNotify.action.${action}` as CircleNotifyCatalogKey)}
        </label>
        <select
          id={selectId}
          data-circle-key={circleKey}
          value={value}
          disabled={disabled}
          {...(explanation === null ? {} : { 'aria-describedby': explainId })}
          onChange={(event) => {
            const next = RELATION_AUDIENCE_CHOICES.find((choice) => choice === event.currentTarget.value);
            if (next !== undefined && next !== value) onChoose(circleKey, next);
          }}
          className={`shrink-0 rounded-chip bg-transparent px-2 text-caption font-semibold focus-visible:outline-2 disabled:opacity-50 ${SECTION_BRAND_INK}`}
          style={{ minHeight: 44, outlineColor: 'var(--color-ios-brand)' }}
        >
          {RELATION_AUDIENCE_CHOICES.map((choice) => (
            <option key={choice} value={choice}>
              {choiceLabel(language, choice)}
            </option>
          ))}
        </select>
      </div>
      {explanation === null ? null : (
        <p id={explainId} className="text-caption" style={{ color: SECTION_INK_2 }}>
          {t(language, explanation)}
        </p>
      )}
    </div>
  );
}

function FamilyRow({
  language,
  family,
  preferences,
  disabled,
  onChoose,
}: {
  readonly language: InterfaceLanguage;
  readonly family: CircleNotifyFamily;
  readonly preferences: CircleNotifyPreferences;
  readonly disabled: boolean;
  readonly onChoose: (key: CircleNotifyKey, value: RelationAudienceChoice) => void;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div>
      <button
        type="button"
        data-circle-family={family}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center gap-3 px-3.5 py-2.5 text-start focus-visible:outline-2"
        style={{ minHeight: 52, outlineColor: 'var(--color-ios-brand)' }}
      >
        <span className="min-w-0 flex-1 break-words text-body font-medium" style={{ color: SECTION_INK }}>
          {t(language, `circleNotify.family.${family}`)}
        </span>
        <span className="shrink-0 text-caption" style={{ color: SECTION_INK_2 }}>
          {familySummary(language, family, preferences)}
        </span>
        <span aria-hidden="true" className="shrink-0" style={{ color: SECTION_INK_2 }}>
          <GlyphSvg glyph={SETTINGS_GLYPHS.caretRight} size={12} className={open ? 'rotate-90' : 'rtl:-scale-x-100'} />
        </span>
      </button>
      <div id={panelId} hidden={!open}>
        {open
          ? familyKeys(family).map(([action, key]) => (
              <ActionRow
                key={key}
                language={language}
                action={action}
                circleKey={key}
                value={preferences[key]}
                disabled={disabled}
                onChoose={onChoose}
              />
            ))
          : null}
      </div>
    </div>
  );
}

export function CircleNotifySectionView({
  language,
  view,
  disabled,
  onChoose,
  onRetry,
}: {
  readonly language: InterfaceLanguage;
  readonly view: CircleNotifyView;
  readonly disabled: boolean;
  readonly onChoose: (key: CircleNotifyKey, value: RelationAudienceChoice) => void;
  readonly onRetry: () => void;
}) {
  if (!useCircleNotifyCatalog(language)) return null;
  return (
    <GroupedSection id="settings-circle-notify" title={t(language, 'circleNotify.title').toLocaleUpperCase(language)} icon={<Glyph name="users" size={12} />}>
      <p className="px-3.5 pt-2.5 text-caption" style={{ color: SECTION_INK_2 }}>
        {t(language, 'circleNotify.intro')}
      </p>
      {view.kind === 'loading' ? (
        <p aria-busy="true" className="px-3.5 py-2.5 text-caption" style={{ color: SECTION_INK_2 }}>
          {t(language, 'circleNotify.loading')}
        </p>
      ) : view.kind === 'error' ? (
        <div className="flex items-center gap-3 px-3.5 py-2.5" style={{ minHeight: 52 }}>
          <span className="min-w-0 flex-1 text-body" style={{ color: SECTION_INK }}>
            {t(language, 'circleNotify.unavailable')}
          </span>
          <button
            type="button"
            data-circle-retry
            onClick={onRetry}
            className={`grid shrink-0 place-items-center rounded-chip px-3 text-caption font-semibold focus-visible:outline-2 ${SECTION_BRAND_INK}`}
            style={{ minHeight: 44, outlineColor: 'var(--color-ios-brand)' }}
          >
            {t(language, 'circleNotify.retry')}
          </button>
        </div>
      ) : (
        FAMILIES.map((family) => (
          <FamilyRow key={family} language={language} family={family} preferences={view.preferences} disabled={disabled} onChoose={onChoose} />
        ))
      )}
    </GroupedSection>
  );
}

export function CircleNotifySection({
  language,
  enabled,
  online,
  onOutcome,
}: {
  readonly language: InterfaceLanguage;
  readonly enabled: boolean;
  readonly online: boolean;
  readonly onOutcome: (outcome: CircleNotifyEditOutcome) => void;
}) {
  const query = useQuery({ ...circleNotifyQueryOptions(apiDeps), enabled }, appQueryClient);
  const view: CircleNotifyView =
    query.data !== undefined ? { kind: 'ready', preferences: query.data } : query.status === 'error' ? { kind: 'error' } : { kind: 'loading' };
  const choose = (key: CircleNotifyKey, value: RelationAudienceChoice) => {
    void performCircleNotifyEdit({
      key,
      value,
      deps: { ...apiDeps, queryClient: appQueryClient, isOnline: () => navigator.onLine },
    }).then(onOutcome);
  };
  return <CircleNotifySectionView language={language} view={view} disabled={!online} onChoose={choose} onRetry={() => void query.refetch()} />;
}
