import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Les plein écrans de l'écran de conversation, en `ViewModifier` NOMINAL**
/// (LOT-10) — le maillon qui s'appelait `bodyWithCovers` : la porte du média
/// reçu et l'aperçu d'un média en attente, la galerie, le flux « Enregistrer »
/// et les feuilles d'un message. L'ordre des modificateurs est celui d'avant.
struct ConversationBodyCovers: ViewModifier {
    let viewModel: ConversationViewModel
    @Binding var composerState: ConversationComposerState
    @Binding var scrollState: ConversationScrollState
    @Binding var overlayState: ConversationOverlayState
    let conversation: Conversation?
    let accentColor: String
    let isDark: Bool
    let authority: ConversationMenuAuthority
    let mediaSaveCoordinator: MediaSaveCoordinator
    let onReply: (Message) -> Void
    let actions: ConversationMessageActions

    func body(content: Content) -> some View {
        content
            .modifier(ConversationComposeCovers(composerState: $composerState, accentColor: accentColor))
            .modifier(ConversationMediaGalleryLayer(
                viewModel: viewModel, scrollState: $scrollState,
                composerState: $composerState, accentColor: accentColor,
                authority: authority, onReply: onReply))
            .mediaSaveFlow(mediaSaveCoordinator)
            .modifier(ConversationMessageSheets(
                viewModel: viewModel, overlayState: $overlayState, conversation: conversation,
                accentColor: accentColor, isDark: isDark,
                authority: authority, mediaSaveCoordinator: mediaSaveCoordinator,
                actions: actions))
    }
}

/// **Les feuilles et alertes de l'écran, en `ViewModifier` NOMINAL** (LOT-10) —
/// le maillon qui s'appelait `bodyWithSheets`, moins le menu d'appui long.
///
/// #10806 — les confirmations de suppression s'ancrent DANS la conversation
/// (`deleteAnchor`), jamais sur la racine : sur iPad, celle-ci devenait un
/// popover posé sur la liste.
struct ConversationBodySheets<Anchor: View, Picker: View>: ViewModifier {
    @Binding var headerState: ConversationHeaderState
    @Binding var overlayState: ConversationOverlayState
    @Binding var composerState: ConversationComposerState
    @Binding var scrollState: ConversationScrollState
    let conversation: Conversation?
    let accentColor: String
    let messages: [Message]
    let router: Router
    let onConversationUpdated: (Conversation) -> Void
    let onVoiceConsentAccept: () -> Void
    let onVoiceConsentLater: () -> Void
    @ViewBuilder let deleteAnchor: () -> Anchor
    @ViewBuilder let forwardPicker: (Message) -> Picker

    func body(content: Content) -> some View {
        content
            .modifier(ConversationStoryViewerCovers(headerState: $headerState, overlayState: $overlayState))
            .modifier(ConversationInfoSheetLayer(
                isPresented: $composerState.showConversationInfo, scrollState: $scrollState,
                conversation: conversation, accentColor: accentColor, messages: messages,
                router: router, onConversationUpdated: onConversationUpdated))
            .alert(String(localized: "conversation.view.action_selected", bundle: .main), isPresented: Binding(get: { composerState.actionAlert != nil }, set: { if !$0 { composerState.actionAlert = nil } })) {
                Button(String(localized: "common.ok", bundle: .main)) { composerState.actionAlert = nil }
            } message: { Text(composerState.actionAlert ?? "") }
            .modifier(ConversationVoiceConsentAlert(
                isPresented: $composerState.showVoiceAutoTranslateConsent,
                onAccept: onVoiceConsentAccept,
                onLater: onVoiceConsentLater))
            .overlay { deleteAnchor() }
            .modifier(ConversationForwardSheet(composerState: $composerState, picker: forwardPicker))
    }
}

/// **Le menu d'appui long, en `ViewModifier` NOMINAL** (LOT-10) : l'animation,
/// l'overlay — qui pose lui-même le voile commun, le matériau système
/// (`LongPressVeil`, #11222 : l'hôte ne floute plus la conversation) —, la
/// restitution du clavier à la fermeture, les
/// cadres des bulles, et le plein écran du lieu depuis la rangée plate (mêmes
/// primitives que la bulle, présentées ICI parce que la rangée vit dans une
/// cellule de collection).
///
/// #12627 — il OBSERVE le fil : le message tenu se relit à chaque changement,
/// et son retrait referme le menu et les feuilles qui l'exposent.
struct ConversationBodyOverlayMenu<Piece: View, PlaceCover: View>: ViewModifier {
    @Binding var overlayState: ConversationOverlayState
    @Binding var focalFullscreenPlace: FocalFullscreenPlace?
    @Binding var focalShareFileItem: FocalShareFileItem?
    @ObservedObject var viewModel: ConversationViewModel
    let frameTracker: MessageFrameBox
    let accentColor: String
    let isDirect: Bool
    let authority: ConversationMenuAuthority
    let mediaSaveCoordinator: MediaSaveCoordinator
    let actions: ConversationMessageActions
    let threadLanguage: (Message) -> MessageOverlayMenu.ThreadLanguage
    let pieceOverlay: (Message) -> Piece?
    let onMenuClosed: () -> Void
    @ViewBuilder let placeCover: (FocalFullscreenPlace) -> PlaceCover

    func body(content: Content) -> some View {
        content
            .animation(.easeOut(duration: 0.28), value: overlayState.showOverlayMenu)
            .overlay { menuLayer }
            .adaptiveOnChange(of: overlayState.showOverlayMenu) { _, isShowing in
                if !isShowing { onMenuClosed() }
            }
            .adaptiveOnChange(of: overlayState.heldSlots { OverlayHeldMessage.resolve($0, in: viewModel) }) { _, _ in
                followHeldMessage()
            }
            .onPreferenceChange(MessageFramePreferenceKey.self) { frames in
                frameTracker.update(frames)
            }
            .conversationCover(item: $focalFullscreenPlace) { placeCover($0) }
            .sheet(item: $focalShareFileItem) { item in
                ShareSheet(activityItems: [item.url])
            }
    }

    /// **Le menu suit le message vivant** (#12627). Retiré — supprimé pour tous,
    /// échu, sorti du fil —, il se referme avec la feuille « Plus… » et le partage,
    /// et VoiceOver dit pourquoi : rien de retiré ne reste copiable. Accusé, il se
    /// réancre sur l'id servi. Le reste (épingle, réactions) se recompose au rendu.
    private func followHeldMessage() {
        let outcome = overlayState.reconciled { OverlayHeldMessage.resolve($0, in: viewModel) }
        guard outcome.changesState else { return }
        overlayState = outcome.state
        guard outcome.announcesWithdrawal else { return }
        AdaptiveAccessibility.announce(String(localized: "conversation.overlay.message_withdrawn", bundle: .main))
    }

    private var menuLayer: ConversationOverlayMenuLayer<Piece> {
        ConversationOverlayMenuLayer(
            overlayState: $overlayState,
            viewModel: viewModel,
            frameTracker: frameTracker,
            accentColor: accentColor,
            isDirect: isDirect,
            authority: authority,
            mediaSaveCoordinator: mediaSaveCoordinator,
            actions: actions,
            threadLanguage: threadLanguage,
            pieceOverlay: pieceOverlay
        )
    }
}

/// L'overlay d'appui long : modal (`zIndex` 999), il n'a aucun coût de liste.
/// L'aperçu d'une PIÈCE prend la place du menu complet quand le message en
/// porte une (`pieceOverlay`).
///
/// #12627 — il se monte depuis le message RELU dans le fil, jamais depuis la
/// copie du geste : une épingle reçue, un `cid_` accusé recomposent le contexte
/// et l'aperçu sans changer l'identité de la vue, donc sans rejouer l'entrée.
struct ConversationOverlayMenuLayer<Piece: View>: View {
    @Binding var overlayState: ConversationOverlayState
    @ObservedObject var viewModel: ConversationViewModel
    let frameTracker: MessageFrameBox
    let accentColor: String
    let isDirect: Bool
    let authority: ConversationMenuAuthority
    let mediaSaveCoordinator: MediaSaveCoordinator
    let actions: ConversationMessageActions
    let threadLanguage: (Message) -> MessageOverlayMenu.ThreadLanguage
    let pieceOverlay: (Message) -> Piece?

    var body: some View {
        if overlayState.showOverlayMenu, let held = overlayState.overlayMessage,
           let msg = OverlayHeldMessage.resolve(held, in: viewModel).liveMessage {
            if let piece = pieceOverlay(msg) {
                piece
            } else {
                menu(for: msg)
                    .transition(.opacity)
                    .zIndex(999)
            }
        }
    }

    private func menu(for msg: Message) -> some View {
        ConversationOverlayMenu(
            viewModel: viewModel,
            overlayState: $overlayState,
            msg: msg,
            accentColor: accentColor,
            bubbleFrame: overlayState.overlaySourceFrame ?? frameTracker.frame(for: msg.id) ?? .zero,
            threadLanguage: threadLanguage(msg),
            isDirect: isDirect,
            authority: authority,
            mediaSaveCoordinator: mediaSaveCoordinator,
            actions: actions
        )
    }
}
