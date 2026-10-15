import Foundation
import MeeshySDK
import os

// MARK: - Un compte supprimé quitte l'appareil, avec son jeu (#10482)
//
// Jumelle iOS de #10237 (web). Quand la passerelle dit qu'un compte de
// l'appareil est supprimé (`AccountDeletedSignal`, posté par le transport pour
// le seul propriétaire du jeton présenté ou de la connexion), ce compte quitte
// le sélecteur et le trousseau (`AuthManager.retireDeletedAccount`) et son
// dossier du jeu — `Application Support/MeeshyGame/<id>`, des photos sans
// autre exemplaire — est effacé. Aucun autre compte n'est touché.
//
// Le retrait est NOTÉ avant le geste et effacé après succès : le signal ne
// repasse pas, et un retrait interrompu (application tuée, disque refusé) se
// rejoue au lancement suivant, une fois la session du trousseau lue. La note
// est DATÉE : un compte qui a reçu une session neuve depuis (reconnecté,
// réajouté au sélecteur) n'est plus retiré par elle.
//
// Un retrait abouti laisse une TOMBE datée : une écriture du carnet encore en
// vol au moment de l'effacement recrée `MeeshyGame/<id>` ; chaque lancement
// réefface donc le dossier des comptes enterrés — sauf celui d'un compte qui a
// reçu une session neuve depuis. Les tombes sont bornées aux plus récentes.

@MainActor
protocol DeletedAccountRetiring: AnyObject {
    func retireDeletedAccount(userId: String) async -> Bool
    func sessionIssuedAt(for userId: String) -> Date?
}

extension AuthManager: DeletedAccountRetiring {}

@MainActor
final class DeletedAccountRetirement {
    nonisolated deinit {}

    static let shared = DeletedAccountRetirement()

    nonisolated static let pendingKey = "meeshy.accountDeleted.pending"
    nonisolated static let notedAtKey = "meeshy.accountDeleted.notedAt"
    nonisolated static let buriedKey = "meeshy.accountDeleted.buried"
    nonisolated static let buriedLimit = 32

    typealias SessionResolution = @MainActor () async -> Void

    private let accounts: DeletedAccountRetiring
    private let gameBase: URL?
    private let defaults: UserDefaults
    private let sessionResolved: SessionResolution
    private let now: () -> Date
    private var observer: NSObjectProtocol?
    private var inFlight: Set<String> = []

    init(
        accounts: DeletedAccountRetiring = AuthManager.shared,
        gameBase: URL? = nil,
        defaults: UserDefaults = .standard,
        sessionResolved: @escaping SessionResolution = DeletedAccountRetirement.awaitStoredSessionRead,
        now: @escaping () -> Date = { Date() }
    ) {
        self.accounts = accounts
        self.gameBase = gameBase
        self.defaults = defaults
        self.sessionResolved = sessionResolved
        self.now = now
    }

    /// Écoute le signal et rejoue les retraits restés en suspens. Idempotent.
    func install(center: NotificationCenter = .default) {
        guard observer == nil else { return }
        observer = center.addObserver(forName: .meeshyAccountDeleted, object: nil, queue: .main) { [weak self] note in
            guard let userId = AccountDeletedSignal.accountId(in: note) else { return }
            Task { @MainActor [weak self] in
                await self?.retire(userId)
            }
        }
        Task { @MainActor [weak self] in
            await self?.replayPending()
        }
    }

    /// Les comptes notés « à retirer » ; ce qui n'a pas la forme d'un identifiant n'en nomme aucun.
    var pending: [String] {
        (defaults.stringArray(forKey: Self.pendingKey) ?? []).filter(AccountDeletedSignal.isAccountId)
    }

    /// Retire `userId` : le compte, puis son dossier du jeu. `true` quand les
    /// deux ont abouti — la note est alors effacée.
    @discardableResult
    func retire(_ userId: String) async -> Bool {
        guard AccountDeletedSignal.isAccountId(userId), !inFlight.contains(userId) else { return false }
        inFlight.insert(userId)
        defer { inFlight.remove(userId) }
        note(pending + [userId])
        guard await accounts.retireDeletedAccount(userId: userId), eraseGameFolder(of: userId) else {
            Logger.auth.warning("Deleted account retirement incomplete — kept for the next launch")
            return false
        }
        note(pending.filter { $0 != userId })
        bury(userId)
        return true
    }

    /// Les comptes enterrés (retrait abouti) et la date de leur retrait.
    var buried: [String: Date] {
        dated(Self.buriedKey)
    }

    /// Rejoue les retraits notés et réefface le jeu des comptes enterrés, une
    /// fois la session du trousseau lue. Un compte qui a reçu une session
    /// neuve depuis la note (ou la tombe) n'est plus touché.
    func replayPending() async {
        let waiting = pending
        let graves = buried
        guard !waiting.isEmpty || !graves.isEmpty else { return }
        await sessionResolved()
        let notedAt = dated(Self.notedAtKey)
        for userId in waiting {
            if signedInAgain(userId, since: notedAt[userId]) {
                note(pending.filter { $0 != userId })
                continue
            }
            await retire(userId)
        }
        for (userId, retiredAt) in graves where !pending.contains(userId) {
            guard !signedInAgain(userId, since: retiredAt) else {
                setDated(Self.buriedKey, buried.filter { $0.key != userId })
                continue
            }
            _ = eraseGameFolder(of: userId)
        }
    }

    /// Une note sans date (écrite avant la datation) se rejoue : rien ne dit
    /// que le compte a été repris depuis.
    private func signedInAgain(_ userId: String, since date: Date?) -> Bool {
        guard let date, let issued = accounts.sessionIssuedAt(for: userId) else { return false }
        return issued > date
    }

    private func bury(_ userId: String) {
        var graves = buried
        graves[userId] = now()
        let kept = graves.sorted { $0.value > $1.value }.prefix(Self.buriedLimit)
        setDated(Self.buriedKey, Dictionary(uniqueKeysWithValues: kept.map { ($0.key, $0.value) }))
    }

    private func dated(_ key: String) -> [String: Date] {
        let raw = defaults.dictionary(forKey: key) as? [String: Double] ?? [:]
        return raw.reduce(into: [String: Date]()) { result, entry in
            guard AccountDeletedSignal.isAccountId(entry.key) else { return }
            result[entry.key] = Date(timeIntervalSince1970: entry.value)
        }
    }

    private func setDated(_ key: String, _ values: [String: Date]) {
        guard !values.isEmpty else {
            defaults.removeObject(forKey: key)
            return
        }
        defaults.set(values.mapValues { $0.timeIntervalSince1970 }, forKey: key)
    }

    private func eraseGameFolder(of userId: String) -> Bool {
        let folder = GamePhotoNotebook.accountFolder(userId: userId, base: gameBase)
        guard FileManager.default.fileExists(atPath: folder.path) else { return true }
        do {
            try FileManager.default.removeItem(at: folder)
            return true
        } catch {
            return false
        }
    }

    private func note(_ ids: [String]) {
        let unique = ids.reduce(into: [String]()) { kept, id in
            if !kept.contains(id) { kept.append(id) }
        }
        if unique.isEmpty {
            defaults.removeObject(forKey: Self.pendingKey)
        } else {
            defaults.set(unique, forKey: Self.pendingKey)
        }
        let known = dated(Self.notedAtKey)
        let stamp = now()
        setDated(Self.notedAtKey, unique.reduce(into: [String: Date]()) { result, id in
            result[id] = known[id] ?? stamp
        })
    }

    /// La session du trousseau est lue (`hasResolvedStoredSession`) : un
    /// retrait rejoué avant croiserait la reprise de cette session.
    static func awaitStoredSessionRead() async {
        for await resolved in AuthManager.shared.$hasResolvedStoredSession.values where resolved {
            return
        }
    }
}
