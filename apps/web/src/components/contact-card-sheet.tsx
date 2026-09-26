import { useCallback, useEffect, useId, useRef } from 'react';

import type { ParsedVCard, PublicContactAccount } from '@meeshy/shared/types/contact-card';

import { contactInitials, vcardFieldRows, type ContactAction, type VCardFieldRow } from '@/lib/contact-card/view';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { useBackDismiss } from '@/lib/view/use-back-dismiss';
import { useLiveAnnouncer } from '@/lib/view/use-live-announcer';

import { ContactAccountRow } from './contact-card-account';
import { Glyph, GlyphSvg } from './glyph';
import { THREAD_MENU_GLYPHS } from './glyphs-thread-menu';

/** Durée d'un appui long — celle du menu du message (`use-long-press`). */
const LONG_PRESS_MS = 500;

export type ClipboardWriter = (text: string) => Promise<void>;

const systemClipboard: ClipboardWriter = (text) =>
  typeof navigator === 'object' && navigator.clipboard
    ? navigator.clipboard.writeText(text)
    : Promise.reject(new Error('presse-papiers indisponible'));

/**
 * **LA FICHE « VERRE » D'UNE CARTE DE VISITE** (#8101) — toucher le nom dans
 * la bulle floute la conversation (`.message-menu-backdrop`, le voile du menu
 * du message, `thread-menu.css`) et pose par-dessus une fiche de verre
 * (`glass-prominent`, `glass.css` : la matière UNIQUE) qui liste TOUS les
 * champs de la vCard.
 *
 * COPIER, TROIS CHEMINS POUR UN GESTE : l'appui long (tactile), le menu
 * contextuel / clic droit (souris), et un bouton « Copier » par champ,
 * atteignable au clavier et nommé pour le lecteur d'écran. Chacun confirme
 * par une annonce visible ET vocale (`role="status"`).
 *
 * `<dialog>` + `showModal()` : piège de focus, Échap et inertie de l'arrière
 * sans une ligne de gestion de touches ; le retour matériel Android ferme la
 * fiche, pas l'écran (`useBackDismiss`).
 */
export function ContactCardSheet({
  card,
  accounts,
  language,
  busy,
  onAction,
  onClose,
  clipboard = systemClipboard,
}: {
  readonly card: ParsedVCard;
  readonly accounts: readonly PublicContactAccount[];
  readonly language: InterfaceLanguage;
  readonly busy: string | null;
  readonly onAction: (action: ContactAction, account: PublicContactAccount) => void;
  readonly onClose: () => void;
  readonly clipboard?: ClipboardWriter;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const { text: announcement, tone, announce } = useLiveAnnouncer();
  useBackDismiss(onClose);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (!dialog.open && typeof dialog.showModal === 'function') dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  const copy = useCallback(
    (row: VCardFieldRow) => {
      clipboard(row.value).then(
        () => announce(translate(language, 'contactCard.copied')),
        () => announce(translate(language, 'contactCard.copyFailed'), 'error'),
      );
    },
    [announce, clipboard, language],
  );

  const rows = vcardFieldRows(card, language);
  const subtitle = [card.title, card.organization].filter(Boolean).join(' · ');
  const close = () => (ref.current?.open ? ref.current.close() : onClose());

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby={titleId}
      data-contact-sheet=""
      style={{
        margin: 0,
        padding: 0,
        border: 0,
        width: '100%',
        maxWidth: '100%',
        height: '100%',
        maxHeight: '100%',
        backgroundColor: 'transparent',
        color: 'var(--color-ios-ink)',
      }}
    >
      <div className="message-menu-backdrop" aria-hidden="true" onClick={close} data-contact-backdrop="" />
      <div
        className="flex h-full items-end justify-center p-4"
        style={{ position: 'relative', zIndex: 41, pointerEvents: 'none' }}
      >
        <section
          className="glass-prominent flex w-full flex-col gap-4 rounded-card p-4"
          style={{
            maxWidth: 440,
            maxHeight: '85vh',
            overflowY: 'auto',
            pointerEvents: 'auto',
            border: '1px solid color-mix(in srgb, var(--color-ios-ink) 10%, transparent)',
            boxShadow: '0 12px 40px color-mix(in srgb, var(--color-ios-ink) 18%, transparent)',
          }}
        >
          <header className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="grid shrink-0 place-items-center rounded-full text-body font-semibold"
              style={{ width: 48, height: 48, backgroundColor: 'var(--color-ios-card)', color: 'var(--color-ios-ink)' }}
            >
              {contactInitials(card.formattedName)}
            </span>
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="text-title font-bold" style={{ overflowWrap: 'anywhere' }}>
                {card.formattedName}
              </h2>
              {subtitle !== '' ? (
                <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
                  {subtitle}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={close}
              className="grid shrink-0 place-items-center rounded-chip"
              style={{ minHeight: 44, minWidth: 44, color: 'var(--color-ios-ink-2)' }}
              aria-label={translate(language, 'contactCard.close')}
            >
              <Glyph name="x" size={20} />
            </button>
          </header>

          <ul className="flex flex-col" aria-label={translate(language, 'contactCard.sheet.title')}>
            {rows.map((row) => (
              <FieldRow key={row.key} row={row} language={language} onCopy={copy} />
            ))}
          </ul>
          <p className="text-caption" style={{ color: 'var(--color-ios-ink-3)' }}>
            {translate(language, 'contactCard.copyHint')}
          </p>

          {/* « Sur Meeshy » APRÈS les champs (#8101) — l'ordre d'iOS
              (`ContactCardDetailSheet.swift` : champs, puis `meeshySection`),
              la référence de disposition : on lit d'abord la carte telle que
              l'auteur l'a partagée, puis ce que Meeshy en sait. */}
          {accounts.length > 0 ? (
            <section data-contact-on-meeshy="" aria-label={translate(language, 'contactCard.onMeeshy')} className="flex flex-col gap-3">
              <h3 className="text-caption font-semibold uppercase" style={{ color: 'var(--color-ios-ink-2)' }}>
                {translate(language, 'contactCard.onMeeshy')}
              </h3>
              {/* Un fond OPAQUE sous les gestes : l'encre de marque des boutons ne
                  tient pas le contraste sur le verre seul (`glass-contrast.mjs`,
                  MinimalHeader : 2,78:1 au pire cas). */}
              {accounts.map((account) => (
                <div key={account.userId} className="rounded-card p-3" style={{ backgroundColor: 'var(--color-ios-card)' }}>
                  <ContactAccountRow account={account} language={language} variant="full" busy={busy} onAction={onAction} />
                </div>
              ))}
            </section>
          ) : null}
        </section>
      </div>
      <p
        role="status"
        aria-live="polite"
        data-contact-toast=""
        className="rounded-chip px-4 py-2 text-caption"
        style={{
          position: 'fixed',
          left: '50%',
          bottom: 24,
          transform: 'translateX(-50%)',
          zIndex: 42,
          visibility: announcement === '' ? 'hidden' : 'visible',
          backgroundColor: 'var(--color-ios-ink)',
          color: tone === 'error' ? 'var(--color-error)' : 'var(--color-ios-surface)',
        }}
      >
        {announcement}
      </p>
    </dialog>
  );
}

function FieldRow({
  row,
  language,
  onCopy,
}: {
  readonly row: VCardFieldRow;
  readonly language: InterfaceLanguage;
  readonly onCopy: (row: VCardFieldRow) => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => cancel, []);

  return (
    <li
      className="flex items-center gap-3 py-2"
      data-contact-field={row.kind}
      style={{ borderBottom: '1px solid color-mix(in srgb, var(--color-ios-ink) 8%, transparent)', userSelect: 'text' }}
      onPointerDown={() => {
        cancel();
        timer.current = setTimeout(() => {
          timer.current = null;
          onCopy(row);
        }, LONG_PRESS_MS);
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(event) => {
        event.preventDefault();
        cancel();
        onCopy(row);
      }}
    >
      <div className="min-w-0 flex-1">
        <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
          {row.label}
        </p>
        <p className="text-body" style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-line' }} dir="auto">
          {row.value}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onCopy(row)}
        className="grid shrink-0 place-items-center rounded-chip"
        style={{ minHeight: 44, minWidth: 44, color: 'var(--color-ios-ink)' }}
        aria-label={translate(language, 'contactCard.copy', { field: `${row.label} ${row.value}` })}
        data-contact-copy=""
      >
        <GlyphSvg glyph={THREAD_MENU_GLYPHS.copy} size={20} />
      </button>
    </li>
  );
}
