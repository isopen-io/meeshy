import { useQueryClient } from '@tanstack/react-query';
import { useId, useState, type ReactNode } from 'react';

import { Field } from '@/components/field';
import { adminUserDetailQueryKey, type AdminUserDetail } from '@/lib/api/admin-user-detail';
import type { ApiFailure, ApiResult } from '@/lib/api/http';
import { translateAdmin, type AdminPlainCatalogKey } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **LES BRIQUES DE LA FICHE ÉDITABLE D'UN MEMBRE** (#8289).
 *
 * Plus de bouton « Modifier » : chaque champ est éditable là où il s'affiche,
 * et chaque SECTION porte son bouton « Enregistrer », actif seulement quand
 * elle a changé. L'état de l'envoi — en cours, enregistré, refusé et pourquoi
 * — se lit SOUS la section, annoncé aux lecteurs d'écran (`role="status"`).
 *
 * ## Les deux gestes de saisie ne se ressemblent pas
 *
 * `onInput` sur les champs texte, `onChange` sur `<select>` et `<input
 * type="checkbox">` : sous happy-dom, un `input` dispatché ne déclenche jamais
 * `onChange` sur un `<input>` texte (témoin permanent dans `test-support`).
 */
export const INK = 'var(--color-ios-ink)';
export const INK2 = 'var(--color-ios-ink-2)';
export const BRAND = 'var(--color-ios-brand)';
/**
 * LA CARTE DE VERRE (#8289, design validé de l'inscription #8288) — la matière
 * est celle du site UNIQUE `styles/glass.css` (`glass glass-card`, jamais un
 * flou réécrit ici) ; le bord et l'ombre sont ceux de la carte d'identité de
 * l'inscription (`signup-identity-card.tsx`), en jetons, donc justes dans les
 * deux schémas.
 */
export const GLASS_CARD_CLASS = 'glass glass-card rounded-[26px]';
export const GLASS_CARD_EDGE = {
  border: '1px solid color-mix(in srgb, var(--color-ios-ink) 12%, transparent)',
  boxShadow: '0 18px 48px color-mix(in srgb, var(--color-ios-ink) 14%, transparent)',
} as const;

export type SectionState =
  | { readonly phase: 'idle' }
  | { readonly phase: 'saving' }
  | { readonly phase: 'saved'; readonly message: string }
  | { readonly phase: 'error'; readonly message: string };

/** Le motif d'un refus, dit dans la langue de l'administrateur — jamais le texte brut de la passerelle. */
export function refusalOf(failure: ApiFailure, language: InterfaceLanguage): string {
  if (failure.code === 'USERNAME_TAKEN') return translateAdmin(language, 'admin.create.usernameTaken');
  if (failure.code === 'EMAIL_TAKEN') return translateAdmin(language, 'admin.create.emailTaken');
  if (failure.code === 'TWO_FACTOR_NOT_ENROLLED') return translateAdmin(language, 'admin.security.twoFactorNotEnrolled');
  if (failure.status === 403) return translateAdmin(language, 'admin.prefs.reserved');
  if (failure.status === 400) return translateAdmin(language, 'admin.prefs.invalid');
  return translateAdmin(language, 'admin.edit.failed');
}

/**
 * L'ÉCRITURE D'UNE SECTION — un geste en vol à la fois, le membre RENDU par la
 * passerelle écrit dans le cache du détail (jamais une invalidation, qui
 * afficherait l'état d'avant le temps de revenir), et la liste des comptes
 * invalidée pour qu'elle ne montre pas l'ancien nom.
 */
export function useMemberWrite({
  userId,
  language,
  onAnnounce,
}: {
  readonly userId: string;
  readonly language: InterfaceLanguage;
  readonly onAnnounce: (texte: string) => void;
}) {
  const client = useQueryClient();
  const [state, setState] = useState<SectionState>({ phase: 'idle' });
  const [failure, setFailure] = useState<ApiFailure | null>(null);

  /**
   * `optimistic` (#8289) — le membre tel qu'il sera, posé dans le cache AVANT
   * la réponse : le badge bascule au geste. Un refus remet l'instantané pris
   * juste avant, jamais une valeur recalculée.
   */
  async function run(
    gesture: () => Promise<ApiResult<AdminUserDetail>>,
    success: AdminPlainCatalogKey = 'admin.edit.saved',
    optimistic?: (avant: AdminUserDetail) => AdminUserDetail,
  ): Promise<AdminUserDetail | null> {
    if (state.phase === 'saving') return null;
    const cle = adminUserDetailQueryKey(userId);
    const instantane = client.getQueryData<AdminUserDetail>(cle);
    if (optimistic !== undefined && instantane !== undefined) client.setQueryData(cle, optimistic(instantane));
    setState({ phase: 'saving' });
    setFailure(null);
    const result = await gesture();
    if (!result.ok) {
      if (optimistic !== undefined && instantane !== undefined) client.setQueryData(cle, instantane);
      const message = refusalOf(result, language);
      setState({ phase: 'error', message });
      setFailure(result);
      onAnnounce(message);
      return null;
    }
    client.setQueryData(adminUserDetailQueryKey(userId), result.data);
    void client.invalidateQueries({ queryKey: ['admin', 'users'] });
    const message = translateAdmin(language, success);
    setState({ phase: 'saved', message });
    onAnnounce(message);
    return result.data;
  }

  const reset = () => {
    if (state.phase !== 'saving') setState({ phase: 'idle' });
  };

  return { state, failure, run, reset };
}

/**
 * UNE SECTION ÉDITABLE — un `<form>` : Entrée enregistre depuis n'importe quel
 * champ, et le bouton porte le nom de la section pour le lecteur d'écran
 * (« Enregistrer — Identité »).
 */
export function MemberSection({
  name,
  titre,
  language,
  dirty,
  state,
  onSave,
  saveLabel,
  saveTone = 'primary',
  children,
}: {
  readonly name: string;
  readonly titre: string;
  readonly language: InterfaceLanguage;
  /** `null` : la section n'a RIEN à enregistrer d'un bloc (ses gestes sont immédiats). */
  readonly dirty: boolean | null;
  readonly state: SectionState;
  readonly onSave?: () => void;
  readonly saveLabel?: string;
  readonly saveTone?: 'primary' | 'danger';
  readonly children: ReactNode;
}) {
  const titreId = useId();
  const envoi = state.phase === 'saving';
  return (
    <section className="grid gap-3" aria-labelledby={titreId} data-admin-member-section={name}>
      <h2 id={titreId} className="px-1 text-body font-semibold" style={{ color: INK }}>
        {titre}
      </h2>
      <form
        className={`${GLASS_CARD_CLASS} grid gap-5 p-5`}
        style={GLASS_CARD_EDGE}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (dirty === true && !envoi) onSave?.();
        }}
      >
        {children}
        <div className="flex flex-wrap items-center justify-end gap-3">
          <p
            role="status"
            aria-live="polite"
            className="min-w-0 flex-1 text-caption"
            data-admin-section-state={state.phase}
            style={{ color: state.phase === 'error' ? 'var(--color-danger)' : state.phase === 'saved' ? 'var(--color-success)' : INK2 }}
          >
            {state.phase === 'saving'
              ? translateAdmin(language, 'admin.section.saving')
              : state.phase === 'saved' || state.phase === 'error'
                ? state.message
                : ''}
          </p>
          {dirty === null ? null : (
            <SectionButton
              type="submit"
              tone={saveTone}
              disabled={!dirty || envoi}
              label={`${saveLabel ?? translateAdmin(language, 'admin.edit.save')} — ${titre}`}
              data={{ 'data-admin-section-save': name }}
            >
              {saveLabel ?? translateAdmin(language, 'admin.edit.save')}
            </SectionButton>
          )}
        </div>
      </form>
    </section>
  );
}

/** Un bouton COMPACT de section — 44 px de haut, jamais étiré sur la largeur d'une carte. */
export function SectionButton({
  type = 'button',
  tone = 'secondary',
  disabled = false,
  label,
  onClick,
  data,
  children,
}: {
  readonly type?: 'button' | 'submit';
  readonly tone?: 'primary' | 'secondary' | 'danger';
  readonly disabled?: boolean;
  readonly label?: string;
  readonly onClick?: () => void;
  readonly data?: Readonly<Record<`data-${string}`, string>>;
  readonly children: string;
}) {
  const teinte =
    tone === 'primary'
      ? { color: 'var(--color-ios-on-brand)', background: 'linear-gradient(90deg, var(--ios-indigo-600), var(--ios-indigo-400))' }
      : tone === 'danger'
        ? { color: 'var(--color-danger)', border: '1px solid color-mix(in srgb, var(--color-danger) 40%, transparent)' }
        : { color: INK, border: '1px solid color-mix(in srgb, var(--color-ios-ink-3) 60%, transparent)' };
  return (
    <button
      {...data}
      type={type}
      disabled={disabled}
      aria-label={label}
      onClick={onClick}
      className="rounded-chip px-4 text-body font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed"
      style={{ ...teinte, minHeight: 44, opacity: disabled ? 0.45 : 1, outlineColor: BRAND }}
    >
      {children}
    </button>
  );
}

/** Un champ texte d'administration — partagé avec la création d'un compte (#8217). */
export function Texte({
  id,
  label,
  valeur,
  type = 'text',
  focus,
  error,
  autoComplete,
  onFocus,
  onBlur,
  onValeur,
}: {
  readonly id: string;
  readonly label: string;
  readonly valeur: string;
  readonly type?: 'text' | 'email' | 'password' | 'tel';
  readonly focus: boolean;
  readonly error?: string | undefined;
  readonly autoComplete?: string;
  readonly onFocus: () => void;
  readonly onBlur: () => void;
  readonly onValeur: (valeur: string) => void;
}) {
  return (
    <Field id={id} label={label} tint={BRAND} focused={focus} error={error}>
      {({ id: champId, describedBy }) => (
        <input
          id={champId}
          type={type}
          value={valeur}
          autoCapitalize="none"
          autoComplete={autoComplete ?? (type === 'password' ? 'new-password' : 'off')}
          spellCheck={false}
          aria-describedby={describedBy}
          aria-invalid={error === undefined ? undefined : true}
          onInput={(event) => onValeur(event.currentTarget.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          className="w-full bg-transparent text-body outline-none"
          style={{ minHeight: 44, color: INK }}
        />
      )}
    </Field>
  );
}

/** Le focus de plusieurs champs, tenu par UN état : un seul champ l'a à la fois. */
export function useFieldFocus() {
  const [focus, setFocus] = useState<string | null>(null);
  return (name: string) => ({
    focus: focus === name,
    onFocus: () => setFocus(name),
    onBlur: () => setFocus((courant) => (courant === name ? null : courant)),
  });
}

export function Choix({
  id,
  label,
  valeur,
  options,
  onValeur,
}: {
  readonly id: string;
  readonly label: string;
  readonly valeur: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly onValeur: (valeur: string) => void;
}) {
  /* Une valeur SERVIE hors de la liste (une langue que ce client ne connaît
     pas) reste choisie et visible — la remplacer en silence par la première
     option ferait « changer » la section sans que personne n'y ait touché. */
  const liste = options.some((option) => option.value === valeur) ? options : [{ value: valeur, label: valeur.toUpperCase() }, ...options];
  return (
    <label className="grid gap-1" htmlFor={id}>
      <span className="text-caption font-medium" style={{ color: 'var(--color-ios-ink-3)' }}>
        {label}
      </span>
      <select
        id={id}
        value={valeur}
        onChange={(event) => onValeur(event.currentTarget.value)}
        className="rounded-[14px] px-3 text-body"
        style={{ minHeight: 48, backgroundColor: 'var(--color-ios-card)', border: '1px solid color-mix(in srgb, var(--color-ios-ink-3) 30%, transparent)', color: INK }}
      >
        {liste.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Une bascule ARIA (`role="switch"`) — l'état se lit, jamais la seule couleur. */
export function Bascule({
  id,
  label,
  actif,
  disabled = false,
  hint,
  onBascule,
}: {
  readonly id: string;
  readonly label: string;
  readonly actif: boolean;
  readonly disabled?: boolean;
  readonly hint?: string;
  readonly onBascule: (actif: boolean) => void;
}) {
  const hintId = `${id}-hint`;
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="text-body" style={{ color: INK }}>
          {label}
        </label>
        {hint === undefined ? null : (
          <p id={hintId} className="text-caption" style={{ color: INK2 }}>
            {hint}
          </p>
        )}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={actif}
        aria-describedby={hint === undefined ? undefined : hintId}
        disabled={disabled}
        onClick={() => onBascule(!actif)}
        className="relative h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
        style={{ backgroundColor: actif ? BRAND : 'color-mix(in srgb, var(--color-ios-ink-3) 35%, transparent)', outlineColor: BRAND }}
      >
        <span aria-hidden="true" className="absolute top-0.5 size-6 rounded-full bg-ios-on-brand transition-all" style={{ insetInlineStart: actif ? 'calc(100% - 1.625rem)' : '0.125rem' }} />
      </button>
    </div>
  );
}

/** Vérifié ✓ ou non : le MOT porte l'état, la couleur ne fait que l'appuyer. */
export function BadgeVerifie({ verifie, language }: { readonly verifie: boolean; readonly language: InterfaceLanguage }) {
  const teinte = verifie ? 'var(--color-success)' : 'var(--color-ios-ink-2)';
  return (
    <span
      data-admin-verified={verifie ? 'true' : 'false'}
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-caption font-semibold"
      style={{
        color: teinte,
        backgroundColor: `color-mix(in srgb, ${teinte} 14%, transparent)`,
        border: `1px solid color-mix(in srgb, ${teinte} 40%, transparent)`,
      }}
    >
      {verifie ? <span aria-hidden="true">✓</span> : null}
      {translateAdmin(language, verifie ? 'admin.contact.verified' : 'admin.contact.unverified')}
    </span>
  );
}
