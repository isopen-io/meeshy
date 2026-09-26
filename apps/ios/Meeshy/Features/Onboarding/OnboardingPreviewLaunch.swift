#if DEBUG
import SwiftUI
import Contacts
import MeeshySDK
import MeeshyUI

/// **Aperçu DEBUG de l'onboarding**, sans compte ni réseau — pour vérifier
/// chaque carte au simulateur, dans chaque langue et chaque thème.
///
/// ```
/// xcrun simctl launch <udid> me.meeshy.app -MeeshyOnboardingPreview global \
///     -MeeshyOnboardingPreviewDone YES -AppleLanguages "(ar)"
/// ```
///
/// Cartes : `languages`, `global`, `story`, `friends`, `notifications`, `recap`.
/// `-MeeshyOnboardingPreviewDone YES` montre la carte APRÈS son geste (salut
/// envoyé, story publiée, demandes envoyées) — « +N » compris.
/// `-MeeshyOnboardingPreviewProtected YES` joue le régime protégé.
/// `-MeeshyOnboardingPreviewStory publishing|failed` montre la carte 3 pendant
/// l'upload ou après son échec. `-MeeshyOnboardingPreviewSuggestions 6` sert
/// six profils (le plafond du contrat) au lieu de quatre.
/// `-MeeshyOnboardingPreviewContacts offer|found|none|denied|failed` joue la
/// proposition « retrouver tes amis » de la carte 4 (#8105) sur un carnet
/// fictif : jamais le vrai carnet, jamais le réseau.
///
/// Rien de ceci n'existe dans un build Release : le fichier entier est sous
/// `#if DEBUG`, et son seul site d'appel aussi.
enum OnboardingPreviewLaunch {
    static let argument = "-MeeshyOnboardingPreview"

    static var isActive: Bool {
        ProcessInfo.processInfo.arguments.contains(argument)
    }

    static var requestedCard: OnboardingCard? {
        let arguments = ProcessInfo.processInfo.arguments
        guard let index = arguments.firstIndex(of: argument), arguments.indices.contains(index + 1) else { return nil }
        let value = arguments[index + 1]
        if value == "recap" { return .recap }
        return OnboardingStepId(rawValue: value).map(OnboardingCard.step)
    }

    static var showsDoneVariant: Bool {
        UserDefaults.standard.bool(forKey: "MeeshyOnboardingPreviewDone")
    }

    /// `-MeeshyOnboardingPreviewStory publishing|failed|rejected|verify` : la
    /// carte 3 pendant l'upload, après son échec, après un refus définitif, ou
    /// quand l'adresse doit être vérifiée pour publier (#7907).
    static var storyState: OnboardingStoryState? {
        switch UserDefaults.standard.string(forKey: "MeeshyOnboardingPreviewStory") {
        case "publishing": return .publishing
        case "failed": return .failed
        case "rejected": return .rejected
        default: return nil
        }
    }

    /// Le carnet fictif de la carte 4 (#8105). Absent : l'offre, sur un accès
    /// jamais demandé.
    nonisolated static var contactsScenario: String {
        UserDefaults.standard.string(forKey: "MeeshyOnboardingPreviewContacts") ?? "offer"
    }

    nonisolated static let fixtureContacts: [DirectoryContact] = [
        DirectoryContact(id: "c1", contactKey: "k1", displayName: "Maman", isOnMeeshy: true,
                         matchedUser: MatchedContactUser(id: "f1", username: "awa.d", displayName: "Awa")),
        DirectoryContact(id: "c2", contactKey: "k2", displayName: "Théo (foot)", isOnMeeshy: true,
                         matchedUser: MatchedContactUser(id: "f2", username: "theo_b", displayName: "Théo")),
        DirectoryContact(id: "c3", contactKey: "k3", displayName: "Nadia", isOnMeeshy: true,
                         matchedUser: MatchedContactUser(id: "f3", username: "nadia.k", displayName: "Nadia")),
    ]

    static var isProtected: Bool {
        UserDefaults.standard.bool(forKey: "MeeshyOnboardingPreviewProtected")
    }

    nonisolated static func fixtureState(protected: Bool) -> APIOnboardingState {
        APIOnboardingState(
            eligible: true,
            completedAt: nil,
            seenSteps: [],
            prefilledSteps: [],
            globalConversationId: "66f1c0ffee00000000000001",
            protectedRegime: protected,
            storyDefaultVisibility: protected ? .friends : .public,
            suggestions: Array(fixtureSuggestions.prefix(suggestionCount)),
            emailVerified: false,
            canPublishStory: UserDefaults.standard.string(forKey: "MeeshyOnboardingPreviewStory") != "verify"
        )
    }

    nonisolated private static let fixtureSuggestions: [APIOnboardingSuggestion] = [
        APIOnboardingSuggestion(id: "p1", username: "lina.novaclub", displayName: "Lina", avatarUrl: nil, languages: ["fr", "es"]),
        APIOnboardingSuggestion(id: "p2", username: "kenji_nova", displayName: "Kenji", avatarUrl: nil, languages: ["ja", "en"]),
        APIOnboardingSuggestion(id: "p3", username: "amara.sings", displayName: "Amara", avatarUrl: nil, languages: ["en", "fr"]),
        APIOnboardingSuggestion(id: "p4", username: "sofi_lx", displayName: "Sofia", avatarUrl: nil, languages: ["pt", "es"]),
        APIOnboardingSuggestion(id: "p5", username: "yusuf.nova", displayName: "Yusuf", avatarUrl: nil, languages: ["ar", "fr"]),
        APIOnboardingSuggestion(id: "p6", username: "mila_beats", displayName: "Mila", avatarUrl: nil, languages: ["de", "en"]),
    ]

    nonisolated private static var suggestionCount: Int {
        let requested = UserDefaults.standard.integer(forKey: "MeeshyOnboardingPreviewSuggestions")
        return requested > 0 ? requested : 4
    }

    static var fixtureUser: MeeshyUser {
        MeeshyUser(id: "preview-user", username: "aicha", displayName: "Aïcha",
                   systemLanguage: OnboardingGreeting.contentLanguage)
    }
}

/// L'écran d'aperçu : le vrai calque, sur un modèle nourri de doubles locaux.
struct OnboardingPreviewScreen: View {
    @StateObject private var model = OnboardingViewModel(
        service: PreviewOnboardingService(),
        progress: PreviewEngagementProgress(),
        permission: PreviewNotificationPermission(),
        contacts: PreviewContactSync(),
        directory: PreviewContactDirectory()
    )

    var body: some View {
        Group {
            if model.isPresented {
                OnboardingOverlay(model: model, onOpenStory: {}, onExplore: {})
            } else {
                MeeshyColors.mainBackgroundGradient(isDark: false).ignoresSafeArea()
            }
        }
        .task {
            let state = OnboardingPreviewLaunch.fixtureState(protected: OnboardingPreviewLaunch.isProtected)
            await model.presentPreview(state: state,
                                       user: OnboardingPreviewLaunch.fixtureUser,
                                       jumpTo: OnboardingPreviewLaunch.requestedCard)
            // Le geste « arrive » une fois la carte à l'écran, comme en vrai :
            // c'est ce qui laisse le « +N » s'envoler vers la pastille.
            if let storyState = OnboardingPreviewLaunch.storyState {
                model.debugSetStoryState(storyState)
                return
            }
            guard OnboardingPreviewLaunch.showsDoneVariant else { return }
            do { try await Task.sleep(nanoseconds: 1_200_000_000) } catch { return }
            model.debugApplyDoneVariant()
        }
    }
}

nonisolated private final class PreviewOnboardingService: OnboardingServiceProviding, @unchecked Sendable {
    func fetchState() async throws -> APIOnboardingState {
        OnboardingPreviewLaunch.fixtureState(protected: false)
    }

    func record(step: OnboardingStepId, outcome: OnboardingStepOutcome) async throws -> APIOnboardingState {
        OnboardingPreviewLaunch.fixtureState(protected: false)
    }

    func finish() async throws -> APIOnboardingState {
        OnboardingPreviewLaunch.fixtureState(protected: false)
    }
}

nonisolated private final class PreviewEngagementProgress: EngagementProgressProviding, @unchecked Sendable {
    func fetchProgress() async throws -> APIEngagementProgress {
        APIEngagementProgress(
            counters: [],
            milestones: [
                .init(milestoneType: .badge, milestoneKey: "content.text_message:1", reachedAt: "2026-09-24T08:00:00.000Z"),
                .init(milestoneType: .badge, milestoneKey: "content.story:1", reachedAt: "2026-09-24T08:02:00.000Z"),
            ],
            streak: .init(currentStreakDays: 1, longestStreakDays: 1),
            level: .init(engagementScore: [EngagementAxisFamily.content, .conversation, .content, .tool]
                .compactMap { EngagementCatalog.familyWeights[$0] }
                .reduce(0, +))
        )
    }

    func mintMeesh(requestId: String) async throws -> APIMeeshMintResult {
        APIMeeshMintResult(status: "insufficient")
    }
}

/// Le carnet fictif : l'accès et la synchronisation répondent selon
/// `-MeeshyOnboardingPreviewContacts`, sans fenêtre système ni réseau.
nonisolated private final class PreviewContactSync: ContactSyncProviding, @unchecked Sendable {
    private var granted = false

    func authorizationStatus() -> CNAuthorizationStatus {
        switch OnboardingPreviewLaunch.contactsScenario {
        case "denied": return .denied
        case "found", "none", "failed": return .authorized
        default: return granted ? .authorized : .notDetermined
        }
    }

    func requestAccess() async -> Bool {
        granted = true
        return OnboardingPreviewLaunch.contactsScenario != "denied"
    }

    func findFriendsFromContacts() async throws -> [ContactMatch] { [] }

    func syncDirectory(mode: DirectorySyncMode) async throws -> DirectorySyncResult {
        try await Task.sleep(nanoseconds: 700_000_000)
        guard OnboardingPreviewLaunch.contactsScenario != "failed" else { throw URLError(.notConnectedToInternet) }
        return DirectorySyncResult(totalContacts: 3, processedContacts: 3, syncedCount: 3, matchedCount: 3, removedCount: 0)
    }
}

nonisolated private final class PreviewContactDirectory: ContactDirectoryServiceProviding, @unchecked Sendable {
    func sync(_ request: DirectorySyncRequest) async throws -> DirectorySyncResult {
        DirectorySyncResult(totalContacts: 0, processedContacts: 0, syncedCount: 0, matchedCount: 0, removedCount: 0)
    }

    func page(cursor: String?, limit: Int, filter: DirectoryFilter, query: String?, updatedSince: Date?) async throws
        -> PaginatedAPIResponse<[DirectoryContact]> {
        let contacts = OnboardingPreviewLaunch.contactsScenario == "none" ? [] : OnboardingPreviewLaunch.fixtureContacts
        return PaginatedAPIResponse(success: true, data: contacts,
                                    pagination: CursorPagination(nextCursor: nil, hasMore: false, limit: limit), error: nil)
    }

    func clear() async throws -> DirectoryClearResult { DirectoryClearResult(removedCount: 0) }
}

private final class PreviewNotificationPermission: OnboardingNotificationPermitting {
    nonisolated deinit {}

    func currentStatus() async -> OnboardingNotificationStatus { .notDetermined }
    func request() async -> Bool { false }
}
#endif
