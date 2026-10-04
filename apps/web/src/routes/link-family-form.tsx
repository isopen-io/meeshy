import type { HTMLAttributes } from 'react';

import { SECTION_INK, SECTION_INK_2 } from '@/components/grouped-section';
import { BRAND_BUTTON_STYLE, LinksGlyph } from '@/routes/links-parts';

/**
 * **LES CHAMPS DES CRÉATIONS DE LIENS** (#6408, #6409) — un champ libellé, qui
 * dit son aide et son refus SOUS lui (`aria-describedby`, `aria-invalid`), et
 * le bouton d'envoi. Les sections et bascules viennent de `share-link-form.tsx`,
 * pour que les trois créations aient la même grammaire.
 */

const BRAND = 'var(--color-ios-brand)';

export function Field({
  id,
  label,
  placeholder,
  value,
  onChange,
  help,
  error,
  type = 'text',
  inputMode,
  dir,
  maxLength,
  required = false,
}: {
  readonly id: string;
  readonly label: string;
  readonly placeholder: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly help?: string;
  readonly error?: string | null;
  readonly type?: 'text' | 'url';
  readonly inputMode?: HTMLAttributes<HTMLInputElement>['inputMode'];
  readonly dir?: 'ltr';
  readonly maxLength?: number;
  readonly required?: boolean;
}) {
  const invalid = error !== undefined && error !== null;
  const described = [help === undefined ? null : `${id}-help`, invalid ? `${id}-error` : null].filter((part): part is string => part !== null).join(' ');
  return (
    <div data-field={id} className="grid gap-0.5 px-3.5 py-2 focus-within:outline-2 focus-within:-outline-offset-2" style={{ outlineColor: BRAND }}>
      <label htmlFor={id} className="text-chip font-medium" style={{ color: invalid ? 'var(--color-error)' : SECTION_INK_2 }}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        required={required}
        aria-invalid={invalid}
        {...(described === '' ? {} : { 'aria-describedby': described })}
        {...(inputMode === undefined ? {} : { inputMode })}
        {...(dir === undefined ? {} : { dir })}
        {...(maxLength === undefined ? {} : { maxLength })}
        onChange={(event) => onChange(event.currentTarget.value)}
        className="min-w-0 bg-transparent text-body outline-none"
        style={{ minHeight: 44, color: SECTION_INK }}
      />
      {help === undefined ? null : (
        <p id={`${id}-help`} className="break-all text-chip" style={{ color: SECTION_INK_2 }}>
          {help}
        </p>
      )}
      {invalid ? (
        <p id={`${id}-error`} data-field-error className="text-chip font-medium" style={{ color: 'var(--color-error)' }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function SubmitButton({ label, disabled }: { readonly label: string; readonly disabled: boolean }) {
  return (
    <button
      type="submit"
      data-link-submit
      disabled={disabled}
      aria-disabled={disabled}
      className="flex w-full items-center justify-center gap-2 rounded-card text-body font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{ ...BRAND_BUTTON_STYLE, minHeight: 50, opacity: disabled ? 0.55 : 1 }}
    >
      <LinksGlyph name="link" size={18} />
      {label}
    </button>
  );
}

export function FormError({ text }: { readonly text: string | null }) {
  return text === null ? null : (
    <p role="alert" data-link-create-error className="text-center text-caption font-medium" style={{ color: 'var(--color-error)' }}>
      {text}
    </p>
  );
}
