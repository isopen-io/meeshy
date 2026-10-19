import Foundation

/// **Le relais de l'extension de partage vers l'écran de partage de l'app**
/// (#10947, D7 et fragment 3).
///
/// Deux cas où la feuille système ne PEUT pas envoyer elle-même, et où rien ne
/// doit se perdre :
/// - **sans session** — « Connectez-vous pour envoyer · Ouvrir Meeshy » : le
///   partage attend dans l'app, qui le rouvre après la connexion ;
/// - **vers une conversation chiffrée** (D7) — l'extension n'a pas les clés :
///   jamais de clair d'ici, l'app reprend l'envoi et chiffre sur l'appareil.
///
/// La fiche décrit le partage (texte, fichiers déjà copiés dans l'App Group,
/// conversations à présélectionner) ; l'app l'ouvre sur `meeshy://share-relay`
/// et la balaie aussi à chaque réveil — l'ouverture n'est qu'un raccourci.
///
/// Compilé dans les DEUX cibles (`project.yml`) : le contrat n'a qu'une source.
nonisolated struct ShareRelayHandoff: Codable, Equatable, Sendable {
    static let appGroupIdentifier = "group.me.meeshy.apps"
    static let directoryName = "share_pending_relays"
    static let mediaDirectoryName = "share_pending_media"
    static let currentVersion = 1
    static let scheme = "meeshy"
    static let host = "share-relay"
    /// Une fiche reste reprenable une semaine, comme une fiche d'envoi différé.
    static let maxAge: TimeInterval = 604_800

    nonisolated struct Media: Codable, Equatable, Sendable {
        let relPath: String
        let mime: String
        let bytes: Int
    }

    let version: Int
    let shareId: String
    let createdAt: Date
    let text: String?
    let media: [Media]
    /// Les conversations que l'auteur avait choisies (les chiffrées, D7).
    let conversationIds: [String]
    /// Le compte de la session qui a déposé la fiche ; `nil` sans session
    /// (fragment 3) — la fiche attend alors le premier compte qui se connecte.
    /// Absent des fiches écrites avant ce champ : elles se relisent sans lui.
    let ownerUserId: String?

    init(shareId: String, createdAt: Date, text: String?, media: [Media], conversationIds: [String], ownerUserId: String? = nil) {
        self.version = Self.currentVersion
        self.shareId = shareId
        self.createdAt = createdAt
        self.text = text
        self.media = media
        self.conversationIds = conversationIds
        self.ownerUserId = ownerUserId
    }

    // MARK: - Ce que l'écran de l'app rouvre

    func incoming(mediaRoot: URL?) -> ShareIncoming {
        ShareIncoming(
            media: media.map { ShareIncomingMedia(id: $0.relPath, mimeType: $0.mime, bytes: $0.bytes, fileURL: mediaRoot?.appendingPathComponent($0.relPath)) },
            text: text,
            preselectedConversationIds: conversationIds
        )
    }

    // MARK: - Le lien

    var openURL: URL? {
        var components = URLComponents()
        components.scheme = Self.scheme
        components.host = Self.host
        components.queryItems = [URLQueryItem(name: "id", value: shareId)]
        return components.url
    }

    static func shareId(from url: URL) -> String? {
        guard url.scheme?.lowercased() == scheme, url.host?.lowercased() == host,
              let value = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "id" })?.value,
              !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        return value
    }

    // MARK: - Le disque

    static func directoryURL(fileManager: FileManager = .default) -> URL? {
        fileManager.containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier)?
            .appendingPathComponent(directoryName, isDirectory: true)
    }

    static func mediaRootURL(fileManager: FileManager = .default) -> URL? {
        fileManager.containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier)?
            .appendingPathComponent(mediaDirectoryName, isDirectory: true)
    }

    func write(in directory: URL) throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        try encoder.encode(self).write(to: directory.appendingPathComponent("\(shareId).json"), options: .atomic)
    }

    /// Une fiche n'est servie qu'au compte qui l'a déposée ; une fiche sans
    /// propriétaire, à tout compte connecté.
    func isServable(to userId: String) -> Bool {
        ownerUserId.map { $0 == userId } ?? true
    }

    /// La fiche demandée, sinon la plus ancienne encore valable, parmi celles que
    /// `userId` a le droit de voir. Une fiche d'une version FUTURE est ignorée,
    /// jamais devinée ; une fiche périmée est effacée.
    static func next(id: String?, in directory: URL, servableTo userId: String, now: Date = Date()) -> ShareRelayHandoff? {
        guard let files = try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil) else { return nil }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let fiches = files.filter { $0.pathExtension == "json" }.compactMap { url -> ShareRelayHandoff? in
            guard let data = try? Data(contentsOf: url), let fiche = try? decoder.decode(ShareRelayHandoff.self, from: data),
                  fiche.version <= currentVersion else { return nil }
            guard now.timeIntervalSince(fiche.createdAt) <= maxAge else {
                try? FileManager.default.removeItem(at: url)
                return nil
            }
            return fiche.isServable(to: userId) ? fiche : nil
        }
        if let id { return fiches.first { $0.shareId == id } }
        return fiches.min { $0.createdAt < $1.createdAt }
    }

    static func remove(shareId: String, in directory: URL) {
        try? FileManager.default.removeItem(at: directory.appendingPathComponent("\(shareId).json"))
    }
}
