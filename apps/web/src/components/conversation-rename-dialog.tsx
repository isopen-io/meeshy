import { useEffect, useId, useRef, useState } from 'react';

import { translate } from '@/lib/i18n-catalog';
import { rowMenuText } from '@/lib/i18n-row-menu-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { useBackDismiss } from '@/lib/view/use-back-dismiss';

/**
 * RENOMMER UNE CONVERSATION — POUR SOI (#10593). Le nom écrit ici est le
 * `customName` du lecteur (`PUT /user-preferences/conversations/:id`) : il
 * prime sur le titre servi dans SA liste et SON fil, et ne change rien chez
 * les autres membres. Le nom d'origine se lit en indice du champ ; un champ
 * vide le rend (`null`).
 *
 * Même modale que `ConfirmDialog` (`<dialog>` natif, `showModal`, Échap et le
 * retour matériel referment) — un champ et deux gestes, Annuler et Enregistrer.
 */
export const RENAME_MAX_LENGTH = 100;

export function ConversationRenameDialog({
  language,
  customName,
  originalName,
  onSave,
  onCancel,
}: {
  readonly language: InterfaceLanguage;
  readonly customName: string | undefined;
  readonly originalName: string;
  /** Le nom rogné, ou `null` pour rendre le nom d'origine. */
  readonly onSave: (name: string | null) => void;
  readonly onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const hintId = useId();
  const inputId = useId();
  const [draft, setDraft] = useState(customName ?? '');
  useBackDismiss(onCancel);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return undefined;
    if (!dialog.open && typeof dialog.showModal === 'function') dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  const trimmed = draft.trim();

  return (
    <dialog
      ref={ref}
      data-rename-dialog=""
      aria-labelledby={titleId}
      onClose={onCancel}
      className="m-auto w-[min(26rem,calc(100%-2rem))] rounded-card p-0 backdrop:bg-veil"
      style={{ backgroundColor: 'var(--color-ios-card)', color: 'var(--color-ios-ink)', border: 0 }}
    >
      <form
        className="grid gap-3 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(trimmed.length === 0 ? null : trimmed);
        }}
      >
        <h2 id={titleId} className="text-thread font-extrabold">
          {rowMenuText(language, 'rowMenu.rename.title')}
        </h2>
        <label htmlFor={inputId} className="text-caption font-semibold" style={{ color: 'var(--color-ios-ink-2)' }}>
          {rowMenuText(language, 'rowMenu.rename.label')}
        </label>
        <input
          id={inputId}
          type="text"
          value={draft}
          onInput={(event) => setDraft(event.currentTarget.value)}
          placeholder={originalName}
          maxLength={RENAME_MAX_LENGTH}
          enterKeyHint="done"
          aria-describedby={hintId}
          autoFocus
          className="min-h-11 w-full rounded-card px-3 text-input outline-none focus-visible:outline-2"
          style={{
            backgroundColor: 'var(--color-ios-surface)',
            color: 'var(--color-ios-ink)',
            border: '1px solid var(--color-edge)',
            outlineColor: 'var(--color-ios-brand)',
          }}
        />
        <p id={hintId} className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
          {rowMenuText(language, 'rowMenu.rename.hint')}
        </p>
        <div className="mt-2 flex flex-wrap gap-2.5">
          <button
            type="button"
            data-rename="cancel"
            onClick={onCancel}
            className="grid flex-auto place-items-center rounded-chip px-3 text-body font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              minHeight: 48,
              color: 'var(--color-ios-ink)',
              border: '1.5px solid color-mix(in srgb, var(--color-ios-ink-3) 45%, transparent)',
              outlineColor: 'var(--color-ios-brand)',
            }}
          >
            {translate(language, 'common.cancel')}
          </button>
          <button
            type="submit"
            data-rename="save"
            className="grid flex-auto place-items-center rounded-chip px-3 text-body font-bold text-ios-on-brand focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ minHeight: 48, backgroundColor: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}
          >
            {rowMenuText(language, 'rowMenu.rename.save')}
          </button>
        </div>
      </form>
    </dialog>
  );
}
