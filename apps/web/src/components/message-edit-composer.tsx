import { useEffect, useRef, useState, type ReactNode } from 'react';

import { translateMessagePieces } from '@/lib/i18n-message-pieces-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import type { MessageEditState } from '@/lib/view/use-message-edit';

import { Glyph } from './glyph';

/**
 * LE COMPOSEUR EN MODE ÉDITION (#10581) — miroir du bandeau d'édition d'iOS
 * (`ConversationView+ComposerBanners.swift`) : « Modification », l'extrait du
 * message, une croix qui annule, et le champ qui porte le texte à réécrire.
 *
 * LE BROUILLON EN COURS EST MIS DE CÔTÉ, PUIS RENDU : le composeur n'est pas
 * démonté, il est retiré de l'affichage (`display: none`) le temps de
 * l'édition. Son texte, ses pièces en attente, sa langue et sa citation
 * l'attendent tels quels — rien à sauver, donc rien à restaurer de travers.
 * Hors édition, l'enveloppe est transparente à la mise en page
 * (`display: contents`).
 *
 * Le champ d'édition ne porte que du TEXTE : ni pièce jointe, ni vocal, ni
 * protection — la route d'édition ne réécrit que `content`.
 *
 * Ses libellés viennent du catalogue du fil (`message.edit.*`) : le mode ne
 * s'arme que depuis le menu, qui ne l'offre qu'une fois ce catalogue chargé.
 */
export function MessageEditDock({ edit, children }: { readonly edit: MessageEditState; readonly children: ReactNode }) {
  const aside = useRef<HTMLDivElement>(null);
  const wasEditing = useRef(false);
  const isEditing = edit.editing !== null;

  /* LE FOCUS REVIENT AU COMPOSEUR quand le mode se referme : le champ
     d'édition qui le portait vient d'être démonté, et un focus tombé sur le
     document obligerait le clavier à retraverser tout le fil. */
  useEffect(() => {
    if (wasEditing.current && !isEditing) aside.current?.querySelector('textarea')?.focus();
    wasEditing.current = isEditing;
  }, [isEditing]);

  return (
    <>
      {edit.editing === null ? null : (
        <MessageEditComposer key={edit.editing.messageId} original={edit.editing.original} onCancel={edit.cancel} onSubmit={edit.submit} />
      )}
      <div ref={aside} data-composer-aside style={{ display: isEditing ? 'none' : 'contents' }}>
        {children}
      </div>
    </>
  );
}

const MAX_FIELD_HEIGHT = 5 * 22;

function MessageEditComposer({
  original,
  onCancel,
  onSubmit,
}: {
  readonly original: string;
  readonly onCancel: () => void;
  readonly onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState(original);
  const field = useRef<HTMLTextAreaElement>(null);
  const language = currentInterfaceLanguage();
  const trimmed = text.trim();
  const sendable = trimmed !== '' && trimmed !== original.trim();

  useEffect(() => {
    const el = field.current;
    if (el === null) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_FIELD_HEIGHT)}px`;
  }, []);

  return (
    <div data-composer-edit className="relative flex flex-col pb-safe">
      <div className="mx-3 mb-1 mt-2 flex items-center gap-2 rounded-quote px-2.5 py-2" style={{ backgroundColor: 'var(--color-ios-card)' }}>
        <span className="w-1 self-stretch rounded-full" style={{ backgroundColor: 'var(--accent)' }} aria-hidden />
        <span className="min-w-0 flex-1 truncate text-title">
          <span className="font-semibold" style={{ color: 'var(--accent)' }}>
            {translateMessagePieces(language, 'message.edit.banner')}{' '}
          </span>
          <span style={{ color: 'var(--color-ios-ink-2)' }}>{original}</span>
        </span>
        <button
          type="button"
          data-composer-edit-cancel
          onClick={onCancel}
          className="grid size-11 shrink-0 place-items-center"
          aria-label={translateMessagePieces(language, 'message.edit.cancel')}
        >
          <Glyph name="x" size={14} style={{ color: 'var(--color-ios-ink-2)' }} />
        </button>
      </div>
      <div className="flex items-end gap-3 px-3 py-2.5">
        <div
          className="flex min-w-0 flex-1 items-end"
          style={{
            minHeight: 44,
            borderRadius: 22,
            backgroundColor: 'color-mix(in srgb, var(--accent) 6%, transparent)',
            border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)',
          }}
        >
          <textarea
            ref={field}
            data-composer-edit-field
            rows={1}
            enterKeyHint="send"
            value={text}
            onInput={(e) => {
              const el = e.currentTarget;
              setText(el.value);
              el.style.height = 'auto';
              el.style.height = `${Math.min(el.scrollHeight, MAX_FIELD_HEIGHT)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                onCancel();
                return;
              }
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                onSubmit(text);
              }
            }}
            aria-label={translateMessagePieces(language, 'message.edit.field')}
            className="min-w-0 flex-1 resize-none bg-transparent py-3 text-input leading-[22px] outline-none"
            style={{ paddingInline: 16 }}
          />
        </div>
        <div className="flex shrink-0 items-end justify-end" style={{ width: 44, height: 44 }}>
          {sendable ? (
            <button
              type="button"
              data-composer-edit-submit
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => onSubmit(text)}
              className="grid size-11 place-items-center rounded-chip"
              style={{ background: 'linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 65%, white))' }}
              aria-label={translateMessagePieces(language, 'message.edit.submit')}
            >
              <Glyph name="check" size={20} className="text-white" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
