import Foundation
import MeeshySDK
import os

/// L'onboarding post-inscription (#7729) : cinq cartes COURTES, passables,
/// chacune finie par un geste RÉEL qui rapporte déjà des points.
///
/// **Le serveur déclare, ce modèle affiche.** L'éligibilité, les étapes déjà
/// vues, celles que l'engagement pré-coche, le régime protégé et les profils
/// suggérés viennent de `GET /me/onboarding` ; chaque carte vue repart en
/// `PATCH`, idempotent. Ce qui est décidé ICI, et seulement ici, c'est l'ordre
/// d'affichage et le moment de la carte notifications.
///
/// **Aucun gain inventé.** Un « +N » ne s'affiche qu'après l'accusé du serveur
/// (message envoyé, story dont l'upload a ABOUTI — jamais au simple départ) ; la demande d'ami n'affiche
/// rien, parce que rien n'est crédité avant l'acceptation. Le récapitulatif
/// relit la progression serveur — et, s'il ne le peut pas, n'affiche que ce que
/// la session a vraiment gagné.
///
/// **Jamais de message de perte, jamais de compte à rebours** : « Passer tout »
/// et « Plus tard » ferment sans rien retirer, et le récapitulatif propose
/// toujours de s'arrêter.
final class OnboardingViewModel: ObservableObject {
    nonisolated deinit {}

    private static let logger = Logger(subsystem: "me.meeshy.app", category: "onboarding")

    @Published private(set) var isPresented = false
    @Published private(set) var card: OnboardingCard?
    @Published private(set) var sessionPoints = 0
    @Published private(set) var lastReward: OnboardingReward?
    @Published var greetingDraft = ""
    @Published private(set) var greetingState: OnboardingSendState = .idle
    @Published private(set) var storyState: OnboardingStoryState = .idle
    @Published private(set) var requestedProfileIds: Set<String> = []
    @Published private(set) var failedProfileId: String?
    @Published private(set) var primaryLanguage = "fr"
    @Published private(set) var secondaryLanguage: String?
    @Published private(set) var suggestions: [APIOnboardingSuggestion] = []
    @Published private(set) var recap: OnboardingRecap?
    @Published private(set) var plannedSteps: [OnboardingStepId] = []

    private(set) var storyDefaultVisibility: OnboardingStoryVisibility = .friends
    private(set) var globalConversationId: String?
    /// L'upload de story que la carte 3 suit : celui qu'elle a vu naître à la
    /// fermeture du composeur. `nil` quand rien n'est en vol.
    private(set) var trackedStoryUploadId: String?

    private let service: any OnboardingServiceProviding
    private let messages: any MessageServiceProviding
    private let friends: any FriendServiceProviding
    private let users: any UserServiceProviding
    private let progress: any EngagementProgressProviding
    private let permission: any OnboardingNotificationPermitting
    private let pickTemplate: (Int) -> Int
    private let applyUser: (MeeshyUser) -> Void
    private let settled: any OnboardingSettledStoring

    private var queue: [OnboardingStepId] = []
    private var producedSomething = false
    private var notificationsPending = false
    private var user: MeeshyUser?
    private var composedGreeting = ""
    private var initialLanguages: (primary: String, secondary: String?) = ("fr", nil)
    private var rewardSequence = 0
    private var storyUploadIdsAtOpen: Set<String>?
    private var isRoutingElsewhere = false
    private var awaitsRoute = false

    init(
        service: any OnboardingServiceProviding = OnboardingService.shared,
        messages: any MessageServiceProviding = MessageService.shared,
        friends: any FriendServiceProviding = FriendService.shared,
        users: any UserServiceProviding = UserService.shared,
        progress: any EngagementProgressProviding = EngagementProgressService.shared,
        permission: (any OnboardingNotificationPermitting)? = nil,
        pickTemplate: ((Int) -> Int)? = nil,
        applyUser: ((MeeshyUser) -> Void)? = nil,
        settled: any OnboardingSettledStoring = UserDefaultsOnboardingSettledStore()
    ) {
        self.service = service
        self.messages = messages
        self.friends = friends
        self.users = users
        self.progress = progress
        self.permission = permission ?? SystemOnboardingNotificationPermission()
        self.pickTemplate = pickTemplate ?? { Int.random(in: 0..<$0) }
        self.applyUser = applyUser ?? { AuthManager.shared.currentUser = $0 }
        self.settled = settled
    }

    // MARK: - Lecture

    /// La position de la carte courante parmi les étapes prévues, à partir de 1.
    var stepPosition: Int {
        guard case .step(let step) = card, let index = plannedSteps.firstIndex(of: step) else {
            return plannedSteps.count
        }
        return index + 1
    }

    var stepCount: Int { plannedSteps.count }

    var storyPublished: Bool { storyState == .published }

    /// Le prénom affiché (anneau de story) — celui du profil lu au démarrage.
    var userDisplayName: String {
        user.map { $0.displayName ?? $0.username } ?? ""
    }

    var greetingLanguageNames: [String] {
        [primaryLanguage, secondaryLanguage].compactMap { $0 }.map(OnboardingGreeting.languageName(for:))
    }

    // MARK: - Démarrage

    /// Un parcours RÉGLÉ — fini, passé, ou déclaré non éligible par le serveur —
    /// ne se redemande plus : aucun `GET` à chaque lancement, pour toujours.
    /// Une panne réseau ne règle rien : la lecture sera retentée.
    func start(user: MeeshyUser) async {
        guard !settled.isSettled(userId: user.id) else { return }
        prepare(for: user)

        let state: APIOnboardingState
        do {
            state = try await service.fetchState()
        } catch {
            Self.logger.info("onboarding state unavailable: \(error.localizedDescription, privacy: .public)")
            return
        }
        guard state.eligible, state.completedAt == nil else {
            settled.markSettled(userId: user.id)
            return
        }
        await present(state)
    }

    /// Un deep link ou un push a mené AILLEURS que la racine : le calque attend
    /// le retour, au lieu de recouvrir la destination. Une fois montré, il ne
    /// se retire jamais pour une navigation.
    func routingChanged(isElsewhere: Bool) {
        isRoutingElsewhere = isElsewhere
        guard !isElsewhere, awaitsRoute else { return }
        awaitsRoute = false
        isPresented = true
    }

    #if DEBUG
    /// Aperçu DEBUG : présente un état fictif, en sautant à la carte demandée.
    func presentPreview(state: APIOnboardingState, user: MeeshyUser, jumpTo target: OnboardingCard?) async {
        prepare(for: user)
        await present(state)
        guard let target else { return }
        if case .step(let step) = target { queue.removeAll { $0 == step } }
        card = target
        if target == .recap { await loadRecap() }
        if target == .step(.notifications) { notificationsPending = false }
    }

    /// Aperçu DEBUG : la carte 3 pendant l'upload, ou après son échec.
    func debugSetStoryState(_ state: OnboardingStoryState) {
        storyState = state
    }

    /// Aperçu DEBUG : la carte courante APRÈS son geste, « +N » compris.
    func debugApplyDoneVariant() {
        switch card {
        case .step(.global):
            greetingState = .sent
            reward(OnboardingRewards.greeting)
        case .step(.story):
            sessionPoints = OnboardingRewards.greeting
            storyState = .published
            reward(OnboardingRewards.story)
        case .step(.friends):
            sessionPoints = OnboardingRewards.greeting + OnboardingRewards.story
            requestedProfileIds = Set(suggestions.prefix(2).map(\.id))
        default:
            break
        }
    }
    #endif

    private func present(_ state: APIOnboardingState) async {
        storyDefaultVisibility = state.storyDefaultVisibility
        globalConversationId = state.globalConversationId
        suggestions = state.suggestions
        queue = OnboardingFlow.pendingGestureSteps(for: state)
        producedSomething = OnboardingFlow.alreadyProduced(state)
        let notificationsUnseen = !state.seenSteps.contains(.notifications)
        notificationsPending = notificationsUnseen ? await permission.currentStatus() == .notDetermined : false
        plannedSteps = queue + (notificationsPending ? [.notifications] : [])
        if isRoutingElsewhere {
            awaitsRoute = true
        } else {
            isPresented = true
        }
        await showNext()
    }

    /// Les défauts justes, posés AVANT la lecture réseau : la langue du profil
    /// (ou de l'appareil, 4e rang du Prisme promu ici en défaut) et un salut
    /// déjà personnel.
    private func prepare(for user: MeeshyUser) {
        self.user = user
        primaryLanguage = Self.initialPrimaryLanguage(for: user)
        secondaryLanguage = user.regionalLanguage.flatMap { $0 == primaryLanguage ? nil : $0 }
        // Un profil SANS langue enregistrée n'a rien d'« inchangé » : la langue
        // pré-remplie depuis l'appareil doit partir au serveur à la confirmation.
        initialLanguages = (user.systemLanguage ?? "", secondaryLanguage)
        composedGreeting = OnboardingGreeting.compose(
            templateIndex: pickTemplate(OnboardingGreeting.templateCount),
            name: user.displayName ?? user.username,
            languageNames: greetingLanguageNames
        )
        greetingDraft = composedGreeting
    }

    private static func initialPrimaryLanguage(for user: MeeshyUser) -> String {
        if let configured = user.systemLanguage, !configured.isEmpty { return configured }
        return Locale.current.language.languageCode?.identifier ?? "fr"
    }

    // MARK: - Navigation

    /// « Continuer » après un geste déjà enregistré.
    func advance() async {
        await showNext()
    }

    /// « Plus tard » : la carte est vue, passée, et rien n'est perdu.
    func later() async {
        guard case .step(let step) = card else { return }
        await showNext()
        await record(step, .skipped)
    }

    /// « Passer tout » : visible dès la première carte, ferme sans condition.
    func skipAll() async {
        await close()
    }

    /// « C'est bon pour aujourd'hui » — et « Continuer à explorer », dont l'hôte
    /// ouvre ensuite Meeshy Global.
    func finish() async {
        await close()
    }

    private func close() async {
        isPresented = false
        awaitsRoute = false
        card = nil
        if let userId = user?.id { settled.markSettled(userId: userId) }
        do {
            _ = try await service.finish()
        } catch {
            Self.logger.error("onboarding finish failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    private func showNext() async {
        if !queue.isEmpty {
            card = .step(queue.removeFirst())
            return
        }
        if notificationsPending && producedSomething {
            notificationsPending = false
            card = .step(.notifications)
            return
        }
        if notificationsPending {
            plannedSteps.removeAll { $0 == .notifications }
            notificationsPending = false
        }
        card = .recap
        await loadRecap()
    }

    private func record(_ step: OnboardingStepId, _ outcome: OnboardingStepOutcome) async {
        do {
            _ = try await service.record(step: step, outcome: outcome)
        } catch {
            Self.logger.error("onboarding record \(step.rawValue, privacy: .public) failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    private func reward(_ points: Int) {
        sessionPoints += points
        rewardSequence += 1
        lastReward = OnboardingReward(id: rewardSequence, points: points)
    }

    // MARK: - Carte 1 — langues

    func selectPrimaryLanguage(_ code: String) {
        primaryLanguage = code
        if secondaryLanguage == code { secondaryLanguage = nil }
        refreshUntouchedGreeting()
    }

    func toggleSecondaryLanguage(_ code: String) {
        guard code != primaryLanguage else { return }
        secondaryLanguage = secondaryLanguage == code ? nil : code
        refreshUntouchedGreeting()
    }

    /// Le salut suit les langues choisies tant que personne ne l'a réécrit.
    private func refreshUntouchedGreeting() {
        guard let user, greetingDraft == composedGreeting else { return }
        composedGreeting = OnboardingGreeting.compose(
            templateIndex: pickTemplate(OnboardingGreeting.templateCount),
            name: user.displayName ?? user.username,
            languageNames: greetingLanguageNames
        )
        greetingDraft = composedGreeting
    }

    func confirmLanguages() async {
        guard card == .step(.languages) else { return }
        await showNext()
        let changed = primaryLanguage != initialLanguages.primary || secondaryLanguage != initialLanguages.secondary
        if changed {
            do {
                let updated = try await users.updateProfile(UpdateProfileRequest(
                    systemLanguage: primaryLanguage,
                    regionalLanguage: secondaryLanguage
                ))
                user = updated
                initialLanguages = (primaryLanguage, secondaryLanguage)
                applyUser(updated)
            } catch {
                Self.logger.error("onboarding languages update failed: \(error.localizedDescription, privacy: .public)")
                FeedbackToastManager.shared.showError(String(localized: "onboarding.languages.failed", bundle: .main))
            }
        }
        await record(.languages, .done)
    }

    // MARK: - Carte 2 — salut dans Meeshy Global

    func sendGreeting() async {
        guard greetingState != .sending, greetingState != .sent, let conversationId = globalConversationId else { return }
        let text = greetingDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        greetingState = .sending
        // La langue d'origine n'est DÉCLARÉE que pour le gabarit intact : un
        // texte réécrit peut être dans n'importe quelle langue, et c'est alors
        // la détection du pipeline qui la trouve.
        let declaredLanguage = greetingDraft == composedGreeting ? OnboardingGreeting.contentLanguage : nil
        do {
            _ = try await messages.send(
                conversationId: conversationId,
                request: SendMessageRequest(content: text, originalLanguage: declaredLanguage)
            )
            greetingState = .sent
            producedSomething = true
            reward(OnboardingRewards.greeting)
            await record(.global, .done)
        } catch {
            Self.logger.error("onboarding greeting failed: \(error.localizedDescription, privacy: .public)")
            greetingState = .failed
        }
    }

    // MARK: - Carte 3 — première story

    /// L'hôte ouvre le composeur : on note les uploads DÉJÀ en file, pour
    /// reconnaître à la fermeture celui que ce composeur a lancé.
    func storyComposerOpened(uploadIds: [String]) {
        storyUploadIdsAtOpen = Set(uploadIds)
    }

    /// Le composeur se referme. Un upload NOUVEAU dans la file veut dire qu'une
    /// publication est PARTIE — pas qu'elle a abouti : la carte affiche « ta
    /// story part… », sans « +N » ni étape écrite.
    func storyComposerClosed(uploads: [OnboardingStoryUpload]) {
        guard let before = storyUploadIdsAtOpen else { return }
        storyUploadIdsAtOpen = nil
        guard !storyPublished, let started = uploads.first(where: { !before.contains($0.id) }) else { return }
        trackedStoryUploadId = started.id
        storyState = started.failed ? .failed : .publishing
    }

    /// La file d'uploads a changé. L'upload suivi qui échoue laisse la carte
    /// en « réessayer » ; relancé, il repart en « part… ». S'il QUITTE la file
    /// sans succès annoncé (annulé, abandonné par la file), la carte revient à
    /// son geste initial — rien n'a été gagné, rien n'est retiré.
    func storyUploadsChanged(_ uploads: [OnboardingStoryUpload]) {
        guard let tracked = trackedStoryUploadId else { return }
        guard let upload = uploads.first(where: { $0.id == tracked }) else {
            trackedStoryUploadId = nil
            storyState = .idle
            return
        }
        storyState = upload.failed ? .failed : .publishing
    }

    /// L'upload suivi a ABOUTI côté serveur : c'est le SEUL moment où la story
    /// rapporte ses points et où l'étape s'écrit `done`. L'état change
    /// SYNCHRONEMENT — `StoryViewModel` annonce le succès juste avant de
    /// retirer l'upload de sa file, et ce retrait ne doit pas le défaire.
    @discardableResult
    func storyUploadSucceeded(id: String) -> Task<Void, Never>? {
        guard id == trackedStoryUploadId, !storyPublished else { return nil }
        trackedStoryUploadId = nil
        storyState = .published
        producedSomething = true
        reward(OnboardingRewards.story)
        return Task { await record(.story, .done) }
    }

    // MARK: - Carte 4 — trouve ta bande

    func addFriend(id: String) async {
        guard !requestedProfileIds.contains(id) else { return }
        requestedProfileIds.insert(id)
        failedProfileId = nil
        do {
            _ = try await friends.sendFriendRequest(receiverId: id, message: nil)
            producedSomething = true
        } catch {
            Self.logger.error("onboarding friend request failed: \(error.localizedDescription, privacy: .public)")
            requestedProfileIds.remove(id)
            failedProfileId = id
        }
    }

    func continueFromFriends() async {
        guard card == .step(.friends) else { return }
        let outcome: OnboardingStepOutcome = requestedProfileIds.isEmpty ? .skipped : .done
        await showNext()
        await record(.friends, outcome)
    }

    // MARK: - Carte 5 — notifications

    /// « Oui » : la SEULE voie qui ouvre la fenêtre système.
    func acceptNotifications() async {
        guard card == .step(.notifications) else { return }
        _ = await permission.request()
        await showNext()
        await record(.notifications, .done)
    }

    // MARK: - Récapitulatif

    private func loadRecap() async {
        do {
            let current = try await progress.fetchProgress()
            let score = current.level.engagementScore
            recap = OnboardingRecap(
                points: score,
                level: OnboardingRewards.level(for: score),
                streakDays: current.streak.currentStreakDays,
                badges: current.milestones.filter { $0.milestoneType == .badge }.count
            )
        } catch {
            Self.logger.info("onboarding recap without server progress: \(error.localizedDescription, privacy: .public)")
            recap = OnboardingRecap(
                points: sessionPoints,
                level: OnboardingRewards.level(for: sessionPoints),
                streakDays: nil,
                badges: nil
            )
        }
    }
}
