import { flag, languageName } from '@/lib/languages';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import type { Attachment } from '@/lib/api/types';
import type { TranslationChoice } from '@/lib/view/message-actions';

import { hasServerMessageId } from '@/lib/view/message-receipts';

import { MessageReceiptsSheet } from './message-receipts-sheet';
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
 *
 * « INFOS DU MESSAGE » (#7226, W7) — la section nominative
 * (Reçu/Vu/Pas encore) et par pièce jointe (ouvertures, téléchargements,
 * progression) se monte à la SUITE, sous la MÊME garde que la ligne
 * « Envoyé » juste au-dessus : `delivery !== null` EST « ce message est le
 * mien », déjà posé par l'appelant (`isMineOf`, `thread.tsx`). Un message
 * REÇU n'a pas d'accusé nominatif à lire sur lui-même — la feuille ne fait
 * aucune requête pour lui, exactement comme `STATUS_LABEL` ne peint rien.
 * SECONDE moitié de la garde, `hasServerMessageId` : un message encore
 * OPTIMISTE porte son `clientMessageId` (`cid_…`) et n'existe pas côté
 * serveur — `delivery` vaut pourtant « envoyé » pour lui (`deliveryOf` lit
 * `deliveredCount: 0` ainsi). iOS pose exactement cette garde avant
 * `loadReadStatus()` (`MessageViewsDetailView.swift:943`).
 *
 * SES TITRES VIENNENT DU CATALOGUE (#7555). `locale` (une prop) FORMATE la
 * date — c'est la locale de l'utilisateur, celle d'`Intl` ; la langue
 * d'INTERFACE, elle, se lit sur le document comme partout ailleurs. Les deux
 * ne se confondent pas : un lecteur peut lire l'application en anglais et
 * vouloir ses dates au format de son pays.
 *
 * CE QUI RESTE FRANÇAIS ICI n'appartient pas à cette feuille : le bouton de
 * fermeture vient de `Sheet` (`aria-label="Fermer"`, en dur, partagé par
 * TOUTES les feuilles) — #7566 porte cet inventaire.
 */
export function MessageDetailSheet({
  choices,
  reactions,
  sentAt,
  delivery,
  locale,
  conversationId,
  messageId,
  attachments,
  onPickLanguage,
  onClose,
}: {
  readonly choices: readonly TranslationChoice[];
  readonly reactions: readonly (readonly [string, number])[];
  readonly sentAt: Date;
  /** `null` sur un message reçu (aucun accusé à peindre, `Check` fait pareil). */
  readonly delivery: Delivery | null;
  readonly locale: string;
  readonly conversationId: string;
  readonly messageId: string;
  readonly attachments: readonly Attachment[];
  readonly onPickLanguage: (code: string) => void;
  readonly onClose: () => void;
}) {
  const fullDate = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'short' }).format(sentAt);
  const language = currentInterfaceLanguage();

  return (
    <Sheet title={translate(language, 'message.detail.title')} onClose={onClose}>
      {choices.length > 0 ? (
        <>
          <li className="px-4 pt-3 pb-1 text-mini font-semibold uppercase" style={{ color: 'var(--color-ios-ink-3)' }}>
            {translate(language, 'message.detail.languages')}
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
                  {choice.isOriginal
                    ? translate(language, 'message.detail.language.original', { language: languageName(choice.code) })
                    : languageName(choice.code)}
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
            {translate(language, 'message.detail.reactions')}
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
        {translate(language, 'message.detail.sent')}
      </li>
      <li className="flex items-center gap-2.5 px-4 pb-3 text-body" style={{ minHeight: 44, color: 'var(--color-ios-ink)' }}>
        <span>{fullDate}</span>
        {delivery !== null ? <span style={{ color: 'var(--color-ios-ink-2)' }}> · {STATUS_LABEL[delivery]}</span> : null}
      </li>

      {delivery !== null && hasServerMessageId(messageId) ? (
        <MessageReceiptsSheet conversationId={conversationId} messageId={messageId} attachments={attachments} />
      ) : null}
    </Sheet>
  );
}
