import Foundation

/// Les révocations de notification que l'extension doit encore voir (ios-systeme-7, #19104).
///
/// ## Le défaut
///
/// Bob envoie une photo et la supprime aussitôt. La NSE de l'iPhone d'Alice télécharge encore
/// l'avatar et la pièce jointe — plusieurs secondes — quand le push silencieux
/// `notification_revoked` arrive dans l'app : `removeDeliveredNotifications` ne trouve rien,
/// puisque la bannière n'est pas encore livrée. La NSE livre ensuite « Bob : 📷 Photo », qui
/// reste dans le Centre de notifications pour un message qui n'existe plus.
///
/// ## La loi
///
/// Une révocation ne se contente pas de retirer ce qui est déjà livré : elle s'INSCRIT. L'app
/// écrit les identifiants dans un fichier du groupe d'apps ; la NSE le relit juste avant de
/// livrer, et les balayages (NSE à chaque push, app au retour au premier plan) retirent ce qui
/// aurait passé entre-temps. Un seul écrivain (l'app), plusieurs lecteurs (la NSE, l'app) :
/// l'écriture est atomique, et un fichier illisible se lit comme VIDE — jamais comme « tout est
/// révoqué ».
///
/// L'inscription est BORNÉE : 200 identifiants au plus (les plus récents), et chacun s'oublie
/// après dix minutes — largement la durée de vie d'une NSE (30 s), sans jamais grossir.
///
/// Atome pur : aucun singleton, l'horloge est un argument, le fichier est injecté.
public struct PendingBannerRevocations: Sendable {

    public static let fileName = "pending_banner_revocations.json"
    public static let ttl: TimeInterval = 600
    public static let capacity = 200

    private let fileURL: URL?
    private let ttl: TimeInterval
    private let capacity: Int

    /// Les écritures d'un même processus se sérialisent (lecture-modification-écriture) ; entre
    /// processus, l'app est le seul écrivain.
    private static let writeLock = Locked<Void>(())

    private struct Entry: Codable {
        let id: String
        let at: TimeInterval
    }

    private struct Document: Codable {
        var entries: [Entry]
    }

    public init(
        fileURL: URL?,
        ttl: TimeInterval = PendingBannerRevocations.ttl,
        capacity: Int = PendingBannerRevocations.capacity
    ) {
        self.fileURL = fileURL
        self.ttl = ttl
        self.capacity = capacity
    }

    /// Le fichier du groupe d'apps que l'app, la NSE et les balayages partagent. Sans conteneur
    /// (simulateur sans droits, test), l'inscription est sans effet : fail-soft, le retrait des
    /// bannières déjà livrées reste entier.
    public static func inAppGroup(
        suiteName: String = AppGroupPreferences.suiteName,
        fileManager: FileManager = .default
    ) -> PendingBannerRevocations {
        let container = fileManager.containerURL(forSecurityApplicationGroupIdentifier: suiteName)
        return PendingBannerRevocations(fileURL: container?.appendingPathComponent(fileName))
    }

    // MARK: - Écriture (l'app)

    /// Inscrit des identifiants de notification révoquée. Élague les entrées échues, rafraîchit la
    /// date d'un identifiant déjà connu, et ne garde que les `capacity` plus récents.
    public func record(_ ids: [String], now: Date) {
        guard let fileURL else { return }
        let fresh = ids.filter { !$0.isEmpty }
        guard !fresh.isEmpty else { return }
        Self.writeLock.mutateUnchecked { _ in
            let kept = liveEntries(readEntries(at: fileURL), now: now).filter { !fresh.contains($0.id) }
            let merged = kept + fresh.map { Entry(id: $0, at: now.timeIntervalSince1970) }
            write(Document(entries: Array(merged.suffix(capacity))), to: fileURL)
        }
    }

    // MARK: - Lecture (la NSE, les balayages)

    /// Cette bannière (sa charge `userInfo`) a-t-elle été révoquée ? Même clé que
    /// `NotificationRevocationPayload.covers` : `notificationId`. Une bannière sans identifiant
    /// (appel, ancien format) n'est jamais révoquée par erreur.
    public func isRevoked(_ bannerUserInfo: [AnyHashable: Any], now: Date) -> Bool {
        guard let fileURL, let id = Self.notificationId(in: bannerUserInfo) else { return false }
        return liveEntries(readEntries(at: fileURL), now: now).contains { $0.id == id }
    }

    /// Les identifiants de requête des bannières LIVRÉES dont la notification a été révoquée.
    public func revokedIdentifiers(
        from entries: [(id: String, userInfo: [AnyHashable: Any])],
        now: Date
    ) -> [String] {
        guard let fileURL else { return [] }
        let live = Set(liveEntries(readEntries(at: fileURL), now: now).map(\.id))
        guard !live.isEmpty else { return [] }
        return entries.compactMap { entry in
            Self.notificationId(in: entry.userInfo).flatMap { live.contains($0) ? entry.id : nil }
        }
    }

    // MARK: - Fichier

    private static func notificationId(in userInfo: [AnyHashable: Any]) -> String? {
        guard let id = userInfo["notificationId"] as? String, !id.isEmpty else { return nil }
        return id
    }

    private func liveEntries(_ entries: [Entry], now: Date) -> [Entry] {
        entries.filter { now.timeIntervalSince1970 - $0.at <= ttl }
    }

    private func readEntries(at url: URL) -> [Entry] {
        guard let data = try? Data(contentsOf: url),
              let document = try? JSONDecoder().decode(Document.self, from: data)
        else { return [] }
        return document.entries
    }

    private func write(_ document: Document, to url: URL) {
        guard let data = try? JSONEncoder().encode(document) else { return }
        try? FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(), withIntermediateDirectories: true
        )
        try? data.write(to: url, options: .atomic)
    }
}
