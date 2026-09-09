import SwiftUI
import MeeshySDK
import MeeshyUI

// Couches PARTAGÉES par les deux racines de fenêtre (`RootView`, `iPadRootView`).
//
// Pourquoi des `ViewModifier` NOMINAUX et non des fonctions `some View` (#5837) :
// la profondeur du type concret d'un `body` coûte ~17 Ko de pile par niveau au
// décodeur de métadonnées Swift, et la pile principale de l'appareil fait
// 1008 Ko. Une chaîne de 46 modificateurs sur la racine imbrique 46 niveaux
// dans UN seul type — et ce type est matérialisé au fond de la pile de CHAQUE
// vue que la racine héberge. Un `ViewModifier` nominal coupe la chaîne : le
// parent ne voit qu'un nom (`ModifiedContent<…, RootStatusBubbleLayer>`), et
// `body(content:)` est évalué par AttributeGraph dans son propre nœud, pile
// déroulée. Une fonction générique `(some View) -> some View` NE coupe RIEN :
// son type opaque se re-niche intégralement chez l'appelant.
//
// L'ORDRE des modificateurs à l'intérieur d'une couche est celui qu'ils avaient
// dans la chaîne de la racine : une feuille présentée sous un
// `environmentObject` ne voit pas le même environnement qu'au-dessus.

/// Fond thématique (dégradé + orbes rasterisés), identique sur iPhone et iPad.
struct RootThemedBackground: View {
    @ObservedObject var theme: ThemeManager

    var body: some View {
        ZStack {
            theme.backgroundGradient

            ForEach(Array(theme.ambientOrbs.enumerated()), id: \.offset) { _, orb in
                Circle()
                    .fill(Color(hex: orb.color).opacity(orb.opacity))
                    .frame(width: orb.size, height: orb.size)
                    .blur(radius: orb.size * 0.25)
                    .offset(x: orb.offset.x, y: orb.offset.y)
            }
        }
        .drawingGroup()  // Rasterise l'ensemble en une seule texture Metal — zéro composition par frame
        .ignoresSafeArea()
    }
}

/// Toast de notification temps réel (socket), monté au sommet du `ZStack`
/// racine. Un appui long OU un tirage vers le bas ouvre l'aperçu de la
/// conversation au lieu de naviguer.
struct RootNotificationToastOverlay: View {
    @ObservedObject var notificationManager: NotificationToastManager
    let suppressToastTap: Bool
    let onTap: (SocketNotificationEvent) -> Void
    let onPreview: (SocketNotificationEvent) -> Void

    var body: some View {
        VStack {
            if let toast = notificationManager.currentToast {
                NotificationToastView(event: toast) {
                    if suppressToastTap { return }
                    notificationManager.dismissToast()
                    onTap(toast)
                }
                .simultaneousGesture(
                    LongPressGesture(minimumDuration: 0.35).onEnded { _ in
                        onPreview(toast)
                    }
                )
                .simultaneousGesture(
                    DragGesture(minimumDistance: 24)
                        .onEnded { value in
                            if value.translation.height > 36 {
                                onPreview(toast)
                            }
                        }
                )
                .transition(.move(edge: .top).combined(with: .opacity))
                .padding(.top, MeeshySpacing.xxl)
            }
            Spacer()
        }
        .animation(MeeshyAnimation.springDefault, value: notificationManager.currentToast?.id)
        .zIndex(201)
    }
}

/// Hôte UNIQUE de la bulle de mood pour toute la fenêtre, et les deux feuilles
/// que la bulle ou un lien de partage ouvrent depuis la racine.
///
/// La bulle se rend dans le repère de CE conteneur — poser l'hôte plus bas
/// (liste, carte de feed, tray…) faisait rendre une bulle par hôte frère,
/// chacune décalée dans son propre repère (bug 2026-07-30). Les présentations
/// modales gardent leur propre pose : l'overlay racine est invisible sous
/// elles. Cf. `StatusBubbleOverlayModifier`.
struct RootStatusBubbleLayer: ViewModifier {
    /// Ce qui, en changeant, ferme la bulle : `router.path` sur iPhone, la
    /// route du panneau droit sur iPad. Une bulle est un popover contextuel :
    /// elle ne survit pas à une navigation (sinon elle se ré-ancre absurdement
    /// sur l'écran suivant).
    let navigationToken: AnyHashable
    @Binding var shareLinkChoice: ShareLinkIdentityChoice?
    @Binding var republishStatusEntry: StatusEntry?
    let statusViewModel: StatusViewModel
    let onContinueWithAccount: (String) -> Void
    let onJoinAnonymously: (String) -> Void

    func body(content: Content) -> some View {
        content
            .withStatusBubble()
            .adaptiveOnChange(of: navigationToken) { _, _ in
                if StatusBubbleController.shared.currentEntry != nil {
                    StatusBubbleController.shared.dismiss()
                }
            }
            // Le lien de partage demande QUI entre. La feuille ne se monte que
            // lorsque le choix existe vraiment : déjà membre, ou lien exigeant un
            // compte, `ShareLinkEntryPolicy` a déjà tranché sans rien demander.
            .sheet(item: $shareLinkChoice) { choice in
                ShareLinkIdentitySheet(
                    choice: choice,
                    accountDisplayName: AuthManager.shared.currentUser?.displayName
                        ?? AuthManager.shared.currentUser?.username
                        ?? String(localized: "shareLink.identity.account.fallback", defaultValue: "mon compte"),
                    accountUsername: AuthManager.shared.currentUser?.username,
                    onContinueWithAccount: { onContinueWithAccount(choice.identifier) },
                    // La session invitée est portée par `MeeshyApp`, au-dessus de
                    // cette vue : on lui passe l'intention plutôt que d'essayer de
                    // présenter le conteneur invité depuis ici.
                    onJoinAnonymously: { onJoinAnonymously(choice.identifier) }
                )
            }
            // Lot 4.7 — la republication d'un mood passe par le MEUBLE. La porte
            // PORTE son format (`sourceFormat: .status`) au lieu de le deviner :
            // une entrée de bulle de mood EST un statut par construction.
            // `repostOfId` n'est pas dans la graine : la porte le porte déjà
            // (`ofPostId:`), et le meuble le lit par `ComposerOrigin.repostedPostId`.
            // Ce site ne sème pas `visibility:` — DÉLIBÉRÉ : `APIPost.toStatusEntry()`
            // ne transmet pas l'audience de l'original (cf. `StoryModels.swift`).
            // Gardes : `ComposerDocumentSurfaceTests`
            // `.test_leRepostDUnMood_offreLAncrage_ET_unEcranLePeint`,
            // `ComposerMoodSurfaceTests`
            // `.test_laPorteDuMood_aiguilleSurLeFORMAT_etRefuseLesDeuxQuElleNeSaitPasPublier`.
            .sheet(item: $republishStatusEntry) { entry in
                MoodComposerDoor(
                    intent: ComposerIntent(origin: .repost(ofPostId: entry.id, sourceFormat: .status)),
                    seed: ComposerMoodSeed(
                        emoji: entry.moodEmoji,
                        text: entry.content,
                        viaUsername: entry.username,
                        audioUrl: entry.audioUrl
                    ),
                    viewModel: statusViewModel
                )
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
            }
    }
}

/// Les intentions qui arrivent à la racine par le canal de notifications, le
/// push, la carte Now Playing et les URL — et ce que chaque racine en fait.
///
/// Les DEUX racines branchent exactement ces neuf récepteurs, dans cet ordre ;
/// seules les actions diffèrent (`router.navigateToConversation` sur iPhone,
/// `openConversation` sur iPad), d'où les fermetures.
struct RootIntentRoutingLayer: ViewModifier {
    let router: Router
    let storyViewModel: StoryViewModel
    let onNavigateToConversation: (Conversation) -> Void
    let onPushNotificationTap: (NotificationPayload) -> Void
    /// `(conversationId, highlightMessageId)`
    let onNavigateToConversationId: (String, String?) -> Void
    let isKnownConversation: (String) -> Bool
    let onSendMessageToUser: (Notification) -> Void
    let onPushNavigateToRoute: (Notification) -> Void

    func body(content: Content) -> some View {
        content
            .onReceive(NotificationCenter.default.publisher(for: .navigateToConversation)) { notification in
                if let conversation = notification.object as? Conversation {
                    onNavigateToConversation(conversation)
                }
            }
            // Drive push-tap navigation straight off the published intent instead
            // of a NotificationCenter post. `@Published` replays its current value
            // to late subscribers, so a cold launch (tap from a terminated app)
            // where this view mounts AFTER the splash + payload was set still
            // receives it. Clearing AFTER we navigate makes this the single
            // consumption point.
            .onReceive(PushNotificationManager.shared.$pendingNotificationPayload) { payload in
                guard let payload, AuthManager.shared.isAuthenticated else { return }
                onPushNotificationTap(payload)
                PushNotificationManager.shared.clearPendingNotification()
            }
            // Navigation par id demandée par une vue sans accès aux helpers de
            // résolution (StarredMessagesView) — le highlight scopé est déjà parké
            // sur le Router par l'émetteur.
            .onReceive(NotificationCenter.default.publisher(for: .meeshyNavigateToConversation)) { notification in
                guard let conversationId = notification.object as? String, !conversationId.isEmpty else { return }
                onNavigateToConversationId(conversationId, router.pendingHighlightMessageId)
            }
            // Tap sur la carte Now Playing (l'app est simplement ré-ouverte) →
            // ramène vers la conversation et le message audio en cours de lecture.
            .nowPlayingReturnNavigation(router: router, isKnownConversation: isKnownConversation)
            .onReceive(NotificationCenter.default.publisher(for: Notification.Name("sendMessageToUser"))) { notification in
                onSendMessageToUser(notification)
            }
            .onReceive(NotificationCenter.default.publisher(for: Notification.Name("openProfileSheet"))) { notification in
                guard let info = notification.object as? [String: String],
                      let userId = info["userId"] else { return }
                let username = info["username"] ?? userId
                router.deepLinkProfileUser = ProfileSheetUser(userId: userId, username: username)
            }
            // Phase H — `StoryExpiredContent` posts `.openStoryComposer` from the
            // notification flow when the underlying story is gone. Routing the
            // composer through `StoryViewModel.showStoryComposer` reuses the
            // single existing presentation surface so the composer animates in
            // cleanly without stacking covers.
            .onReceive(NotificationCenter.default.publisher(for: .openStoryComposer)) { _ in
                storyViewModel.showStoryComposer = true
            }
            .onReceive(NotificationCenter.default.publisher(for: Notification.Name("pushNavigateToRoute"))) { notification in
                onPushNavigateToRoute(notification)
            }
            .onOpenURL { url in
                // Only the share intent flows through Router here — every other
                // destination (joinLink/chatLink/conversation/magicLink) is
                // already routed via MeeshyApp's `.onOpenURL` → DeepLinkRouter →
                // pendingDeepLink → handleDeepLink. Letting Router.handleDeepLink
                // process those a second time double-fires the API call and
                // races the navigation with the pendingDeepLink path.
                if case .share = DeepLinkParser.parse(url) {
                    router.handleDeepLink(url)
                }
            }
    }
}
