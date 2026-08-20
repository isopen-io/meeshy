import Foundation
import UniformTypeIdentifiers

/// Un fichier déjà copié dans le conteneur App Group, décrit par la fiche.
///
/// `relPath` est relatif à `share_pending_media/` — c'est ce que l'app relit,
/// et c'est ce qui permet aux deux process de désigner le même octet sans
/// partager un chemin absolu (leurs conteneurs diffèrent).
nonisolated struct ShareStagedMedia: Codable, Equatable, Sendable {
    let relPath: String
    let ext: String
    let mime: String
    let bytes: Int

    init(relPath: String, ext: String, mime: String, bytes: Int) {
        self.relPath = relPath
        self.ext = ext
        self.mime = mime
        self.bytes = bytes
    }
}

nonisolated enum ShareMediaStagingError: Error, Equatable {
    case appGroupUnavailable
    case notDownloadedFromICloud
    case insufficientFreeSpace(needed: Int, free: Int)
    case byteBudgetExceeded(total: Int, limit: Int)
    case fileCountExceeded(count: Int, limit: Int)
    case copyFailed(String)
}

/// Copie des fichiers reçus vers le conteneur App Group.
///
/// Trois contraintes dictent la forme de ce code :
///
/// 1. `loadFileRepresentation` SUPPRIME l'URL qu'il fournit au retour de sa
///    closure — la copie doit être faite DANS la closure, de façon synchrone ;
/// 2. le process est plafonné à ~120 Mo — la copie est STREAMÉE par tranches
///    de 64 Kio, jamais `Data(contentsOf:)` ;
/// 3. une URL issue de Fichiers/iCloud est security-scoped — l'appelant
///    (`ShareViewController`) appaire `startAccessingSecurityScopedResource` /
///    `stopAccessing…` autour de l'appel à `stage`.
nonisolated enum ShareMediaStaging {

    static let directoryName = "share_pending_media"

    /// 64 Kio : même arbitrage syscall/mémoire que la digestion SHA-256 du
    /// `TusUploadManager` du SDK. Chaque lecture alloue un `Data` neuf, drainé
    /// et relâché dans l'autoreleasepool de la boucle.
    static let copyBufferSize = 64 * 1024

    // MARK: - Emplacements

    static func mediaRootURL() -> URL? {
        FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: ShareSession.appGroupIdentifier)?
            .appendingPathComponent(directoryName, isDirectory: true)
    }

    /// Crée `<racine>/<shareId>/` et renvoie la **racine** : les `relPath` de
    /// la fiche sont relatifs à elle, et c'est elle que les deux process
    /// résolvent chacun dans son propre conteneur. Le sous-dossier est créé
    /// ici parce que la copie qui suit a besoin d'un répertoire existant.
    static func prepareMediaRoot(shareId: String) -> URL? {
        guard let root = mediaRootURL() else { return nil }
        try? FileManager.default.createDirectory(
            at: root.appendingPathComponent(shareId, isDirectory: true),
            withIntermediateDirectories: true)
        return root
    }

    // MARK: - Décisions pures

    /// L'ABSENCE de statut signifie « fichier local ordinaire », jamais
    /// « non téléchargé » : confondre les deux refuserait tous les partages
    /// venant de Photos.
    static func isNotDownloaded(ubiquitousDownloadingStatus: String?) -> Bool {
        guard let ubiquitousDownloadingStatus else { return false }
        return ubiquitousDownloadingStatus == URLUbiquitousItemDownloadingStatus.notDownloaded.rawValue
    }

    static func requiredFreeBytes(for bytes: Int) -> Int {
        bytes + ShareLimits.freeSpaceMarginBytes
    }

    /// L'identifiant de type système prime : il distingue un GIF
    /// (`com.compuserve.gif`, conforme à `public.image`) d'un JPEG là où une
    /// extension peut mentir ou manquer. Sans rien d'utilisable, le repli est
    /// `application/octet-stream` — côté serveur `getAttachmentType` retombe
    /// alors sur `document`, ce qui fait justement passer `.xls`/`.xlsx`.
    static func mimeType(typeIdentifier: String?, fileExtension: String) -> String {
        if let typeIdentifier,
           let mime = UTType(typeIdentifier)?.preferredMIMEType {
            return mime
        }
        if !fileExtension.isEmpty,
           let mime = UTType(filenameExtension: fileExtension.lowercased())?.preferredMIMEType {
            return mime
        }
        return "application/octet-stream"
    }

    // MARK: - Copie

    /// Copie `source` vers `destination` par tranches, et renvoie le nombre
    /// d'octets écrits. Une destination existante est REMPLACÉE — un résidu
    /// d'une tentative précédente ne doit jamais survivre.
    @discardableResult
    static func streamCopy(from source: URL, to destination: URL, bufferSize: Int) throws -> Int {
        if FileManager.default.fileExists(atPath: destination.path) {
            try FileManager.default.removeItem(at: destination)
        }
        guard FileManager.default.createFile(atPath: destination.path, contents: nil) else {
            throw ShareMediaStagingError.copyFailed("destination non créable")
        }

        let reader = try FileHandle(forReadingFrom: source)
        defer { try? reader.close() }
        let writer = try FileHandle(forWritingTo: destination)
        defer { try? writer.close() }

        var written = 0
        while true {
            let chunk = try autoreleasepool { () -> Data? in
                try reader.read(upToCount: bufferSize)
            }
            guard let chunk, !chunk.isEmpty else { break }
            try writer.write(contentsOf: chunk)
            written += chunk.count
        }
        return written
    }

    /// Copie UN fichier reçu vers `<mediaRoot>/<shareId>/<index>.<ext>`.
    ///
    /// L'espace libre est contrôlé AVANT le premier octet : un disque plein en
    /// cours de copie produirait un fichier tronqué, donc une pièce jointe
    /// corrompue livrée sans un mot.
    static func stage(
        source: URL,
        into mediaRoot: URL,
        shareId: String,
        index: Int,
        mime: String,
        freeBytes: Int
    ) throws -> ShareStagedMedia {
        let values = try? source.resourceValues(
            forKeys: [.fileSizeKey, .ubiquitousItemDownloadingStatusKey])

        if isNotDownloaded(ubiquitousDownloadingStatus: values?.ubiquitousItemDownloadingStatus?.rawValue) {
            throw ShareMediaStagingError.notDownloadedFromICloud
        }

        let bytes = values?.fileSize ?? 0
        let needed = requiredFreeBytes(for: bytes)
        guard freeBytes >= needed else {
            throw ShareMediaStagingError.insufficientFreeSpace(needed: needed, free: freeBytes)
        }

        let ext = source.pathExtension.isEmpty ? "bin" : source.pathExtension.lowercased()
        let directory = mediaRoot.appendingPathComponent(shareId, isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        } catch {
            throw ShareMediaStagingError.copyFailed(error.localizedDescription)
        }

        let relPath = "\(shareId)/\(index).\(ext)"
        let destination = mediaRoot.appendingPathComponent(relPath)
        let written: Int
        do {
            written = try streamCopy(from: source, to: destination, bufferSize: copyBufferSize)
        } catch let error as ShareMediaStagingError {
            throw error
        } catch {
            throw ShareMediaStagingError.copyFailed(error.localizedDescription)
        }

        return ShareStagedMedia(relPath: relPath, ext: ext, mime: mime, bytes: written)
    }

    // MARK: - Câblage système

    static func availableCapacityBytes(at url: URL) -> Int {
        let values = try? url.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey])
        guard let capacity = values?.volumeAvailableCapacityForImportantUsage else { return 0 }
        return Int(clamping: capacity)
    }

    /// Rend les octets d'un partage abandonné ou entièrement servi.
    ///
    /// Round 2 de revue (Critical) — défense en profondeur : si une fiche
    /// VIVANTE référence encore ce dossier (un envoi a été COMMITTÉ, même
    /// différé — `ShareSender.send` écrit la fiche AVANT le premier POST),
    /// l'effacement est REFUSÉ. Passé ce point les fichiers ne sont plus
    /// orphelins : `SharePendingSendConsumer` les reprendra à la prochaine
    /// ouverture de l'app depuis ces mêmes `relPath`. La garde vit ICI, dans
    /// le code qui détruit — pas seulement dans le code qui appelle
    /// (`ShareViewController.discardStagedMedia`), pour qu'aucune autre porte
    /// ne puisse la contourner demain.
    ///
    /// `pendingSendsDirectory` est injectable pour les tests ; en production
    /// c'est le même conteneur App Group où la fiche est committée. `nil`
    /// (conteneur indisponible) ne bloque PAS l'effacement : sans fiche
    /// lisible nulle part, il n'y a rien à protéger.
    static func discard(
        shareId: String,
        in mediaRoot: URL,
        pendingSendsDirectory: URL? = SharePendingShare.directoryURL()
    ) {
        if let pendingSendsDirectory {
            let recordFile = pendingSendsDirectory
                .appendingPathComponent(SharePendingShare.fileName(forShareId: shareId))
            guard !FileManager.default.fileExists(atPath: recordFile.path) else { return }
        }
        let directory = mediaRoot.appendingPathComponent(shareId, isDirectory: true)
        try? FileManager.default.removeItem(at: directory)
    }
}
