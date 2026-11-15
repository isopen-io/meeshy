import { useState } from 'react';

import { translate } from '@/lib/i18n-catalog';
import { translateMessagePieces } from '@/lib/i18n-message-pieces-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import type { DeleteOffer } from '@/lib/view/message-deletion';
import type { MessageDeleteMode } from '@/lib/view/use-message-delete';

import { ContentRemovalSheet } from './content-removal-sheet';
import { Sheet } from './sheet';

/**
 * LE DIALOGUE DE SUPPRESSION (#10582) — miroir du `confirmationDialog` d'iOS
 * (`ConversationView.swift`, un message ou la sélection entière) : « Supprimer
 * pour tout le monde », « Supprimer pour moi », « Annuler », dans cet ordre.
 *
 * UN CHOIX INTERDIT N'EXISTE PAS : « pour tout le monde » n'est rendu que si
 * la règle le permet pour TOUS les messages visés (`deleteOfferOf`), et son
 * explication avec lui — sans ce choix, il n'y a rien à distinguer.
 *
 * La feuille basse (`Sheet`, `<dialog>` modal) porte le piège de focus, Échap
 * et le toucher sur le voile : les trois referment sans rien supprimer.
 *
 * « RETIRER » (#11150) — le message d'un autre, pour qui modère la
 * conversation : le choix ouvre la feuille du MOTIF (`ContentRemovalSheet`),
 * et c'est elle qui confirme, motif nettoyé en main. Une offre qui ne porte
 * QUE le retrait (le geste « Retirer » du menu rapide, #11210) s'ouvre
 * directement sur le motif : il n'y a rien d'autre à choisir.
 */
export function MessageDeleteDialog({
  count,
  offer,
  onConfirm,
  onDismiss,
}: {
  readonly count: number;
  readonly offer: DeleteOffer;
  readonly onConfirm: (mode: MessageDeleteMode, reason?: string) => void;
  readonly onDismiss: () => void;
}) {
  const language = currentInterfaceLanguage();
  const [removing, setRemoving] = useState(offer.remove && !offer.forEveryone && !offer.forMe);
  if (removing) return <ContentRemovalSheet onConfirm={(reason) => onConfirm('remove', reason)} onCancel={onDismiss} />;
  const title =
    count === 1
      ? translateMessagePieces(language, 'message.delete.title')
      : translateMessagePieces(language, 'message.delete.titleMany', { count: new Intl.NumberFormat(language).format(count) });
  const choices = [
    { mode: 'everyone', offered: offer.forEveryone, label: () => translateMessagePieces(language, 'message.delete.forEveryone') },
    { mode: 'remove', offered: offer.remove, label: () => translate(language, 'moderation.remove.action') },
    { mode: 'me', offered: offer.forMe, label: () => translateMessagePieces(language, 'message.delete.forMe') },
  ] as const;

  return (
    <Sheet title={title} presentation="bottom" dialogData={{ 'data-message-delete-dialog': '' }} onClose={onDismiss}>
      {offer.forEveryone ? (
        <li data-message-delete-hint className="px-4 pb-2 text-mini" style={{ color: 'var(--color-ios-ink-2)' }}>
          {translateMessagePieces(language, 'message.delete.hint')}
        </li>
      ) : null}
      {choices.map((choice) =>
        choice.offered ? (
          <li key={choice.mode}>
            <button
              type="button"
              data-message-delete={choice.mode}
              onClick={() => (choice.mode === 'remove' ? setRemoving(true) : onConfirm(choice.mode))}
              className="flex w-full items-center px-4 text-start text-body font-semibold"
              style={{ minHeight: 44, color: 'var(--color-error)' }}
            >
              {choice.label()}
            </button>
          </li>
        ) : null,
      )}
      <li>
        <button
          type="button"
          data-message-delete="cancel"
          onClick={onDismiss}
          className="flex w-full items-center px-4 text-start text-body"
          style={{ minHeight: 44, color: 'var(--color-ios-ink)' }}
        >
          {translate(language, 'common.cancel')}
        </button>
      </li>
    </Sheet>
  );
}
