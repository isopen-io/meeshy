import Foundation

/// La fiche de reprise écrite par l'extension, relue par l'app.
///
/// Le relais précédent (`SharePendingSend`) ne portait que du texte, un seul
/// destinataire et aucun état — il ne pouvait décrire ni un fan-out, ni un
/// upload déjà fait. Cette fiche versionnée le remplace.
///
/// **Deux invariants, et tout le reste en découle :**
///
/// 1. elle est réécrite ATOMIQUEMENT à chaque transition (fichiers copiés,
///    upload terminé, cible servie) ;
/// 2. elle n'est supprimée que lorsque TOUTES les cibles sont `sent` — jamais
///    après la première.
///
/// Sans (1), une interruption après l'upload re-téléverserait plusieurs
/// gigaoctets : les attachments orphelins ne sont balayés qu'à H+24
/// (`MaintenanceService.ts:386-400`). Sans (2), une interruption après la
/// première cible perdrait les suivantes SANS TRACE : le `clientMessageId` ne
/// dédoublonne que sur `(conversationId, clientMessageId)`
/// (`schema.prisma:677-686`), il ne rattrape pas une cible jamais servie.
///
/// Le contrat est DUPLIQUÉ côté app (`SharePendingSendConsumer.PendingShare`) :
/// l'extension est sans dépendance SDK, les deux cibles ne peuvent donc pas
/// partager un type. `SharePendingSendContractTests` est le garde-fou — il
/// compile les deux miroirs et vérifie qu'ils s'accordent.
nonisolated struct SharePendingShare: Codable, Equatable, Sendable {

    typealias Media = ShareStagedMedia

    nonisolated enum TargetState: String, Codable, Equatable, Sendable {
        case pending
        case sent
        case failed
    }

    nonisolated struct Target: Codable, Equatable, Sendable {
        let conversationId: String
        var state: TargetState
        var serverMessageId: String?

        init(conversationId: String, state: TargetState = .pending, serverMessageId: String? = nil) {
            self.conversationId = conversationId
            self.state = state
            self.serverMessageId = serverMessageId
        }
    }

    /// Version du format. Une fiche d'une version inconnue est traitée comme
    /// illisible par le consommateur — jamais devinée.
    let v: Int
    let clientMessageId: String
    let createdAt: Date
    let content: String?
    var media: [Media]
    /// Écrit APRÈS un upload réussi. Sa présence dispense TOUTE cible de
    /// re-téléverser quoi que ce soit.
    var uploadedAttachmentIds: [String]?
    var targets: [Target]
    /// L'index de la cible qui porte les octets. `nil` quand il n'y a pas de
    /// média à porter.
    var originTargetIndex: Int?

    // MARK: - Contrat partagé avec l'app

    static let currentVersion = 1
    static let appGroupIdentifier = ShareSession.appGroupIdentifier
    static let directoryName = "share_pending_sends"
    static let mediaDirectoryName = ShareMediaStaging.directoryName

    /// L'identifiant de la fiche reste la clé de reprise ; chaque cible reçoit
    /// un identifiant DÉRIVÉ, stable d'une reprise à l'autre. Sans stabilité,
    /// un rejeu après interruption créerait des doublons ; sans distinction,
    /// deux cibles écriraient les mêmes chemins de fichiers pendants.
    static func derivedClientMessageId(shareId: String, targetIndex: Int) -> String {
        "\(shareId)_t\(targetIndex)"
    }

    static func make(
        shareId: String,
        createdAt: Date,
        content: String?,
        media: [Media],
        conversationIds: [String]
    ) -> SharePendingShare {
        SharePendingShare(
            v: currentVersion,
            clientMessageId: shareId,
            createdAt: createdAt,
            content: content,
            media: media,
            uploadedAttachmentIds: nil,
            targets: conversationIds.map { Target(conversationId: $0) },
            originTargetIndex: media.isEmpty ? nil : 0
        )
    }

    static func encoder() -> JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }

    static func directoryURL() -> URL? {
        FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier)?
            .appendingPathComponent(directoryName, isDirectory: true)
    }

    // MARK: - État

    /// Le nom de fichier EST l'identifiant du partage : deux écritures du même
    /// partage écrasent le même fichier, donc ne peuvent pas produire deux
    /// rejeux.
    var fileName: String { "\(clientMessageId).json" }

    var isFullyServed: Bool { targets.allSatisfy { $0.state == .sent } }

    // MARK: - Commit

    /// Le SEUL point d'écriture de la fiche — les deux invariants sont ici, et
    /// nulle part ailleurs. Écriture atomique, suppression conditionnée à
    /// `isFullyServed`.
    func commit(in directory: URL) throws {
        let file = directory.appendingPathComponent(fileName)
        guard !isFullyServed else {
            if FileManager.default.fileExists(atPath: file.path) {
                try FileManager.default.removeItem(at: file)
            }
            return
        }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try Self.encoder().encode(self).write(to: file, options: .atomic)
    }

    @discardableResult
    func commitLive() -> Bool {
        guard let directory = Self.directoryURL() else {
            ShareLog.logger.error("Conteneur App Group indisponible — fiche de reprise impossible")
            return false
        }
        do {
            try commit(in: directory)
            return true
        } catch {
            ShareLog.logger.error("Écriture de la fiche échouée : \(error.localizedDescription, privacy: .public)")
            return false
        }
    }
}
