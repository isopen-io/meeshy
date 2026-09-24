import { useEffect, useRef, useState, type ReactNode } from 'react';

import { Glyph } from '@/components/glyph';
import { RowIcon, SECTION_BRAND_INK, SECTION_CARD_STYLE } from '@/components/grouped-section';
import { endonymOf } from '@/components/language-share-bar';
import { MAX_USES_CEILING, SHARE_LINK_EXPIRATIONS, type MyShareLink, type ShareLinkPatch, type ShareLinkPolicy } from '@/lib/api/links';
import type { ShareLinkUpdateOutcome } from '@/lib/api/link-actions';
import { translate } from '@/lib/i18n-catalog';
import { translateInvite } from '@/lib/i18n-invite-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { editDraftOf, validateEditDraft, type EditDraftField, type ShareLinkEditDraft, type ShareLinkExpirationChoice } from '@/lib/links/edit-draft';
import { canReactivate } from '@/lib/links/view';
import { useBackDismiss } from '@/lib/view/use-back-dismiss';
import { BRAND_BUTTON_STYLE, LinksGlyph, SHARE_TINT } from '@/routes/links-parts';
import { ACCESS_RULES, FormSection, PERMISSION_RULES, RuleToggle, RulesSection, type RuleKey } from '@/routes/share-link-form';

/**
 * **L'ÉDITION D'UN LIEN D'INVITATION** (#7797) — la colonne de droite de la
 * page du créateur (sous la configuration en mobile) : nom, message
 * d'invitation, limites, conditions d'entrée, langues, droits des invités ;
 * « Enregistrer » (optimiste, `performUpdateShareLink`), « Désactiver » /
 * « Activer » et « Supprimer » (confirmé).
 *
 * Les bascules sont celles de la création (`share-link-form.tsx`) : même mot,
 * même geste, même « compte requis » qui éteint ses voisins.
 */

const INK = 'var(--color-ios-ink)';
const INK_2 = 'var(--color-ios-ink-2)';
const BRAND = 'var(--color-ios-brand)';

/** Les langues proposées d'emblée — celles de la maquette ; une langue déjà
 * autorisée hors de cette liste s'y ajoute plutôt que de disparaître. */
const LANGUAGE_CHOICES = ['fr', 'en', 'es', 'de', 'it', 'pt', 'ar', 'ko', 'ja', 'zh', 'ru'] as const;

const EXPIRATION_KEY = {
  never: 'links.create.expiration.never',
  h24: 'links.create.expiration.h24',
  d7: 'links.create.expiration.d7',
  d30: 'links.create.expiration.d30',
  m3: 'links.create.expiration.m3',
} as const;

const expirationOf = (value: string): ShareLinkExpirationChoice =>
  value === 'keep' ? 'keep' : (SHARE_LINK_EXPIRATIONS.find((option) => option === value) ?? 'keep');

const TEXT_INPUT = 'w-full min-w-0 rounded-[14px] px-3.5 text-body outline-none focus-visible:outline-2';
const TEXT_INPUT_STYLE = {
  minHeight: 48,
  color: INK,
  backgroundColor: 'var(--color-ios-surface)',
  border: '1.5px solid color-mix(in srgb, var(--ios-indigo-400) 45%, transparent)',
  outlineColor: BRAND,
} as const;

function NumberRow({
  id,
  label,
  value,
  invalid,
  errorText,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly invalid: boolean;
  readonly errorText: string;
  readonly onChange: (value: number) => void;
}) {
  return (
    <div className="grid">
      <label htmlFor={id} className="flex items-center gap-3 px-3.5 py-1.5 focus-within:outline-2 focus-within:-outline-offset-2" style={{ outlineColor: BRAND }}>
        <span className="min-w-0 flex-1 text-body" style={{ color: INK }}>
          {label}
        </span>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_USES_CEILING}
          step={1}
          value={Number.isFinite(value) ? String(value) : ''}
          aria-invalid={invalid}
          {...(invalid ? { 'aria-describedby': `${id}-error` } : {})}
          onInput={(event) => onChange(event.currentTarget.valueAsNumber)}
          className={`w-24 bg-transparent text-end text-body font-bold outline-none ${SECTION_BRAND_INK}`}
          style={{ minHeight: 44 }}
        />
      </label>
      {invalid ? (
        <p id={`${id}-error`} role="alert" className="px-3.5 pb-2 text-caption font-medium" style={{ color: 'var(--color-error)' }}>
          {errorText}
        </p>
      ) : null}
    </div>
  );
}

function LanguageChoices({
  language,
  draft,
  invalid,
  onAll,
  onToggle,
}: {
  readonly language: InterfaceLanguage;
  readonly draft: ShareLinkEditDraft;
  readonly invalid: boolean;
  readonly onAll: (next: boolean) => void;
  readonly onToggle: (code: string) => void;
}) {
  const choices = [...LANGUAGE_CHOICES, ...draft.languages.filter((code) => !(LANGUAGE_CHOICES as readonly string[]).includes(code))];
  return (
    <FormSection id="link-edit-languages" title={translateInvite(language, 'linkDetail.edit.languages')} subtitle={null} icon={<Glyph name="translate" size={13} />}>
      <RuleToggle
        id="allLanguages"
        label={translateInvite(language, 'linkDetail.edit.languages.all')}
        caption={translateInvite(language, 'linkDetail.edit.languages.hint')}
        icon={<Glyph name="translate" size={15} />}
        tint={SHARE_TINT}
        checked={draft.allLanguages}
        disabled={false}
        onToggle={onAll}
      />
      <div className="grid gap-2 px-3.5 py-3">
        <div role="group" aria-label={translateInvite(language, 'linkDetail.edit.languages')} data-link-edit-languages className="flex flex-wrap gap-2">
          {choices.map((code) => {
            const selected = !draft.allLanguages && draft.languages.includes(code);
            return (
              <button
                key={code}
                type="button"
                data-link-language={code}
                aria-pressed={selected}
                disabled={draft.allLanguages}
                onClick={() => onToggle(code)}
                lang={code}
                className={`rounded-chip px-3.5 text-caption font-bold focus-visible:outline-2 focus-visible:outline-offset-2 ${selected ? 'text-white' : SECTION_BRAND_INK}`}
                style={{
                  minHeight: 44,
                  outlineColor: BRAND,
                  opacity: draft.allLanguages ? 0.5 : 1,
                  backgroundColor: selected ? 'var(--ios-indigo-600)' : 'color-mix(in srgb, var(--ios-indigo-500) 10%, var(--color-ios-card))',
                }}
              >
                {endonymOf(code)}
              </button>
            );
          })}
        </div>
        {invalid ? (
          <p role="alert" className="text-caption font-medium" style={{ color: 'var(--color-error)' }}>
            {translateInvite(language, 'linkDetail.edit.languages.invalid')}
          </p>
        ) : null}
      </div>
    </FormSection>
  );
}

export type EditLinkFormProps = {
  readonly language: InterfaceLanguage;
  readonly link: MyShareLink;
  readonly policy: ShareLinkPolicy;
  readonly now: () => Date;
  readonly onSave: (patch: ShareLinkPatch) => Promise<ShareLinkUpdateOutcome>;
  readonly onToggleActive: () => void;
  readonly onDelete: () => void;
};

/**
 * LE FORMULAIRE — le brouillon part de ce que le lien EST (`editDraftOf`) et
 * n'envoie que ce qui a changé. Un REFUS de la passerelle rend au formulaire
 * ce que le lien était avant le geste : le cache est revenu en arrière
 * (`performUpdateShareLink`), le brouillon aussi.
 */
export function EditLinkForm({ language, link, policy, now, onSave, onToggleActive, onDelete }: EditLinkFormProps) {
  const [draft, setDraft] = useState<ShareLinkEditDraft>(() => editDraftOf(link, policy));
  const [invalid, setInvalid] = useState<EditDraftField | null>(null);
  const [saving, setSaving] = useState(false);

  const edit = (next: Partial<ShareLinkEditDraft>) => {
    setDraft((current) => ({ ...current, ...next }));
    setInvalid(null);
  };

  async function submit() {
    if (saving) return;
    const verdict = validateEditDraft(draft, link, policy, now());
    if (!verdict.ok) {
      setInvalid(verdict.field);
      return;
    }
    const before = editDraftOf(link, policy);
    setSaving(true);
    const outcome = await onSave(verdict.patch);
    setSaving(false);
    if (outcome === 'failed') setDraft(before);
  }

  const format = new Intl.NumberFormat(language);
  const numberError = translateInvite(language, 'linkDetail.edit.number.invalid', { max: format.format(MAX_USES_CEILING) });

  return (
    <section id="link-edit" aria-labelledby="link-edit-title" data-share-link-edit className="grid scroll-mt-4 gap-4 rounded-[24px] p-4 md:p-6" style={SECTION_CARD_STYLE}>
      <h2 id="link-edit-title" className="text-thread font-extrabold" style={{ color: INK }}>
        {translateInvite(language, 'linkDetail.edit.title')}
      </h2>
      <form
        noValidate
        data-link-edit-form
        className="grid gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="grid gap-3">
          <label htmlFor="link-edit-name" className="grid gap-1.5 text-caption font-bold" style={{ color: INK_2 }}>
            {translateInvite(language, 'linkDetail.edit.name')}
            <input
              id="link-edit-name"
              dir="auto"
              value={draft.name}
              maxLength={100}
              autoComplete="off"
              placeholder={translateInvite(language, 'linkDetail.edit.name.placeholder')}
              onInput={(event) => edit({ name: event.currentTarget.value })}
              className={TEXT_INPUT}
              style={TEXT_INPUT_STYLE}
            />
          </label>
          <label htmlFor="link-edit-message" className="grid gap-1.5 text-caption font-bold" style={{ color: INK_2 }}>
            {translateInvite(language, 'linkDetail.edit.message')}
            <textarea
              id="link-edit-message"
              dir="auto"
              value={draft.description}
              rows={3}
              maxLength={500}
              placeholder={translateInvite(language, 'linkDetail.edit.message.placeholder')}
              onInput={(event) => edit({ description: event.currentTarget.value })}
              className={`${TEXT_INPUT} py-3 leading-relaxed`}
              style={{ ...TEXT_INPUT_STYLE, resize: 'vertical' }}
            />
          </label>
        </div>

        <FormSection id="link-edit-limits" title={translateInvite(language, 'linkDetail.edit.limits')} subtitle={null} icon={<LinksGlyph name="hourglass" size={13} />}>
          <label htmlFor="link-edit-expiration" className="flex items-center gap-3 px-3.5 py-1.5 focus-within:outline-2 focus-within:-outline-offset-2" style={{ outlineColor: BRAND }}>
            <RowIcon tint="var(--color-warning)">
              <LinksGlyph name="hourglass" size={15} />
            </RowIcon>
            <span className="min-w-0 flex-1 text-body font-medium" style={{ color: INK }}>
              {translateInvite(language, 'linkDetail.edit.expiration')}
            </span>
            <select
              id="link-edit-expiration"
              value={draft.expiration}
              onChange={(event) => edit({ expiration: expirationOf(event.currentTarget.value) })}
              className={`max-w-[55%] rounded-chip bg-transparent text-body font-semibold outline-none ${SECTION_BRAND_INK}`}
              style={{ minHeight: 44 }}
            >
              {link.expiresAt === null ? null : (
                <option value="keep">
                  {translateInvite(language, 'linkDetail.edit.expiration.keep', {
                    date: new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(link.expiresAt)),
                  })}
                </option>
              )}
              {SHARE_LINK_EXPIRATIONS.map((option) => (
                <option key={option} value={option}>
                  {translate(language, EXPIRATION_KEY[option])}
                </option>
              ))}
            </select>
          </label>
          <RuleToggle
            id="limitUses"
            label={translateInvite(language, 'linkDetail.edit.maxUses')}
            caption={
              draft.limitUses && Number.isFinite(draft.maxUses)
                ? translate(language, draft.maxUses === 1 ? 'links.create.limit.max.one' : 'links.create.limit.max.other', { count: format.format(draft.maxUses) })
                : translate(language, 'links.unlimited')
            }
            icon={<Glyph name="users" size={15} />}
            tint={SHARE_TINT}
            checked={draft.limitUses}
            disabled={false}
            onToggle={(next) => edit({ limitUses: next })}
          />
          {draft.limitUses ? (
            <NumberRow
              id="link-edit-max-uses"
              label={translateInvite(language, 'linkDetail.edit.maxUses.count')}
              value={draft.maxUses}
              invalid={invalid === 'maxUses'}
              errorText={numberError}
              onChange={(value) => edit({ maxUses: value })}
            />
          ) : null}
          <RuleToggle
            id="limitConcurrent"
            label={translateInvite(language, 'linkDetail.edit.maxConcurrent')}
            caption={
              draft.limitConcurrent && Number.isFinite(draft.maxConcurrent)
                ? translateInvite(language, 'linkDetail.config.concurrent.value', { count: format.format(draft.maxConcurrent) })
                : translate(language, 'links.unlimited')
            }
            icon={<Glyph name="users" size={15} />}
            tint="var(--ios-indigo-600)"
            checked={draft.limitConcurrent}
            disabled={false}
            onToggle={(next) => edit({ limitConcurrent: next })}
          />
          {draft.limitConcurrent ? (
            <NumberRow
              id="link-edit-max-concurrent"
              label={translateInvite(language, 'linkDetail.edit.maxConcurrent.count')}
              value={draft.maxConcurrent}
              invalid={invalid === 'maxConcurrent'}
              errorText={numberError}
              onChange={(value) => edit({ maxConcurrent: value })}
            />
          ) : null}
        </FormSection>

        <RulesSection
          language={language}
          id="link-edit-entry"
          title={translateInvite(language, 'linkDetail.edit.entry')}
          subtitle={translate(language, 'links.create.section.access.subtitle')}
          icon={<LinksGlyph name="userCheck" size={13} />}
          rules={ACCESS_RULES}
          draft={draft}
          onToggle={(key: RuleKey, next) => edit({ [key]: next })}
        />

        <LanguageChoices
          language={language}
          draft={draft}
          invalid={invalid === 'languages'}
          onAll={(next) => edit({ allLanguages: next })}
          onToggle={(code) =>
            edit({ languages: draft.languages.includes(code) ? draft.languages.filter((current) => current !== code) : [...draft.languages, code] })
          }
        />

        <RulesSection
          language={language}
          id="link-edit-rights"
          title={translateInvite(language, 'linkDetail.edit.rights')}
          subtitle={translate(language, 'links.create.section.permissions.subtitle')}
          icon={<LinksGlyph name="chatCircle" size={13} />}
          rules={PERMISSION_RULES}
          draft={draft}
          onToggle={(key: RuleKey, next) => edit({ [key]: next })}
        />

        <button
          type="submit"
          data-share-link-save
          disabled={saving}
          aria-busy={saving}
          className="flex w-full items-center justify-center gap-2 rounded-[18px] text-body font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ ...BRAND_BUTTON_STYLE, minHeight: 52, opacity: saving ? 0.7 : 1 }}
        >
          {translateInvite(language, saving ? 'linkDetail.edit.saving' : 'linkDetail.edit.save')}
        </button>
      </form>

      <div className="grid grid-cols-2 gap-2.5">
        {link.isActive || canReactivate(link) ? (
          <button
            type="button"
            data-share-link-action={link.isActive ? 'disable' : 'activate'}
            onClick={onToggleActive}
            className="flex items-center justify-center gap-2 rounded-[16px] px-3 text-body font-bold focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ minHeight: 48, color: INK, border: '1.5px solid color-mix(in srgb, var(--color-ios-ink-3) 45%, transparent)', outlineColor: BRAND }}
          >
            <span aria-hidden="true">{link.isActive ? <LinksGlyph name="pauseCircle" size={18} /> : <LinksGlyph name="playCircle" size={18} />}</span>
            {translate(language, link.isActive ? 'links.detail.disable' : 'links.detail.activate')}
          </button>
        ) : (
          <span aria-hidden="true" />
        )}
        <button
          type="button"
          data-share-link-action="delete"
          aria-haspopup="dialog"
          onClick={onDelete}
          className="flex items-center justify-center gap-2 rounded-[16px] px-3 text-body font-bold focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ minHeight: 48, color: 'var(--color-error)', border: '1.5px solid color-mix(in srgb, var(--color-error) 45%, transparent)', outlineColor: 'var(--color-error)' }}
        >
          {translateInvite(language, 'linkDetail.edit.delete')}
        </button>
      </div>
    </section>
  );
}

/**
 * LA CONFIRMATION DE « SUPPRIMER » — un `<dialog>` modal (focus piégé, Échap),
 * fermé aussi par le retour matériel d'Android (`useBackDismiss`). Le texte
 * dit ce que le geste FAIT — le lien cesse de fonctionner, les invités sans
 * compte perdent l'accès — et ne promet pas d'« irréversible » que la
 * passerelle ne tient pas encore (#6411).
 */
export function ConfirmDelete({
  language,
  busy,
  onConfirm,
  onCancel,
}: {
  readonly language: InterfaceLanguage;
  readonly busy: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useBackDismiss(onCancel);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return undefined;
    if (!dialog.open && typeof dialog.showModal === 'function') dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      data-share-link-delete-dialog
      aria-labelledby="link-delete-title"
      aria-describedby="link-delete-body"
      onClose={onCancel}
      className="m-auto w-[min(26rem,calc(100%-2rem))] rounded-[24px] p-0 backdrop:bg-black/40"
      style={{ backgroundColor: 'var(--color-ios-card)', color: INK, border: 0 }}
    >
      <div className="grid gap-3 p-5">
        <h2 id="link-delete-title" className="text-thread font-extrabold">
          {translateInvite(language, 'linkDetail.delete.title')}
        </h2>
        <p id="link-delete-body" className="text-body" style={{ color: INK_2 }}>
          {translateInvite(language, 'linkDetail.delete.body')}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2.5">
          <DialogButton onClick={onCancel} tone="neutral" data="cancel">
            {translateInvite(language, 'linkDetail.delete.cancel')}
          </DialogButton>
          <DialogButton onClick={onConfirm} tone="danger" data="confirm" busy={busy}>
            {translateInvite(language, 'linkDetail.delete.confirm')}
          </DialogButton>
        </div>
      </div>
    </dialog>
  );
}

function DialogButton({
  onClick,
  tone,
  data,
  busy = false,
  children,
}: {
  readonly onClick: () => void;
  readonly tone: 'neutral' | 'danger';
  readonly data: string;
  readonly busy?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      data-share-link-delete={data}
      onClick={onClick}
      disabled={busy}
      aria-busy={busy}
      className="grid place-items-center rounded-[14px] px-3 text-body font-bold focus-visible:outline-2 focus-visible:outline-offset-2"
      style={
        tone === 'danger'
          ? { minHeight: 48, color: 'white', backgroundColor: 'var(--color-error)', outlineColor: 'var(--color-error)' }
          : { minHeight: 48, color: INK, border: '1.5px solid color-mix(in srgb, var(--color-ios-ink-3) 45%, transparent)', outlineColor: BRAND }
      }
    >
      {children}
    </button>
  );
}
