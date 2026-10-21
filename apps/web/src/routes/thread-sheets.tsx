
import { lazy, Suspense, useEffect } from 'react';
import { useStore } from 'zustand';

import { discussionCardSubjectOf } from '@/lib/export/discussion-card-subject';
import { messageCardLanguagesOf, messageCardSubjectOf } from '@/lib/export/message-card-subject';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { MessageMenu } from '@/components/message-menu';
import { MessageReactionQuickBar } from '@/components/reaction-quick-bar';
import { reactionEntries } from '@/components/message-blocks';
import type { Attachment, Message } from '@/lib/api/types';
import { translate } from '@/lib/i18n-catalog';
import { offerStudioSeed } from '@/lib/stories/studio-seed';
import { loadMessagePiecesCatalog, translateMessagePieces } from '@/lib/i18n-message-pieces-catalog';
import { closeReactorsSheet, reactorsSheetStore } from '@/lib/view/reactors-sheet-store';
import { imageableOf, messageDetailExposureOf, messageMenuContextOf, translationChoices } from '@/lib/view/message-actions';
import { deliveryOf as deliveryStatusOf, isMineOf } from '@/lib/view/message';
import type { MessageMenuController } from '@/lib/view/use-message-menu';

import { ExportCatalogGate } from './export-catalog-gate';
import { href, navigate } from './route-table';
import { MessageExportSheet } from './thread-export-sheet';

/** « PLUS… » se charge au geste (#10149) : la fiche détail et sa section
 * d'accusés nominatifs ne servent qu'au message visé, jamais au premier rendu
 * du fil — les embarquer gonflait le chunk « thread » au-delà de son plafond. */
/** « ＋ AJOUTER UNE RÉACTION » se charge au geste (#10531) : la feuille d'emojis
 * complète et ses libellés (`emojiPicker.*`, `prepareEmojiPickerSheet`) n'entrent pas dans le chunk
 * « thread », et n'arrivent qu'au premier « ＋ » du rail. */
const ReactionSheet = lazy(() =>
  import('@/components/reaction-sheet').then((m) => m.prepareEmojiPickerSheet().then(() => ({ default: m.ReactionSheet }))),
);

/** « QUI A RÉAGI » se charge au geste (#10583), avec le catalogue du fil qui
 * porte son état vide — la feuille ne se rend jamais avant lui. */
const MessageReactorsSheet = lazy(() =>
  Promise.all([import('@/components/message-reactors'), loadMessagePiecesCatalog(currentInterfaceLanguage())]).then(([m]) => ({
    default: m.MessageReactorsSheet,
  })),
);

/** « SIGNALER » (#7558) — la feuille des motifs, celle des comptes et des publications, chargée au geste. */
const ReportSheet = lazy(() => import('@/components/report-sheet').then((m) => ({ default: m.ReportSheet })));
const MessageDeleteDialog = lazy(() => import('@/components/message-delete-dialog').then((m) => ({ default: m.MessageDeleteDialog })));
const MessageDetailSheet = lazy(() => import('@/components/message-detail-sheet').then((m) => ({ default: m.MessageDetailSheet })));

/** LA PART du contrôleur de `useMessageMenu` que les feuilles LISENT — un
 * `Pick`, jamais le contrôleur entier : le contrat de ce composant se lit
 * d'un coup d'œil, et un bouchon de test le remplit sans `as`. */
export type ThreadSheetsMenu = Pick<
  MessageMenuController,
  | 'menuTarget'
  | 'menuData'
  | 'quickReactionFor'
  | 'onCloseQuickReaction'
  | 'onCloseMenu'
  | 'onMenuReact'
  | 'onMenuAction'
  | 'onPieceChange'
  | 'onPieceAction'
  | 'onPickLanguage'
  | 'reactionSheetFor'
  | 'setReactionSheetFor'
  | 'detailFor'
  | 'setDetailFor'
  | 'exportFor'
  | 'setExportFor'
  | 'servedOf'
  | 'starOf'
  | 'editOf'
  | 'deleteOf'
  | 'deleteRequest'
  | 'onDismissDelete'
  | 'onConfirmDelete'
  | 'pinOf'
  | 'reportOf'
  | 'reportFor'
  | 'onPickReportReason'
  | 'onDismissReport'
>;

/**
 * LES FEUILLES DU MESSAGE (#5814, #5866 ; extrait de `routes/thread.tsx` au
 * lot #7429, découpage sans changer un pixel) — le menu du message (appui
 * long / clic droit / `ContextMenu`), le rail de réactions et la fiche détail.
 * Le TRANSFERT n'a plus de feuille ici (#8884) : la barre de sélection ouvre la
 * feuille d'envoi commune (`openSendSheet`, montée une fois par le shell).
 * Miroir `ConversationOverlayState` (iOS,
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
  conversationId,
  viewerId,
  viewerName,
  viewerHandle,
  conversationTitle,
  announce,
}: {
  readonly messageMenu: ThreadSheetsMenu;
  readonly messages: readonly Message[];
  readonly readerLanguages: readonly string[];
  readonly conversationId: string;
  readonly viewerId: string;
  /** Le nom de qui exporte : il nomme ses propres messages sur la carte. */
  readonly viewerName: string;
  /** Le pseudo de qui exporte : il signe le filigrane, « Meeshy @pseudo ». */
  readonly viewerHandle: string | null;
  /** Le titre du fil, qu'une carte d'export peut afficher. */
  readonly conversationTitle: string | null;
  readonly announce: (message: string) => void;
}) {
  /* « QUI A RÉAGI » (#10583) — la demande d'une pilule maintenue. Elle ne
     survit pas au fil qui l'a posée. */
  const reactorsFor = useStore(reactorsSheetStore, (state) => state.messageId);
  useEffect(() => closeReactorsSheet, []);
  const reactorsMessage = reactorsFor === null ? undefined : messages.find((m) => m.id === reactorsFor);
  return (
    <>
      {reactorsMessage === undefined ? null : (
        <Suspense fallback={null}>
          <MessageReactorsSheet
            messageId={reactorsMessage.id}
            reactions={reactionEntries(reactorsMessage.reactionSummary)}
            onClose={closeReactorsSheet}
          />
        </Suspense>
      )}
      {/* LA BARRE DE RÉACTION RAPIDE DU DOUBLE TOUCHER (#10599) — montée tant
          que sa cible est posée ET que le message est encore dans le fil ;
          un choix vise la pièce touchée quand la cible en porte une. */}
      {((quick) =>
        quick === null || !messages.some((m) => m.id === quick.messageId) ? null : (
          <MessageReactionQuickBar
            key={`${quick.messageId}:${quick.pieceId ?? ''}`}
            anchor={quick.anchor}
            x={quick.x}
            onReact={(emoji) => messageMenu.onMenuReact(quick.messageId, emoji, quick.pieceId)}
            onExpand={() => messageMenu.setReactionSheetFor(quick.messageId)}
            onClose={messageMenu.onCloseQuickReaction}
          />
        ))(messageMenu.quickReactionFor)}
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
            forwardItems={data.forwardItems}
            subjectLabel={data.subjectLabel}
            canReact={data.canReact}
            onClose={messageMenu.onCloseMenu}
            /* LA PIÈCE VISÉE (#9907, #9908) — l'aperçu la montre seule, le
               défilement change la cible, le rail réagit sur elle. */
            {...(data.piece === undefined || target.pieceId === undefined
              ? {}
              : ((pieceData, pieceId) => ({
                  piece: {
                    data: pieceData,
                    onIndex: (index: number) => {
                      const next = pieceData.pieces[index];
                      if (next !== undefined) messageMenu.onPieceChange(next.id);
                    },
                    onWholeMessage: () => messageMenu.onPieceChange(undefined),
                    onAction: (actionId: Parameters<typeof messageMenu.onPieceAction>[2]) =>
                      messageMenu.onPieceAction(target.messageId, pieceId, actionId),
                  },
                }))(data.piece, target.pieceId))}
            onReact={(emoji) => messageMenu.onMenuReact(target.messageId, emoji, data.piece === undefined || !data.piece.canReact ? undefined : target.pieceId)}
            onExpandReactions={() => messageMenu.setReactionSheetFor(target.messageId)}
            onAction={(actionId) => messageMenu.onMenuAction(target.messageId, actionId)}
            onPickLanguage={(code) => messageMenu.onPickLanguage(target.messageId, code)}
          />
        ))(messageMenu.menuTarget, messageMenu.menuData)}

      {/* « ＋ Ajouter une réaction » (rail) et « Plus… » (détails) — deux
          feuilles indépendantes, jamais montées en même temps que le menu
          (celui-ci se referme déjà avant de les ouvrir, `use-message-menu.ts`). */}
      {((messageId) =>
        messageId === null ? null : (
          <Suspense fallback={null}>
            <ReactionSheet
              onPick={(emoji) => {
                messageMenu.onMenuReact(messageId, emoji);
                messageMenu.setReactionSheetFor(null);
              }}
              onClose={() => messageMenu.setReactionSheetFor(null)}
            />
          </Suspense>
        ))(messageMenu.reactionSheetFor)}
      {((detailFor) => {
        if (detailFor === null) return null;
        const detailMessage = messages.find((m) => m.id === detailFor);
        if (detailMessage === undefined) return null;
        const servedDetail = messageMenu.servedOf(detailFor);
        /* Un message protégé (#7580, #8008) : ni langues ni pièces — rien de son contenu. */
        const exposed = messageDetailExposureOf(detailMessage, { now: Date.now() });
        const menuContext = messageMenuContextOf(detailMessage, { now: Date.now() });
        const imageable = imageableOf(menuContext);
        const composable = menuContext.composableIndex === null || menuContext.composableIndex === undefined ? null : (detailMessage.attachments ?? [])[menuContext.composableIndex];
        return (
          <Suspense fallback={null}>
            <MessageDetailSheet
              choices={
                exposed
                  ? translationChoices({ message: detailMessage, preferredLanguages: readerLanguages, servedLanguage: servedDetail?.language ?? '' })
                  : []
              }
              reactions={reactionEntries(detailMessage.reactionSummary)}
              sentAt={new Date(detailMessage.createdAt)}
              delivery={isMineOf(detailMessage, viewerId) ? deliveryStatusOf(detailMessage) : null}
              locale={currentInterfaceLanguage()}
              conversationId={conversationId}
              messageId={detailMessage.id}
              attachments={exposed ? (detailMessage.attachments ?? []) : []}
              star={messageMenu.starOf(detailFor)}
              act={{
                onEdit: messageMenu.editOf(detailFor),
                onDelete: messageMenu.deleteOf(detailFor),
                pin: messageMenu.pinOf(detailFor),
                onReport: messageMenu.reportOf(detailFor),
              }}
              create={{
                onCompose: composable === undefined || composable === null ? null : () => void composeWithAttachment(composable, announce),
                onImage: imageable ? () => messageMenu.setExportFor({ messageId: detailFor, quick: false }) : null,
              }}
              onPickLanguage={(code) => {
                messageMenu.onPickLanguage(detailFor, code);
                messageMenu.setDetailFor(null);
              }}
              onClose={() => messageMenu.setDetailFor(null)}
            />
          </Suspense>
        );
      })(messageMenu.detailFor)}
      {/* LE DIALOGUE DE SUPPRESSION (#10582) — ouvert par « Plus… » pour un
          message, par la corbeille de la barre pour la sélection. */}
      {((request) =>
        request === null ? null : (
          <Suspense fallback={null}>
            <MessageDeleteDialog
              count={request.messageIds.length}
              offer={request.offer}
              onConfirm={messageMenu.onConfirmDelete}
              onDismiss={messageMenu.onDismissDelete}
            />
          </Suspense>
        ))(messageMenu.deleteRequest)}
      {/* LA FEUILLE DES MOTIFS (#7558) — ouverte par « Signaler » de « Plus… » ;
          jamais sur un message qui a quitté le fil. */}
      {((reportFor) => {
        const reported = reportFor === null ? undefined : messages.find((m) => m.id === reportFor);
        if (reported === undefined) return null;
        return (
          <Suspense fallback={null}>
            <ReportSheet
              name={reported.sender?.displayName ?? ''}
              title={translateMessagePieces(currentInterfaceLanguage(), 'message.report.title')}
              busy={false}
              onPick={messageMenu.onPickReportReason}
              onClose={messageMenu.onDismissReport}
            />
          </Suspense>
        );
      })(messageMenu.reportFor)}
      {((request) => {
        if (request === null) return null;
        const exportFor = request.messageId;
        const exportMessage = messages.find((m) => m.id === exportFor);
        if (exportMessage === undefined) return null;
        const subjectIn = (language: string | null) =>
          messageCardSubjectOf({
            message: exportMessage,
            servedText: messageMenu.servedOf(exportFor)?.text,
            viewer: { id: viewerId, displayName: viewerName, handle: viewerHandle },
            readerLanguages,
            interfaceLanguage: currentInterfaceLanguage(),
            now: Date.now(),
            language,
          });
        /* « IMAGER LA DISCUSSION » (#9039) — la même carte, étendue aux messages
           qui mènent à celui-ci ; elle se lit dans les langues que le lecteur
           lit, sans choix de langue d'export (chaque message a les siennes). */
        const discussion = request.scope === 'discussion';
        const subject = discussion
          ? discussionCardSubjectOf({
              messages,
              anchorId: exportFor,
              servedOf: (id) => messageMenu.servedOf(id)?.text,
              viewer: { id: viewerId, displayName: viewerName, handle: viewerHandle },
              now: Date.now(),
            })
          : subjectIn(null);
        if (subject === null) return null;
        return (
          <ExportCatalogGate>
            <MessageExportSheet
              subject={subject}
              {...(discussion ? {} : { exportLanguages: { codes: messageCardLanguagesOf(exportMessage), subjectIn } })}
              handle={viewerHandle}
              conversationTitle={conversationTitle}
              quick={request.quick}
              announce={announce}
              onClose={() => messageMenu.setExportFor(null)}
            />
          </ExportCatalogGate>
        );
      })(messageMenu.exportFor)}
    </>
  );
}

/**
 * « COMPOSER » DEPUIS « PLUS… » (#8693) — le geste de la visionneuse
 * (`viewer-media-actions.tsx`, #6303) : la pièce en fichier, posée en graine
 * du studio, puis le studio. Un échec se dit, jamais un bouton muet.
 */
async function composeWithAttachment(attachment: Attachment, announce: (message: string) => void): Promise<void> {
  const language = currentInterfaceLanguage();
  const { fetchCardMediaBlob } = await import('@/lib/export/message-card-fetch');
  const blob = await fetchCardMediaBlob(attachment.fileUrl, attachment.id).catch(() => null);
  if (blob === null) {
    announce(translate(language, 'media.viewer.compose_failed'));
    return;
  }
  offerStudioSeed(new File([blob], attachment.originalName !== '' ? attachment.originalName : attachment.fileName, { type: attachment.mimeType }));
  navigate(href('storyCompose'));
}

