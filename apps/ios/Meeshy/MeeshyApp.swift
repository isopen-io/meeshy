import SwiftUI
import Combine
import UserNotifications
import MeeshySDK
import MeeshyUI
import os

struct MeeshyApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    let dependencies = DependencyContainer.shared
    @StateObject private var authManager = AuthManager.shared
    @StateObject private var toastManager = FeedbackToastManager.shared
    @StateObject private var pushManager = PushNotificationManager.shared
    @StateObject var deepLinkRouter = DeepLinkRouter.shared
    @StateObject private var theme = ThemeManager.shared
    @StateObject private var a11yPrefs = MeeshyAccessibilityPreferences.shared
    /// La célébration de l'arrivée, au-dessus de la racine connectée.
    @StateObject private var arrivalCelebration = ArrivalCelebrationController.shared
    @AppStorage("hasCompletedOnboarding") private var hasCompletedOnboarding = false
    /// Le splash et sa loi de vie : il tombe dès que la session et la
    /// liste en cache sont prêtes, et à son plafond quoi que fasse le démarrage.
    @StateObject var launchSplash = LaunchSplashController()
    @State var hasCheckedSession = false
    @State private var activeGuestSession: GuestSession?
    /// Le contenu d'un lien ouvert sans session, au-dessus de la connexion.
    @StateObject private var visitorPresenter = VisitorContentPresenter.shared
    @State private var crashReportsToShow: [CrashDiagnostic] = []
    @State private var showCrashSheet = false
    @State private var hasSurfacedCrashReports = false
    @Environment(\.colorScheme) private var colorScheme

    private var shouldShowOnboarding: Bool {
        !hasCompletedOnboarding && !authManager.isAuthenticated
    }

    // Kept alive for the process lifetime so the Combine pipeline is never
    // deallocated. A static var on the App struct survives SwiftUI re-evaluations.
    private static var nearCapacityCancellable: AnyCancellable?

    init() {
        // Prisme Linguistique — l'override de langue UI est écrit AVANT
        // `UIApplicationMain`, par `MeeshyLaunch.main()` : le bundle fige sa
        // localisation au lancement, un override tardif ne l'atteindrait pas.

        // Les extensions de notification tournent dans leur propre
        // processus : elles lisent cette langue dans le groupe d'app, et les
        // catégories que l'AppDelegate enregistre juste après aussi.
        UILanguageOverride.publishInterfaceLanguage()

        // Le mot qui me désigne dans le préfixe d'auteur d'une ligne de liste.
        // Lu APRÈS l'override de `MeeshyLaunch.main()` : c'est lui
        // qui décide dans quelle langue le catalogue va répondre.
        //
        // Le SDK ne lit pas le catalogue de l'app ; il reçoit ce mot une fois,
        // et ses chemins (pont socket, moteur de synchro) le relaient.
        ConversationListAuthor.configureReaderLabel(ConversationListViewModel.youAuthorLabel)

        // Sortie de bêta : la clé de la préférence « Activer les bêta » est effacée de l'appareil.
        LentilleFeatureFlag.removeRetiredBetaPreference()

        // Publier, inviter par e-mail ou créer un lien sans adresse
        // prouvée ouvre la validation, puis la requête repart (`APIClient`).
        EmailVerificationGate.current = EmailVerificationGateController.shared

        #if DEBUG
        // Filet de diagnostic dev : capture la stack des SIGSEGV que
        // ReportCrash throttle et que MetricKit tronque (stack overflows du
        // décodeur de métadonnées — cf. ConversationFirstRenderWarmup).
        CrashStackDumper.install()
        #endif

        // Task 1.3 — register the BGProcessingTask identifier BEFORE the
        // scene is created. `BGTaskScheduler.register` MUST run before
        // `application(_:didFinishLaunchingWithOptions:)` returns, which
        // for SwiftUI apps means inside the App initializer. Registering
        // later (e.g. in `.task`) is a programmer error and crashes with
        // a clear "All launch handlers must be registered before
        // application finishes launching" exception. The coordinator
        // submits the request later, when `willTerminate` fires.
        CacheBackgroundFlushTask().register()

        // Wire the "is a call active?" guard into both socket
        // managers. While a call is active, `forceReconnect()` (token rotation,
        // re-auth, lifecycle) is suppressed so the realtime socket carrying the
        // WebRTC signaling is never torn down mid-call (which strands the call on
        // "connecting" + leaves a phantom). The closure reads a thread-safe
        // nonisolated flag — the SDK stays call-agnostic (SDK purity).
        MessageSocketManager.shared.isCallActiveGuard = { CallManager.isCallActiveFlag }
        SocialSocketManager.shared.isCallActiveGuard = { CallManager.isCallActiveFlag }

        // Surface a one-shot toast when the offline outbox reaches 80% of its
        // 500-item capacity. removeDuplicates() in nearCapacityPublisher ensures
        // the toast fires exactly once per true→false→true crossing, not on
        // every new enqueue while near capacity.
        //
        // Le saut sur le main PRÉCÈDE le filter : `OfflineQueue` est un actor
        // et émet depuis son exécuteur. Une fermeture écrite ici est isolée au
        // MainActor ; reçue hors du main, elle trappe
        // (`_dispatch_assert_queue_fail`) — même forme que le plantage
        // TestFlight 1915/1916. Garde : OffMainCombineHopSourceGuardTests.
        Self.nearCapacityCancellable = OfflineQueue.shared.nearCapacityPublisher
            .receive(on: DispatchQueue.main)
            .filter { $0 }
            .sink { _ in
                Task { @MainActor in
                    FeedbackToastManager.shared.showError(
                        String(localized: "offline.queue.near_capacity",
                               defaultValue: "File d'envoi presque pleine — reconnectez-vous pour vider la file.",
                               bundle: .main)
                    )
                }
            }

        // Arrière-plan, retour et ouverture/fermeture de session : une fois par
        // transition de l'APPLICATION, même quand l'iPad a fermé la fenêtre
        // principale (`AppLifecycleHooks`).
        Self.installApplicationLifecycleHooks()
    }

    /// L'aperçu DEBUG de l'onboarding REMPLACE l'écran de connexion au lieu de
    /// s'y superposer : un frère de `ZStack` est proposé la taille du plus
    /// grand, et `LoginView` en arabe sur iPhone SE en annonce 666 pour 647 —
    /// le calque débordait alors de 19 pt, coupant son bouton au bord.
    private static var onboardingPreviewReplacesLogin: Bool {
        #if DEBUG
        OnboardingPreviewLaunch.isActive
        #else
        false
        #endif
    }

    var body: some Scene {
        WindowGroup {
            // UNE fenêtre principale : une seconde copie ouverte par le système renvoie vers la première
            // (`MainWindowGate`, AdaptiveRootView.swift).
            MainWindowGate {
            SystemThemeDetector {
                ZStack {
                    Group {
                        if authManager.isAuthenticated {
                            AdaptiveRootView()
                                // Les listes `@` du SDK servent les
                                // mêmes contacts que celles de l'app, réchauffés
                                // de la même façon.
                                .environment(\.mentionContactsProvider, MentionContactsAudienceBridge())
                                .modifier(ProfileSheetEnvironment())
                        } else if hasCheckedSession && !Self.onboardingPreviewReplacesLogin && !authManager.isSwitchingAccount {
                            LoginView()
                                .safeAreaInset(edge: .top, spacing: 0) {
                                    PendingLinkNotice(isVisible: deepLinkRouter.pendingDeepLink?.opensAfterSignIn == true)
                                }
                                .animation(.easeOut(duration: 0.25), value: deepLinkRouter.pendingDeepLink)
                                // Un lien d'appel reçu avant que la session soit relue
                                // n'attend pas la connexion : se connecter ne relance rien.
                                .onAppear { deepLinkRouter.discardPendingCallRequest() }
                                // La fermeture prononcée par le serveur s'explique AVANT la reconnexion.
                                .sheet(item: Binding(
                                    get: { authManager.sessionRevocationNotice },
                                    set: { if $0 == nil { authManager.acknowledgeSessionRevocationNotice() } }
                                )) { notice in
                                    SessionClosedNoticeView(notice: notice) { authManager.acknowledgeSessionRevocationNotice() }
                                }
                        }
                    }
                    .opacity(launchSplash.phase == .covering ? 0 : 1)
                    .accessibilityHidden(arrivalCelebration.isShowing).modifier(ComposerRetoucheRecetteCover())

                    // L'adresse prouvée vient d'ouvrir la session : la
                    // fête passe AVANT l'onboarding, qui l'attend
                    // (`OnboardingHost`), pendant que la racine, montée
                    // dessous, et `ArrivalPrefetcher` remplissent les caches.
                    if authManager.isAuthenticated && arrivalCelebration.isShowing {
                        ArrivalCelebrationView(onSkip: { arrivalCelebration.dismiss() })
                            .transition(.opacity)
                            .zIndex(3)
                    }

                    // Il s'efface d'abord (`fullScreenGate`
                    // coupe touches et VoiceOver), puis quitte l'arbre SANS
                    // transition. Son plafond vit dans SA tâche : aucune attente
                    // du démarrage ne peut le retenir. Voir `LaunchSplashController`.
                    if launchSplash.phase != .gone {
                        SplashScreen()
                            .fullScreenGate(isPresented: launchSplash.phase == .covering)
                            .task { await launchSplash.holdUntilCeiling() }
                            .zIndex(1)
                    }

                    #if DEBUG
                    // Aperçu de l'onboarding pour la vérification au
                    // simulateur — voir `OnboardingPreviewLaunch`.
                    if OnboardingPreviewLaunch.isActive {
                        OnboardingPreviewScreen().zIndex(2)
                    }
                    if ConversationLinkCardPreviewLaunch.isActive {
                        ConversationLinkCardPreviewScreen().zIndex(2)
                    }
                    if ResetPasswordPreviewLaunch.isActive {
                        ResetPasswordPreviewScreen().zIndex(2)
                    }
                    if ForgotPasswordPreviewLaunch.isActive {
                        ForgotPasswordPreviewScreen().zIndex(2)
                    }
                    if LinkSignInConfirmationPreviewLaunch.isActive {
                        LinkSignInConfirmationPreviewScreen().zIndex(2)
                    }
                    #endif
                }
                .meeshyAnimation(.easeInOut(duration: 0.35), value: arrivalCelebration.isShowing)
                // `!isAuthenticated` protège d'un ACCIDENT — un lien traité
                // avant la fin de `checkExistingSession`, qui échouerait un
                // utilisateur connecté dans un flux invité. `isDeliberate`
                // nomme l'INTENTION inverse : quelqu'un qui a un compte et
                // choisit malgré tout d'entrer sans lui. Les deux doivent
                // coexister ; les confondre reviendrait soit à rouvrir
                // l'accident, soit à interdire le choix.
                .fullScreenCover(isPresented: .init(
                    get: { activeGuestSession != nil && (!authManager.isAuthenticated || activeGuestSession?.isDeliberate == true) },
                    set: { if !$0 { dismissGuestSession() } }
                )) {
                    if let guestSession = activeGuestSession {
                        GuestConversationContainer(
                            session: guestSession,
                            onSessionCreated: { ctx in
                                if !AnonymousSessionStore.save(ctx) {
                                    toastManager.showError(String(localized: "guest.session.save.error", defaultValue: "Impossible d'enregistrer la session", bundle: .main))
                                }
                                activeGuestSession = GuestSession(
                                    identifier: guestSession.identifier,
                                    context: ctx,
                                    isDeliberate: guestSession.isDeliberate,
                                    origin: guestSession.origin
                                )
                            },
                            onAccountRequest: { entry in
                                deepLinkRouter.requestAccount(entry, forShareLink: guestSession.identifier)
                                dismissGuestSession()
                            },
                            onNewLink: { identifier in
                                activeGuestSession = GuestSession(identifier: identifier, context: AnonymousSessionStore.load(linkId: identifier), isDeliberate: guestSession.isDeliberate)
                            }
                        )
                    }
                }
                // Posté par le transport, hors du fil principal : la session se termine sur lui.
                .onReceive(NotificationCenter.default.publisher(for: .meeshyGuestSessionEnded).receive(on: DispatchQueue.main)) { endGuestSession($0) }
                .visitorContentCover(
                    presenter: visitorPresenter,
                    isEligible: !authManager.isAuthenticated && activeGuestSession == nil && launchSplash.phase != .covering
                )
                .fullScreenCover(isPresented: .init(
                    get: { shouldShowOnboarding && launchSplash.phase != .covering && activeGuestSession == nil && visitorPresenter.request == nil },
                    set: { _ in }
                )) {
                    WelcomeView(hasCompletedOnboarding: $hasCompletedOnboarding)
                }
                // **L'hôte des toasts est un modificateur.** Un `fullScreenCover` — le
                // composer — couvrirait un hôte posé à la seule racine : tout toast levé
                // de là-haut serait invisible. Sa PLACE peut donc se répéter sans se
                // recopier.
                .feedbackToastOverlay()
                .ageGateOverlay()
                .sheet(isPresented: $showCrashSheet) {
                    CrashReportSheet(reports: crashReportsToShow)
                }
                .environmentObject(authManager)
                .environmentObject(deepLinkRouter)
                .environment(\.meeshyForceReduceMotion, a11yPrefs.reduceMotion)
                .preferredColorScheme(theme.preferredColorScheme)
                .onOpenURL { url in
                    // **`meeshy://compose-share` n'est pas une
                    // DESTINATION.** Il ne navigue nulle part : il demande de
                    // reprendre une fiche que l'extension vient de déposer, et
                    // c'est le cover racine qui la présente. Le faire passer par
                    // `DeepLinkParser` aurait demandé un cas d'énumération pour
                    // quelque chose qui n'est pas un lieu de l'app.
                    //
                    // L'identifiant est PASSÉ, pas deviné : deux partages
                    // rapides se suivent, et reprendre « la plus ancienne »
                    // ouvrirait la première pièce sur le geste de la seconde.
                    // Même principe pour un partage RELAYÉ par
                    // l'extension : la fiche est déjà sur le disque, l'écran de
                    // partage de la racine la présente.
                    if let relayId = ShareRelayHandoff.shareId(from: url) {
                        ShareRelayConsumer.shared.consumeNext(id: relayId)
                        return
                    }
                    if ShareComposeLink.shareId(from: url) != nil {
                        let identifiant = ShareComposeLink.shareId(from: url)
                        Task { await ShareComposeHandoffConsumer.shared.consumeNext(id: identifiant) }
                        return
                    }
                    if let link = SignInLink(DeepLinkParser.parse(url)) {
                        Task { await SignInLinkOpener.open(link) }
                        return
                    }
                    let _ = deepLinkRouter.handle(url: url)
                }
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { userActivity in
                    guard let url = userActivity.webpageURL else { return }
                    if let link = SignInLink(DeepLinkParser.parse(url)) {
                        Task { await SignInLinkOpener.open(link) }
                        return
                    }
                    let _ = deepLinkRouter.handle(url: url)
                }
                .onContinueUserActivity(CallBackRequest.startCallActivityType) { userActivity in
                    guard CallDialReadinessSnapshot.mayQueueDial(sessionResolved: authManager.hasResolvedStoredSession, authenticated: authManager.isAuthenticated),
                          let request = CallBackRequest(userActivity: userActivity) else { return }
                    CallBackDialer.shared.dial(request)
                }
                .task { await runLaunchSequence() }
                // La session elle-même (sockets, clés, notifications) se règle dans
                // `MeeshyApp+Lifecycle.swift`, hors de toute fenêtre : ici, seulement
                // l'état de CETTE vue.
                .adaptiveOnChange(of: authManager.isAuthenticated) { _, isAuth in
                    if isAuth { activeGuestSession = nil }
                }
                .adaptiveOnChange(of: deepLinkRouter.pendingDeepLink) { _, link in
                    handleGuestDeepLink(link)
                }
                // Entrée SANS COMPTE choisie depuis un appareil qui en a un.
                // `RootView` a posé la question et reçu la réponse ; la session
                // invitée, elle, vit ici. Le canal est distinct de
                // `pendingDeepLink` parce qu'il ne porte pas une destination à
                // résoudre mais une identité déjà choisie — le confondre
                // reposerait la question.
                .adaptiveOnChange(of: deepLinkRouter.requestedGuestJoin) { _, identifier in
                    guard let identifier else { return }
                    deepLinkRouter.requestedGuestJoin = nil
                    activeGuestSession = GuestSession(
                        identifier: identifier,
                        context: AnonymousSessionStore.load(linkId: identifier),
                        isDeliberate: true
                    )
                }
                // « Entrer dans World Wide » depuis l'écran de
                // connexion : la session invitée s'ouvre sur la clé SERVIE
                // par `GET /world`, et reprend celle que cet appareil y a déjà.
                .adaptiveOnChange(of: deepLinkRouter.requestedWorldEntry) { _, entry in
                    guard let entry else { return }
                    deepLinkRouter.requestedWorldEntry = nil
                    activeGuestSession = GuestSession(
                        identifier: entry.shareLinkIdentifier,
                        context: AnonymousSessionStore.load(linkId: entry.shareLinkIdentifier),
                        origin: .world(entry)
                    )
                }
                // Prisme Linguistique — dès que la langue principale de
                // l'utilisateur change (login, changement de préférence), on la
                // met en cache pour l'override de langue UI appliqué au prochain
                // lancement (cf. `UILanguageOverride`).
                .adaptiveOnChange(of: authManager.currentUser?.systemLanguage) { _, newLanguage in
                    UILanguageOverride.cache(from: newLanguage)
                    UILanguageOverride.refreshNotificationLanguage()
                }
            }
            }
            // La taille de CETTE fenêtre (Stage Manager, Split View), publiée au-dessus de tout ce qu'elle porte :
            // feuilles, couvertures, toasts et barrière d'âge la lisent aussi.
            .publishingSceneWindowSize()
        }
        .commands { MeeshyCommands() }
        detachedWindows
    }

    @SceneBuilder
    private var detachedWindows: some Scene {
        // Les fenêtres DÉTACHÉES (iPad) : une conversation, ou le fil de réels, à côté de la fenêtre principale.
        WindowGroup(id: DetachedWindowOpener.sceneId, for: DetachedWindowContent.self) { $content in
            DetachedWindowView(content: content)
                .environment(\.mentionContactsProvider, MentionContactsAudienceBridge())
                .feedbackToastOverlay()
                // Mêmes barrière d'âge et préférence d'animation que la fenêtre principale.
                .ageGateOverlay()
                .environment(\.meeshyForceReduceMotion, a11yPrefs.reduceMotion)
                .environmentObject(authManager)
                .environmentObject(deepLinkRouter)
                .preferredColorScheme(theme.preferredColorScheme)
                .publishingSceneWindowSize()
        }
        .handlesExternalEvents(matching: [DetachedWindowOpener.activityIdentifier])
    }

    // MARK: - Test seam (DEBUG)

    /// Reproduces the `.background` branch of `adaptiveOnChange(of: scenePhase)`
    /// in a testable, static form. Kept aligned with the production handler:
    /// when the conversation audio coordinator is actively playing we do NOT
    /// tear down the shared `AVAudioSession`, so iOS keeps streaming the
    /// engine in background under the `UIBackgroundModes: audio` declaration.
    static func handleScenePhaseForTesting(_ newPhase: ScenePhase) async {
        switch newPhase {
        case .background:
            if !ConversationAudioCoordinator.sharedForTesting.isPlaying {
                // `deactivateForBackground()` owns the `deactivateCount` probe
                // increment (post `callActive` guard) — do NOT pre-count here or
                // a single background transition double-counts.
                await MediaSessionCoordinator.shared.deactivateForBackground()
            }
        default:
            break
        }
    }

    // MARK: - Push Notifications

    /// Un RELAIS vers le site unique (`PushPermissionPrompt`), jamais une
    /// seconde copie : le fil d'envoi la déclenche aussi. Au démarrage
    /// à froid, le report de l'inscription et la carte 5 de l'onboarding
    /// passent d'abord.
    func requestPushPermissionIfNeeded() async {
        await PushPermissionPrompt.onColdStart(request: { await PushPermissionPrompt.requestIfNeeded(using: pushManager) })
    }

    /// VoIP registration must run unconditionally, before the notification-
    /// permission request. PushKit needs no user permission at all, but
    /// `requestPushPermission` awaits the system permission alert, which can
    /// stay on screen indefinitely if the user backgrounds the app instead
    /// of dismissing it. Sequencing it first previously left `PKPushRegistry`
    /// uncreated — and no VoIP token registered with the backend — for as
    /// long as that alert was pending, silently dropping any call placed to
    /// the device in that window (most commonly right after a fresh install).
    static func runPushBootstrapSequence(
        voipRegister: () -> Void,
        requestPushPermission: () async -> Void
    ) async {
        voipRegister()
        await requestPushPermission()
    }

    // MARK: - Crash Diagnostics Surfacing

    /// Drains the queue of crash/hang reports captured since the last
    /// foreground and shows a single toast describing the most recent one.
    /// Each report is also logged via `Logger.crash` so the full call stack
    /// is grep-able in Console.app under subsystem `me.meeshy.app` /
    /// category `crash`.
    func surfacePendingCrashReports() {
        guard !hasSurfacedCrashReports else { return }
        hasSurfacedCrashReports = true

        let reports = CrashDiagnosticsManager.shared.consumePending()
        guard let mostRecent = reports.first else { return }

        for report in reports {
            let when = report.timestamp.formatted(.iso8601)
            Logger.crash.error("""
                [\(report.kind.rawValue, privacy: .public)] \
                \(when, privacy: .public) — \
                \(report.summary, privacy: .public)
                \(report.details, privacy: .public)
                """)
        }

        crashReportsToShow = reports

        let kindLabel = mostRecent.kind.localizedLabel
        let extra = reports.count > 1 ? " (+\(reports.count - 1))" : ""
        toastManager.show(
            String(
                format: String(
                    localized: "crash.toast.previous",
                    defaultValue: "%1$@ précédent%2$@ : %3$@",
                    bundle: .main
                ),
                kindLabel, extra, mostRecent.summary
            ),
            type: .info
        ) { [self] in
            showCrashSheet = true
        }
    }

    // MARK: - Guest Session Lifecycle

    private func dismissGuestSession() {
        if let ctx = activeGuestSession?.context {
            Task { try? await ShareLinkService.shared.leaveAnonymousSession(sessionToken: ctx.sessionToken) }
        }
        if let id = activeGuestSession?.identifier {
            AnonymousSessionStore.delete(linkId: id)
        }
        activeGuestSession = nil
    }

    /// La passerelle a terminé la session (lien échu, accès retiré) :
    /// l'appareil l'oublie (trousseau, jeton, socket et ses reconnexions) et
    /// le fil laisse place à l'écran qui le dit.
    private func endGuestSession(_ notification: Notification) {
        guard let session = activeGuestSession, let end = GuestSessionEnd(notification: notification),
              session.isEnded(byRefusedToken: GuestSessionEnd.refusedSessionToken(in: notification)) else { return }
        session.storedSessionKeys.forEach { AnonymousSessionStore.delete(linkId: $0) }
        APIClient.shared.anonymousSessionToken = nil
        MessageSocketManager.shared.disconnect()
        activeGuestSession = session.ended(by: end)
    }

    // MARK: - Guest Deep Link (handles join/chat links when not authenticated)

    func handleGuestDeepLink(_ link: DeepLink?) {
        guard let link else { return }
        // Hold the link until the session check finishes. Otherwise an
        // incoming join/chat link would activate a guest session BEFORE
        // `checkExistingSession` flips `isAuthenticated` to true, leaving
        // the user stranded in an anonymous flow even though they have a
        // valid token. The `.task` block below re-invokes this method
        // after `hasCheckedSession = true`, so the link survives in
        // `deepLinkRouter.pendingDeepLink` and is processed then.
        guard hasCheckedSession else { return }
        guard !authManager.isAuthenticated else { return }
        switch link {
        case .joinLink(let id), .chatLink(let id):
            activeGuestSession = GuestSession(identifier: id, context: AnonymousSessionStore.load(linkId: id))
            deepLinkRouter.consumePendingDeepLink()
        case .magicLink, .emailVerificationLink:
            // Cold-launch Universal Link sign-in link. `AppDelegate
            // .application(_:continue:)` set `pendingDeepLink = .magicLink`
            // before any view mounted, and `RootView` (the warm consumer)
            // never mounts while unauthenticated — so this is the ONLY place
            // a cold-launch magic link gets validated. Consume first so the
            // `.task` + `.onChange` callers don't double-fire the request.
            deepLinkRouter.consumePendingDeepLink()
            if let signIn = SignInLink(link) {
                Task { await SignInLinkOpener.open(signIn) }
            }
        case .externalLink(let url):
            // `/l/<token>` de cible EXTERNAL reçu SANS compte : `RootView` n'est
            // pas monté, donc personne d'autre ne l'ouvrirait. Le lien vise le
            // web ouvert — aucune session n'est requise pour le suivre.
            deepLinkRouter.consumePendingDeepLink()
            UIApplication.shared.open(url)
        default:
            // Une publication ou un réel s'affiche au visiteur, SANS
            // consommer le lien : il s'ouvrira encore après la connexion.
            visitorPresenter.present(link)
        }
    }
}

// MARK: - System Theme Detector
// Sits OUTSIDE preferredColorScheme to always see the real system colorScheme
struct SystemThemeDetector<Content: View>: View {
    @Environment(\.colorScheme) private var systemScheme
    let content: () -> Content

    init(@ViewBuilder content: @escaping () -> Content) {
        self.content = content
    }

    var body: some View {
        content()
            .adaptiveOnChange(of: systemScheme) { _, newScheme in
                ThemeManager.shared.syncWithSystem(newScheme)
            }
            .onAppear {
                ThemeManager.shared.syncWithSystem(systemScheme)
            }
    }
}

// MARK: - Profile sheet environment

private struct ProfileSheetEnvironment: ViewModifier {
    /// Le niveau et le rang d'un membre, sur la BANNIÈRE de sa fiche : ce que SA visibilité autorise,
    /// rien sinon. Le chargeur de profil (cache, conversations partagées) est posé au même endroit : une seule
    /// injection, toutes les feuilles de profil la reçoivent.
    func body(content: Content) -> some View {
        content
            .environment(\.profileGameSection, ProfileGameSection { userId, _ in
                AnyView(GameBannerBadge(userId: userId))
            })
            .environment(\.profileLoading, LiveProfileLoading())
    }
}
