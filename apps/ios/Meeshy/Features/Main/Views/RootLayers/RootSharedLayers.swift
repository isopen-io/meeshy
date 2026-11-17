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
/// racine. Un appui long ouvre l'aperçu de la conversation (#8723) ; un
/// BALAYAGE VERS LE HAUT la ferme, la carte suivant le doigt. TIRÉE VERS LE
/// BAS (#18721), la carte s'ouvre comme un TIROIR : son haut reste accroché,
/// son bord bas suit le doigt avec une résistance franche, elle s'élargit, et
/// au seuil elle s'arme (haptique, poignée à l'accent). Relâchée avant, elle
/// se referme en ressort ; au-delà, elle se transforme continûment en la
/// FEUILLE de la conversation, ouverte en REGARD, donc laissée non lue
/// jusqu'au premier acte de l'utilisateur (`PeekReadLaw`). Le toucher, lui,
/// ouvre et consomme.
struct RootNotificationToastOverlay: View {
    @ObservedObject var notificationManager: NotificationToastManager
    let suppressToastTap: Bool
    let onTap: (SocketNotificationEvent) -> Void
    let onPreview: (SocketNotificationEvent) -> Void
    /// La feuille que la bannière TIRÉE devient : ouverte au cran grand, là
    /// où l'enveloppe du morphisme s'est posée.
    let onPulledOpen: (SocketNotificationEvent) -> Void
    /// Le tiroir commence à s'ouvrir : la conversation se lit en cache avant
    /// même la levée du doigt.
    var onPullBegan: (SocketNotificationEvent) -> Void = { _ in }
    /// D'où l'enveloppe peint les derniers messages en cache de la
    /// conversation : jamais un vide entre la bannière et la feuille.
    var envelopeSource = BannerEnvelopeSource()

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// Sur iPad la feuille est un formulaire centré : la carte n'a pas de
    /// cadre où se poser, la feuille paraît par sa propre présentation.
    @Environment(\.horizontalSizeClass) private var sizeClass
    /// La traction verticale du doigt : la SEULE valeur que la carte projette
    /// (ouverture du tiroir, largeur, armement) — aucune animation empilée.
    @State private var pull: CGFloat = 0
    /// Le cadre GLOBAL de la carte, tiroir compris : le départ du morphisme.
    @State private var cardFrame: CGRect = .zero
    /// La bannière qui devient la feuille : l'identité de la transformation en
    /// cours, peinte par `BannerMorphWindow`.
    @State private var morphId: UUID?
    /// Une traction n'est jamais un toucher : le bouton émet le sien à la levée.
    @State private var tapLatch = NotificationBannerTapLatch()

    var body: some View {
        VStack {
            if let toast = notificationManager.currentToast {
                card(toast)
                    .transition(reduceMotion ? .opacity : .move(edge: .top).combined(with: .opacity))
                    .padding(.top, MeeshySpacing.xxl)
            }
            Spacer()
        }
        .animation(reduceMotion ? .easeOut(duration: 0.2) : MeeshyAnimation.springBouncy,
                   value: notificationManager.currentToast?.id)
        .task(id: morphId) { await runMorph() }
        .zIndex(201)
        #if DEBUG
        .task { await Self.presentLaunchPreviewIfRequested(on: notificationManager) }
        #endif
    }

    private var drawer: NotificationToastDrawer {
        NotificationToastDrawer.pulled(translation: pull, restInset: MeeshySpacing.sm, reduceMotion: reduceMotion)
    }

    private func card(_ toast: SocketNotificationEvent) -> some View {
        NotificationToastView(
            event: toast,
            // #7167 — la présentation est résolue à la POSE du toast ;
            // la vue la place, elle ne la recalcule pas à chaque corps.
            presentation: notificationManager.currentToastPresentation,
            onTap: { openTapped(toast) },
            onDismiss: { notificationManager.dismissToast() },
            drawer: drawer
        )
        .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { cardFrame = $0 }
        .offset(y: NotificationBannerDrawer.lift(translation: pull))
        .adaptiveOnChange(of: pull) { previous, translation in
            tapLatch = tapLatch.notingPull(translation: translation, at: Date())
            if previous == 0, translation > 0 { onPullBegan(toast) }
            if NotificationBannerDrawer.isArmed(translation: translation) != NotificationBannerDrawer.isArmed(translation: previous) {
                HapticFeedback.light()
            }
        }
        .simultaneousGesture(
            LongPressGesture(minimumDuration: 0.35).onEnded { _ in
                onPreview(toast)
            }
        )
        .simultaneousGesture(
            DragGesture(minimumDistance: NotificationBannerPull.minimumPull)
                .onChanged { pull = $0.translation.height }
                .onEnded { release($0, toast: toast) }
        )
        // L'équivalent du geste pour VoiceOver : ouvrir sans marquer lu.
        .accessibilityAction(named: Text(String(
            localized: "notifications.banner.peekAction",
            defaultValue: "Regarder sans marquer lu"
        ))) { openPulled(toast) }
    }

    /// #6999 — taper un toast OUVRE le contenu : la notification est
    /// consommée, exactement comme une ligne de cloche tapée.
    private func openTapped(_ toast: SocketNotificationEvent) {
        if suppressToastTap || !tapLatch.admitsTap(at: Date()) { return }
        notificationManager.dismissToast()
        let consumedId = toast.id
        Task { @MainActor in
            await NotificationToastManager.shared.consume(.notification(id: consumedId))
        }
        onTap(toast)
    }

    /// La levée du doigt : le HAUT ferme (loi inchangée), le BAS est une
    /// traction que `NotificationBannerPull` tranche — refermer ou ouvrir.
    private func release(_ value: DragGesture.Value, toast: SocketNotificationEvent) {
        tapLatch = tapLatch.notingRelease(at: Date())
        let translation = value.translation.height
        let predictedEnd = value.predictedEndTranslation.height
        if NotificationBannerSwipe.outcome(translation: translation, predictedEnd: predictedEnd) == .dismiss {
            pull = 0
            notificationManager.dismissToast()
            return
        }
        switch NotificationBannerPull.outcome(translation: translation, predictedEnd: predictedEnd) {
        case .cancel:
            springBack()
        case .open:
            openPulled(toast)
        }
    }

    /// Le tiroir relâché en deçà se referme en ressort : rien n'a changé.
    private func springBack() {
        meeshyWithAnimation(MeeshyMotion.bannerPull(reduce: false), reduced: MeeshyMotion.bannerPull(reduce: true),
                            reduceMotion: reduceMotion) { pull = 0 }
    }

    /// La bannière tirée devient la feuille de sa conversation. Une
    /// notification de message l'ouvre EN REGARD et ne se consomme pas : rien
    /// n'a été lu. Les autres s'ouvrent comme au toucher. La feuille passe par
    /// l'aiguillage de l'appui long (verrou PIN, cache, réseau) : le regard ne
    /// contourne aucune garde.
    private func openPulled(_ toast: SocketNotificationEvent) {
        if suppressToastTap { return springBack() }
        guard let conversationId = PeekReadLaw.peekTarget(type: toast.notificationType, conversationId: toast.conversationId) else {
            pull = 0
            openTapped(toast)
            return
        }
        PeekOpeningRequests.request(conversationId)
        HapticFeedback.medium()
        beginMorph(from: toast)
    }

    /// Pose l'enveloppe à la place exacte du tiroir relâché, la bannière
    /// s'effaçant dans la même image ; `runMorph` la fait ensuite devenir la
    /// feuille. Sous « Réduire les animations », ou sur iPad, pas d'enveloppe :
    /// la feuille paraît par sa propre présentation.
    private func beginMorph(from toast: SocketNotificationEvent) {
        guard !reduceMotion, sizeClass == .compact else {
            pull = 0
            onPulledOpen(toast)
            return
        }
        let released = cardFrame.insetBy(dx: drawer.sideInset ?? MeeshySpacing.sm, dy: 0)
        guard let target = BannerMorphWindow.sheetTarget(topGap: NotificationSheetGeometry.topGap) else {
            pull = 0
            onPulledOpen(toast)
            return
        }
        let presentation = notificationManager.currentToastPresentation
        let morph = BannerMorph(event: toast, headline: presentation?.headline ?? toast.toastAvatarName,
                                message: presentation?.body, origin: released, target: target)
        if let conversationId = toast.conversationId { ConversationOpeningPaint.forget(conversationId) }
        var instant = Transaction()
        instant.disablesAnimations = true
        withTransaction(instant) {
            pull = 0
            notificationManager.dismissToast()
        }
        guard BannerMorphWindow.shared.show(morph, source: envelopeSource) else {
            onPulledOpen(toast)
            return
        }
        morphId = morph.id
    }

    /// L'enveloppe a été peinte à la taille du tiroir et grandit jusqu'à la
    /// feuille (`BannerMorphHost`). Posée, la feuille réelle se présente À SA
    /// PLACE, sans animation, DESSOUS l'enveloppe ; celle-ci ne s'efface qu'une
    /// fois la feuille peinte de ses messages (`NotificationBannerHandoff`).
    /// Lancée par `.task(id:)`, donc après la première image de l'enveloppe.
    private func runMorph() async {
        let stage = BannerMorphWindow.shared.stage
        guard let id = morphId, let event = stage.morph?.event else { return }
        guard await cancellableSleep(for: MeeshyMotion.bannerMorphSettle) else { return BannerMorphWindow.shared.hide(id) }
        var inPlace = Transaction()
        inPlace.disablesAnimations = true
        withTransaction(inPlace) { onPulledOpen(event) }
        guard await awaitSheetPaint(of: event.conversationId ?? "", on: stage) else { return BannerMorphWindow.shared.hide(id) }
        stage.fading = true
        _ = await cancellableSleep(for: MeeshyMotion.bannerMorphFadeOut)
        BannerMorphWindow.shared.hide(id)
        if morphId == id { morphId = nil }
    }

    /// Le relais : le voile de l'enveloppe cède dès que la feuille est à
    /// l'écran, l'enveloppe elle-même dès qu'elle a peint — ou au plafond.
    private func awaitSheetPaint(of conversationId: String, on stage: BannerMorphStage) async -> Bool {
        let handedAt = Date()
        while !NotificationBannerHandoff.releasesEnvelope(
            morphSettled: true,
            sheetPainted: ConversationOpeningPaint.reached(.painted, for: conversationId),
            waited: Date().timeIntervalSince(handedAt)
        ) {
            if !stage.sheetShown, ConversationOpeningPaint.reached(.shown, for: conversationId) { stage.sheetShown = true }
            guard await cancellableSleep(for: .milliseconds(16)) else { return false }
        }
        stage.sheetShown = true
        return await cancellableSleep(for: MeeshyMotion.bannerSheetHandoff)
    }

    #if DEBUG
    /// Recette DEBUG (#8723) : `-MeeshyBannerPreview audio` pose, deux secondes
    /// après l'ouverture, la bannière de la capture porteur (un vocal dont la
    /// passerelle a déjà composé le libellé) — sans socket ni envoi.
    /// `-MeeshyBannerConversation <id>` (#8822) la rattache à une conversation
    /// réelle du compte : la tirer vers le bas ouvre alors son aperçu.
    private static func presentLaunchPreviewIfRequested(on manager: NotificationToastManager) async {
        let arguments = ProcessInfo.processInfo.arguments
        guard arguments.contains("-MeeshyBannerPreview") else { return }
        guard await cancellableSleep(for: .seconds(2)) else { return }
        let conversationId = arguments.firstIndex(of: "-MeeshyBannerConversation")
            .flatMap { arguments.indices.contains($0 + 1) ? arguments[$0 + 1] : nil }
            .flatMap { $0.allSatisfy(\.isHexDigit) ? $0 : nil } ?? ""
        let fixture = #"""
        {"id":"preview-8723","userId":"me","type":"new_message","title":"Abed Dollar",
         "content":"🎵 Audio · 0:32 · 193 Ko",
         "actor":{"id":"preview-actor","displayName":"Abed Dollar"},
         "context":{"conversationType":"direct","conversationId":"CONVERSATION_ID"},
         "metadata":{"commentPreview":"🎵 Audio · 0:32 · 193 Ko","attachments":{"count":1,"firstType":"audio"}}}
        """#.replacingOccurrences(of: "CONVERSATION_ID", with: conversationId)
        guard let event = try? JSONDecoder().decode(SocketNotificationEvent.self, from: Data(fixture.utf8)) else { return }
        manager.presentPreviewToast(event)
    }
    #endif
}

/// La bannière qui devient la feuille : ce qu'elle montre, d'où elle part,
/// où elle arrive.
struct BannerMorph: Identifiable {
    let id = UUID()
    let event: SocketNotificationEvent
    let headline: String
    let message: String?
    let origin: CGRect
    let target: CGRect
}

/// Où l'enveloppe lit la conversation tirée et ses derniers messages en
/// cache. Sans chargeur (iPad), elle ne peint que l'identité.
struct BannerEnvelopeSource {
    var loader: ConversationListPreviewLoader?
    var conversation: (String) -> Conversation? = { _ in nil }
}

/// Ce que la fenêtre de l'enveloppe peint : l'enveloppe, et où en est son
/// relais à la feuille.
@MainActor
final class BannerMorphStage: ObservableObject {
    nonisolated deinit {}
    @Published var morph: BannerMorph?
    @Published var sheetShown = false
    @Published var fading = false
}

/// L'enveloppe vit dans sa propre fenêtre passe-plat : la feuille qu'elle
/// devient est une présentation, que rien de la racine ne recouvre. Elle
/// n'existe que le temps de la transformation et ne prend aucun toucher.
@MainActor
final class BannerMorphWindow {
    static let shared = BannerMorphWindow()
    static let windowLevel = UIWindow.Level(rawValue: UIWindow.Level.normal.rawValue + 1)

    let stage = BannerMorphStage()
    private var window: CallPassthroughWindow?

    /// Le cadre, en coordonnées d'écran, où la feuille se pose : la fenêtre
    /// principale et le haut de SA zone sûre — jamais la zone sûre SwiftUI de
    /// la racine, que des bandeaux de l'app (barre du jeu) agrandissent.
    static func sheetTarget(topGap: CGFloat) -> CGRect? {
        guard let main = CallWindowScene.target()?.windows.first(where: { $0.isKeyWindow }) else { return nil }
        return NotificationBannerMorph.sheetFrame(container: main.bounds.size, top: main.safeAreaInsets.top + topGap)
    }

    nonisolated deinit {}

    func show(_ morph: BannerMorph, source: BannerEnvelopeSource) -> Bool {
        guard let scene = CallWindowScene.target() else { return false }
        hide()
        stage.sheetShown = false
        stage.fading = false
        stage.morph = morph
        let overlay = CallPassthroughWindow(windowScene: scene)
        let controller = UIHostingController(rootView: BannerMorphHost(stage: stage, source: source))
        controller.view.backgroundColor = .clear
        if #available(iOS 16.4, *) { controller.safeAreaRegions = [] }
        overlay.windowLevel = Self.windowLevel
        overlay.overrideUserInterfaceStyle = DeviceLayout.measurementWindow?.overrideUserInterfaceStyle ?? .unspecified
        overlay.rootViewController = controller
        overlay.interactiveFrame = .zero
        overlay.isHidden = false
        window = overlay
        return true
    }

    /// Retire l'enveloppe `id` seulement : une transformation remplacée ne
    /// retire jamais celle qui l'a remplacée.
    func hide(_ id: UUID) {
        guard stage.morph?.id == id else { return }
        hide()
    }

    func hide() {
        stage.morph = nil
        guard let overlay = window else { return }
        window = nil
        overlay.isHidden = true
        overlay.rootViewController = nil
    }
}

/// L'enveloppe peinte dans sa fenêtre : elle grandit dès sa première image,
/// porte les derniers messages en cache, et s'efface quand la feuille a peint.
struct BannerMorphHost: View {
    @ObservedObject var stage: BannerMorphStage
    let source: BannerEnvelopeSource
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var progress: CGFloat = 0

    var body: some View {
        ZStack {
            if let morph = stage.morph { envelope(morph) }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .ignoresSafeArea()
    }

    private func envelope(_ morph: BannerMorph) -> some View {
        BannerToConversationMorph(
            event: morph.event, headline: morph.headline, message: morph.message,
            origin: morph.origin, target: morph.target,
            targetCornerRadius: NotificationSheetGeometry.cornerRadius,
            surface: NotificationSheetGeometry.surface,
            sheetShown: stage.sheetShown, fading: stage.fading,
            progress: progress
        ) {
            NotificationEnvelopeMessages(
                conversation: source.conversation(morph.event.conversationId ?? ""),
                loader: source.loader, width: morph.target.width
            )
        }
        .opacity(stage.fading ? 0 : 1)
        .animation(reduceMotion ? MeeshyMotion.reducedFade : MeeshyAnimation.bannerMorphFade, value: stage.fading)
        .task(id: morph.id) {
            meeshyWithAnimation(MeeshyMotion.bannerMorph(reduce: false), reduced: MeeshyMotion.bannerMorph(reduce: true),
                                reduceMotion: reduceMotion) { progress = 1 }
        }
    }
}

/// La feuille de la conversation que la bannière devient, telle que le
/// système la pose au cran « grand » : son haut SUR la zone sûre, ses coins,
/// son fond. Mesurée au simulateur (iPhone 17 Pro, iOS 27 : haut à 62 pt) ;
/// l'enveloppe s'y pose pour que la feuille réelle arrive sans saut.
enum NotificationSheetGeometry {
    static let topGap: CGFloat = 0
    static let cornerRadius: CGFloat = 38
    static var surface: Color { Color(uiColor: .systemBackground) }
}

/// Hôte UNIQUE de la bulle de mood pour toute la fenêtre, et les deux feuilles
/// que la bulle ou un lien de partage ouvrent depuis la racine.
///
/// La bulle se rend dans le repère de CE conteneur — poser l'hôte plus bas
/// (liste, carte de feed, tray…) faisait rendre une bulle par hôte frère,
/// chacune décalée dans son propre repère. Les présentations
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
            // La page d'invitation (#7795) — elle ne se monte que pour un lien
            // qu'on n'a pas encore rejoint : déjà membre, `ShareLinkEntryPolicy`
            // ouvre la conversation sans rien montrer.
            .sheet(item: $shareLinkChoice) { choice in
                ShareLinkIdentitySheet(
                    choice: choice,
                    accountDisplayName: AuthManager.shared.currentUser?.displayName
                        ?? AuthManager.shared.currentUser?.username
                        ?? "",
                    accountAvatarURL: AuthManager.shared.currentUser?.avatar,
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
    @Environment(\.rootNavigationHandoff) private var navigationHandoff
    @State private var rootToken = UUID()

    /// Rouvre le composer de story démonté avec la racine précédente, sur son brouillon (une fois).
    private func reopenTornDownComposer() {
        guard let draftId = navigationHandoff?.takeComposerToReopen(
            presentingComposer: storyViewModel.showStoryComposer, root: rootToken) else { return }
        storyViewModel.openComposer(resumingDraftId: draftId)
    }

    func body(content: Content) -> some View {
        content
            // La porte du verrou PIN (#11386) : toute ouverture retenue par le
            // routeur se présente ici, sur les deux racines.
            .modifier(ConversationLockGateLayer(router: router))
            .onAppear {
                navigationHandoff?.rootAppeared(rootToken)
                reopenTornDownComposer()
            }
            .onDisappear { navigationHandoff?.rootDisappeared(rootToken) }
            // Démontage annoncé APRÈS le montage de cette racine : l'ordre des deux n'est pas garanti.
            // Différé d'un tour, pour que `AdaptiveRootView` ait noté le brouillon.
            .onReceive(NotificationCenter.default.publisher(for: .storyComposerTornDown)) { _ in
                DispatchQueue.main.async { reopenTornDownComposer() }
            }
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
