import { SEASON_THEME_KEYS } from '@meeshy/shared/utils/game/season';
import { SEASON_COPY_LOCALES, SEASON_STEP_POINTS_MAX, SEASON_STEP_POINTS_MIN, SEASON_STEP_POINTS_STEP, type SeasonCopyLocale } from '@meeshy/shared/utils/game/season-schedule';
import type { LeagueMoment } from '@meeshy/shared/utils/game/league';

import { AdminSelect, AdminTextArea, AdminTextInput } from '@/components/admin/form';
import { INK2 } from '@/components/admin/tone';
import {
  COPY_FIELDS,
  charCount,
  copyLimit,
  mondayOptions,
  stepPointsOptions,
  withCopy,
  type CopyField,
  type DraftIssues,
  type SeasonDraft,
} from '@/lib/admin/game-season-form';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { seasonThemeName } from '@/lib/view/game-copy-v2';

/**
 * **LES CHAMPS D'UNE SAISON** (#10232) — partagés par le formulaire d'une saison à venir et par la relecture d'une
 * proposition de l'IA : même loi, mêmes limites, mêmes libellés. Le sélecteur de date ne propose QUE des lundis à
 * venir ; les textes se comptent en signes (30 / 50 / 120), l'arabe se tape de droite à gauche.
 */

/** Les langues des textes, nommées dans leur propre langue : un nom d'autonyme ne se traduit pas. */
const LOCALE_NAMES: Readonly<Record<SeasonCopyLocale, string>> = {
  fr: 'Français',
  en: 'English',
  es: 'Español',
  de: 'Deutsch',
  it: 'Italiano',
  'pt-BR': 'Português (Brasil)',
  ar: 'العربية',
};

const MONDAYS_AHEAD = 104;

export function longDay(dayKey: string, language: AdminLanguage): string {
  const [year, month, day] = dayKey.split('-').map(Number);
  return new Intl.DateTimeFormat(language, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1)),
  );
}

export const themeLabel = (themeKey: string, language: AdminLanguage): string => seasonThemeName(themeKey, language) ?? themeKey;

const issueText = (language: AdminLanguage, issue: 'empty' | 'too-long') =>
  translateAdmin(language, issue === 'empty' ? 'admin.gameSeasons.issue.empty' : 'admin.gameSeasons.issue.tooLong');

function CopyLocaleFields({
  language,
  locale,
  draft,
  issues,
  onDraft,
  idPrefix,
  disabled,
}: {
  readonly language: AdminLanguage;
  readonly locale: SeasonCopyLocale;
  readonly draft: SeasonDraft;
  readonly issues: DraftIssues;
  readonly onDraft: (next: SeasonDraft) => void;
  readonly idPrefix: string;
  readonly disabled: boolean;
}) {
  const copy = draft.copy[locale];
  const filled = COPY_FIELDS.filter((field) => copy[field].trim() !== '').length;
  const state = filled === 0 ? 'empty' : filled === COPY_FIELDS.length ? 'complete' : 'incomplete';
  const faultOf = (field: CopyField) => issues.copyFields.find((entry) => entry.locale === locale && entry.field === field)?.issue;
  const rtl = locale === 'ar';
  const labelOf = (field: CopyField) =>
    translateAdmin(language, field === 'title' ? 'admin.gameSeasons.copy.name' : field === 'tagline' ? 'admin.gameSeasons.copy.tagline' : 'admin.gameSeasons.copy.description');
  const counter = (field: CopyField) => translateAdmin(language, 'admin.gameSeasons.copy.counter', { count: String(charCount(copy[field])), max: String(copyLimit(field)) });
  const over = (field: CopyField) => charCount(copy[field]) > copyLimit(field);

  return (
    <details open={locale === 'fr'} data-gameseasons-copy-locale={locale} className="rounded-chip px-3 py-2" style={{ border: '1px solid var(--color-edge)' }}>
      <summary className="flex min-h-[44px] cursor-pointer items-center gap-2 text-body font-medium">
        <span lang={locale}>{LOCALE_NAMES[locale]}</span>
        <span className="text-caption" style={{ color: INK2 }} data-gameseasons-copy-state={state}>
          {translateAdmin(language, state === 'empty' ? 'admin.gameSeasons.copy.state.empty' : state === 'complete' ? 'admin.gameSeasons.copy.state.complete' : 'admin.gameSeasons.copy.state.incomplete')}
        </span>
      </summary>
      <div className="grid gap-3 pt-2" lang={locale} {...(rtl ? { dir: 'rtl' as const } : {})}>
        {(['title', 'tagline'] as const).map((field) => {
          const fault = faultOf(field);
          return (
            <AdminTextInput
              key={field}
              id={`${idPrefix}-${locale}-${field}`}
              label={labelOf(field)}
              value={copy[field]}
              onValue={(value) => onDraft(withCopy(draft, locale, field, value))}
              disabled={disabled}
              dir={rtl ? 'rtl' : 'ltr'}
              note={counter(field)}
              noteTone={over(field) ? 'danger' : 'neutral'}
              noteData={{ 'data-gameseasons-counter': `${locale}:${field}` }}
              error={fault === undefined ? undefined : issueText(language, fault)}
              errorData={{ 'data-gameseasons-copy-issue': `${locale}:${field}` }}
              data={{ 'data-gameseasons-copy': `${locale}:${field}` }}
            />
          );
        })}
        <AdminTextArea
          id={`${idPrefix}-${locale}-description`}
          label={labelOf('description')}
          value={copy.description}
          onValue={(value) => onDraft(withCopy(draft, locale, 'description', value))}
          rows={3}
          dir={rtl ? 'rtl' : 'ltr'}
          note={counter('description') + (faultOf('description') === undefined ? '' : ` — ${issueText(language, faultOf('description') ?? 'empty')}`)}
          noteTone={over('description') || faultOf('description') !== undefined ? 'danger' : 'neutral'}
          noteData={{ 'data-gameseasons-counter': `${locale}:description` }}
          data={{ 'data-gameseasons-copy': `${locale}:description` }}
        />
      </div>
    </details>
  );
}

export function SeasonFields({
  language,
  draft,
  onDraft,
  issues,
  now,
  showStatus,
  idPrefix,
  disabled = false,
}: {
  readonly language: AdminLanguage;
  readonly draft: SeasonDraft;
  readonly onDraft: (next: SeasonDraft) => void;
  readonly issues: DraftIssues;
  readonly now: LeagueMoment;
  readonly showStatus: boolean;
  readonly idPrefix: string;
  readonly disabled?: boolean;
}) {
  const paused = draft.status === 'paused';
  const startError = issues.startDay === undefined ? undefined : translateAdmin(language, `admin.gameSeasons.refusal.${issues.startDay}`);
  const themeError = issues.themeKey === undefined ? undefined : translateAdmin(language, 'admin.gameSeasons.refusal.invalid-theme');
  const pointsError = issues.stepPoints === undefined ? undefined : translateAdmin(language, 'admin.gameSeasons.refusal.rewards-out-of-bounds');

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 @2xl:grid-cols-2">
        {showStatus ? (
          <AdminSelect
            id={`${idPrefix}-status`}
            label={translateAdmin(language, 'admin.gameSeasons.field.status')}
            value={draft.status}
            disabled={disabled}
            options={[
              { value: 'scheduled', label: translateAdmin(language, 'admin.gameSeasons.status.scheduled') },
              { value: 'paused', label: translateAdmin(language, 'admin.gameSeasons.status.paused') },
            ]}
            onValue={(value) => onDraft({ ...draft, status: value === 'paused' ? 'paused' : 'scheduled' })}
            data={{ 'data-gameseasons-field': 'status' }}
          />
        ) : null}
        <div className="grid gap-1">
          <AdminSelect
            id={`${idPrefix}-start`}
            label={translateAdmin(language, 'admin.gameSeasons.field.start')}
            value={draft.startDay}
            disabled={disabled || paused}
            options={mondayOptions(now, MONDAYS_AHEAD).map((day) => ({ value: day, label: longDay(day, language) }))}
            fallbackLabel={(value) => value}
            onValue={(value) => onDraft({ ...draft, startDay: value })}
            data={{ 'data-gameseasons-field': 'startDay' }}
          />
          <p className="text-caption" style={{ color: startError === undefined ? INK2 : 'var(--color-danger)' }} {...(startError === undefined ? {} : { role: 'alert', 'data-gameseasons-issue': 'startDay' })}>
            {startError ?? translateAdmin(language, 'admin.gameSeasons.field.startNote')}
          </p>
        </div>
        <div className="grid gap-1">
          <AdminSelect
            id={`${idPrefix}-theme`}
            label={translateAdmin(language, 'admin.gameSeasons.field.theme')}
            value={draft.themeKey}
            disabled={disabled}
            options={SEASON_THEME_KEYS.map((key) => ({ value: key, label: themeLabel(key, language) }))}
            fallbackLabel={(value) => value}
            onValue={(value) => onDraft({ ...draft, themeKey: value })}
            data={{ 'data-gameseasons-field': 'themeKey' }}
          />
          {themeError === undefined ? null : (
            <p role="alert" className="text-caption" style={{ color: 'var(--color-danger)' }} data-gameseasons-issue="themeKey">
              {themeError}
            </p>
          )}
        </div>
        <div className="grid gap-1">
          <AdminSelect
            id={`${idPrefix}-points`}
            label={translateAdmin(language, 'admin.gameSeasons.field.points')}
            value={draft.stepPoints}
            disabled={disabled}
            options={stepPointsOptions().map((points) => ({ value: String(points), label: translateAdmin(language, 'admin.gameSeasons.pointsValue', { points: String(points) }) }))}
            fallbackLabel={(value) => value}
            onValue={(value) => onDraft({ ...draft, stepPoints: value })}
            data={{ 'data-gameseasons-field': 'stepPoints' }}
          />
          <p className="text-caption" style={{ color: pointsError === undefined ? INK2 : 'var(--color-danger)' }} {...(pointsError === undefined ? {} : { role: 'alert', 'data-gameseasons-issue': 'stepPoints' })}>
            {pointsError ??
              translateAdmin(language, 'admin.gameSeasons.field.pointsNote', {
                min: String(SEASON_STEP_POINTS_MIN),
                max: String(SEASON_STEP_POINTS_MAX),
                step: String(SEASON_STEP_POINTS_STEP),
              })}
          </p>
        </div>
      </div>

      <section aria-labelledby={`${idPrefix}-copy-title`} className="grid gap-2">
        <h3 id={`${idPrefix}-copy-title`} className="text-body font-semibold">
          {translateAdmin(language, 'admin.gameSeasons.copy.title')}
        </h3>
        <p className="text-caption" style={{ color: INK2 }}>
          {translateAdmin(language, 'admin.gameSeasons.copy.hint')}
        </p>
        {SEASON_COPY_LOCALES.map((locale) => (
          <CopyLocaleFields key={locale} language={language} locale={locale} draft={draft} issues={issues} onDraft={onDraft} idPrefix={idPrefix} disabled={disabled} />
        ))}
      </section>
    </div>
  );
}
