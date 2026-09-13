import { flag, languageName } from '@/lib/languages';
import type { TranslationChoice } from '@/lib/view/message-actions';

import { STATUS_LABEL } from './message-blocks';
import type { Delivery } from '@/lib/view/message';
import { Sheet } from './sheet';

/**
 * « PLUS… » — LA FEUILLE « DÉTAILS DU MESSAGE » (#5814, § 1.3 tableau,
 * question 4 tranchée) : SEULES les entrées qui ont un EFFET aujourd'hui
 * (loi 4) — Langues (même liste que Traduire), Réactions (comptes), Envoyé
 * (date complète cadrée par la langue du lecteur, accusé). Les entrées à
 * transport (Répondre/Transférer/Épingler/Supprimer/Signaler…) n'ont aucun
 * port web ce lot — issue compagnon (D-29).
 */
export function MessageDetailSheet({
  choices,
  reactions,
  sentAt,
  delivery,
  locale,
  onPickLanguage,
  onClose,
}: {
  readonly choices: readonly TranslationChoice[];
  readonly reactions: readonly (readonly [string, number])[];
  readonly sentAt: Date;
  /** `null` sur un message reçu (aucun accusé à peindre, `Check` fait pareil). */
  readonly delivery: Delivery | null;
  readonly locale: string;
  readonly onPickLanguage: (code: string) => void;
  readonly onClose: () => void;
}) {
  const fullDate = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'short' }).format(sentAt);

  return (
    <Sheet title="Détails du message" onClose={onClose}>
      {choices.length > 0 ? (
        <>
          <li className="px-4 pt-3 pb-1 text-mini font-semibold uppercase" style={{ color: 'var(--color-ios-ink-3)' }}>
            Langues
          </li>
          {choices.map((choice) => (
            <li key={choice.code}>
              <button
                type="button"
                onClick={() => onPickLanguage(choice.code)}
                className="flex w-full items-center gap-2.5 px-4 text-left text-body"
                style={{ minHeight: 44, color: 'var(--color-ios-ink)' }}
              >
                <span aria-hidden>{flag(choice.code)}</span>
                <span className="flex-1">
                  {languageName(choice.code)}
                  {choice.isOriginal ? ' (original)' : ''}
                </span>
                {choice.isServed ? <span aria-hidden>✓</span> : null}
              </button>
            </li>
          ))}
        </>
      ) : null}

      {reactions.length > 0 ? (
        <>
          <li className="px-4 pt-3 pb-1 text-mini font-semibold uppercase" style={{ color: 'var(--color-ios-ink-3)' }}>
            Réactions
          </li>
          {reactions.map(([emoji, count]) => (
            <li key={emoji} className="flex items-center gap-2.5 px-4 text-body" style={{ minHeight: 44, color: 'var(--color-ios-ink)' }}>
              <span aria-hidden>{emoji}</span>
              <span>{count}</span>
            </li>
          ))}
        </>
      ) : null}

      <li className="px-4 pt-3 pb-1 text-mini font-semibold uppercase" style={{ color: 'var(--color-ios-ink-3)' }}>
        Envoyé
      </li>
      <li className="flex items-center gap-2.5 px-4 pb-3 text-body" style={{ minHeight: 44, color: 'var(--color-ios-ink)' }}>
        <span>{fullDate}</span>
        {delivery !== null ? <span style={{ color: 'var(--color-ios-ink-2)' }}> · {STATUS_LABEL[delivery]}</span> : null}
      </li>
    </Sheet>
  );
}
