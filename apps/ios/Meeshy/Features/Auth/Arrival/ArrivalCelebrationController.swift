import Foundation
import Combine
import MeeshySDK

/// Ce qui remplit les caches pendant la célébration de l'arrivée (#8089).
@MainActor
protocol ArrivalPrefetching: AnyObject {
    func prefetch() async
}

/// Ce que les portes d'accès appellent quand la preuve de l'adresse vient
/// d'ouvrir la session : le lien de vérification ouvert sur le téléphone
/// (`SignInLinkOpener`) ou le code saisi (`EmailVerificationViewModel`).
@MainActor
protocol ArrivalCelebrating: AnyObject {
    func begin(userId: String)
    /// Le préchargement SEUL, sans la fête : la carte de l'inscription a déjà
    /// joué son feu d'artifice quand elle ouvre la session (#8288).
    func prepare(userId: String)
}

extension ArrivalCelebrating {
    func prepare(userId: String) {}
}

/// La célébration de l'arrivée (#8089, jumelle iOS de #8088) : la feuille
/// refermée, la session ouverte, un feu d'artifice précède l'onboarding.
///
/// **Elle LANCE le préchargement, et le préchargement lui survit.** La tâche
/// appartient à ce contrôleur, jamais à une vue : ni la fin de la célébration,
/// ni l'onboarding qui s'ouvre ensuite (`OnboardingHost` attend `isShowing`),
/// ni un écran qui se démonte ne l'annulent — le fil et les réels sont en cache
/// quand l'onboarding se referme.
///
/// **Un préchargement par utilisateur et par processus** : un second lien, ou
/// le code tapé après le lien, ne relance ni la fête ni le réseau.
@MainActor
final class ArrivalCelebrationController: ObservableObject, ArrivalCelebrating {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466) → double-free au
    // démontage hors d'une tâche. Garde : MainActorDeinitSourceGuardTests.
    nonisolated deinit {}

    static let shared = ArrivalCelebrationController()

    /// Le temps de la fête : assez pour la voir, trop court pour l'attendre.
    static let holdDuration: Duration = .milliseconds(2600)

    @Published private(set) var isShowing = false

    private let prefetcher: any ArrivalPrefetching
    private let hold: @MainActor () async -> Void
    private var prefetchedUserIds: Set<String> = []
    private var prefetchTask: Task<Void, Never>?
    private var holdTask: Task<Void, Never>?

    init(
        prefetcher: (any ArrivalPrefetching)? = nil,
        hold: (@MainActor () async -> Void)? = nil
    ) {
        self.prefetcher = prefetcher ?? ArrivalPrefetcher()
        self.hold = hold ?? { try? await Task.sleep(for: ArrivalCelebrationController.holdDuration) }
    }

    func begin(userId: String) {
        startPrefetch(for: userId)
        guard !isShowing else { return }
        isShowing = true
        let hold = self.hold
        holdTask = Task { [weak self] in
            await hold()
            guard !Task.isCancelled else { return }
            self?.isShowing = false
        }
    }

    func prepare(userId: String) {
        startPrefetch(for: userId)
    }

    /// Toucher l'écran passe la fête — le préchargement, lui, continue.
    func dismiss() {
        holdTask?.cancel()
        holdTask = nil
        isShowing = false
    }

    func awaitHold() async {
        await holdTask?.value
    }

    func awaitPrefetch() async {
        await prefetchTask?.value
    }

    private func startPrefetch(for userId: String) {
        guard !prefetchedUserIds.contains(userId) else { return }
        prefetchedUserIds.insert(userId)
        let prefetcher = self.prefetcher
        prefetchTask = Task(priority: .userInitiated) {
            await prefetcher.prefetch()
        }
    }
}

/// Le préchargement réel : les MÊMES chargeurs que les écrans, donc les mêmes
/// clés de cache — rien n'est réinventé.
///
/// - le fil (`FeedViewModel.loadFeed`) écrit `main-feed` dans
///   `CacheCoordinator.feed`, que relisent le fil ET le lecteur de réels, et
///   préchauffe les médias de ses premiers posts ;
/// - les premiers réels voient leur fichier vidéo posé sur disque
///   (`ReelPrewarm`), sans lecteur préparé ;
/// - les contacts (`ContactsListViewModel.loadFriends`) écrivent la liste
///   d'amis dans `CacheCoordinator.friends`.
///
/// Les conversations et le plateau de stories n'y figurent pas : la racine,
/// montée SOUS la célébration, les charge déjà (`RootView`) — les demander ici
/// doublerait l'appel.
@MainActor
final class ArrivalPrefetcher: ArrivalPrefetching {
    nonisolated deinit {}

    static let prewarmedReelCount = 2

    func prefetch() async {
        let feed = Task { await Self.prefetchFeedAndReels() }
        let contacts = Task { await ContactsListViewModel().loadFriends() }
        await feed.value
        await contacts.value
    }

    private static func prefetchFeedAndReels() async {
        let feed = FeedViewModel()
        await feed.loadFeed()
        let reels = feed.posts.filter { ReelPrewarm.videoURL(for: $0) != nil }.prefix(prewarmedReelCount)
        for reel in reels {
            await ReelPrewarm.prepare(reel, preroll: false)
        }
    }
}
