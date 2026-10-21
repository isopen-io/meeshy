import { useEffect, useRef, useState } from 'react';

import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';

import { AdminGlyph } from './admin-glyph';
import { AdminFormError, type AdminData, type AdminSelectOption } from './form';
import { BRAND, EDGE, INK, INK2, INK3 } from './tone';

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2';

export type AdminInlineStatus =
  | { readonly phase: 'idle' }
  | { readonly phase: 'saving' }
  | { readonly phase: 'saved'; readonly message?: string }
  | { readonly phase: 'error'; readonly message: string };

/**
 * **UNE INFORMATION QUI S'ÉDITE LÀ OÙ ELLE S'AFFICHE** (demande porteur 2026-10-13, #10562) —
 * « par un clic / une touche la zone devient éditable, et à la perte du focus on valide ».
 *
 * - Au REPOS : le libellé et la valeur, dans un bouton de 44 px nommé « Modifier <libellé> :
 *   <valeur> » (une valeur vide se dit « Non renseigné », jamais un trou). Un clic, Entrée ou
 *   Espace ouvre le champ, déjà rempli et focalisé.
 * - En ÉDITION : Entrée ou la perte du focus VALIDENT, Échap ANNULE (et ne ferme pas la
 *   modale qui porterait le champ). La valeur part NETTOYÉE, une seule fois, et seulement si
 *   elle a changé : une écriture pour rien demanderait une permission pour rien.
 * - Une LISTE valide dès le choix : il n'y a rien à « finir de taper ».
 *
 * Le champ ne sait rien de l'écriture : `onCommit` reçoit la valeur, l'hôte écrit (de façon
 * optimiste) et rend `status` — en cours (la zone le dit et ne se rouvre pas), refusé (une
 * alerte sous la zone). Sans droit d'écrire, `readOnly` rend la valeur sans bouton.
 */
export function AdminInlineField({
  id,
  language,
  label,
  value,
  display,
  kind = 'text',
  type = 'text',
  options = [],
  placeholder,
  status = { phase: 'idle' },
  readOnly = false,
  hint,
  onCommit,
  data,
}: {
  readonly id: string;
  readonly language: AdminLanguage;
  readonly label: string;
  /** La valeur SERVIE, celle que le champ édite. */
  readonly value: string;
  /** Ce qui se lit au repos quand la valeur brute ne suffit pas (« 12 mars 1990 · 36 ans »). */
  readonly display?: string;
  readonly kind?: 'text' | 'date' | 'select';
  readonly type?: 'text' | 'email' | 'tel';
  readonly options?: readonly AdminSelectOption[];
  readonly placeholder?: string;
  readonly status?: AdminInlineStatus;
  readonly readOnly?: boolean;
  /** Une précision sous la valeur (« 3 tentatives échouées »). */
  readonly hint?: string;
  readonly onCommit: (next: string) => void;
  readonly data?: AdminData;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const settled = useRef(true);
  const refocus = useRef(false);
  const field = useRef<HTMLInputElement & HTMLSelectElement>(null);
  const viewButton = useRef<HTMLButtonElement>(null);
  const saving = status.phase === 'saving';

  useEffect(() => {
    if (editing) {
      field.current?.focus();
      return;
    }
    if (refocus.current) {
      refocus.current = false;
      viewButton.current?.focus();
    }
  }, [editing]);

  const open = () => {
    if (saving || readOnly) return;
    settled.current = false;
    setDraft(value);
    setEditing(true);
  };

  /** `null` annule. Un seul aboutissement par ouverture : Entrée puis la perte du focus ne valident pas deux fois. */
  const finish = (next: string | null, viaKeyboard: boolean) => {
    if (settled.current) return;
    settled.current = true;
    refocus.current = viaKeyboard;
    setEditing(false);
    if (next === null) return;
    const cleaned = next.trim();
    if (cleaned !== value) onCommit(cleaned);
  };

  const shown =
    display ?? (kind === 'select' ? (options.find((option) => option.value === value)?.label ?? value) : value);
  const empty = shown.trim() === '';
  const fieldId = `admin-inline-${id}`;

  const body = (
    <>
      <span className="block text-caption font-medium" style={{ color: INK3 }}>
        {label}
      </span>
      <span className="block break-words text-body font-semibold" style={{ color: empty ? INK3 : INK }}>
        {empty ? translateAdmin(language, 'admin.kit.inline.empty') : shown}
      </span>
      {hint === undefined ? null : (
        <span className="block text-caption" style={{ color: INK2 }}>
          {hint}
        </span>
      )}
    </>
  );

  return (
    <div {...data} data-admin-inline={id} data-admin-inline-phase={status.phase} className="grid min-w-0 gap-1">
      {readOnly ? (
        <div className="grid gap-0.5 px-3 py-2">{body}</div>
      ) : editing ? (
        <div className="grid gap-1 px-1">
          <label htmlFor={fieldId} className="px-2 text-caption font-medium" style={{ color: BRAND }}>
            {label}
          </label>
          {kind === 'select' ? (
            <select
              id={fieldId}
              ref={field}
              data-admin-inline-input={id}
              value={draft}
              onChange={(event) => {
                setDraft(event.currentTarget.value);
                finish(event.currentTarget.value, true);
              }}
              onBlur={() => finish(null, false)}
              onKeyDown={(event) => {
                if (event.key !== 'Escape') return;
                event.preventDefault();
                event.stopPropagation();
                finish(null, true);
              }}
              className="w-full rounded-card px-3 text-body"
              style={{ minHeight: 44, border: `2px solid ${BRAND}`, backgroundColor: 'var(--color-ios-card)', color: INK }}
            >
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={fieldId}
              ref={field}
              data-admin-inline-input={id}
              type={kind === 'date' ? 'date' : type}
              value={draft}
              {...(placeholder === undefined ? {} : { placeholder })}
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
              aria-describedby={`${fieldId}-hint`}
              onInput={(event) => setDraft(event.currentTarget.value)}
              onChange={() => undefined}
              onBlur={(event) => finish(event.currentTarget.value, false)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  finish(event.currentTarget.value, true);
                  return;
                }
                if (event.key !== 'Escape') return;
                event.preventDefault();
                event.stopPropagation();
                finish(null, true);
              }}
              className="w-full rounded-card px-3 text-body outline-none"
              style={{ minHeight: 44, border: `2px solid ${BRAND}`, backgroundColor: 'var(--color-ios-card)', color: INK }}
            />
          )}
          <span id={`${fieldId}-hint`} className="px-2 text-caption" style={{ color: INK2 }}>
            {translateAdmin(language, 'admin.kit.inline.keys')}
          </span>
        </div>
      ) : (
        <button
          type="button"
          ref={viewButton}
          data-admin-inline-view={id}
          disabled={saving}
          aria-busy={saving}
          aria-label={translateAdmin(language, 'admin.kit.inline.edit', {
            label,
            value: empty ? translateAdmin(language, 'admin.kit.inline.empty') : shown,
          })}
          onClick={open}
          className={`group flex w-full items-center gap-3 rounded-card px-3 py-2 text-start transition-colors hover:bg-[color-mix(in_srgb,var(--color-ios-brand)_6%,transparent)] disabled:cursor-progress ${FOCUS}`}
          style={{ minHeight: 44, border: `1px solid ${EDGE}`, outlineColor: BRAND }}
        >
          <span className="grid min-w-0 flex-1 gap-0.5">{body}</span>
          <span aria-hidden="true" className="shrink-0" style={{ color: saving ? INK3 : BRAND }}>
            {saving ? (
              <span className="text-caption">{translateAdmin(language, 'admin.kit.inline.saving')}</span>
            ) : (
              <AdminGlyph name="pencilSimple" size={16} />
            )}
          </span>
        </button>
      )}
      {status.phase === 'error' ? <AdminFormError text={status.message} data={{ 'data-admin-inline-error': id }} /> : null}
    </div>
  );
}
