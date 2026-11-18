import Foundation
import Combine
import MeeshySDK

/// D'où « En commun » se lit (#19377) : le cache chiffré de l'app, puis `GET /users/:id/in-common`. L'app fournit
/// l'implémentation ; sans elle, la fiche montre ses conversations en commun comme avant.
@MainActor
public protocol ProfileInCommonLoading: AnyObject {
    func cachedInCommon(with userId: String) async -> CacheResult<[UserInCommon]>
    func fetchInCommon(with userId: String, mediaKind: InCommonMediaKind?) async throws -> UserInCommon
    func storeInCommon(_ inCommon: UserInCommon) async
}

/// Aucune source : la fiche s'en passe (aperçus, témoins, passerelle injoignable au premier lancement).
@MainActor
public final class ProfileInCommonUnavailable: ProfileInCommonLoading {
    nonisolated deinit {}

    public init() {}

    public func cachedInCommon(with userId: String) async -> CacheResult<[UserInCommon]> { .empty }

    public func fetchInCommon(with userId: String, mediaKind: InCommonMediaKind?) async throws -> UserInCommon {
        throw CancellationError()
    }

    public func storeInCommon(_ inCommon: UserInCommon) async {}
}

/// « En commun » sur la fiche d'un autre : le cache d'abord (loi 8), revalidé en silence ; un échec réseau garde ce
/// qui est à l'écran. Un filtre de médias dont la page n'est pas déjà là la demande au serveur, sans effacer la grille.
@MainActor
final class ProfileInCommonModel: ObservableObject {
    nonisolated deinit {}

    @Published private(set) var inCommon: UserInCommon?
    @Published private(set) var filter: InCommonMediaKind?
    @Published private(set) var pagesByKind: [InCommonMediaKind: [InCommonMedia]] = [:]

    private var loadedUserId: String?

    func open(userId: String, using source: any ProfileInCommonLoading) async {
        forgetAnotherPerson(userId)
        switch await source.cachedInCommon(with: userId) {
        case .fresh(let cached, _):
            if let first = cached.first {
                show(first)
                return
            }
        case .stale(let cached, _):
            if let first = cached.first { show(first) }
        case .expired, .empty:
            break
        }
        await refresh(userId: userId, using: source)
    }

    func refresh(userId: String, using source: any ProfileInCommonLoading) async {
        do {
            let served = try await source.fetchInCommon(with: userId, mediaKind: nil)
            guard loadedUserId == userId else { return }
            show(served)
            await source.storeInCommon(served)
        } catch {
            return
        }
    }

    func digest(conversations: Int) -> ProfileInCommonDigest? {
        inCommon.map { ProfileInCommonDigest.resolve(conversations: conversations, inCommon: $0) }
    }

    /// Le filtre montré : celui choisi, sinon le premier type servi.
    func shownFilter(in digest: ProfileInCommonDigest) -> InCommonMediaKind? {
        guard let filter, digest.mediaFilters.contains(filter) else { return digest.defaultFilter }
        return filter
    }

    /// Les médias d'un type : la page demandée pour lui si elle est arrivée, sinon ceux de la première page.
    func media(of kind: InCommonMediaKind, in digest: ProfileInCommonDigest) -> [InCommonMedia] {
        pagesByKind[kind] ?? digest.media(of: kind)
    }

    func select(_ kind: InCommonMediaKind, userId: String, using source: any ProfileInCommonLoading) async {
        filter = kind
        guard pagesByKind[kind] == nil, let media = inCommon?.media else { return }
        let shown = media.shownItems.filter { $0.mediaKind == kind }.count
        guard shown < (media.countsByKind[kind] ?? 0) else { return }
        do {
            let served = try await source.fetchInCommon(with: userId, mediaKind: kind)
            guard loadedUserId == userId else { return }
            pagesByKind[kind] = (served.media?.shownItems ?? []).filter { $0.mediaKind == kind }
        } catch {
            return
        }
    }

    private func forgetAnotherPerson(_ userId: String) {
        guard loadedUserId != userId else { return }
        loadedUserId = userId
        inCommon = nil
        filter = nil
        pagesByKind = [:]
    }

    private func show(_ value: UserInCommon) {
        inCommon = value
        pagesByKind = [:]
    }
}
