import Foundation
import MeeshySDK

// MARK: - Les lectures d'intégration du jeu (#9481)
//
// Deux lectures que le serveur sert et que l'app ne devine plus :
//  - l'ÉTAT des réglages du jeu (`GET /me/game/privacy`) — « Jeu masqué », l'opposition à la ligue Amis. L'appareil
//    n'en garde qu'une COPIE (`GameDevicePrefsStore`), qui sert hors ligne et que la lecture remplace ;
//  - le jeu d'un AUTRE membre (`GET /users/:userId/game`) — niveau, palier, rang, trésor, Flamme, selon SON réglage.

// MARK: Les réglages, relus

/// Relit les réglages du jeu au serveur et les pose sur l'appareil. Le serveur est maître : l'appareil qui
/// a masqué le jeu avant que la lecture existe, ou un AUTRE appareil du même compte, se met à jour au chargement.
/// Hors ligne (ou refus), la copie de l'appareil reste, sans rien dire : c'est le dernier état connu.
@MainActor
struct GameSettingsSync {
    var service: GameIntegrationServiceProviding = GameService.shared
    var prefs: GameDevicePrefsStore = GameDevicePrefsStore.current()

    @discardableResult
    func refresh() async -> GameSettingsResponse? {
        guard let served = try? await service.fetchSettings() else { return nil }
        prefs.set(hidden: served.gameHidden, friendsLeagueOptOut: served.friendsLeagueOptOut)
        return served
    }
}

// MARK: Le jeu d'un autre

extension GameWave2CacheName {
    static func userGame(_ userId: String) -> String { "user-game-\(userId)" }
}

/// Ce qu'on montre du jeu d'un autre : le niveau et le rang (réglage `rank`), et le palier du trésor (réglage
/// `treasury`). Rien d'autre ne voyage — jamais la Gloire, les jours de série, les Meeshes, une date, la présence.
struct GameStandingContent: Equatable, Sendable {
    let standing: GameStanding?
    let treasuryTier: TreasuryTierKey?

    /// `nil` quand il n'y a RIEN à montrer : un refus, un compte inconnu, ou deux blocs que ce client ne lit pas.
    static func of(_ response: UserGameProfileResponse?) -> GameStandingContent? {
        guard let response, response.hasSomethingToShow else { return nil }
        return GameStandingContent(standing: response.standing, treasuryTier: response.treasury?.tier)
    }
}

/// Ce que la carte d'un visiteur a LU, et POUR QUI. La carte est montée par une injection `AnyView` à une place
/// fixe de la feuille de profil (`profileGameSection`) : passer d'un membre à un autre GARDE la vue et son état.
/// Sans l'identifiant, le niveau et les trophées du membre précédent se peignaient sous le nom du suivant jusqu'à
/// la réponse du réseau — et pour de bon hors ligne.
struct GameVisitorRead: Equatable {
    let userId: String
    let entries: [GameVisitorShowcase.Entry]
    let standing: GameStandingContent?

    /// Ce qui se peint pour `userId` : rien sous « Jeu masqué », rien d'un autre membre, rien de vide.
    static func shown(_ read: GameVisitorRead?, for userId: String, hidden: Bool) -> GameVisitorRead? {
        guard !hidden, let read, read.userId == userId, !read.entries.isEmpty || read.standing != nil else { return nil }
        return read
    }
}

/// Lit le jeu d'un AUTRE membre : le cache disque d'abord, le réseau ensuite — la MÊME règle que la vitrine
/// (`GameShowcaseLoader`). Quand le serveur a RÉPONDU (refus, blocage, réglage fermé depuis — conformité D-5), la
/// copie gardée est oubliée, jamais rouverte depuis le disque : elle ne sert que sur une panne de transport.
struct GameUserGameLoader: Sendable {
    let service: GameIntegrationServiceProviding
    let cache: GameWave2Caching

    init(service: GameIntegrationServiceProviding = GameService.shared, cache: GameWave2Caching? = nil,
         currentUserId: String = AuthManager.shared.currentUser?.id ?? "") {
        self.service = service
        self.cache = cache ?? GameWave2DiskCache(userId: currentUserId)
    }

    /// Ce que le disque a gardé, sans le réseau : l'écran s'y peint avant que la lecture réponde.
    func cached(userId: String) async -> GameStandingContent? {
        GameStandingContent.of(await cache.load(UserGameProfileResponse.self, name: GameWave2CacheName.userGame(userId)))
    }

    func load(userId: String) async -> GameStandingContent? {
        let name = GameWave2CacheName.userGame(userId)
        do {
            let fresh = try await service.fetchUserGame(userId: userId)
            await cache.save(fresh, name: name)
            return GameStandingContent.of(fresh)
        } catch {
            guard GameShowcaseLoader.isTransportFailure(error) else {
                await cache.remove(name: name)
                return nil
            }
            return GameStandingContent.of(await cache.load(UserGameProfileResponse.self, name: name))
        }
    }
}
