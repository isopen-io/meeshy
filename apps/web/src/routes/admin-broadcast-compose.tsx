import { useId, useMemo, useState, type FormEvent } from 'react';

import { BRAND, EDGE, INK, INK2, SURFACE } from '@/components/admin/tone';
import { Sheet } from '@/components/sheet';
import { audienceSentence } from '@/lib/admin/broadcast-audience';
import {
  bodyOfForm,
  countryOptions,
  languageOptions,
  targetingOfForm,
  validateBroadcastForm,
  type BroadcastForm,
  type BroadcastFormField,
} from '@/lib/admin/broadcast-form';
import { BROADCAST_ACTIVITIES, type AdminBroadcastActivity, type AdminBroadcastBody } from '@/lib/api/admin-broadcasts';
import { translateAdmin, type AdminPlainCatalogKey } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { ChoiceField, SelectField, TextField } from './admin-broadcast-fields';

/**
 * **LA FEUILLE DE COMPOSITION D'UNE DIFFUSION** (#8876, #6731) — créer un
 * brouillon, ou modifier celui qui existe : le même formulaire, à deux titres.
 * Plein écran : un courrier destiné à tous les comptes mérite la place de se
 * relire, et la sélection des langues et des pays est une liste de plusieurs
 * centaines de lignes.
 *
 * Chaque champ est nommé et validé SOUS lui (la passerelle ne dit qu'un 400
 * générique) ; les langues et les pays sont choisis par NOM, l'audience se lit en
 * phrase pendant la saisie. Rien ne part en appuyant : on ENREGISTRE un brouillon
 * — l'envoi se décide depuis la fiche, après la préparation.
 */
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2';

const ACTIVITY_KEYS = {
  all: 'admin.broadcast.compose.activity.all',
  active: 'admin.broadcast.compose.activity.active',
  inactive: 'admin.broadcast.compose.activity.inactive',
  new: 'admin.broadcast.compose.activity.new',
} as const satisfies Readonly<Record<AdminBroadcastActivity, string>>;

const ACTIVITY_HINT_KEYS = {
  all: 'admin.broadcast.compose.activity.all.hint',
  active: 'admin.broadcast.compose.activity.active.hint',
  inactive: 'admin.broadcast.compose.activity.inactive.hint',
  new: 'admin.broadcast.compose.activity.new.hint',
} as const satisfies Readonly<Record<AdminBroadcastActivity, string>>;

const ERROR_KEYS = {
  name: 'admin.broadcast.compose.error.name',
  subject: 'admin.broadcast.compose.error.subject',
  body: 'admin.broadcast.compose.error.body',
  sourceLanguage: 'admin.broadcast.compose.error.sourceLanguage',
  inactiveDays: 'admin.broadcast.compose.error.inactiveDays',
} as const satisfies Readonly<Record<BroadcastFormField, string>>;

const isActivity = (value: string): value is AdminBroadcastActivity => BROADCAST_ACTIVITIES.some((activity) => activity === value);

export function BroadcastComposerSheet({
  language,
  mode,
  initial,
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  readonly language: InterfaceLanguage;
  readonly mode: 'create' | 'edit';
  readonly initial: BroadcastForm;
  readonly busy: boolean;
  readonly error: string | null;
  readonly onSubmit: (body: AdminBroadcastBody) => void;
  readonly onCancel: () => void;
}) {
  const uid = useId();
  const [form, setForm] = useState<BroadcastForm>(initial);
  const [attempted, setAttempted] = useState(false);

  const fieldId = (field: string): string => `${uid}-${field}`;
  const invalid = validateBroadcastForm(form);
  const shown = attempted ? invalid : [];
  const errorOf = (field: BroadcastFormField): string | null => (shown.includes(field) ? translateAdmin(language, ERROR_KEYS[field]) : null);

  const languages = useMemo(() => languageOptions(language, [initial.sourceLanguage, ...initial.languages]), [language, initial]);
  const countries = useMemo(() => countryOptions(language), [language]);
  const sourceOptions = useMemo(() => languageOptions(language, [form.sourceLanguage]), [language, form.sourceLanguage]);

  const patch = (next: Partial<BroadcastForm>) => setForm((current) => ({ ...current, ...next }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const first = invalid[0];
    if (first !== undefined) {
      setAttempted(true);
      document.getElementById(fieldId(first))?.focus();
      return;
    }
    onSubmit(bodyOfForm(form));
  };

  const t = (key: AdminPlainCatalogKey) => translateAdmin(language, key);
  const edit = mode === 'edit';

  return (
    <Sheet title={translateAdmin(language, edit ? 'admin.broadcast.compose.title.edit' : 'admin.broadcast.compose.title.create')} presentation="fullscreen" bodyAs="div" onClose={onCancel}>
      <form data-admin-compose={mode} noValidate onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 pb-6 pt-2">
            <p className="text-body" style={{ color: INK2 }}>
              {translateAdmin(language, edit ? 'admin.broadcast.compose.intro.edit' : 'admin.broadcast.compose.intro.create')}
            </p>

            <section aria-labelledby={`${uid}-message`} className="grid gap-4">
              <h3 id={`${uid}-message`} className="text-title font-semibold" style={{ color: INK }}>
                {t('admin.broadcast.compose.section.message')}
              </h3>
              <TextField
                id={fieldId('name')}
                label={t('admin.broadcast.compose.field.name')}
                hint={t('admin.broadcast.compose.field.name.hint')}
                error={errorOf('name')}
                value={form.name}
                onChange={(name) => patch({ name })}
              />
              <SelectField
                id={fieldId('sourceLanguage')}
                label={t('admin.broadcast.compose.field.sourceLanguage')}
                error={errorOf('sourceLanguage')}
                value={form.sourceLanguage}
                options={sourceOptions}
                onChange={(sourceLanguage) => patch({ sourceLanguage })}
              />
              <TextField
                id={fieldId('subject')}
                label={t('admin.broadcast.compose.field.subject')}
                hint={t('admin.broadcast.compose.field.subject.hint')}
                error={errorOf('subject')}
                value={form.subject}
                onChange={(subject) => patch({ subject })}
              />
              <TextField
                id={fieldId('body')}
                label={t('admin.broadcast.compose.field.body')}
                hint={t('admin.broadcast.compose.field.body.hint')}
                error={errorOf('body')}
                value={form.body}
                rows={9}
                onChange={(body) => patch({ body })}
              />
            </section>

            <section aria-labelledby={`${uid}-audience`} className="grid gap-4">
              <h3 id={`${uid}-audience`} className="text-title font-semibold" style={{ color: INK }}>
                {t('admin.broadcast.compose.section.audience')}
              </h3>
              <SelectField
                id={fieldId('activity')}
                label={t('admin.broadcast.compose.activity')}
                hint={translateAdmin(language, ACTIVITY_HINT_KEYS[form.activity])}
                value={form.activity}
                options={BROADCAST_ACTIVITIES.map((activity) => ({ value: activity, label: translateAdmin(language, ACTIVITY_KEYS[activity]) }))}
                onChange={(value) => isActivity(value) && patch({ activity: value })}
              />
              {form.activity === 'inactive' ? (
                <TextField
                  id={fieldId('inactiveDays')}
                  label={t('admin.broadcast.compose.inactiveDays')}
                  error={errorOf('inactiveDays')}
                  value={form.inactiveDays}
                  inputMode="numeric"
                  onChange={(inactiveDays) => patch({ inactiveDays })}
                />
              ) : null}
              <ChoiceField
                language={language}
                id={fieldId('languages')}
                anchor="languages"
                legend={t('admin.broadcast.compose.languages')}
                hint={t('admin.broadcast.compose.languages.hint')}
                options={languages}
                selected={form.languages}
                onChange={(next) => patch({ languages: next })}
              />
              <ChoiceField
                language={language}
                id={fieldId('countries')}
                anchor="countries"
                legend={t('admin.broadcast.compose.countries')}
                hint={t('admin.broadcast.compose.countries.hint')}
                options={countries}
                selected={form.countries}
                onChange={(next) => patch({ countries: next })}
              />
              <p data-admin-audience-preview className="rounded-card px-4 py-3 text-body" style={{ backgroundColor: SURFACE, border: `1px solid ${EDGE}`, color: INK }}>
                <span className="block text-caption font-medium" style={{ color: INK2 }}>
                  {t('admin.broadcast.compose.audience.preview')}
                </span>
                {audienceSentence(targetingOfForm(form), language)}
              </p>
            </section>
          </div>
        </div>

        <div className="shrink-0 px-4 py-3" style={{ borderTop: `1px solid ${EDGE}`, backgroundColor: SURFACE }}>
          <div className="mx-auto grid w-full max-w-3xl gap-3">
            {shown.length > 0 ? (
              <p role="alert" data-admin-compose-summary className="text-caption font-medium" style={{ color: 'var(--color-danger)' }}>
                {t('admin.broadcast.compose.error.summary')}
              </p>
            ) : null}
            {error === null ? null : (
              <p role="alert" data-admin-compose-error className="text-caption font-medium" style={{ color: 'var(--color-danger)' }}>
                {error}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-3">
              <button
                type="button"
                data-admin-action="cancel"
                disabled={busy}
                onClick={onCancel}
                className={`rounded-chip px-5 text-body font-semibold disabled:opacity-40 ${FOCUS}`}
                style={{ minHeight: 44, border: `1px solid ${EDGE}`, color: INK, backgroundColor: SURFACE, outlineColor: BRAND }}
              >
                {t('admin.kit.cancel')}
              </button>
              <button
                type="submit"
                data-admin-action="save"
                disabled={busy}
                aria-busy={busy}
                className={`rounded-chip px-5 text-body font-semibold text-ios-on-brand disabled:opacity-40 ${FOCUS}`}
                style={{ minHeight: 44, backgroundColor: BRAND, outlineColor: BRAND }}
              >
                {busy ? t('admin.broadcast.compose.save.busy') : translateAdmin(language, edit ? 'admin.broadcast.compose.save.edit' : 'admin.broadcast.compose.save.create')}
              </button>
            </div>
          </div>
        </div>
      </form>
    </Sheet>
  );
}
