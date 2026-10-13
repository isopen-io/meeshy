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
// rejoue au lancement suivant, une fois la session du trousseau lue.

@MainActor
protocol DeletedAccountRetiring: AnyObject {
    func retireDeletedAccount(userId: String) async -> Bool
}

extension AuthManager: DeletedAccountRetiring {}

@MainActor
final class DeletedAccountRetirement {
    nonisolated deinit {}

    static let shared = DeletedAccountRetirement()

    nonisolated static let pendingKey = "meeshy.accountDeleted.pending"

    typealias SessionResolution = @MainActor () async -> Void

    private let accounts: DeletedAccountRetiring
    private let gameBase: URL?
    private let defaults: UserDefaults
    private let sessionResolved: SessionResolution
    private var observer: NSObjectProtocol?
    private var inFlight: Set<String> = []

    init(
        accounts: DeletedAccountRetiring = AuthManager.shared,
        gameBase: URL? = nil,
        defaults: UserDefaults = .standard,
        sessionResolved: @escaping SessionResolution = DeletedAccountRetirement.awaitStoredSessionRead
    ) {
        self.accounts = accounts
        self.gameBase = gameBase
        self.defaults = defaults
        self.sessionResolved = sessionResolved
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
        let accountRetired = await accounts.retireDeletedAccount(userId: userId)
        let gameErased = eraseGameFolder(of: userId)
        guard accountRetired, gameErased else {
            Logger.auth.warning("Deleted account retirement incomplete — kept for the next launch")
            return false
        }
        note(pending.filter { $0 != userId })
        return true
    }

    /// Rejoue les retraits notés, une fois la session du trousseau lue.
    func replayPending() async {
        let waiting = pending
        guard !waiting.isEmpty else { return }
        await sessionResolved()
        for userId in waiting {
            await retire(userId)
        }
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
    }

    /// La session du trousseau est lue (`hasResolvedStoredSession`) : un
    /// retrait rejoué avant croiserait la reprise de cette session.
    static func awaitStoredSessionRead() async {
        for await resolved in AuthManager.shared.$hasResolvedStoredSession.values where resolved {
            return
        }
    }
}
