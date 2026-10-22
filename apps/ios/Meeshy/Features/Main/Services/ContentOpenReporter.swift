import Foundation
import Combine
import MeeshySDK
import os
#if canImport(UIKit)
import UIKit
#endif

// MARK: - Le tap d'un listing est un engagement d'ouverture (#10483)

/// **Taper un contenu dans un listing n'est pas le voir : c'est l'OUVRIR.**
///
/// Demande du porteur du 2026-10-13 : le tap envoie l'événement `open` avec son
/// origine (fil, profil, favoris, rail de stories…), et la VUE est comptée par
/// l'écran ouvert, qui reprend l'origine comme provenance `listing`.
///
/// Le tap fait donc deux choses, et seulement deux :
/// 1. il MARQUE le contenu de son entrée (`ContentEntry.listing(origin)`), que
///    l'écran détail consomme à sa première apparition ;
/// 2. il envoie `open`, sous le compte s'il y en a un, sinon par la file du
///    lecteur sans compte.
///
/// Les `open` partent toujours dans une requête à eux
/// (`SocialEventsDispatch`) : un ancien serveur qui les refuse n'emporte rien
/// d'autre, et un refus définitif ne se rejoue pas.
protocol ContentOpenReporting: AnyObject {
    @MainActor func open(_ postId: String, from origin: OpenOrigin)
    @MainActor func flushNow() async
}

@MainActor
final class ContentOpenReporter: ContentOpenReporting {
    // iOS 26.1 : deinit synthétisée ISOLÉE → double-free au démontage hors
    // d'une tâche. Garde : MainActorDeinitSourceGuardTests.
    nonisolated deinit {}

    static let shared = ContentOpenReporter()
    /// Au-delà, les plus anciens tombent : un compteur d'engagement ne
    /// justifie pas une file sans borne hors ligne.
    static let pendingCap = 200

    private static let logger = MeeshyLog.logger(.contentOpen)

    private let entries: DetailOpenSourceProviding
    private let postService: PostServiceProviding
    private let visitor: VisitorReachReporting
    private let accountId: @MainActor () -> String?
    private let flushDelay: TimeInterval
    private let clock: @MainActor () -> Date

    /// Chaque `open` garde l'enveloppe posée au TAP (#10500) : un rejeu après
    /// une panne renvoie le même `eventId`, daté du tap.
    private var pending: [StampedSocialEvent] = []
    /// Le compte sous lequel les `open` en attente ont été TAPÉS : ils ne
    /// partent jamais sous le jeton d'un autre.
    private var pendingAccount: String?
    private var flushTask: Task<Void, Never>?
    private var cancellables = Set<AnyCancellable>()

    init(
        entries: DetailOpenSourceProviding = DetailOpenSources.shared,
        postService: PostServiceProviding = PostService.shared,
        visitor: VisitorReachReporting = VisitorReachReporter.shared,
        accountId: @escaping @MainActor () -> String? = { AuthManager.shared.currentUser?.id },
        flushDelay: TimeInterval = 1,
        clock: @escaping @MainActor () -> Date = { Date() }
    ) {
        self.entries = entries
        self.postService = postService
        self.visitor = visitor
        self.accountId = accountId
        self.flushDelay = flushDelay
        self.clock = clock
        subscribeToAppLifecycle()
    }

    var pendingEvents: [SocialEvent] { pending.map(\.event) }
    var pendingStampedEvents: [StampedSocialEvent] { pending }

    func open(_ postId: String, from origin: OpenOrigin) {
        guard !postId.isEmpty else { return }
        entries.mark(postId, entry: .listing(origin))
        let event = SocialEvent.open(postId: postId, origin: origin)
        guard let account = accountId() else {
            visitor.record([event])
            return
        }
        if account != pendingAccount {
            pending.removeAll()
            pendingAccount = account
        }
        pending = Array((pending + [.stamping(event, at: clock())]).suffix(Self.pendingCap))
        scheduleFlush()
    }

    func flushNow() async {
        flushTask?.cancel()
        flushTask = nil
        let batch = pending
        guard !batch.isEmpty else { return }
        let owner = pendingAccount
        pending.removeAll()
        guard owner != nil, owner == accountId() else {
            Self.logger.debug("content opens of a gone account dropped: \(batch.count, privacy: .public)")
            return
        }
        let unsent = await SocialEventsDispatch.deliver(batch, credential: .account, through: postService)
        // Ce qu'une panne a gardé revient en tête de la file de SON compte —
        // jamais dans celle d'un compte posé pendant l'envoi.
        guard !unsent.isEmpty, owner == accountId(), owner == pendingAccount else { return }
        pending = Array((unsent + pending).suffix(Self.pendingCap))
    }

    private func scheduleFlush() {
        flushTask?.cancel()
        flushTask = Task { [weak self] in
            guard let self else { return }
            guard await cancellableSleep(for: .seconds(self.flushDelay)), !Task.isCancelled else { return }
            await self.flushNow()
        }
    }

    private func subscribeToAppLifecycle() {
        #if canImport(UIKit)
        for name in [UIApplication.willResignActiveNotification,
                     UIApplication.didEnterBackgroundNotification] {
            NotificationCenter.default.publisher(for: name)
                .sink { [weak self] _ in
                    Task { @MainActor in await self?.flushNow() }
                }
                .store(in: &cancellables)
        }
        #endif
    }
}

// MARK: - Les portes d'un listing

extension ContentOpenReporting {
    /// Le tap d'un anneau du rail : l'engagement porte la story que l'anneau
    /// MONTRE (`StoryRailReach.displayedStoryId`), celle sur laquelle le
    /// lecteur s'ouvre (première non vue, sinon la première active).
    @MainActor func openStory(of group: StoryGroup) {
        guard let storyId = StoryRailReach.displayedStoryId(of: group) else { return }
        open(storyId, from: .storyRail)
    }
}

extension Router {
    /// Le tap d'un listing sur un post qui s'ouvre en DÉTAIL : l'engagement
    /// d'ouverture part, puis le détail est poussé — il comptera
    /// l'impression et la vue, provenance `listing` et cette origine.
    func openPostDetail(_ post: FeedPost, from origin: OpenOrigin) {
        ContentOpenReporter.shared.open(post.id, from: origin)
        push(.postDetail(post.id, post))
    }

    /// La même porte quand seul l'identifiant est connu (repost cité).
    func openPostDetail(id postId: String, from origin: OpenOrigin) {
        ContentOpenReporter.shared.open(postId, from: origin)
        push(.postDetail(postId))
    }
}

extension ReelsPresenter {
    /// Le tap d'un listing sur un réel : l'engagement d'ouverture part, puis le
    /// lecteur s'ouvre sur ce réel — il comptera l'impression et la vue.
    func present(posts: [FeedPost], startId: String, from origin: OpenOrigin) {
        ContentOpenReporter.shared.open(startId, from: origin)
        present(posts: posts, startId: startId)
    }
}
