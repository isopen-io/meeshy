import { useState, type ReactNode } from 'react';

import { AdminGlyph } from '@/components/admin/admin-glyph';
import { BRAND, EDGE, INK, INK2, INK3, SURFACE } from '@/components/admin/tone';
import { formatCount } from '@/lib/admin/interpret/numbers';
import type { ChoiceOption } from '@/lib/admin/broadcast-form';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';

/**
 * **LES CHAMPS DE LA FEUILLE DE COMPOSITION** (#8876, #6731) — un champ texte, un
 * choix dans une liste, et la SÉLECTION MULTIPLE NOMMÉE (langues, pays) : le kit
 * d'administration n'a pas de formulaire, ces pièces sont locales au lot et
 * signalées dans le rapport.
 *
 * Chaque champ porte son libellé (`<label for>`), son indice et son erreur
 * rattachés par `aria-describedby`, une erreur annoncée (`role="alert"`) et
 * peinte avec le bord de danger : jamais la couleur seule, le texte est là.
 */
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2';

const fieldStyle = (invalid: boolean) =>
  ({
    minHeight: 44,
    backgroundColor: SURFACE,
    border: `1px solid ${invalid ? 'var(--color-danger)' : EDGE}`,
    color: INK,
    outlineColor: BRAND,
  }) as const;

const describedBy = (id: string, hint: boolean, error: boolean): string | undefined => {
  const ids = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].flatMap((entry) => (entry === null ? [] : [entry]));
  return ids.length === 0 ? undefined : ids.join(' ');
};

function FieldFrame({
  id,
  label,
  hint,
  error,
  children,
}: {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  readonly error?: string | null;
  readonly children: ReactNode;
}) {
  return (
    <div data-admin-field={id} className="grid gap-1">
      <label htmlFor={id} className="text-caption font-medium" style={{ color: INK2 }}>
        {label}
      </label>
      {children}
      {hint === undefined ? null : (
        <p id={`${id}-hint`} className="text-caption" style={{ color: INK3 }}>
          {hint}
        </p>
      )}
      {error === undefined || error === null ? null : (
        <p id={`${id}-error`} role="alert" data-admin-field-error className="text-caption font-medium" style={{ color: 'var(--color-danger)' }}>
          {error}
        </p>
      )}
    </div>
  );
}

export function TextField({
  id,
  label,
  hint,
  error,
  value,
  onChange,
  rows,
  inputMode,
}: {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  readonly error?: string | null;
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** Présent : un champ multiligne. */
  readonly rows?: number;
  readonly inputMode?: 'numeric';
}) {
  const invalid = error !== undefined && error !== null;
  const common = {
    id,
    value,
    'aria-invalid': invalid,
    'aria-describedby': describedBy(id, hint !== undefined, invalid),
    className: `w-full rounded-card px-4 py-2 text-body ${FOCUS}`,
    style: fieldStyle(invalid),
  } as const;

  return (
    <FieldFrame id={id} label={label} {...(hint === undefined ? {} : { hint })} {...(error === undefined ? {} : { error })}>
      {rows === undefined ? (
        /* `onInput`, la convention des champs texte du dépôt (voir `sheet.tsx`) : un `onChange` n'y est jamais rappelé sous happy-dom. */
        <input {...common} type="text" {...(inputMode === undefined ? {} : { inputMode })} onInput={(event) => onChange(event.currentTarget.value)} onChange={() => undefined} />
      ) : (
        <textarea {...common} rows={rows} onInput={(event) => onChange(event.currentTarget.value)} onChange={() => undefined} />
      )}
    </FieldFrame>
  );
}

export function SelectField({
  id,
  label,
  hint,
  error,
  value,
  options,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  readonly error?: string | null;
  readonly value: string;
  readonly options: readonly ChoiceOption[];
  readonly onChange: (value: string) => void;
}) {
  const invalid = error !== undefined && error !== null;
  return (
    <FieldFrame id={id} label={label} {...(hint === undefined ? {} : { hint })} {...(error === undefined ? {} : { error })}>
      <select
        id={id}
        value={value}
        aria-invalid={invalid}
        aria-describedby={describedBy(id, hint !== undefined, invalid)}
        onChange={(event) => onChange(event.target.value)}
        className={`w-full rounded-card px-3 text-body ${FOCUS}`}
        style={fieldStyle(invalid)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldFrame>
  );
}

/** Recherche sans accents ni casse : « senegal » trouve « Sénégal ». */
const fold = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();

/**
 * **LA SÉLECTION MULTIPLE NOMMÉE** — les choisis en puces retirables (chacune une
 * cible de 44 px, nommée « Retirer Espagnol »), un filtre, et la liste des
 * cases à cocher. Ce qui est coché est dit en MOTS (« Sélection : 2 ») dans une
 * région vivante : un lecteur d'écran apprend l'effet de chaque case.
 *
 * Aucune sélection signifie « tous » — c'est l'indice qui le dit, pas un état caché.
 */
export function ChoiceField({
  language,
  id,
  legend,
  hint,
  options,
  selected,
  onChange,
  anchor,
}: {
  readonly language: AdminLanguage;
  readonly id: string;
  readonly legend: string;
  readonly hint: string;
  readonly options: readonly ChoiceOption[];
  readonly selected: readonly string[];
  readonly onChange: (next: readonly string[]) => void;
  readonly anchor: string;
}) {
  const [filter, setFilter] = useState('');
  const labelOf = new Map(options.map((option) => [option.value, option.label]));
  const needle = fold(filter.trim());
  const shown = needle === '' ? options : options.filter((option) => fold(option.label).includes(needle));
  const toggle = (value: string) => onChange(selected.includes(value) ? selected.filter((entry) => entry !== value) : [...selected, value]);
  const nameOf = (value: string): string => labelOf.get(value) ?? value;

  return (
    <fieldset data-admin-choice={anchor} className="grid min-w-0 gap-2 rounded-card p-4" style={{ border: `1px solid ${EDGE}`, backgroundColor: SURFACE }}>
      <legend className="px-1 text-caption font-medium" style={{ color: INK2 }}>
        {legend}
      </legend>
      <p id={`${id}-hint`} className="text-caption" style={{ color: INK3 }}>
        {hint}
      </p>

      <p role="status" aria-live="polite" data-admin-choice-count className="text-caption font-medium tabular-nums" style={{ color: INK }}>
        {selected.length === 0
          ? translateAdmin(language, 'admin.broadcast.compose.choice.none')
          : translateAdmin(language, 'admin.broadcast.compose.choice.selected', { count: formatCount(selected.length, language) })}
      </p>

      {selected.length === 0 ? null : (
        <ul className="flex flex-wrap gap-2">
          {selected.map((value) => (
            <li key={value}>
              <button
                type="button"
                data-admin-choice-remove={value}
                aria-label={translateAdmin(language, 'admin.broadcast.compose.choice.remove', { name: nameOf(value) })}
                onClick={() => toggle(value)}
                className={`inline-flex items-center gap-2 rounded-chip px-3 text-caption font-medium ${FOCUS}`}
                style={{ minHeight: 44, border: `1px solid ${BRAND}`, color: BRAND, outlineColor: BRAND, backgroundColor: 'color-mix(in srgb, var(--color-ios-brand) 12%, transparent)' }}
              >
                {nameOf(value)}
                <AdminGlyph name="x" size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <label className="grid gap-1">
        <span className="text-caption" style={{ color: INK2 }}>
          {translateAdmin(language, 'admin.broadcast.compose.choice.filter')}
        </span>
        <input
          type="search"
          data-admin-choice-filter
          aria-describedby={`${id}-hint`}
          value={filter}
          onInput={(event) => setFilter(event.currentTarget.value)}
          onChange={() => undefined}
          /* Entrée dans le filtre n'envoie pas le formulaire : on cherche une langue, on n'enregistre pas le brouillon. */
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.preventDefault();
          }}
          className={`w-full rounded-chip px-4 text-body ${FOCUS}`}
          style={fieldStyle(false)}
        />
      </label>

      {shown.length === 0 ? (
        <p data-admin-choice-empty className="px-1 text-caption" style={{ color: INK2 }}>
          {translateAdmin(language, 'admin.broadcast.compose.choice.noMatch')}
        </p>
      ) : (
        <ul className="max-h-64 overflow-y-auto rounded-card" style={{ border: `1px solid ${EDGE}` }}>
          {shown.map((option) => {
            const checked = selected.includes(option.value);
            return (
              <li key={option.value}>
                <label className="flex cursor-pointer items-center gap-3 px-3 text-body" style={{ minHeight: 44, color: INK }}>
                  <input
                    type="checkbox"
                    data-admin-choice-option={option.value}
                    checked={checked}
                    onChange={() => toggle(option.value)}
                    className={`size-5 shrink-0 ${FOCUS}`}
                    style={{ accentColor: BRAND, outlineColor: BRAND }}
                  />
                  <span className="min-w-0 break-words">{option.label}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </fieldset>
  );
}
