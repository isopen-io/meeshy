import { ForwardSheet } from '@/components/forward-sheet';
import { MessageDetailSheet } from '@/components/message-detail-sheet';
import { MessageMenu } from '@/components/message-menu';
import { reactionEntries } from '@/components/message-blocks';
import { ReactionSheet } from '@/components/reaction-sheet';
import type { Message } from '@/lib/api/types';
import { translationChoices } from '@/lib/view/message-actions';
import { deliveryOf as deliveryStatusOf, isMineOf } from '@/lib/view/message';
import type { MessageMenuController } from '@/lib/view/use-message-menu';

/** LA PART du contrôleur de `useMessageMenu` que les feuilles LISENT — un
 * `Pick`, jamais le contrôleur entier : le contrat de ce composant se lit
 * d'un coup d'œil, et un bouchon de test le remplit sans `as`. */
export type ThreadSheetsMenu = Pick<
  MessageMenuController,
  | 'menuTarget'
  | 'menuData'
  | 'onCloseMenu'
  | 'onMenuReact'
  | 'onMenuAction'
  | 'onPickLanguage'
  | 'forwardIds'
  | 'onForwardTo'
  | 'onCloseForward'
  | 'reactionSheetFor'
  | 'setReactionSheetFor'
  | 'detailFor'
  | 'setDetailFor'
  | 'servedOf'
  | 'starOf'
>;

/**
 * LES FEUILLES DU MESSAGE (#5814, #5866 ; extrait de `routes/thread.tsx` au
 * lot #7429, découpage sans changer un pixel) — le menu du message (appui
 * long / clic droit / `ContextMenu`), la feuille de destinataires, le rail de
 * réactions et la fiche détail. Miroir `ConversationOverlayState` (iOS,
 * `ConversationView.swift:24` — menu, sélection, feuilles) : la même
 * partition que `useThreadJump` (le saut) et `useThreadReadingMode`
 * (l'orchestration du mode) reprennent côté état, ici côté FEUILLES.
 * Composant SANS état propre (motif `ThreadModes`/`ThreadHeader`) : toute la
 * règle vit dans `useMessageMenu`, ce fichier ne fait que CÂBLER le JSX.
 *
 * Chaque feuille ne se monte que quand SA cible est posée ; le menu et la
 * fiche détail exigent EN PLUS que le message visé soit encore dans le fil
 * (`menuData` est `undefined` sinon, et la fiche le recherche dans
 * `messages`) — jamais un panneau ouvert sur un message disparu.
 */
export function ThreadMessageSheets({
  messageMenu,
  messages,
  readerLanguages,
  readerLocale,
  conversationId,
  viewerId,
}: {
  readonly messageMenu: ThreadSheetsMenu;
  readonly messages: readonly Message[];
  readonly readerLanguages: readonly string[];
  readonly readerLocale: string;
  readonly conversationId: string;
  readonly viewerId: string;
}) {
  return (
    <>
      {/* LE MENU DU MESSAGE (#5814) — portail conditionnel : monté SEULEMENT
          quand `useLongPress`/le clic droit/`ContextMenu` ont ciblé un
          message ET que ce message existe encore dans le fil. */}
      {((target, data) =>
        target === null || data === undefined ? null : (
          /* L'ID EST CAPTURÉ, PAS RÉ-ASSERTÉ (revue #5814) — `menuTarget!`
             dans chaque fermeture était une assertion de type par fermeture,
             que la garde d'au-dessus ne justifie pas (TypeScript ne narrow
             pas à travers un callback). Un paramètre le fige une fois. */
          <MessageMenu
            target={target}
            items={data.items}
            choices={data.choices}
            subjectLabel={data.subjectLabel}
            onClose={messageMenu.onCloseMenu}
            onReact={(emoji) => messageMenu.onMenuReact(target.messageId, emoji)}
            onExpandReactions={() => messageMenu.setReactionSheetFor(target.messageId)}
            onAction={(actionId) => messageMenu.onMenuAction(target.messageId, actionId)}
            onPickLanguage={(code) => messageMenu.onPickLanguage(target.messageId, code)}
          />
        ))(messageMenu.menuTarget, messageMenu.menuData)}

      {/* « ＋ Ajouter une réaction » (rail) et « Plus… » (détails) — deux
          feuilles indépendantes, jamais montées en même temps que le menu
          (celui-ci se referme déjà avant de les ouvrir, `use-message-menu.ts`). */}
      {/* LA FEUILLE DE DESTINATAIRES (#5866) — montée SEULEMENT quand une
          sélection ADMISE attend sa cible : c'est ce montage conditionnel qui
          fait que la requête de liste (`useConversations`, cache-first) n'est
          jamais lancée par la simple ouverture d'un fil. */}
      {messageMenu.forwardIds === null ? null : (
        <ForwardSheet viewerId={viewerId} onPick={messageMenu.onForwardTo} onClose={messageMenu.onCloseForward} />
      )}
      {((messageId) =>
        messageId === null ? null : (
          <ReactionSheet
            onPick={(emoji) => {
              messageMenu.onMenuReact(messageId, emoji);
              messageMenu.setReactionSheetFor(null);
            }}
            onClose={() => messageMenu.setReactionSheetFor(null)}
          />
        ))(messageMenu.reactionSheetFor)}
      {((detailFor) => {
        if (detailFor === null) return null;
        const detailMessage = messages.find((m) => m.id === detailFor);
        if (detailMessage === undefined) return null;
        const servedDetail = messageMenu.servedOf(detailFor);
        return (
          <MessageDetailSheet
            /* Une vue unique (#7580) : ni langues ni pièces — rien de son contenu. */
            choices={
              detailMessage.isViewOnce
                ? []
                : translationChoices({ message: detailMessage, preferredLanguages: readerLanguages, servedLanguage: servedDetail?.language ?? '' })
            }
            reactions={reactionEntries(detailMessage.reactionSummary)}
            sentAt={new Date(detailMessage.createdAt)}
            delivery={isMineOf(detailMessage, viewerId) ? deliveryStatusOf(detailMessage) : null}
            locale={readerLocale}
            conversationId={conversationId}
            messageId={detailMessage.id}
            attachments={detailMessage.isViewOnce ? [] : (detailMessage.attachments ?? [])}
            star={messageMenu.starOf(detailFor)}
            onPickLanguage={(code) => {
              messageMenu.onPickLanguage(detailFor, code);
              messageMenu.setDetailFor(null);
            }}
            onClose={() => messageMenu.setDetailFor(null)}
          />
        );
      })(messageMenu.detailFor)}
    </>
  );
}
