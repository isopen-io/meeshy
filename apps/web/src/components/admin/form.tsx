import { useState, type ReactNode } from 'react';

import { Field } from '@/components/field';
import { Sheet } from '@/components/sheet';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { useOnline } from '@/lib/net/online';

import { AdminButton, type AdminButtonTone } from './button';
import { BRAND, INK, INK2, INK3 } from './tone';

/**
 * **LE KIT DE FORMULAIRE D'ADMINISTRATION** (#9463) — la généralisation des briques
 * que la fiche d'un membre avait écrites pour elle seule (`Texte`, `Choix`, `Bascule`,
 * `admin-member-parts`) et des conventions d'`AdminConfirmSheet` (compteur de motif,
 * refus annoncé, souverain sans motif). Les feuilles et les panneaux d'administration
 * recopiaient chacun leurs champs, leurs bascules, leur motif et leurs boutons : le
 * même geste se dessinait cinq fois, et la règle du motif vivait en quatre copies.
 *
 * Trois conventions tiennent ensemble tout le fichier :
 * - `onInput` sur les champs texte, `onChange` sur `<select>` et la case à cocher —
 *   sous happy-dom, un `input` dispatché ne rappelle jamais `onChange` d'un champ texte ;
 * - toute cible fait au moins 44 px (la boîte d'un champ en fait 48) ;
 * - les ancres de test passent par `data`, la forme d'`AdminButton` : le kit ne
 *   connaît aucun nom d'ancre d'écran, et l'écran garde le sien.
 */
export type AdminData = Readonly<Record<`data-${string}`, string>>;

export type AdminSelectOption = { readonly value: string; readonly label: string };

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2';
const CAPTION_LABEL = { color: INK3 } as const;
const BOX = {
  minHeight: 48,
  backgroundColor: 'var(--color-ios-card)',
  border: '1px solid color-mix(in srgb, var(--color-ios-ink-3) 30%, transparent)',
  color: INK,
  outlineColor: BRAND,
} as const;

const describedBy = (...ids: readonly (string | undefined)[]): string | undefined =>
  ids.filter((id): id is string => id !== undefined).join(' ') || undefined;

/**
 * **LA RÈGLE DU MOTIF, UNE FOIS** — pure, testée sans DOM. Le bannissement, la
 * conversation, le mot de passe et le rôle l'écrivaient chacun ; elles ne
 * différaient que par trois réglages, que voici.
 *
 * - `required` : un champ vide bloque-t-il l'envoi ? Sinon, un motif COMMENCÉ doit
 *   encore atteindre son minimum — un demi-mot n'est pas une justification.
 * - `whenSovereign` : le rang souverain n'a rien à justifier (spec 2026-10-04 § 4).
 *   `'hide'` retire le champ ; `'optional'` le laisse, facultatif, pour qui veut
 *   en écrire un.
 * - `sent` : le motif nettoyé qui part, ou `null` — un champ vide n'envoie jamais
 *   une chaîne vide que la passerelle refuserait.
 */
export function motiveState({
  text,
  minLength,
  required,
  sovereign,
  whenSovereign,
}: {
  readonly text: string;
  readonly minLength: number;
  readonly required: boolean;
  readonly sovereign: boolean;
  readonly whenSovereign: 'hide' | 'optional';
}): { readonly trimmed: string; readonly shown: boolean; readonly tooShort: boolean; readonly ready: boolean; readonly sent: string | null } {
  const trimmed = text.trim();
  if (sovereign && whenSovereign === 'hide') return { trimmed, shown: false, tooShort: false, ready: true, sent: null };
  const mandatory = required && !sovereign;
  const tooShort = (mandatory || trimmed !== '') && trimmed.length < Math.max(minLength, mandatory ? 1 : 0);
  return { trimmed, shown: true, tooShort, ready: !tooShort, sent: trimmed === '' ? null : trimmed };
}

/**
 * **LE REFUS D'UN FORMULAIRE** — une alerte (`role="alert"`) : il s'annonce dès
 * qu'il paraît, sans que le lecteur d'écran ait à le chercher. Vide, il ne rend
 * rien : une alerte montée vide n'annonce rien, et tient une place. `tone="neutral"`
 * sert l'avis qui n'est pas une faute (« rien à enregistrer ») : annoncé pareil,
 * jamais peint en danger. Un refus de plusieurs lignes garde ses retours à la ligne.
 */
export function AdminFormError({
  id,
  text,
  tone = 'danger',
  data,
}: {
  readonly id?: string;
  readonly text: string;
  readonly tone?: 'danger' | 'neutral';
  readonly data?: AdminData;
}) {
  if (text === '') return null;
  return (
    <p
      {...data}
      id={id}
      role="alert"
      className="whitespace-pre-line break-words text-caption font-medium"
      style={{ color: tone === 'danger' ? 'var(--color-danger)' : INK2 }}
    >
      {text}
    </p>
  );
}

/**
 * **L'ÉTAT D'UN ENVOI** — en cours, enregistré, refusé. La région est montée VIDE et
 * reste montée : une région `aria-live` qui apparaît en même temps que son texte
 * n'est pas annoncée par tous les lecteurs d'écran.
 */
export function AdminFormStatus({
  phase,
  text,
  data,
}: {
  readonly phase: 'idle' | 'saving' | 'saved' | 'error';
  readonly text: string;
  readonly data?: AdminData;
}) {
  const color = phase === 'error' ? 'var(--color-danger)' : phase === 'saved' ? 'var(--color-success)' : INK2;
  return (
    <p {...data} role="status" aria-live="polite" data-admin-form-status={phase} className="min-w-0 flex-1 text-caption" style={{ color }}>
      {phase === 'idle' ? '' : text}
    </p>
  );
}

/**
 * **LE CADRE D'UN CHAMP** — libellé, contrôle, note, refus. Les identifiants de la
 * note et du refus se dérivent de celui du champ (`${id}-note`, `${id}-error`) : le
 * contrôle les cite dans `aria-describedby` sans que l'appelant ait à les inventer.
 */
export function AdminField({
  id,
  label,
  note,
  noteTone = 'neutral',
  noteData,
  error,
  errorData,
  children,
}: {
  readonly id: string;
  readonly label?: string | undefined;
  readonly note?: string | undefined;
  readonly noteTone?: 'neutral' | 'danger';
  readonly noteData?: AdminData;
  readonly error?: string | undefined;
  readonly errorData?: AdminData | undefined;
  readonly children: ReactNode;
}) {
  return (
    <div className="grid gap-1">
      {label === undefined ? null : (
        <label htmlFor={id} className="text-caption font-medium" style={CAPTION_LABEL}>
          {label}
        </label>
      )}
      {children}
      {note === undefined ? null : (
        <p {...noteData} id={`${id}-note`} className="text-caption tabular-nums" style={{ color: noteTone === 'danger' ? 'var(--color-danger)' : INK2 }}>
          {note}
        </p>
      )}
      {error === undefined ? null : <AdminFormError id={`${id}-error`} text={error} {...(errorData === undefined ? {} : { data: errorData })} />}
    </div>
  );
}

type TextInputProps = {
  readonly id: string;
  readonly label?: string | undefined;
  readonly value: string;
  readonly onValue: (value: string) => void;
  readonly type?: 'text' | 'email' | 'password' | 'tel' | 'url' | 'number' | 'date';
  readonly inputMode?: 'text' | 'email' | 'tel' | 'url' | 'numeric' | 'decimal' | 'search' | 'none';
  readonly min?: string | number;
  readonly step?: string | number;
  readonly onCommit?: (value: string) => void;
  readonly placeholder?: string;
  readonly autoComplete?: string;
  readonly mono?: boolean;
  readonly note?: string | undefined;
  readonly noteTone?: 'neutral' | 'danger';
  readonly noteData?: AdminData;
  readonly error?: string | undefined;
  readonly errorData?: AdminData | undefined;
  readonly data?: AdminData | undefined;
  readonly disabled?: boolean;
};

/**
 * **UN CHAMP TEXTE** — la boîte du dépôt (`Field`, 48 px, bord épaissi au focus),
 * posée SANS son propre refus : celui-ci vit dans `AdminField`, où il peut porter
 * l'ancre d'un écran. Le focus est tenu ici : plus aucun écran n'a à suivre quel
 * champ l'a (la fin de `useFieldFocus`).
 *
 * `onCommit` sert les champs qui ÉCRIVENT sans bouton (une préférence) : la valeur
 * part quand on quitte le champ ou sur Entrée, jamais à chaque frappe — un nombre à
 * demi tapé n'est pas une valeur à enregistrer.
 */
export function AdminTextInput({
  id,
  label,
  value,
  onValue,
  type = 'text',
  inputMode,
  min,
  step,
  onCommit,
  placeholder,
  autoComplete,
  mono = false,
  note,
  noteTone,
  noteData,
  error,
  errorData,
  data,
  disabled = false,
}: TextInputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <AdminField
      id={id}
      label={label}
      note={note}
      {...(noteTone === undefined ? {} : { noteTone })}
      {...(noteData === undefined ? {} : { noteData })}
      error={error}
      errorData={errorData}
    >
      <Field id={id} tint={BRAND} focused={focused}>
        {({ id: fieldId }) => (
          <input
            {...data}
            id={fieldId}
            type={type}
            value={value}
            disabled={disabled}
            {...(inputMode === undefined ? {} : { inputMode })}
            {...(min === undefined ? {} : { min })}
            {...(step === undefined ? {} : { step })}
            {...(placeholder === undefined ? {} : { placeholder })}
            autoCapitalize="none"
            autoComplete={autoComplete ?? (type === 'password' ? 'new-password' : 'off')}
            spellCheck={false}
            aria-describedby={describedBy(note === undefined ? undefined : `${id}-note`, error === undefined ? undefined : `${id}-error`)}
            aria-invalid={error === undefined ? undefined : true}
            onInput={(event) => onValue(event.currentTarget.value)}
            onFocus={() => setFocused(true)}
            onBlur={(event) => {
              setFocused(false);
              onCommit?.(event.currentTarget.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onCommit?.(event.currentTarget.value);
            }}
            className={`w-full bg-transparent text-body outline-none disabled:opacity-50 ${mono ? 'font-mono' : ''}`.trim()}
            style={{ minHeight: 44, color: INK }}
          />
        )}
      </Field>
    </AdminField>
  );
}

/** **UN TEXTE LONG** (une bio, une description) — mêmes libellé et bord que le champ texte. */
export function AdminTextArea({
  id,
  label,
  value,
  onValue,
  rows = 3,
  maxLength,
  data,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onValue: (value: string) => void;
  readonly rows?: number;
  readonly maxLength?: number;
  readonly data?: AdminData;
}) {
  return (
    <AdminField id={id} label={label}>
      <textarea
        {...data}
        id={id}
        rows={rows}
        value={value}
        {...(maxLength === undefined ? {} : { maxLength })}
        onInput={(event) => onValue(event.currentTarget.value)}
        onChange={() => undefined}
        className={`rounded-[14px] px-4 py-3 text-body ${FOCUS}`}
        style={BOX}
      />
    </AdminField>
  );
}

/**
 * **UNE LISTE DE CHOIX** — une valeur SERVIE hors de la liste (une langue que ce
 * client ne connaît pas, un rôle non posé) reste choisie et visible : la remplacer
 * en silence par la première option ferait « changer » le formulaire sans que
 * personne n'y ait touché. Sans `label`, le contrôle seul — l'hôte le nomme.
 */
export function AdminSelect({
  id,
  label,
  value,
  options,
  onValue,
  fallbackLabel,
  disabled = false,
  data,
}: {
  readonly id: string;
  readonly label?: string;
  readonly value: string;
  readonly options: readonly AdminSelectOption[];
  readonly onValue: (value: string) => void;
  readonly fallbackLabel?: (value: string) => string;
  readonly disabled?: boolean;
  readonly data?: AdminData;
}) {
  const listed = options.some((option) => option.value === value)
    ? options
    : [{ value, label: fallbackLabel === undefined ? value.toUpperCase() : fallbackLabel(value) }, ...options];
  const control = (
    <select
      {...data}
      id={id}
      value={value}
      disabled={disabled}
      onChange={(event) => onValue(event.currentTarget.value)}
      className={`rounded-[14px] px-3 text-body disabled:opacity-50 ${FOCUS}`}
      style={BOX}
    >
      {listed.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
  return label === undefined ? control : <AdminField id={id} label={label}>{control}</AdminField>;
}

/**
 * **UNE BASCULE** (`role="switch"`) — l'état se lit dans `aria-checked`, jamais dans la
 * seule couleur. La piste dessinée fait 28 px ; le BOUTON qui la porte en fait 44 sur
 * 48, la cible tactile que la piste seule n'atteignait pas. Le bouton glisse par
 * `insetInlineStart`, jamais par `translateX` : en RTL, la piste se lit à l'envers.
 * Sans `label`, l'hôte qui dessine son propre libellé le cite par `ariaLabelledBy`.
 */
export function AdminSwitch({
  id,
  label,
  hint,
  checked,
  onToggle,
  disabled = false,
  ariaLabelledBy,
  ariaDescribedBy,
  data,
}: {
  readonly id: string;
  readonly label?: string;
  readonly hint?: string;
  readonly ariaLabelledBy?: string;
  readonly ariaDescribedBy?: string;
  readonly checked: boolean;
  readonly onToggle: (next: boolean) => void;
  readonly disabled?: boolean;
  readonly data?: AdminData;
}) {
  const hintId = `${id}-hint`;
  const control = (
    <button
      {...data}
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={describedBy(hint === undefined ? undefined : hintId, ariaDescribedBy)}
      disabled={disabled}
      onClick={() => onToggle(!checked)}
      className={`grid shrink-0 place-items-center rounded-full disabled:opacity-50 ${FOCUS}`}
      style={{ minHeight: 44, minWidth: 48, outlineColor: BRAND }}
    >
      <span
        aria-hidden="true"
        className="relative h-7 w-12 rounded-full transition-colors"
        style={{ backgroundColor: checked ? BRAND : 'color-mix(in srgb, var(--color-ios-ink-3) 35%, transparent)' }}
      >
        <span className="absolute top-0.5 size-6 rounded-full bg-ios-on-brand transition-all" style={{ insetInlineStart: checked ? 'calc(100% - 1.625rem)' : '0.125rem' }} />
      </span>
    </button>
  );
  if (label === undefined) return control;
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
      {control}
    </div>
  );
}

/**
 * **UNE CASE À COCHER, NATIVE** — `.checked` est un contrat que des écrans lisent
 * (création d'un compte, réinitialisation d'un mot de passe) : un `role="checkbox"`
 * dessiné ne le porterait pas. Le libellé ENVELOPPE la case, sur 44 px : toute la
 * rangée est la cible.
 */
export function AdminCheckbox({
  id,
  label,
  hint,
  checked,
  onToggle,
  disabled = false,
  data,
}: {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  readonly checked: boolean;
  readonly onToggle: (next: boolean) => void;
  readonly disabled?: boolean;
  readonly data?: AdminData;
}) {
  const hintId = `${id}-hint`;
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="flex items-center gap-3 text-body" style={{ minHeight: 44, color: INK }}>
        <input
          {...data}
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          aria-describedby={hint === undefined ? undefined : hintId}
          onChange={(event) => onToggle(event.currentTarget.checked)}
          className={`size-5 shrink-0 ${FOCUS}`}
          style={{ accentColor: BRAND, outlineColor: BRAND }}
        />
        <span>{label}</span>
      </label>
      {hint === undefined ? null : (
        <p id={hintId} className="text-caption" style={{ color: INK2 }}>
          {hint}
        </p>
      )}
    </div>
  );
}

/**
 * **LE CHAMP DU MOTIF** — la règle est `motiveState`, ce champ en est le dessin. Quand
 * le rang souverain lève l'obligation, le libellé le DIT (`admin.kit.motiveOptional`) ;
 * quand il retire le champ, rien n'est rendu. Le compteur se lit dès qu'un minimum
 * existe, en danger sous ce minimum. Un `input`, pas un `textarea` : un motif tient
 * sur une ligne, et les écrans qui l'adoptent le lisent comme tel.
 */
export function AdminReasonField({
  id,
  language,
  label,
  value,
  onValue,
  minLength,
  required,
  sovereign,
  whenSovereign,
  error,
  data,
}: {
  readonly id: string;
  readonly language: AdminLanguage;
  readonly label: string;
  readonly value: string;
  readonly onValue: (value: string) => void;
  readonly minLength: number;
  readonly required: boolean;
  readonly sovereign: boolean;
  readonly whenSovereign: 'hide' | 'optional';
  readonly error?: string;
  readonly data?: AdminData;
}) {
  const state = motiveState({ text: value, minLength, required, sovereign, whenSovereign });
  if (!state.shown) return null;
  const lifted = required && sovereign;
  return (
    <AdminTextInput
      id={id}
      label={lifted ? translateAdmin(language, 'admin.kit.motiveOptional') : label}
      value={value}
      onValue={onValue}
      note={
        minLength > 0
          ? translateAdmin(language, 'admin.kit.confirm.motiveCount', { count: String(state.trimmed.length), min: String(minLength) })
          : undefined
      }
      noteTone={state.tooShort ? 'danger' : 'neutral'}
      noteData={{ 'data-admin-motive-count': '' }}
      error={error}
      data={data}
    />
  );
}

export type AdminFormPrimary = {
  readonly label: string;
  readonly tone?: 'primary' | 'danger';
  readonly type?: 'button' | 'submit';
  readonly disabled?: boolean;
  readonly busy?: boolean;
  readonly onClick?: () => void;
  readonly data?: AdminData;
};

export type AdminFormSecondary = {
  /** Clé STABLE du geste : son libellé change quand il s'arme, et une clé qui change remonte le bouton — le focus partait au `<body>`. */
  readonly id: string;
  readonly label: string;
  readonly tone?: AdminButtonTone;
  readonly disabled?: boolean;
  readonly onClick: () => void;
  readonly data?: AdminData;
};

/**
 * **LES GESTES D'UN FORMULAIRE** — la disposition d'`AdminConfirmSheet` (alignés à
 * droite, jamais étirés). Un geste à la fois : pendant l'envoi, le principal se dit
 * occupé et les autres gestes qui ÉCRIVENT attendent. Annuler reste offert, en vol
 * comme hors ligne, puisqu'il n'écrit rien : on peut toujours renoncer à attendre.
 * Hors ligne, les gestes qui écrivent sont désactivés (ce que l'avis
 * `admin.kit.offline` promet).
 *
 * Annuler porte `data-admin-form-cancel`, jamais `data-admin-action="cancel"`, que la
 * feuille de confirmation et les gestes de fiche occupent déjà.
 */
export function AdminFormActions({
  language,
  primary,
  secondary = [],
  onCancel,
  cancelLabel,
}: {
  readonly language: AdminLanguage;
  readonly primary?: AdminFormPrimary;
  readonly secondary?: readonly AdminFormSecondary[];
  readonly onCancel?: () => void;
  readonly cancelLabel?: string;
}) {
  const online = useOnline();
  const busy = primary?.busy === true;
  const writeBlocked = busy || !online;
  return (
    <div data-admin-form-actions data-admin-form-offline={online ? 'false' : 'true'} className="flex flex-wrap justify-end gap-3">
      {onCancel === undefined ? null : (
        <AdminButton onClick={onCancel} data={{ 'data-admin-form-cancel': '' }}>
          {cancelLabel ?? translateAdmin(language, 'admin.kit.cancel')}
        </AdminButton>
      )}
      {secondary.map((action) => (
        <AdminButton
          key={action.id}
          tone={action.tone ?? 'secondary'}
          disabled={writeBlocked || action.disabled === true}
          onClick={action.onClick}
          {...(action.data === undefined ? {} : { data: action.data })}
        >
          {action.label}
        </AdminButton>
      ))}
      {primary === undefined ? null : (
        <AdminButton
          type={primary.type ?? 'button'}
          tone={primary.tone ?? 'primary'}
          busy={busy}
          disabled={!online || primary.disabled === true}
          {...(primary.onClick === undefined ? {} : { onClick: primary.onClick })}
          {...(primary.data === undefined ? {} : { data: primary.data })}
        >
          {primary.label}
        </AdminButton>
      )}
    </div>
  );
}

/**
 * **LA CONFIRMATION EN DEUX TEMPS** — le premier appui ARME le geste (son libellé
 * devient « Confirmer »), le second l'exécute ; toute modification désarme. `K` nomme
 * les gestes armables d'un écran (« enregistrer », « retirer »).
 */
export function useArmedConfirm<K extends string>(): { readonly armed: K | null; readonly arm: (key: K) => void; readonly disarm: () => void } {
  const [armed, setArmed] = useState<K | null>(null);
  return { armed, arm: setArmed, disarm: () => setArmed(null) };
}

/**
 * **LA FEUILLE ÉDITABLE** — la troisième forme du kit, à côté d'`AdminDetailSheet`
 * (large, en lecture) et d'`AdminConfirmSheet` (un geste et son motif) : centrée, un
 * corps qui défile lui-même, la croix nommée dans la langue de l'administration.
 * Le corps est un `div` : la feuille rendait par défaut un `<ul>`, et un formulaire
 * y plaçait un `<div>` enfant direct d'une liste. Avec `onSubmit`, le corps est un
 * `<form noValidate>` — Entrée soumet, la validation reste celle de l'écran.
 */
export function AdminFormSheet({
  language,
  title,
  onClose,
  data,
  onSubmit,
  children,
}: {
  readonly language: AdminLanguage;
  readonly title: string;
  readonly onClose: () => void;
  readonly data?: AdminData;
  readonly onSubmit?: () => void;
  readonly children: ReactNode;
}) {
  const body = 'grid min-h-0 flex-1 gap-4 overflow-y-auto px-4 pb-6';
  return (
    <Sheet title={title} presentation="centered" bodyAs="div" closeLabel={translateAdmin(language, 'admin.kit.close')} onClose={onClose}>
      {onSubmit === undefined ? (
        <div {...data} className={body}>
          {children}
        </div>
      ) : (
        <form
          {...data}
          noValidate
          className={body}
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          {children}
        </form>
      )}
    </Sheet>
  );
}
