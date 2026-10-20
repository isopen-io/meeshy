import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - La couche de la liste de messages
//
// Extraite de `ConversationView.swift` (cohésion) : le pont UIKit vers la
// liste et les ~45 rappels qu'il remet à l'écran forment UNE responsabilité —
// traduire ce que la liste constate (un appui, un défilement, une lecture) en
// état de la conversation. Elle écrit les états de vue que l'hôte tient en
// `@State` (liés, jamais copiés) et lui rend, par `ConversationMessageActions`
// et `ConversationMessageListActions`, les gestes qui se composent chez lui
// (citation, édition, sélection, menu).

/// Les marges que la liste réserve autour de son contenu, mesurées par l'hôte.
struct ConversationListInsets {
    let bottom: CGFloat
    let bottomTransition: ListInsetTransition?
    let top: CGFloat
    let headerBand: CGFloat
}

/// Les gestes propres à la liste (les gestes d'un message sont dans
/// `ConversationMessageActions`).
struct ConversationMessageListActions {
    let toggleSelection: (String) -> Void
    let presentMenu: (Message, CGRect?, String?) -> Void
    let openMedia: (MessageAttachment) -> Void
    let openViewOnce: (String) -> Bool
    let focalPlace: (SharedPlace, String) -> FocalFullscreenPlace
}

/// **La couche de la liste de messages, SORTIE du cadre de la scène** (#6213 bis).
///
/// Mesuré sur appareil (`CrashStackDumper`, palmarès des cadres apparié PAR
/// ADRESSE de retour) : le cadre qui portait cette branche occupait **552 Ko**
/// sur une pile principale de 1008 Ko, et le tronc entier en occupait **847**.
/// L'adresse fautive tombait 88 octets sous le plancher : page de garde.
///
/// Un effacement de type posé EN LIGNE sur la branche n'y change rien : il a
/// lieu APRÈS que le cadre a réservé la place du type concret, et en `-Onone`
/// un `ZStack` de quatorze branches réserve la place de TOUTES. Déplacer la
/// branche dans SA struct nominale change le mécanisme : la construction se
/// fait dans un cadre à elle, entré puis quitté, et la scène
/// (`ConversationBodyStage`) ne voit plus passer que seize octets. Les branches
/// se SUCCÈDENT au lieu de s'ADDITIONNER.
///
/// Cette branche-ci est la plus lourde du lot : ~340 lignes d'arguments et de
/// closures pour un représentable UIKit.
struct ConversationMessageListLayer: View {
    let viewModel: ConversationViewModel
    @Binding var scrollState: ConversationScrollState
    @Binding var overlayState: ConversationOverlayState
    @Binding var focalFullscreenPlace: FocalFullscreenPlace?
    @Binding var focalShareFileItem: FocalShareFileItem?
    @EnvironmentObject private var storyViewModel: StoryViewModel
    let accentColor: String
    let isDirect: Bool
    let insets: ConversationListInsets
    let isHeaderExpanded: Bool
    let readingMode: ReadingModeOrchestrator.ConversationReadingMode
    let isAdminOrMod: Bool
    let messageActions: ConversationMessageActions
    let actions: ConversationMessageListActions

    var body: some View {
        MessageListView(
            store: viewModel.messageStore,
            conversationViewModel: viewModel,
            currentUserId: viewModel.currentUserIdForView,
            accentColor: accentColor,
            isDirect: isDirect,
            // Le représentable court désormais jusqu'au bord BAS physique
            // (`ignoresSafeArea` bas, cf. plus bas) : la bande safe area
            // qu'il traverse s'ajoute à la réserve du composeur pour que
            // le repos du fil ne bouge pas d'un point.
            bottomInset: insets.bottom,
            bottomInsetTransition: insets.bottomTransition,
            // 0 en preview : `.sheet` à détentes, déjà sous la status bar. La
            // bande est réservée partout — l'aperçu porte l'en-tête (#8822).
            topInset: insets.top,
            headerBandHeight: insets.headerBand,
            scrollToBottomTrigger: scrollState.scrollToBottomTrigger,
            scrollToMessageId: scrollState.scrollToMessageId,
            scrollToMessageTrigger: scrollState.scrollToMessageTrigger,
            flushSeenTrigger: scrollState.flushSeenTrigger,
            isSearchingQuotedMessage: viewModel.isSearchingQuotedMessage,
            // Header déplié = la pill de jour se retire. Les deux vivent
            // dans la même bande haute ; le déplié étant un geste
            // explicite vers les détails de la conversation, c'est lui qui
            // gagne (retour user 2026-08-13).
            isHeaderExpanded: isHeaderExpanded,
            // WS-7 (F-086) — décision de l'orchestrateur (§WS-6 travail
            // 10 : props posées AVANT les closures on…, contrainte
            // d'ordre de l'init memberwise). `readingModeController.mode`
            // et `MessageListView.readingMode` sont le MÊME type
            // (`ConversationReadingMode`, typealias sur
            // `ReadingModeOrchestrator.ConversationReadingMode`,
            // F-080) — aucune conversion.
            readingMode: readingMode,
            onNewMessagesBadge: { count in
                scrollState.unreadBadgeCount = count
            },
            onScrollToMessage: { targetId in
                // Tap on a reply chip inside a bubble: jump to the cited
                // message. Uses the new jumpToQuotedMessage flow which:
                // 1. Checks if the message is already local → instant scroll
                // 2. If not, shows a pulsing indicator on the scroll button
                //    while fetching from the server
                // 3. After loading, triggers the visual scroll + highlight
                Task {
                    let result = await viewModel.jumpToQuotedMessage(messageId: targetId)
                    switch result {
                    case .foundLocally:
                        // The VC's scrollToMessage already handled the
                        // visual scroll for the local case.
                        break
                    case .loadedFromServer:
                        // The store snapshot was reloaded around the target.
                        // Trigger the VC to scroll to it now.
                        scrollState.scrollToMessageId = targetId
                        scrollState.scrollToMessageTrigger += 1
                    case .notFound:
                        HapticFeedback.error()
                        FeedbackToastManager.shared.show(String(localized: "conversation.messageNotFound", bundle: .main), type: .info)
                    }
                }
            },
            onLoadOlder: {
                // Infinite scroll: VM owns the cache + network sequence
                // (syncEngine.fetchOlderMessages → store.loadOlder).
                // Going through the store directly stalls once the local
                // GRDB window is exhausted, leaving older messages
                // unreachable.
                await viewModel.loadOlderMessages()
            },
            onNearBottomChanged: { nearBottom in
                if scrollState.isNearBottom != nearBottom {
                    scrollState.isNearBottom = nearBottom
                }
                // Revenir au bas ne marque rien (`onMessagesSeen` le fait) ;
                // au bas d'une fenêtre sautée, les pages plus récentes (#9339).
                viewModel.noteNearBottom(nearBottom)
            },
            onScrollingActiveChanged: { isActive in
                withAnimation(.easeInOut(duration: 0.22)) {
                    scrollState.isScrollingActiveList = isActive
                }
            },
            onMessagesSeen: { seenIds, visibleIds in
                // Seule source de vérité de la lecture : ces identifiants
                // ont été RÉELLEMENT affichés assez longtemps.
                // @see docs/superpowers/specs/2026-07-24-read-exactness-design.md
                viewModel.markAsRead(messageIds: seenIds, visibleIds: visibleIds)
            },
            onStoryReplyTap: { storyId in
                // Open the story viewer at the slide that originated the
                // quoted reply. Resolves the story id to a (group, slide)
                // pair via StoryViewModel — preserves the legacy behaviour
                // from ConversationView+MessageRow (now dead code).
                guard let groupIdx = storyViewModel.groupIndex(forStoryId: storyId) else {
                    // Vue `3h` (#4098) — la citation SUBSISTE à l'expiration
                    // de la story, mais son lien, lui, ne survit pas. Cette
                    // branche n'existait pas : story expirée, purgée ou
                    // jamais chargée, le tap ne faisait RIEN. Pas d'erreur,
                    // pas d'explication — l'utilisateur touchait la carte
                    // trois fois avant de conclure que l'app était figée.
                    //
                    // Loi 4 du dépôt : un contrôle existe s'il a un effet.
                    // Le chemin voisin — un MESSAGE cité introuvable — fait
                    // déjà exactement ceci douze lignes plus haut
                    // (`conversation.messageNotFound`) ; la story n'avait
                    // simplement jamais reçu son pendant.
                    //
                    // C'est ici, et NULLE PART ailleurs, que l'échec se
                    // constate : le client ne PEUT pas préjuger de
                    // l'expiration. Le droit d'ouvrir une story passé son
                    // heure est DÉCLARÉ par le serveur
                    // (`StoryItem.referenceAccess`, « never recomputed from
                    // `expiresAt` here ») — une personne nommée dans la
                    // story y accède encore. Une carte qui s'annoncerait
                    // « expirée » d'après sa seule date mentirait sur une
                    // story que ce tap aurait ouverte.
                    FeedbackToastManager.shared.show(
                        String(localized: "conversation.storyUnavailable", bundle: .main),
                        type: .info
                    )
                    return
                }
                let group = storyViewModel.storyGroups[groupIdx]
                let slideIdx = group.stories.firstIndex { $0.id == storyId } ?? 0
                overlayState.storyViewerUserId = group.id
                overlayState.storyViewerGroupIndex = groupIdx
                overlayState.storyViewerSlideIndex = slideIdx
                overlayState.storyViewerPostId = storyId
                overlayState.storyViewerStartAtFirstUnviewed = false
                overlayState.showStoryViewer = true
            },
            onViewSenderStory: { userId in
                // Anneau story d'un avatar de bulle (conversations de
                // groupe) → story de CET expéditeur, première non-vue.
                overlayState.storyViewerUserId = userId
                overlayState.storyViewerSlideIndex = 0; overlayState.storyViewerPostId = nil
                overlayState.storyViewerStartAtFirstUnviewed = true
                overlayState.showStoryViewer = true
            },
            onSwipeReply: { messageId in
                // Restore swipe-to-reply: BubbleSwipeContainer commits when
                // the bubble crosses the reply threshold. We resolve the
                // message and reuse triggerReply() so the composer mirrors
                // the legacy long-press / context menu reply path.
                guard let msg = viewModel.messages.first(where: { $0.id == messageId }) else { return }
                messageActions.reply(msg)
            },
            onSwipeForward: { messageId in
                // #4021 — swipe-to-forward ARME la sélection multiple,
                // même contrat que le "Transférer" du menu long-press
                // ci-dessus. HapticFeedback already fires inside the
                // swipe container — we only seed the selection here.
                guard let msg = viewModel.messages.first(where: { $0.id == messageId }),
                      msg.isForwardable else { return }
                messageActions.beginSelection(msg.id)
            },
            onLongPress: { messageId, cellFrame in
                guard overlayState.longPressEnabled else { return }
                // Exclusivité mutuelle : si la barre de quick-reaction est
                // déjà ouverte, l'appui-long ne fait rien (une seule feature
                // active à la fois).
                guard overlayState.quickReactionMessageId == nil else { return }
                guard let msg = viewModel.messages.first(where: { $0.id == messageId }) else { return }
                // L'appui long ouvre les options habituelles — pour TOUT
                // message, avis système compris (directive 2026-08-24).
                //
                // Il aiguillait auparavant par type : un résumé d'appel
                // ouvrait sa feuille de détail, et tout autre message
                // système ne faisait RIEN. Ce no-op était le vrai défaut :
                // un avis d'arrivée reste un message du fil — épinglable,
                // favorisable, signalable, supprimable — et le geste qui
                // ouvre ces options est le même partout.
                //
                // La feuille de détail d'un appel n'est pas perdue pour
                // autant : elle est devenue une ACTION du menu
                // (`PrimaryAction.callDetail`, cf. `onShowCallDetail`).
                //
                // Le clavier + le repositionnement vers le centre (#4004)
                // passent tous les deux par `presentLongPressMenu`. Le
                // menu NATIF iOS 26+ est présenté par le système, sans
                // point d'interception avant ouverture — ce site est le
                // SEUL point d'entrée (menu custom, < iOS 26).
                actions.presentMenu(msg, cellFrame, nil)
            },
            // #9907 — l'appui long d'une TUILE : mêmes gardes, CETTE pièce visée.
            onLongPressPiece: { messageId, pieceId, cellFrame in
                guard overlayState.longPressEnabled, overlayState.quickReactionMessageId == nil,
                      let msg = viewModel.messages.first(where: { $0.id == messageId }) else { return }
                actions.presentMenu(msg, cellFrame, pieceId)
            },
            // iOS 26+ : contenu du `.contextMenu` NATIF (Liquid Glass) des
            // bulles — mêmes actions que l'overlay custom (SSOT). `nil`
            // renvoyé pour les messages système / résumés d'appel (pas de
            // menu). Le builder est appelé une fois par config de cellule.
            overlaidMessageId: overlayState.showOverlayMenu ? overlayState.overlayMessage?.id : nil,
            onCallDetailRequest: { messageId in
                guard let msg = viewModel.messages.first(where: { $0.id == messageId }) else { return }
                overlayState.callDetailMessage = msg
            },
            isSelectionModeActive: overlayState.isSelectionModeActive,
            selectedMessageIds: overlayState.selectedMessageIds,
            onToggleSelection: { messageId in actions.toggleSelection(messageId) },
            // **Les rappels du menu SYSTÈME** (#6117, double tap).
            // Chacun réutilise EXACTEMENT ce que le menu Meeshy appelle
            // déjà : deux entrées du même nom, dans deux menus du même
            // message, doivent faire la même chose.
            onEditMessage: { messageId in
                guard let msg = viewModel.messages.first(where: { $0.id == messageId }) else { return }
                messageActions.edit(msg)
            },
            onSelectMessage: { messageId in messageActions.beginSelection(messageId) },
            onComposeFromMessage: { messageId in
                guard let msg = viewModel.messages.first(where: { $0.id == messageId }) else { return }
                messageActions.compose(msg)
            },
            onImagineFromMessage: { messageId in if let msg = viewModel.messages.first(where: { $0.id == messageId }) { messageActions.export(msg, false) } },
            // « Plus… » ouvre le GRAND menu — `MessageMoreSheet`, présentée
            // par `overlayState.detailSheetMessage` — et non l'overlay
            // d'appui long. Directive porteur : « le plus doit ouvrir le
            // grand menu et non le menu longpress ».
            onOpenMoreSheet: { messageId in
                guard let msg = viewModel.messages.first(where: { $0.id == messageId }) else { return }
                overlayState.detailSheetMessage = msg
            },
            // La règle d'éditabilité est REMISE, pas recopiée : même expression que les trois autres sites de ce fichier.
            canEditMessage: { messageId in
                guard let msg = viewModel.messages.first(where: { $0.id == messageId }) else { return false }
                return msg.isMe || isAdminOrMod
            },
            onAddReaction: { messageId, bubbleFrame in
                // Exclusivité mutuelle : ouvrir la barre de quick-reaction
                // ferme d'abord l'overlay d'appui-long s'il est visible.
                if overlayState.showOverlayMenu {
                    overlayState.showOverlayMenu = false
                    overlayState.overlayMessage = nil
                }
                // Spring-open the emoji bar anchored to the tapped bubble
                // (appears below it, flips above near the composer).
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    overlayState.emojiOnlyMode = true
                    overlayState.quickReactionAnchorFrame = bubbleFrame
                    overlayState.quickReactionMessageId = messageId
                }
                HapticFeedback.light()
            },
            onToggleReaction: { messageId, emoji in
                viewModel.toggleReaction(messageId: messageId, emoji: emoji)
            },
            onReactToAttachment: { attachmentId, messageId, emoji in
                viewModel.toggleAttachmentReaction(attachmentId: attachmentId, messageId: messageId, emoji: emoji)
            },
            onOpenReactPicker: { messageId in
                guard let msg = viewModel.messages.first(where: { $0.id == messageId }) else { return }
                overlayState.fullReactionPickerMessage = msg
            },
            onShowMessageInfo: { messageId in
                guard let msg = viewModel.messages.first(where: { $0.id == messageId }) else { return }
                overlayState.moreSheetInitialItem = .views
                overlayState.detailSheetMessage = msg
            },
            onShowReadStatus: { messageId in
                // Tap sur les coches (✓ / ✓✓ / ✓✓ bleu) d'un message envoyé.
                // Ouvre la sheet detail sur l'onglet "Vues" pour consulter
                // qui a reçu / qui a lu — sans passer par le long-press.
                guard let msg = viewModel.messages.first(where: { $0.id == messageId }) else { return }
                overlayState.moreSheetInitialItem = .views
                overlayState.detailSheetMessage = msg
            },
            onRetry: { messageId in
                // Tap on the orange retry band of a FAILED outgoing message.
                // `retryMessage` deletes the failed row and re-sends with the
                // SAME clientMessageId (gateway dedup) AND kicks the outbox
                // flusher — so the resend actually fires (the old local
                // OfflineQueue reset never flushed on a foregrounded device).
                Task { await viewModel.retryMessage(messageId: messageId) }
            },
            onShowReactions: { messageId in
                guard let msg = viewModel.messages.first(where: { $0.id == messageId }) else { return }
                overlayState.moreSheetInitialItem = .reactions
                overlayState.detailSheetMessage = msg
            },
            onShowTranslationDetail: { messageId in
                guard let msg = viewModel.messages.first(where: { $0.id == messageId }) else { return }
                overlayState.moreSheetInitialItem = .language
                overlayState.detailSheetMessage = msg
            },
            onFocalTapLocation: { place, messageId in
                focalFullscreenPlace = actions.focalPlace(place, messageId)
            },
            onFocalShareFile: { url in
                focalShareFileItem = FocalShareFileItem(url: url)
            },
            onMediaTap: actions.openMedia,
            onConsumeViewOnce: { messageId, completion in
                // #7618 — la puce d'une vue unique OUVRE : plein écran pour
                // un média, lecture sur place pour un texte. On arme, on ne
                // détruit pas (#7500) : `openViewOnce` en tient la règle.
                completion(actions.openViewOnce(messageId))
            },
            onRequestTranslation: { messageId, targetLang in
                MessageSocketManager.shared.requestTranslation(messageId: messageId, targetLanguage: targetLang)
            }
        ).equatable()
        // Le flux traverse la zone status bar / Dynamic Island jusqu'au bord
        // haut de l'écran (retour user 2026-08-12) : sans ça, SwiftUI pose le
        // représentable DANS la safe area, la liste s'arrête sous l'îlot et
        // cette bande ne montre plus que le dégradé de fond — lu comme une
        // « couleur unie » derrière l'îlot, là où les autres écrans laissent
        // leur contenu défiler sous le header jusqu'au bord. Le repos du flux
        // est inchangé : le contrôleur réserve la hauteur de la bande en
        // inset (`applyTopInset`), le contenu ne fait qu'y transiter au
        // défilement. Le header flottant, lui, reste dans la safe area
        // (zIndex 100, au-dessus).
        //
        // MÊME règle au bord BAS (retour user 2026-08-16, capture device) :
        // borné à la safe area basse, le représentable coupait les
        // messages ~34 pt AVANT le bord physique — visible dès que le
        // chrome s'escamote au défilement (Focal) : le fil doit sortir de
        // l'écran par le bord, exactement comme en haut. La réserve du
        // composeur est portée par `bottomInset` (le contrôleur la
        // compose dans `contentInset.top`), compensée de
        // `safeAreaBottom` au site d'appel — le repos est inchangé.
        .ignoresSafeArea(.container, edges: [.top, .bottom])
    }
}
