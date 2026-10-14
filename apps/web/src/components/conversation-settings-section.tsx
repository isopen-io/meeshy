import { useQueryClient } from '@tanstack/react-query';
import { useId, useRef, useState, type ReactNode } from 'react';

import type { ConversationWriteRole } from '@meeshy/shared/types/conversation';

import type { ConversationsDeps } from '@/lib/api/conversations';
import { updateConversationSettings, type ConversationSettingsPatch } from '@/lib/api/conversation-settings';
import type { Conversation } from '@/lib/api/types';
import { manageText, type ConversationManageCatalogKey } from '@/lib/i18n-conversation-manage-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { initialsOf } from '@/lib/view/conversation';
import type { ConversationManagement } from '@/lib/view/conversation-management';

import { Avatar } from './avatar';
import { IosSwitch } from './ios-switch';

/**
 * **LES RÉGLAGES DU GROUPE DEPUIS SA FEUILLE** (#7836) — ce que la roue dentée
 * d'iOS ouvre (`ConversationSettingsView.swift`) : la PHOTO, le TITRE et la
 * DESCRIPTION pour un modérateur et plus ; les PERMISSIONS (qui peut écrire,
 * mode annonce, mode lent, traduction automatique) pour un administrateur et
 * plus. Rien de ceci n'est rendu à qui n'en a pas le rang (`managementOf`).
 *
 * L'identité s'enregistre d'un geste (« Enregistrer », comme iOS) ; une
 * permission s'applique dès qu'on la touche — un interrupteur qui attendrait un
 * second bouton serait un contrôle sans effet. Tout est optimiste
 * (`updateConversationSettings`) : la liste et le fil changent avant la
 * réponse, un refus les remet.
 */
const TITLE_MAX = 100;
const DESCRIPTION_MAX = 500;
const WRITE_ROLES: readonly Exclude<ConversationWriteRole, 'creator'>[] = ['everyone', 'member', 'moderator', 'admin'];
const SLOW_MODES: readonly number[] = [0, 10, 30, 60, 300];

const WRITE_ROLE_KEYS: Readonly<Record<Exclude<ConversationWriteRole, 'creator'>, ConversationManageCatalogKey>> = {
  everyone: 'conversationManage.permissions.write_role.everyone',
  member: 'conversationManage.permissions.write_role.member',
  moderator: 'conversationManage.permissions.write_role.moderator',
  admin: 'conversationManage.permissions.write_role.admin',
};

export function ConversationSettingsSection({
  conversation,
  title,
  accent,
  deps,
  language,
  management,
}: {
  readonly conversation: Conversation;
  /** Le nom AFFICHÉ (avec l'éventuel nom personnel du lecteur) — pour les initiales de la photo. */
  readonly title: string;
  readonly accent: string;
  readonly deps: ConversationsDeps;
  readonly language: InterfaceLanguage;
  readonly management: ConversationManagement;
}) {
  const t = (key: ConversationManageCatalogKey, params?: Readonly<Record<string, string>>) => manageText(language, key, params);
  const headingId = useId();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const servedTitle = conversation.title ?? '';
  const servedDescription = conversation.description ?? '';
  const [draftTitle, setDraftTitle] = useState(servedTitle);
  const [draftDescription, setDraftDescription] = useState(servedDescription);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const apply = async (patch: ConversationSettingsPatch, done?: ConversationManageCatalogKey) => {
    const outcome = await updateConversationSettings({ deps: { ...deps, queryClient }, conversationId: conversation.id, patch });
    if (outcome.ok) setStatus(done === undefined ? '' : t(done));
    else setStatus(t(outcome.reason === 'refused' ? 'conversationManage.error.refused' : 'conversationManage.error.failed'));
    return outcome.ok;
  };

  const trimmedTitle = draftTitle.trim();
  const titleChanged = trimmedTitle !== servedTitle.trim();
  const descriptionChanged = draftDescription.trim() !== servedDescription.trim();
  const titleMissing = trimmedTitle === '';
  const canSave = (titleChanged || descriptionChanged) && !titleMissing && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    await apply(
      {
        ...(titleChanged ? { title: trimmedTitle } : {}),
        ...(descriptionChanged ? { description: draftDescription.trim() } : {}),
      },
      'conversationManage.settings.saved',
    );
    setSaving(false);
  };

  const onPhoto = async (file: File | undefined) => {
    if (file === undefined) return;
    setUploading(true);
    setStatus(t('conversationManage.settings.photo.uploading'));
    const { uploadProfileImage } = await import('@/lib/profile/image-upload');
    const upload = await uploadProfileImage({ kind: 'avatar', file, deps: { source: deps.source, transport: deps.transport, isOnline: () => navigator.onLine } });
    setUploading(false);
    if (upload.status !== 'uploaded') {
      setStatus(upload.status === 'cancelled' ? '' : t('conversationManage.settings.photo.failed'));
      return;
    }
    await apply({ avatar: upload.url }, 'conversationManage.settings.saved');
  };

  const writeRole = conversation.defaultWriteRole === 'creator' ? 'admin' : (conversation.defaultWriteRole ?? 'everyone');
  const announcement = conversation.isAnnouncementChannel === true;
  const slowMode = conversation.slowModeSeconds ?? 0;
  const autoTranslate = conversation.autoTranslateEnabled !== false;

  return (
    <section aria-labelledby={headingId} className="px-4 pb-6" data-conversation-settings>
      <h4 id={headingId} className="pb-2 text-caption font-semibold uppercase" style={{ color: 'var(--color-ios-ink-2)' }}>
        {t('conversationManage.settings.section')}
      </h4>

      <Card>
        <div className="flex items-center gap-3 p-3">
          <Avatar initials={initialsOf(title)} color={accent} size={56} name={title} {...(conversation.avatar === undefined ? {} : { src: conversation.avatar })} />
          <div className="flex min-w-0 flex-1 flex-wrap gap-2">
            <input ref={fileRef} type="file" accept="image/*" className="offscreen" tabIndex={-1} aria-hidden onChange={(event) => void onPhoto(event.currentTarget.files?.[0])} data-conversation-photo-input />
            <ChipButton disabled={uploading} onClick={() => fileRef.current?.click()} data="data-conversation-photo-change">
              {uploading ? t('conversationManage.settings.photo.uploading') : t('conversationManage.settings.photo.change')}
            </ChipButton>
            {conversation.avatar === undefined ? null : (
              <ChipButton disabled={uploading} onClick={() => void apply({ avatar: null }, 'conversationManage.settings.saved')} data="data-conversation-photo-remove">
                {t('conversationManage.settings.photo.remove')}
              </ChipButton>
            )}
          </div>
        </div>

        <Field label={t('conversationManage.settings.name')}>
          <input
            type="text"
            value={draftTitle}
            maxLength={TITLE_MAX}
            placeholder={t('conversationManage.settings.name.placeholder')}
            onInput={(event) => setDraftTitle(event.currentTarget.value)}
            aria-invalid={titleMissing}
            data-conversation-settings-title
            className="w-full bg-transparent text-body outline-none"
            style={{ color: 'var(--color-ios-ink)' }}
          />
        </Field>
        <Field label={t('conversationManage.settings.description')}>
          <textarea
            value={draftDescription}
            maxLength={DESCRIPTION_MAX}
            rows={3}
            onInput={(event) => setDraftDescription(event.currentTarget.value)}
            data-conversation-settings-description
            className="w-full resize-none bg-transparent text-body outline-none"
            style={{ color: 'var(--color-ios-ink)' }}
          />
        </Field>
        {titleMissing ? (
          <p className="px-3 text-caption" style={{ color: 'var(--color-error)' }}>
            {t('conversationManage.settings.name.required')}
          </p>
        ) : null}
        <div className="flex justify-end p-3">
          <button
            type="button"
            disabled={!canSave}
            aria-busy={saving}
            onClick={() => void save()}
            data-conversation-settings-save
            className="rounded-chip px-4 font-bold disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ minHeight: 44, color: 'var(--color-ios-on-brand)', backgroundColor: 'var(--accent)', outlineColor: 'var(--accent)' }}
          >
            {saving ? t('conversationManage.settings.saving') : t('conversationManage.settings.save')}
          </button>
        </div>
      </Card>

      {management.editPermissions ? (
        <>
          <h5 className="pt-4 pb-2 text-caption font-semibold uppercase" style={{ color: 'var(--color-ios-ink-2)' }}>
            {t('conversationManage.permissions.section')}
          </h5>
          <Card>
            <Choices
              legend={t('conversationManage.permissions.write_role')}
              name={`write-role-${conversation.id}`}
              disabled={announcement}
              options={WRITE_ROLES.map((role) => ({ value: role, label: t(WRITE_ROLE_KEYS[role]) }))}
              value={writeRole}
              onChange={(role) => void apply({ defaultWriteRole: role })}
              marker="data-conversation-write-role"
            />
            <SwitchRow
              label={t('conversationManage.permissions.announcement')}
              hint={t('conversationManage.permissions.announcement.subtitle')}
              checked={announcement}
              onChange={(on) => void apply({ isAnnouncementChannel: on })}
              marker="data-conversation-announcement"
            />
            <Choices
              legend={t('conversationManage.permissions.slow_mode')}
              name={`slow-mode-${conversation.id}`}
              options={SLOW_MODES.map((seconds) => ({
                value: seconds,
                label:
                  seconds === 0
                    ? t('conversationManage.permissions.slow_mode.off')
                    : seconds < 60
                      ? t('conversationManage.permissions.slow_mode.seconds', { count: String(seconds) })
                      : t('conversationManage.permissions.slow_mode.minutes', { count: String(seconds / 60) }),
              }))}
              value={SLOW_MODES.includes(slowMode) ? slowMode : 0}
              onChange={(seconds) => void apply({ slowModeSeconds: seconds })}
              marker="data-conversation-slow-mode"
            />
            <SwitchRow
              label={t('conversationManage.permissions.auto_translate')}
              hint={t('conversationManage.permissions.auto_translate.subtitle')}
              checked={autoTranslate}
              onChange={(on) => void apply({ autoTranslateEnabled: on })}
              marker="data-conversation-auto-translate"
            />
          </Card>
        </>
      ) : null}

      <p role="status" aria-live="polite" className="pt-2 text-center text-caption" style={{ color: 'var(--color-ios-ink-2)' }} data-conversation-settings-status>
        {status}
      </p>
    </section>
  );
}

function Card({ children }: { readonly children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-card" style={{ backgroundColor: 'var(--color-ios-card)' }}>
      {children}
    </div>
  );
}

function Field({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <label className="block px-3 pb-3">
      <span className="block pb-1 text-caption font-semibold" style={{ color: 'var(--color-ios-ink-2)' }}>
        {label}
      </span>
      <span className="block rounded-field px-3 py-2" style={{ border: '1px solid color-mix(in srgb, var(--color-ios-ink-3) 35%, transparent)' }}>
        {children}
      </span>
    </label>
  );
}

function ChipButton({ disabled, onClick, data, children }: { readonly disabled: boolean; readonly onClick: () => void; readonly data: `data-${string}`; readonly children: ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      {...{ [data]: '' }}
      className="rounded-chip px-3 text-body font-semibold disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{ minHeight: 44, color: 'var(--accent)', border: '1.5px solid color-mix(in srgb, var(--accent) 45%, transparent)', outlineColor: 'var(--accent)' }}
    >
      {children}
    </button>
  );
}

export function SwitchRow({
  label,
  hint,
  checked,
  onChange,
  marker,
}: {
  readonly label: string;
  readonly hint?: string;
  readonly checked: boolean;
  readonly onChange: (on: boolean) => void;
  readonly marker: `data-${string}`;
}) {
  const hintId = useId();
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2" style={{ minHeight: 52 }}>
      <span className="flex min-w-0 flex-col">
        <span className="text-body font-medium" style={{ color: 'var(--color-ios-ink)' }}>
          {label}
        </span>
        {hint === undefined ? null : (
          <span id={hintId} className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
            {hint}
          </span>
        )}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        {...(hint === undefined ? {} : { 'aria-describedby': hintId })}
        {...{ [marker]: '' }}
        onClick={() => onChange(!checked)}
        className="grid shrink-0 place-items-center rounded-chip focus-visible:outline-2"
        style={{ minWidth: 56, minHeight: 44, outlineColor: 'var(--accent)' }}
      >
        <IosSwitch checked={checked} tint="var(--accent)" />
      </button>
    </div>
  );
}

function Choices<V extends string | number>({
  legend,
  name,
  options,
  value,
  onChange,
  disabled = false,
  marker,
}: {
  readonly legend: string;
  readonly name: string;
  readonly options: readonly { readonly value: V; readonly label: string }[];
  readonly value: V;
  readonly onChange: (value: V) => void;
  readonly disabled?: boolean;
  readonly marker: `data-${string}`;
}) {
  return (
    <fieldset disabled={disabled} className="px-3 py-2 disabled:opacity-50" {...{ [marker]: String(value) }}>
      <legend className="pb-2 text-body font-medium" style={{ color: 'var(--color-ios-ink)' }}>
        {legend}
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <label
              key={String(option.value)}
              className="relative grid cursor-pointer place-items-center rounded-chip px-3 text-caption font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2"
              style={{
                minHeight: 44,
                color: selected ? 'var(--color-ios-on-brand)' : 'var(--color-ios-ink)',
                backgroundColor: selected ? 'var(--accent)' : 'transparent',
                border: selected ? '1.5px solid var(--accent)' : '1.5px solid color-mix(in srgb, var(--color-ios-ink-3) 45%, transparent)',
                outlineColor: 'var(--accent)',
              }}
            >
              <input
                type="radio"
                name={name}
                value={String(option.value)}
                checked={selected}
                onChange={() => onChange(option.value)}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
