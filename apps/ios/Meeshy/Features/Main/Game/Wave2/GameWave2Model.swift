import SwiftUI
import MeeshySDK

// MARK: - Une lecture, avec ce qu'elle montre pendant qu'elle se rafraîchit

/// Ce qu'un écran montre d'une lecture : la valeur (du cache, ou servie), le rafraîchissement en cours,
/// et l'échec — qui ne PRIME jamais sur une valeur déjà là (cache-first : jamais de spinner ni d'erreur
/// plein écran quand le cache a quelque chose). Un squelette ne paraît que sur un cache VIDE.
struct GameLoad<Value: Equatable>: Equatable {
    var value: Value?
    var isLoading = false
    var errorMessage: String?

    var showsSkeleton: Bool { value == nil && isLoading }
    /// L'échec se dit en grand quand il n'y a rien d'autre à montrer ; sinon il reste discret.
    var failedWithoutValue: Bool { value == nil && !isLoading && errorMessage != nil }
}

/// Les gestes du jeu EN VOL, un par intention (#9481).
struct GameWave2Pending: Equatable {
    var consent = false
    var pseudonym = false
    var invite = false
    var accept = false
    var abandon = false
    /// L'étape dont la récompense est en cours de réclamation.
    var claimingStep: Int?
    var seal = false
    var order = false
    var visibility = false
    var prestige = false
    var hide = false
    var friendsOptOut = false

    var duo: Bool { invite || accept || abandon }
}

/// Le refus du DERNIER geste, en une phrase — jamais un code (#9481).
struct GameWave2Errors: Equatable {
    var consent: String?
    var pseudonym: String?
    var duo: String?
    var claim: String?
    var seal: String?
    var order: String?
    var visibility: String?
    var prestige: String?
    var hide: String?
    var friendsOptOut: String?
}

/// Les noms des fichiers du cache disque.
enum GameWave2CacheName {
    static let leagueWeek = "league-week"
    static let leagueFriends = "league-friends"
    static func showcase(_ userId: String) -> String { "showcase-\(userId)" }
}

/// LES GESTES ET LES LECTURES DE LA VAGUE 2 (#9481) — consentement et pseudonyme de ligue, duo, saison,
/// vitrine, visibilité, Prestige, « Jeu masqué ». Chaque geste suit la règle des gestes du jeu (Instant App
/// Principles), la MÊME que `ProgressionViewModel+Game` :
///
///   capturer l'instantané → appliquer en local → envoyer → restaurer si échec
///
/// L'identifiant d'idempotence naît UNE fois par intention et ne se renouvelle qu'après un SUCCÈS (ou un
/// conflit d'identifiant) : un réessai après échec réseau rejoue la même requête, que la passerelle
/// reconnaît — il ne devient jamais une seconde écriture. Ce que le serveur seul connaît se pose à sa
/// réponse ; la relecture qui suit chaque geste rend la vérité. Un REFUS d'état (409) dit que l'écran
/// était périmé : il se relit, au lieu de laisser mentir ce qu'on vient de restaurer. Miroir de
/// `apps/web/src/routes/game-v2-actions.ts`.
///
/// Les lectures (classement, ligue Amis, vitrine d'un autre) sont CACHE-FIRST : servies depuis le disque
/// dès qu'il existe, rafraîchies en silence. Quitter la ligue retire le classement du disque.
@MainActor
final class GameWave2Model: ObservableObject {
    // iOS 26.1 : la deinit synthétisée serait ISOLÉE (SE-0466) et double-libère au démontage.
    nonisolated deinit {}

    let progression: ProgressionViewModel
    private let service: GameWave2ServiceProviding
    private let cache: GameWave2Caching
    private let friendsProvider: GameFriendsProviding
    private let prefs: GameDevicePrefsStore

    @Published var pending = GameWave2Pending()
    @Published var errors = GameWave2Errors()
    @Published private(set) var week = GameLoad<LeagueWeekResponse>()
    @Published private(set) var friendsLeague = GameLoad<LeagueFriendsResponse>()
    @Published private(set) var friends: [GameFriend] = []
    /// Le dernier état des interrupteurs de confidentialité que la passerelle a CONFIRMÉ — elle ne les sert
    /// qu'en réponse à l'écriture, jamais en lecture : l'écran garde ce qu'il a su.
    @Published private(set) var privacy: GamePrivacyResponse?

    init(
        progression: ProgressionViewModel? = nil,
        service: GameWave2ServiceProviding = GameService.shared,
        cache: GameWave2Caching? = nil,
        friends: GameFriendsProviding = CachedGameFriends(),
        prefs: GameDevicePrefsStore? = nil,
        currentUserId: String = AuthManager.shared.currentUser?.id ?? ""
    ) {
        self.progression = progression ?? ProgressionViewModel()
        self.service = service
        let disk = GameWave2DiskCache(userId: currentUserId)
        self.cache = cache ?? disk
        self.friendsProvider = friends
        self.prefs = prefs ?? GameDevicePrefsStore.current(userId: currentUserId)
        Task { await disk.purgeOtherAccounts() }
    }

    var game: GameBlock? { progression.game }
    var isOnline: Bool { progression.isOnline }

    // MARK: - Les lectures

    /// Le classement de MA ligue cette semaine : le cache d'abord, le réseau en silence derrière.
    func loadWeek() async {
        if week.value == nil, let cached = await cache.load(LeagueWeekResponse.self, name: GameWave2CacheName.leagueWeek) {
            week.value = cached
        }
        week.isLoading = true
        week.errorMessage = nil
        do {
            let fresh = try await service.fetchLeagueWeek()
            week.value = fresh
            await cache.save(fresh, name: GameWave2CacheName.leagueWeek)
        } catch {
            week.errorMessage = GameCopy.errorMessage(for: error)
        }
        week.isLoading = false
    }

    func loadFriendsLeague() async {
        friends = await friendsProvider.friends()
        if friendsLeague.value == nil,
           let cached = await cache.load(LeagueFriendsResponse.self, name: GameWave2CacheName.leagueFriends) {
            friendsLeague.value = cached
        }
        friendsLeague.isLoading = true
        friendsLeague.errorMessage = nil
        do {
            let fresh = try await service.fetchFriendsLeague()
            friendsLeague.value = fresh
            await cache.save(fresh, name: GameWave2CacheName.leagueFriends)
        } catch {
            friendsLeague.errorMessage = GameCopy.errorMessage(for: error)
        }
        friendsLeague.isLoading = false
    }

    /// Les amis seuls (le duo les propose sans ouvrir la ligue Amis).
    func loadFriends() async {
        friends = await friendsProvider.friends()
    }

    /// La vitrine d'un AUTRE membre : ce que SA visibilité autorise, rien sinon (voir `GameShowcaseLoader`).
    func showcase(of userId: String) async -> UserShowcaseResponse? {
        await GameShowcaseLoader(service: service, cache: cache).load(userId: userId)
    }

    // MARK: - Le socle commun d'un geste

    /// Un geste du jeu de bout en bout. Rend `true` quand le serveur l'a pris en compte.
    @discardableResult
    private func run<Served>(
        intention: String,
        apply: (GameState) -> GameState,
        send: (String) async throws -> Served,
        land: ((GameState, Served) -> GameState)? = nil,
        onApplied: (() -> Void)? = nil,
        fail: (String) -> Void
    ) async -> Bool {
        let before = progression.beginGesture(apply)
        onApplied?()
        var done = false
        do {
            let result = try await send(progression.requestId(for: intention))
            progression.spent(intention)
            if let land, let snapshot = progression.snapshot, let game = snapshot.game {
                progression.commit(land(GameState(game: game, meesh: snapshot.meesh), result), over: snapshot)
            }
            await progression.load(forceNetwork: true)
            done = true
        } catch {
            progression.restore(before)
            progression.releaseRequestIdIfConflict(error, intention: intention)
            fail(GameCopy.errorMessage(for: error))
            if GameService.refusal(of: error) != nil { await progression.load(forceNetwork: true) }
        }
        progression.endGesture()
        return done
    }

    // MARK: - La ligue

    /// Consentir à la ligue publique (ou retirer son consentement). Le pseudonyme est tiré au sort par le
    /// serveur ; celui qu'on choisit n'est offert que quand le contrat l'ouvre (`GameLeagueRules`).
    func setConsent(_ consent: Bool, pseudonym: String? = nil) async {
        guard !pending.consent else { return }
        pending.consent = true
        errors.consent = nil
        await run(
            intention: "consent:\(consent):\(pseudonym ?? "")",
            apply: { GameWave2Optimistic.afterConsent($0, consent: consent, pseudonym: pseudonym) },
            send: { [service] requestId in try await service.setLeagueConsent(consent, pseudonym: pseudonym, requestId: requestId) },
            land: { GameWave2Optimistic.withConsentResult($0, consent: $1.consent, pseudonym: $1.pseudonym) },
            onApplied: { [weak self] in
                // Quitter la ligue retire le classement du disque : les pseudonymes des autres membres ne restent
                // pas sur l'appareil d'une personne qui n'y joue plus (conformité A-9).
                guard !consent, let self else { return }
                self.week = GameLoad()
                Task { await self.cache.remove(name: GameWave2CacheName.leagueWeek) }
            },
            fail: { errors.consent = $0 }
        )
        pending.consent = false
    }

    func setPseudonym(_ name: String) async {
        guard !pending.pseudonym else { return }
        pending.pseudonym = true
        errors.pseudonym = nil
        await run(
            intention: "pseudonym:\(name)",
            apply: { GameWave2Optimistic.withPseudonym($0, pseudonym: name) },
            send: { [service] requestId in try await service.setLeaguePseudonym(name, requestId: requestId) },
            fail: { errors.pseudonym = $0 }
        )
        pending.pseudonym = false
    }

    // MARK: - Le duo

    func invite(_ friend: GameFriend) async {
        guard !pending.duo else { return }
        pending.invite = true
        errors.duo = nil
        await run(
            intention: "invite:\(friend.id)",
            apply: { GameWave2Optimistic.afterInvite($0, friendId: friend.id, friendName: friend.displayName) },
            send: { [service] requestId in try await service.inviteToDuo(friendId: friend.id, requestId: requestId) },
            land: { GameWave2Optimistic.withDuoId($0, duoId: $1.duoId) },
            fail: { errors.duo = $0 }
        )
        pending.invite = false
    }

    func accept(duoId: String) async {
        guard !pending.duo else { return }
        pending.accept = true
        errors.duo = nil
        await run(
            intention: "accept:\(duoId)",
            apply: { GameWave2Optimistic.afterAccept($0) },
            send: { [service] requestId in try await service.acceptDuo(duoId: duoId, requestId: requestId) },
            fail: { errors.duo = $0 }
        )
        pending.accept = false
    }

    /// Décliner, annuler ou quitter : un seul geste (conformité B-4 : le duo se quitte à tout moment).
    func abandon(duoId: String) async {
        guard !pending.duo else { return }
        pending.abandon = true
        errors.duo = nil
        await run(
            intention: "abandon:\(duoId)",
            apply: { GameWave2Optimistic.afterAbandon($0) },
            send: { [service] requestId in try await service.abandonDuo(duoId: duoId, requestId: requestId) },
            fail: { errors.duo = $0 }
        )
        pending.abandon = false
    }

    // MARK: - La saison

    func claim(step: Int) async {
        guard pending.claimingStep == nil else { return }
        pending.claimingStep = step
        errors.claim = nil
        await run(
            intention: "claim:\(step)",
            apply: { GameWave2Optimistic.afterSeasonClaim($0, step: step) },
            send: { [service] requestId in try await service.claimSeasonStep(step, requestId: requestId) },
            fail: { errors.claim = $0 }
        )
        pending.claimingStep = nil
    }

    func buySeal() async {
        guard !pending.seal else { return }
        pending.seal = true
        errors.seal = nil
        await run(
            intention: "seal",
            apply: { GameWave2Optimistic.afterSealBought($0) },
            send: { [service] requestId in try await service.buySeasonSeal(requestId: requestId) },
            fail: { errors.seal = $0 }
        )
        pending.seal = false
    }

    // MARK: - La vitrine et la visibilité

    func saveOrder(_ order: [String]) async {
        guard !pending.order else { return }
        pending.order = true
        errors.order = nil
        await run(
            intention: "order:\(order.joined(separator: ","))",
            apply: { GameWave2Optimistic.withShowcaseOrder($0, order: order) },
            send: { [service] requestId in try await service.setShowcaseOrder(order, requestId: requestId) },
            fail: { errors.order = $0 }
        )
        pending.order = false
    }

    func setVisibility(showcase: ShowcaseVisibility? = nil, rank: ShowcaseVisibility? = nil,
                       treasury: ShowcaseVisibility? = nil, atlas: ShowcaseVisibility? = nil) async {
        guard !pending.visibility else { return }
        pending.visibility = true
        errors.visibility = nil
        await run(
            intention: "visibility:\(showcase?.rawValue ?? "-"):\(rank?.rawValue ?? "-"):\(treasury?.rawValue ?? "-"):\(atlas?.rawValue ?? "-")",
            apply: { GameWave2Optimistic.withVisibility($0, showcase: showcase, rank: rank, treasury: treasury, atlas: atlas) },
            send: { [service] requestId in
                try await service.setVisibility(ShowcaseVisibilityRequest(
                    requestId: requestId, showcase: showcase, rank: rank, treasury: treasury, atlas: atlas))
            },
            fail: { errors.visibility = $0 }
        )
        pending.visibility = false
    }

    // MARK: - Le Prestige

    @discardableResult
    func passPrestige() async -> Bool {
        guard !pending.prestige else { return false }
        pending.prestige = true
        errors.prestige = nil
        let passed = await run(
            intention: "prestige",
            apply: { GameWave2Optimistic.afterPrestige($0) },
            send: { [service] requestId in try await service.passPrestige(requestId: requestId) },
            fail: { errors.prestige = $0 }
        )
        pending.prestige = false
        return passed
    }

    // MARK: - « Jeu masqué » et l'opposition à la ligue Amis

    /// « Jeu masqué » est un geste COMPOSÉ, et l'écran le dit : il masque le jeu sur l'appareil ET demande au
    /// serveur de sortir le compte des classements, des vitrines et des listes (la vitrine retombe à « moi
    /// seul »). Si le serveur REFUSE, l'interrupteur se rouvre : « masqué » ici alors que les autres voient
    /// encore serait une fausse promesse. Hors ligne, le geste est SUSPENDU pour la même raison ; le
    /// réafficher marche toujours côté appareil, et dit au serveur ce qu'il peut.
    func setHidden(_ hidden: Bool) async {
        guard !pending.hide else { return }
        pending.hide = true
        errors.hide = nil
        let previous = prefs.prefs.hidden
        prefs.set(hidden: hidden)
        let intention = "hide:\(hidden)"
        do {
            let response = try await service.setPrivacy(gameHidden: hidden, friendsLeagueOptOut: nil, requestId: progression.requestId(for: intention))
            progression.spent(intention)
            privacy = response
            if hidden { await closeEverything() }
            await progression.load(forceNetwork: true)
        } catch {
            progression.releaseRequestIdIfConflict(error, intention: intention)
            errors.hide = GameCopy.errorMessage(for: error)
            // Masquer ne tient que si le serveur l'a pris : « masqué » ici alors que les autres voient encore serait
            // une fausse promesse. Réafficher, lui, ne se bloque jamais.
            if hidden { prefs.set(hidden: previous) }
        }
        pending.hide = false
    }

    /// Ce que « Jeu masqué » ferme APRÈS que le serveur l'a pris : les quatre visibilités à « moi seul » (le
    /// réafficher ne les rouvrira pas) et la ligue publique. Chacune est un geste ordinaire — optimiste, avec retour
    /// arrière ; un refus se dit, sans défaire le masquage, que le serveur applique déjà.
    private func closeEverything() async {
        if let visibility = game?.visibility, visibility != GameVisibility(showcase: .me, rank: .me, treasury: .me, atlas: .me) {
            await setVisibility(showcase: .me, rank: .me, treasury: .me, atlas: .me)
        }
        if game?.league?.access == .open {
            await setConsent(false)
        }
    }

    func setFriendsLeagueOptOut(_ optedOut: Bool) async {
        guard !pending.friendsOptOut else { return }
        pending.friendsOptOut = true
        errors.friendsOptOut = nil
        do {
            let response = try await service.setPrivacy(gameHidden: nil, friendsLeagueOptOut: optedOut,
                                                        requestId: progression.requestId(for: "friends-opt-out:\(optedOut)"))
            progression.spent("friends-opt-out:\(optedOut)")
            privacy = response
        } catch {
            progression.releaseRequestIdIfConflict(error, intention: "friends-opt-out:\(optedOut)")
            errors.friendsOptOut = GameCopy.errorMessage(for: error)
        }
        pending.friendsOptOut = false
    }
}
