import SwiftUI
import MeeshySDK
import MeeshyUI

/// Le cercle sur le profil d'un Ami ou d'un Proche (#13940) : le niveau COMMUN que `GET /relations` sert à l'appelant —
/// donc visible des deux seuls —, et la demande du cran suivant quand la loi de demande la laisse proposer.
///
/// - **Cache d'abord** : le même store que « Mes cercles » ; le niveau se peint avant le réseau.
/// - **Rien n'est fabriqué** : sans lien servi (ou sous Connaissance), `shownLevel` est `nil` et le profil garde son
///   badge d'avant.
/// - **Optimiste** : la demande s'applique localement avant la file durable, et se défait si la file y renonce.
/// - **Rétrograder / annuler le lien** (#14910) : un cran sous le niveau EFFECTIF à la fois, `public` à Connaissance ;
///   appliqué localement, envoyé, défait en cas d'échec ; le cache des liens est invalidé, l'amitié oubliée sous Ami.
@MainActor
final class ProfileCircleViewModel: ObservableObject {

    private static let requestsPage = 50

    let userId: String

    @Published private(set) var link: RelationLink?
    @Published private(set) var pendingLevel: RelationLevel?
    @Published var notice: String?
    @Published private(set) var isLowering = false
    @Published private(set) var didUnlink = false
    /// Le niveau auquel la passerelle juge les outils de cercle (`accessLevel`, #16623) ; `nil` tant qu'il n'est pas lu.
    @Published private(set) var toolLevel: RelationLevel?

    private let relations: RelationsProviding
    private let friendService: FriendServiceProviding
    private let offlineQueue: OfflineQueueing
    private let networkMonitor: any NetworkMonitorProviding
    private let now: () -> Date
    private let linksStore: @concurrent @Sendable () async -> GRDBCacheStore<String, RelationLink>
    private let forgetFriendship: @MainActor (String) async -> Void

    init(
        userId: String,
        relations: RelationsProviding,
        friendService: FriendServiceProviding,
        offlineQueue: OfflineQueueing,
        networkMonitor: any NetworkMonitorProviding,
        now: @escaping () -> Date = { Date() },
        linksStore: @escaping @concurrent @Sendable () async -> GRDBCacheStore<String, RelationLink> = CirclesLinkStore.live,
        forgetFriendship: @escaping @MainActor (String) async -> Void
    ) {
        self.userId = userId
        self.relations = relations
        self.friendService = friendService
        self.offlineQueue = offlineQueue
        self.networkMonitor = networkMonitor
        self.now = now
        self.linksStore = linksStore
        self.forgetFriendship = forgetFriendship
    }

    nonisolated deinit {}

    /// Le niveau commun, Connaissance et au-dessus ; `nil` sinon.
    var shownLevel: RelationLevel? {
        guard let level = link?.effectiveLevel, level >= .acquaintance else { return nil }
        return level
    }

    /// Le cran que l'on peut demander maintenant ; `nil` s'il est verrouillé, au sommet, ou déjà demandé.
    var offeredRaise: RelationLevel? {
        guard pendingLevel == nil, shownLevel != nil, case .available(let target)? = link?.raiseOffer(now: now()) else {
            return nil
        }
        return target
    }

    /// Le Bring se PROPOSE dès Ami, par le lien affiché ou par le verdict servi — entre deux comptes de l'équipe, Sang
    /// sans lien (#16623). La ligne ne s'affiche ensuite que si `GET /bring/:userId` l'ouvre : rien n'est déduit d'un rôle.
    var offersBring: Bool {
        max(shownLevel ?? .public, toolLevel ?? .public) >= .friend
    }

    /// Le cercle occupe l'emplacement de la fiche : un lien est montré, ou vient d'être annulé ici.
    var claimsTheSlot: Bool { shownLevel != nil || didUnlink }

    /// Le geste de baisse proposé : un cran sous le niveau affiché, l'annulation du lien à Connaissance.
    var offeredLowering: ProfileCircleLowering? {
        guard let level = shownLevel, let below = RelationRequestRule.rung(below: level) else { return nil }
        return below == .public ? .unlink : .demote(below)
    }

    var summary: String? {
        link.flatMap { CircleProgressSummary.make($0, now: now()).text(levelTitle: CircleLevelNames.title(of:)) }
    }

    func load() async {
        let relations = self.relations
        let userId = self.userId
        let store = await linksStore()
        let loader = CacheFirstLoader(store: store, key: CirclesViewModel.cacheKey, networkMonitor: networkMonitor)
        let fetch: @Sendable () async throws -> [RelationLink] = { try await relations.links() }
        let apply: @MainActor @Sendable ([RelationLink]) -> Void = { [weak self] served in
            self?.link = served.first { $0.userId == userId }
        }
        let revalidation = await loader.load(fetch: fetch, setLoadState: { _ in }, apply: apply)
        await revalidation?.value
        await loadServedDetail()
        await loadPendingRequest()
    }

    /// `GET /relations/:userId` : le blocage de montée quand la passerelle le sert, et le lien lui-même quand la liste
    /// ne le portait pas encore. Un échec garde ce qui est affiché.
    private func loadServedDetail() async {
        guard let served = try? await relations.link(userId: userId), served.userId.lowercased() == userId.lowercased() else {
            return
        }
        toolLevel = served.toolLevel
        guard let current = link else {
            if served.effectiveLevel >= .acquaintance { link = served }
            return
        }
        link = RelationLink(
            userId: current.userId,
            effectiveLevel: current.effectiveLevel,
            grantedByMe: current.grantedByMe,
            since: current.since,
            progress: current.progress,
            eligibleFor: current.eligibleFor,
            raiseBlockedUntil: served.raiseBlockedUntil ?? current.raiseBlockedUntil,
            canRaise: served.canRaise ?? current.canRaise,
            accessLevel: served.accessLevel ?? current.accessLevel
        )
    }

    private func loadPendingRequest() async {
        guard pendingLevel == nil,
              let sent = try? await friendService.sentRequests(offset: 0, limit: Self.requestsPage) else { return }
        pendingLevel = sent.data.first { $0.status == "pending" && $0.receiverId == userId }?.requestedLevel
    }

    /// Instantané -> local -> file durable -> retour arrière.
    @discardableResult
    func requestRaise() async -> Bool {
        guard let target = offeredRaise else { return false }
        pendingLevel = target
        do {
            try await CircleRaiseSender(offlineQueue: offlineQueue).send(to: userId, level: target) { [weak self] in
                self?.pendingLevel = nil
                self?.notice = String(localized: "circles.notice.requestFailed", defaultValue: "Impossible d'envoyer la demande", bundle: .main)
                HapticFeedback.error()
            }
            HapticFeedback.success()
            return true
        } catch {
            pendingLevel = nil
            notice = String(localized: "circles.notice.requestFailed", defaultValue: "Impossible d'envoyer la demande", bundle: .main)
            HapticFeedback.error()
            return false
        }
    }

    /// Instantané -> local -> réseau -> retour arrière. Silencieux pour l'autre (RG-07).
    @discardableResult
    func lower() async -> Bool {
        guard !isLowering, let current = link, let lowering = offeredLowering else { return false }
        let target = lowering.level
        let pendingBefore = pendingLevel
        isLowering = true
        defer { isLowering = false }
        link = current.lowered(to: target)
        if let waiting = pendingLevel, waiting > target { pendingLevel = nil }
        do {
            let served = try await relations.lower(userId: userId, to: target)
            link = served.effectiveLevel <= target ? served : current.lowered(to: target)
            didUnlink = target == .public
            await linksStore().invalidate(for: CirclesViewModel.cacheKey)
            if target < .friend { await forgetFriendship(userId) }
            HapticFeedback.success()
            return true
        } catch {
            link = current
            pendingLevel = pendingBefore
            notice = String(localized: "circles.notice.lowerFailed", defaultValue: "La modification n'a pas pu être enregistrée.", bundle: .main)
            HapticFeedback.error()
            return false
        }
    }
}

/// Le geste de baisse d'un lien : un cran plus bas, ou la sortie du cercle à Connaissance.
enum ProfileCircleLowering: Equatable {
    case demote(RelationLevel)
    case unlink

    var level: RelationLevel {
        switch self {
        case .demote(let level): return level
        case .unlink: return .public
        }
    }
}

/// Les libellés IMPÉRATIFS d'un lien (#14910, décision porteur) : une clé par cercle visé, jamais un gabarit
/// « Promouvoir en X » / « Rétrograder en X ». Monter : Soyons amis, Soyons proches, Devenons sang ; descendre : Restons
/// proches, Restons amis, Restons en contact ; à Connaissance, « Annuler le lien ».
enum ProfileCircleWording {
    static func promote(to level: RelationLevel) -> String? {
        switch level {
        case .friend: return String(localized: "circles.promote.friend", defaultValue: "Soyons amis", bundle: .main)
        case .close: return String(localized: "circles.promote.close", defaultValue: "Soyons proches", bundle: .main)
        case .blood: return String(localized: "circles.promote.blood", defaultValue: "Devenons sang", bundle: .main)
        case .public, .community, .acquaintance: return nil
        }
    }

    static func promoteAccessibility(to level: RelationLevel, name: String) -> String? {
        switch level {
        case .friend:
            return String(format: String(localized: "circles.promote.friend.a11y", defaultValue: "Soyons amis : demander le niveau Ami à %@", bundle: .main), name)
        case .close:
            return String(format: String(localized: "circles.promote.close.a11y", defaultValue: "Soyons proches : demander le niveau Proche à %@", bundle: .main), name)
        case .blood:
            return String(format: String(localized: "circles.promote.blood.a11y", defaultValue: "Devenons sang : demander le niveau Sang à %@", bundle: .main), name)
        case .public, .community, .acquaintance:
            return nil
        }
    }
}

extension ProfileCircleLowering {
    /// Le libellé du bouton ET de l'action destructive du dialogue.
    var label: String {
        switch self {
        case .demote(.close): return String(localized: "circles.demote.close", defaultValue: "Restons proches", bundle: .main)
        case .demote(.friend): return String(localized: "circles.demote.friend", defaultValue: "Restons amis", bundle: .main)
        case .demote: return String(localized: "circles.demote.acquaintance", defaultValue: "Restons en contact", bundle: .main)
        case .unlink: return String(localized: "circles.action.unlink", defaultValue: "Annuler le lien", bundle: .main)
        }
    }

    func confirmationTitle(name: String) -> String {
        switch self {
        case .demote(.close):
            return String(format: String(localized: "circles.demote.close.confirm.title", defaultValue: "Rester seulement proches avec %@ ?", bundle: .main), name)
        case .demote(.friend):
            return String(format: String(localized: "circles.demote.friend.confirm.title", defaultValue: "Rester seulement amis avec %@ ?", bundle: .main), name)
        case .demote:
            return String(format: String(localized: "circles.demote.acquaintance.confirm.title", defaultValue: "Rester seulement en contact avec %@ ?", bundle: .main), name)
        case .unlink:
            return String(format: String(localized: "circles.unlink.confirm.title", defaultValue: "Annuler le lien avec %@ ?", bundle: .main), name)
        }
    }
}
