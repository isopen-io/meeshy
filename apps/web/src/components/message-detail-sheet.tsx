import { flag, languageName } from '@/lib/languages';
import { translate } from '@/lib/i18n-catalog';
import { translateMessagePieces } from '@/lib/i18n-message-pieces-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import type { Attachment } from '@/lib/api/types';
import type { TranslationChoice } from '@/lib/view/message-actions';
import type { MessagePinEntry } from '@/lib/view/use-message-pin';
import type { MessageStarEntry } from '@/lib/view/use-message-star';

import { useSpeaksAsGuest } from '@/lib/view/guest-focus';
import { hasServerMessageId } from '@/lib/view/message-receipts';

import { Glyph, GlyphSvg } from './glyph';
import { THREAD_MENU_GLYPHS } from './glyphs-thread-menu';
import { MessageReactors } from './message-reactors';
import { MessageReceiptsSheet } from './message-receipts-sheet';
import { statusLabel } from './message-blocks';
import type { Delivery } from '@/lib/view/message';
import { Sheet } from './sheet';

/**
 * « PLUS… » — LA FEUILLE « DÉTAILS DU MESSAGE » (#5814, § 1.3 tableau,
 * question 4 tranchée) : SEULES les entrées qui ont un EFFET aujourd'hui
 * (loi 4) — Langues (même liste que Traduire), Réactions (les comptes tout de
 * suite, puis qui a réagi — `MessageReactors`, #10583), Envoyé (date complète
 * cadrée par la langue du lecteur, accusé). Modifier, Épingler, Supprimer
 * et Signaler ont leur port (#10581, #7558, #10582, plus bas).
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
 * « FAIRE » — LE FAVORI (#7378) : iOS ouvre sa feuille « Plus… » par les
 * actions, et y range l'étoile juste après l'épingle
 * (`MessageActionResolver.moreSections`). Elle AGIT puis REFERME, comme une action iOS de
 * cette section. `star` nul — état inconnu, lecteur sans compte, message
 * non favorisable — n'offre rien (`messageStarAction`).
 *
 * SES TITRES VIENNENT DU CATALOGUE (#7555). `locale` (une prop) FORMATE la
 * date — c'est la locale de l'utilisateur, celle d'`Intl` ; la langue
 * d'INTERFACE, elle, se lit sur le document comme partout ailleurs. Les deux
 * ne se confondent pas : un lecteur peut lire l'application en anglais et
 * vouloir ses dates au format de son pays.
 *
 * « MODIFIER » (#10581) ouvre la section, à la place qu'iOS lui donne
 * (`moreSections`, avant copier, imager et l'étoile) : `act.onEdit` nul ou
 * absent, l'entrée n'existe pas. Son libellé vit dans le catalogue du fil
 * (`message.edit.*`), que l'hôte sait chargé quand il remet le geste
 * (`useMessageMenu.editOf`).
 *
 * « SUPPRIMER » (#10582) FERME la section, comme sur iOS (`moreSections`,
 * dernière action). Elle REFERME la feuille puis ouvre le dialogue de
 * suppression — jamais deux modales l'une sur l'autre.
 *
 * « ÉPINGLER » / « DÉSÉPINGLER » (#7558) se range juste avant l'étoile, comme
 * sur iOS (`moreSections` : imager, épingle, favori) ; `act.pin` nul, rien ne
 * s'offre (`messagePinAction`). « SIGNALER » est seul dans sa section de
 * MODÉRATION, à la fin de la feuille comme sur iOS (`.moderation([.report])`),
 * jamais sur son propre message (`reportOffered`) : il referme la feuille puis
 * ouvre la feuille des motifs.
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
  star,
  create = { onCompose: null, onImage: null },
  act = {},
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
  /** Le favori du message, CONNU — `null` quand rien ne peut être offert sans mentir. */
  readonly star: MessageStarEntry | null;
  /**
   * « CRÉER » (#8693) — le (>) de « Plus… » déplie « Composer » ET « Imager ».
   * `null` : l'entrée n'a pas d'effet sur CE message (pas de photo ni de vidéo
   * à composer ; rien à imager, ou message protégé) et ne s'offre pas.
   */
  readonly create?: { readonly onCompose: (() => void) | null; readonly onImage: (() => void) | null };
  /** CE QUE LE LECTEUR PEUT FAIRE DU MESSAGE (#10581) — `null` ou absent : le geste ne s'offre pas. */
  readonly act?: {
    readonly onEdit?: (() => void) | null;
    readonly onDelete?: (() => void) | null;
    readonly pin?: MessagePinEntry | null;
    readonly onReport?: (() => void) | null;
  };
  readonly onPickLanguage: (code: string) => void;
  readonly onClose: () => void;
}) {
  const speaksAsGuest = useSpeaksAsGuest();
  const fullDate = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'short' }).format(sentAt);
  const language = currentInterfaceLanguage();

  const creations = [
    { id: 'compose', run: create.onCompose, labelKey: 'message.menu.compose', glyph: THREAD_MENU_GLYPHS.magicWand },
    { id: 'image', run: create.onImage, labelKey: 'message.menu.export', glyph: THREAD_MENU_GLYPHS.imageSquare },
  ] as const;

  return (
    <Sheet title={translate(language, 'message.detail.title')} onClose={onClose}>
      {act.onEdit == null ? null : (
        <li>
          <button
            type="button"
            data-message-act="edit"
            onClick={() => {
              act.onEdit?.();
              onClose();
            }}
            className="flex w-full items-center gap-2.5 px-4 text-start text-body"
            style={{ minHeight: 44, color: 'var(--color-ios-ink)' }}
          >
            <GlyphSvg glyph={THREAD_MENU_GLYPHS.pencilSimple} size={18} style={{ color: 'var(--accent)' }} />
            <span className="flex-1">{translateMessagePieces(language, 'message.edit.action')}</span>
          </button>
        </li>
      )}
      {creations.map((entry) =>
        entry.run === null ? null : (
          <li key={entry.id}>
            <button
              type="button"
              data-message-create={entry.id}
              onClick={() => {
                entry.run?.();
                onClose();
              }}
              className="flex w-full items-center gap-2.5 px-4 text-start text-body"
              style={{ minHeight: 44, color: 'var(--color-ios-ink)' }}
            >
              <GlyphSvg glyph={entry.glyph} size={18} style={{ color: 'var(--accent)' }} />
              <span className="flex-1">{translate(language, entry.labelKey)}</span>
            </button>
          </li>
        ),
      )}
      {act.pin == null ? null : (
        <li>
          <button
            type="button"
            data-message-act={act.pin.action}
            onClick={() => {
              act.pin?.onToggle();
              onClose();
            }}
            className="flex w-full items-center gap-2.5 px-4 text-start text-body"
            style={{ minHeight: 44, color: 'var(--color-ios-ink)' }}
          >
            <Glyph name="pushPin" size={18} style={{ color: 'var(--accent)' }} />
            <span className="flex-1">{translateMessagePieces(language, act.pin.action === 'pin' ? 'message.pin.action' : 'message.unpin.action')}</span>
          </button>
        </li>
      )}
      {star === null ? null : (
        <li>
          <button
            type="button"
            data-message-star={star.action}
            onClick={() => {
              star.onToggle();
              onClose();
            }}
            className="flex w-full items-center gap-2.5 px-4 text-start text-body"
            style={{ minHeight: 44, color: 'var(--color-ios-ink)' }}
          >
            <GlyphSvg
              glyph={star.action === 'star' ? THREAD_MENU_GLYPHS.star : THREAD_MENU_GLYPHS.starFill}
              size={18}
              style={{ color: 'var(--accent)' }}
            />
            <span className="flex-1">{translate(language, star.action === 'star' ? 'action.star' : 'action.unstar')}</span>
          </button>
        </li>
      )}
      {act.onDelete == null ? null : (
        <li>
          <button
            type="button"
            data-message-act="delete"
            onClick={() => {
              onClose();
              act.onDelete?.();
            }}
            className="flex w-full items-center gap-2.5 px-4 text-start text-body"
            style={{ minHeight: 44, color: 'var(--color-error)' }}
          >
            <GlyphSvg glyph={THREAD_MENU_GLYPHS.trash} size={18} />
            <span className="flex-1">{translateMessagePieces(language, 'message.delete.action')}</span>
          </button>
        </li>
      )}
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
                className="flex w-full items-center gap-2.5 px-4 text-start text-body"
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
          <MessageReactors messageId={messageId} reactions={reactions} />
        </>
      ) : null}

      <li className="px-4 pt-3 pb-1 text-mini font-semibold uppercase" style={{ color: 'var(--color-ios-ink-3)' }}>
        {translate(language, 'message.detail.sent')}
      </li>
      <li className="flex items-center gap-2.5 px-4 pb-3 text-body" style={{ minHeight: 44, color: 'var(--color-ios-ink)' }}>
        <span>{fullDate}</span>
        {delivery !== null ? <span style={{ color: 'var(--color-ios-ink-2)' }}> · {statusLabel(delivery, language)}</span> : null}
      </li>

      {/* Les accusés PAR PERSONNE sont refusés à un invité (#10205, 403
          ACCOUNT_REQUIRED) : la feuille ne les demande pas. */}
      {delivery !== null && hasServerMessageId(messageId) && !speaksAsGuest ? (
        <MessageReceiptsSheet conversationId={conversationId} messageId={messageId} attachments={attachments} />
      ) : null}

      {act.onReport == null ? null : (
        <li style={{ borderTop: '0.5px solid var(--color-edge)' }}>
          <button
            type="button"
            data-message-act="report"
            onClick={() => {
              onClose();
              act.onReport?.();
            }}
            className="flex w-full items-center gap-2.5 px-4 text-start text-body"
            style={{ minHeight: 44, color: 'var(--color-error)' }}
          >
            <Glyph name="warningCircle" size={18} />
            <span className="flex-1">{translate(language, 'report.action')}</span>
          </button>
        </li>
      )}
    </Sheet>
  );
}
