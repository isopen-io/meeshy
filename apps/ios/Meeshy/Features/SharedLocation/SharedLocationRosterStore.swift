import CryptoKit
import Foundation
import MeeshySDK

/// Où la liste survit à un lancement : les identifiants et les échéances, jamais une position.
@MainActor
protocol SharedLocationRosterStoring: AnyObject {
    func load() -> SharedLocationRoster?
    func save(_ roster: SharedLocationRoster)
    /// La liste vient-elle d'un autre appareil du compte (#18578) ? Survit au lancement : un appareil qui n'a fait que
    /// RECEVOIR la liste ne se remet jamais à publier sa position en se relançant.
    func loadReceived() -> Bool
    func saveReceived(_ received: Bool)
    /// Le démarrage que CET appareil a fait accepter (#19681) : survit au lancement avec la marque « reçue », s'efface
    /// avec elle (arrêt, cession), et vit sous la clé du compte comme la liste.
    func loadPublishedStart() -> String?
    func savePublishedStart(_ startedAt: String?)
}

/// La liste d'UN compte, dans ses réglages locaux. Les réglages partent dans la sauvegarde iCloud : un iPhone restauré
/// depuis la sauvegarde d'un AUTRE appareil du compte y retrouverait la liste, la marque « reçue », le démarrage et les
/// retraits en attente de celui-ci (#19767, #19929). La liste porte donc la marque de l'appareil qui l'a écrite — une
/// EMPREINTE de son identifiant d'installation (trousseau `ThisDeviceOnly`, jamais restauré ailleurs), jamais
/// l'identifiant lui-même, qui est aussi celui des jetons push. Lue sur un autre appareil, elle est EFFACÉE avec sa
/// marque et son démarrage : la relecture du partage servi la reconstruit, reçue — rien de la sauvegarde ne repart, ni
/// un arrêt ni une liste périmée. Une marque d'avant l'empreinte (l'identifiant en clair) vaut pour cet appareil et se
/// réécrit en empreinte ; une liste d'avant toute marque est adoptée telle quelle. Sans identifiant tenu par le
/// trousseau (avant le premier déverrouillage), rien n'est jugé et la marque ne change pas.
final class UserDefaultsSharedLocationRosterStore: SharedLocationRosterStoring {
    nonisolated deinit {}

    private let key: String
    private let defaults: UserDefaults

    /// L'effacement se fait dans les réglages AVANT que la marque passe à cet appareil : déduit sans être écrit, il ne
    /// tiendrait qu'un lancement.
    init(userId: String, deviceId: String?, defaults: UserDefaults = .standard) {
        self.key = "sharedLocation.roster." + userId
        self.defaults = defaults
        guard let deviceId, !deviceId.isEmpty else { return }
        let marker = key + ".device"
        let stamped = defaults.string(forKey: marker)
        let mark = Self.deviceMark(userId: userId, deviceId: deviceId)
        if Self.isWrittenElsewhere(stamped: stamped, deviceId: deviceId, mark: mark) {
            save(.empty)
            saveReceived(false)
            savePublishedStart(nil)
        }
        if stamped != mark { defaults.set(mark, forKey: marker) }
    }

    private static let markDomain = "meeshy.sharedLocation.deviceMark.v1:"

    /// L'empreinte qui marque la liste : un condensé du compte et de l'installation, qui ne redonne ni l'un ni l'autre.
    static func deviceMark(userId: String, deviceId: String) -> String {
        SHA256.hash(data: Data((Self.markDomain + userId + ":" + deviceId).utf8)).map { String(format: "%02x", $0) }.joined()
    }

    static func isWrittenElsewhere(stamped: String?, deviceId: String, mark: String) -> Bool {
        guard let stamped, !stamped.isEmpty else { return false }
        return stamped != mark && stamped != deviceId
    }

    func load() -> SharedLocationRoster? {
        defaults.data(forKey: key).flatMap { try? JSONDecoder().decode(SharedLocationRoster.self, from: $0) }
    }

    func save(_ roster: SharedLocationRoster) {
        guard !roster.isEmpty, let data = try? JSONEncoder().encode(roster) else {
            defaults.removeObject(forKey: key)
            return
        }
        defaults.set(data, forKey: key)
    }

    func loadReceived() -> Bool { defaults.bool(forKey: key + ".received") }

    func saveReceived(_ received: Bool) {
        if received { defaults.set(true, forKey: key + ".received") } else { defaults.removeObject(forKey: key + ".received") }
    }

    func loadPublishedStart() -> String? { defaults.string(forKey: key + ".publishedStart") }

    func savePublishedStart(_ startedAt: String?) {
        if let startedAt { defaults.set(startedAt, forKey: key + ".publishedStart") } else { defaults.removeObject(forKey: key + ".publishedStart") }
    }
}
