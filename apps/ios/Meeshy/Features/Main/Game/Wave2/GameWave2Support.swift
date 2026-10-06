import Foundation
import MeeshySDK
import MeeshyUI

// MARK: - Les appuis de la vague 2 : le cache disque, les réglages de l'appareil, les amis
//
// Trois petits outils, chacun derrière un protocole pour que les gestes se testent sans disque, sans
// réseau et sans carnet d'amis.

// MARK: Le cache disque

/// Le cache DISQUE du jeu (classement de la semaine, ligue Amis, vitrine d'un autre). Cache-first : un
/// écran se peint depuis lui avant la réponse du réseau. Il vit dans le dossier des caches du système
/// (purgeable, hors sauvegarde), rangé PAR COMPTE ; il ne garde que ce que la passerelle a servi,
/// jamais une donnée qu'elle n'aurait pas servie à ce compte.
///
/// **Conformité A-9** : les pseudonymes et les totaux des AUTRES membres d'une ligue ne restent pas sur
/// l'appareil d'une personne qui n'y joue plus — `remove(name:)` à la sortie de la ligue, et
/// `purgeOtherAccounts` à l'ouverture, qui retire le dossier de tout autre compte.
protocol GameWave2Caching: Sendable {
    func load<T: Decodable & Sendable>(_ type: T.Type, name: String) async -> T?
    func save<T: Encodable & Sendable>(_ value: T, name: String) async
    func remove(name: String) async
}

actor GameWave2DiskCache: GameWave2Caching {
    static let folder = "meeshy-game-v2"

    private let directory: URL
    private let root: URL

    init(userId: String, base: URL? = nil) {
        let caches = base ?? FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        root = caches.appendingPathComponent(Self.folder, isDirectory: true)
        directory = root.appendingPathComponent(Self.safe(userId), isDirectory: true)
    }

    /// Un identifiant venu d'une charge est ENCODÉ avant d'entrer dans un chemin.
    nonisolated static func safe(_ value: String) -> String {
        let allowed = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_")
        let encoded = value.unicodeScalars.map { allowed.contains($0) ? String($0) : "_" }.joined()
        return encoded.isEmpty ? "_" : encoded
    }

    private func url(_ name: String) -> URL {
        directory.appendingPathComponent(Self.safe(name) + ".json")
    }

    func load<T: Decodable & Sendable>(_ type: T.Type, name: String) async -> T? {
        guard let data = try? Data(contentsOf: url(name)) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }

    func save<T: Encodable & Sendable>(_ value: T, name: String) async {
        guard let data = try? JSONEncoder().encode(value) else { return }
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try? data.write(to: url(name), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    func remove(name: String) async {
        try? FileManager.default.removeItem(at: url(name))
    }

    /// Retire le dossier de tout AUTRE compte que celui-ci.
    func purgeOtherAccounts() {
        let mine = directory.lastPathComponent
        let others = (try? FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)) ?? []
        for other in others where other.lastPathComponent != mine {
            try? FileManager.default.removeItem(at: other)
        }
    }
}

// MARK: Les réglages de l'appareil

/// LES RÉGLAGES DU JEU SUR L'APPAREIL (#9481) — deux commodités, par appareil et par compte :
///
///  - `hidden` — « Jeu masqué » : le jeu disparaît des écrans de cet appareil (Progression, profil).
///    Le geste du réglage fait AUSSI ce que le serveur sait faire (`PUT /me/game/privacy`) ; ce
///    drapeau-ci n'en est que la moitié locale, jamais une garantie de confidentialité à lui seul ;
///  - `celebrations` — les cartes de Mee et Meo et les propositions de photo.
///
/// Aucune donnée de jeu ne vit ici. Une valeur illisible vaut le défaut : le jeu visible, les
/// célébrations permises. Miroir de `apps/web/src/lib/game/preferences.ts`.
struct GameDevicePrefs: Equatable, Sendable {
    var hidden = false
    var celebrations = true
}

@MainActor
final class GameDevicePrefsStore: ObservableObject {
    nonisolated deinit {}

    private static var cached: GameDevicePrefsStore?

    /// Celui du compte courant, partagé par les écrans du jeu ; un autre compte reçoit le sien.
    static func current(userId: String = AuthManager.shared.currentUser?.id ?? "") -> GameDevicePrefsStore {
        if let cached, cached.userId == userId { return cached }
        let fresh = GameDevicePrefsStore(userId: userId)
        cached = fresh
        return fresh
    }

    @Published private(set) var prefs: GameDevicePrefs
    private let userId: String
    private let defaults: UserDefaults
    private let key: String

    init(userId: String, defaults: UserDefaults = .standard) {
        self.userId = userId
        self.defaults = defaults
        self.key = "meeshy.game.prefs.\(userId)"
        self.prefs = Self.read(defaults, key)
    }

    private static func read(_ defaults: UserDefaults, _ key: String) -> GameDevicePrefs {
        guard let raw = defaults.dictionary(forKey: key) else { return GameDevicePrefs() }
        let fallback = GameDevicePrefs()
        return GameDevicePrefs(
            hidden: raw["hidden"] as? Bool ?? fallback.hidden,
            celebrations: raw["celebrations"] as? Bool ?? fallback.celebrations
        )
    }

    func set(hidden: Bool? = nil, celebrations: Bool? = nil) {
        var next = prefs
        if let hidden { next.hidden = hidden }
        if let celebrations { next.celebrations = celebrations }
        guard next != prefs else { return }
        prefs = next
        defaults.set(["hidden": next.hidden, "celebrations": next.celebrations], forKey: key)
    }
}

// MARK: Les amis

/// Un ami que le duo peut inviter, et dont la ligue Amis dit le NOM — le seul endroit du jeu où un
/// classement porte des identités (ils se connaissent déjà).
struct GameFriend: Equatable, Hashable, Sendable {
    let id: String
    let displayName: String
}

protocol GameFriendsProviding: Sendable {
    func friends() async -> [GameFriend]
}

/// Les amitiés ACCEPTÉES, lues dans le cache déjà peuplé par les écrans de contacts : l'écran se peint
/// sans attendre le réseau. Une personne sans nom d'affichage se nomme par son pseudo, jamais par un
/// identifiant. Miroir de `apps/web/src/routes/game-friends.ts`.
struct CachedGameFriends: GameFriendsProviding {
    func friends() async -> [GameFriend] {
        await FriendsCacheAudienceContacts().cachedContacts().map { contact in
            let name = contact.displayName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            return GameFriend(id: contact.id, displayName: name.isEmpty ? contact.username : name)
        }
    }
}

// MARK: La vitrine d'un autre, cache-first

/// Lit la vitrine d'un AUTRE membre : le cache disque d'abord, le réseau ensuite. Ce que SA visibilité autorise,
/// rien sinon — le serveur décide (`visible`), et un échec ne dit RIEN : une vitrine fermée ne se distingue pas
/// d'une vitrine absente. Partagé par le profil d'un autre, la fiche d'une carte de contact et le modèle des
/// pages du jeu.
struct GameShowcaseLoader: Sendable {
    let service: GameWave2ServiceProviding
    let cache: GameWave2Caching

    init(service: GameWave2ServiceProviding = GameService.shared, cache: GameWave2Caching? = nil,
         currentUserId: String = AuthManager.shared.currentUser?.id ?? "") {
        self.service = service
        self.cache = cache ?? GameWave2DiskCache(userId: currentUserId)
    }

    func load(userId: String) async -> UserShowcaseResponse? {
        let name = GameWave2CacheName.showcase(userId)
        let cached = await cache.load(UserShowcaseResponse.self, name: name)
        do {
            let fresh = try await service.fetchUserShowcase(userId: userId)
            await cache.save(fresh, name: name)
            return fresh
        } catch {
            return cached
        }
    }
}

// MARK: Le jeu de MON profil, lu dans le cache de la progression

/// Ce que mon profil montre du jeu : le bloc `game` et mes meilleures médailles. Lu dans le cache de la progression
/// (la même clé que le hub) — jamais le réseau, jamais un spinner : le profil est déjà là.
struct GameProfileContent: Equatable {
    let game: GameBlock
    let medals: [GameBadgeItem]
}

protocol GameProfileSourcing: Sendable {
    func load() async -> GameProfileContent?
}

struct CachedGameProfileSource: GameProfileSourcing {
    var userId: String = AuthManager.shared.currentUser?.id ?? ""
    private static let medalCount = 4

    func load() async -> GameProfileContent? {
        let store = await CacheCoordinator.shared.engagementProgress
        guard let cached = await store.loadIgnoringExpiry(for: "engagement:\(userId)"),
              let snapshot = cached.items.first, let game = snapshot.game else { return nil }
        let medals = GameBadges.items(for: EngagementProgressResolver.resolve(snapshot))
            .filter(\.lit)
            .sorted { $0.threshold != $1.threshold ? $0.threshold > $1.threshold : $0.progress > $1.progress }
        return GameProfileContent(game: game, medals: Array(medals.prefix(Self.medalCount)))
    }
}
