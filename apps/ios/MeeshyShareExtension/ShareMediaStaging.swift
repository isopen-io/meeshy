import Foundation
import MeeshySDK
import os
import UniformTypeIdentifiers

/// Un fichier déjà copié dans le conteneur App Group, décrit par la fiche.
///
/// `relPath` est relatif à `share_pending_media/` — c'est ce que l'app relit,
/// et c'est ce qui permet aux deux process de désigner le même octet sans
/// partager un chemin absolu (leurs conteneurs diffèrent).
///
/// `originalName` : le nom que le fichier portait chez l'app hôte, assaini
/// (#11531). Il voyage en MÉTADONNÉE jusqu'au `filename` TUS, jamais dans un
/// chemin (#11134). Absent des fiches écrites avant lui : `nil`, et l'envoi
/// retombe sur `<index>.<ext>`.
nonisolated struct ShareStagedMedia: Codable, Equatable, Sendable {
    let relPath: String
    let ext: String
    let mime: String
    let bytes: Int
    let originalName: String?

    init(relPath: String, ext: String, mime: String, bytes: Int, originalName: String? = nil) {
        self.relPath = relPath
        self.ext = ext
        self.mime = mime
        self.bytes = bytes
        self.originalName = originalName
    }

    /// Le nom que le serveur reçoit : l'original, sinon celui de la copie.
    var uploadFileName: String {
        originalName ?? URL(fileURLWithPath: relPath).lastPathComponent
    }
}

nonisolated enum ShareMediaStagingError: Error, Equatable, Sendable {
    case appGroupUnavailable
    case notDownloadedFromICloud
    case insufficientFreeSpace(needed: Int, free: Int)
    case byteBudgetExceeded(total: Int, limit: Int)
    case fileCountExceeded(count: Int, limit: Int)
    case copyFailed(String)
    /// La source n'est pas un fichier que le système a remis, ou elle vit là
    /// où l'extension a des droits que l'app hôte n'a pas (App Group, bundle).
    case refusedSource
    /// La copie sortirait du dossier du partage.
    case destinationOutsideShare
}

/// Le budget d'octets CUMULÉ des copies d'un partage (D10 : `ShareLimits.maxTotalBytes`,
/// 5 Go depuis le 2026-10-25, #12974 ; #11429).
///
/// Les copies partent en parallèle, AVANT l'écran : un contrôle fichier par
/// fichier laissait une app hôte remplir le disque jusqu'à la marge de
/// 128 Mio. Chaque copie réserve ses octets ici, de façon atomique ; ce qui
/// dépasse n'est pas copié, et l'écran le dit.
nonisolated final class ShareByteBudget: Sendable {
    let limit: Int
    private let reserved = OSAllocatedUnfairLock(initialState: 0)

    init(limit: Int) {
        self.limit = limit
    }

    var reservedBytes: Int { reserved.withLock { $0 } }

    /// Réserve `bytes` si le cumul reste sous le plafond ; rien sinon.
    func reserve(_ bytes: Int) -> Bool {
        let limit = limit
        return reserved.withLock { total in
            guard bytes >= 0, bytes <= limit - total else { return false }
            total += bytes
            return true
        }
    }

    func release(_ bytes: Int) {
        reserved.withLock { total in total = max(0, total - max(0, bytes)) }
    }
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
        bytes + ShareUploadBudget.freeSpaceMarginBytes
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

    /// L'extension garde le TYPE du fichier : celle de la source d'abord, celle
    /// du MIME sinon, `bin` en dernier. Le nom de la source est choisi par
    /// l'app hôte : seule une extension courte, minuscule et alphanumérique
    /// entre dans un chemin (#11134).
    static func fileExtension(sourceExtension: String, mime: String) -> String {
        [sourceExtension.lowercased(), UTType(mimeType: mime)?.preferredFilenameExtension ?? ""]
            .first(where: isSafeExtension) ?? "bin"
    }

    /// Plafond d'un nom d'origine, en octets UTF-8 : l'en-tête TUS le porte
    /// en base64, et l'écran l'affiche sur une ligne.
    static let maxOriginalNameBytes = 120

    /// Le nom d'ORIGINE d'un fichier reçu, tel qu'il peut voyager (#11531) : le
    /// premier candidat non vide, réduit à son dernier composant, sans
    /// caractère de contrôle ni de mise en forme bidirectionnelle (un
    /// `U+202E` ferait lire `photo‮gpj.exe` comme `photoexe.jpg`), sans
    /// séparateur, sans point ni espace en bordure, plafonné en gardant son
    /// extension. Une extension absente ou douteuse cède la place à `ext`.
    /// Rien d'utilisable : `nil`, et l'envoi garde `<index>.<ext>`.
    static func sanitizedOriginalName(candidates: [String?], fallbackExt: String) -> String? {
        candidates.lazy.compactMap { $0 }.compactMap { sanitizedName($0, fallbackExt: fallbackExt) }.first
    }

    private static func sanitizedName(_ raw: String, fallbackExt: String) -> String? {
        let lastComponent = raw.split(whereSeparator: { $0 == "/" || $0 == "\\" }).last.map(String.init) ?? ""
        let scalars = lastComponent.unicodeScalars
            .filter { !isInvisibleOrControl($0) }
            .map { $0 == ":" ? "_" : $0 }
        let cleaned = String(String.UnicodeScalarView(scalars))
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .drop(while: { $0 == "." || $0 == " " })
        let name = String(cleaned).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty, name != ".", name != ".." else { return nil }
        let nameExt = (name as NSString).pathExtension
        let hasSafeExt = isSafeExtension(nameExt.lowercased()) && nameExt != name
        let stem = hasSafeExt ? String(name.dropLast(nameExt.count + 1)) : name
        let ext = hasSafeExt ? nameExt : fallbackExt
        let suffix = ext.isEmpty ? "" : "." + ext
        let cappedStem = truncated(stem, toUTF8Bytes: maxOriginalNameBytes - suffix.utf8.count)
            .trimmingCharacters(in: stemEdges)
        guard !cappedStem.isEmpty else { return nil }
        return cappedStem + suffix
    }

    /// Ce qui ne borde pas une racine : un point final doublerait celui de
    /// l'extension (`photo.` → `photo..jpeg`).
    private static let stemEdges = CharacterSet.whitespaces.union(CharacterSet(charactersIn: "."))

    private static func isInvisibleOrControl(_ scalar: Unicode.Scalar) -> Bool {
        switch scalar.value {
        case 0x00...0x1F, 0x7F...0x9F, 0x200B...0x200F, 0x202A...0x202E, 0x2060...0x2069, 0xFEFF:
            return true
        default:
            return false
        }
    }

    private static func truncated(_ text: String, toUTF8Bytes limit: Int) -> String {
        guard limit > 0 else { return "" }
        var bytes = 0
        return String(text.prefix { character in
            bytes += character.utf8.count
            return bytes <= limit
        })
    }

    static func isSafeExtension(_ ext: String) -> Bool {
        let scalars = ext.unicodeScalars
        return (1...10).contains(scalars.count)
            && scalars.allSatisfy { ("a"..."z").contains($0) || ("0"..."9").contains($0) }
    }

    /// La destination reste dans `<mediaRoot>/<shareId>/`. Avant la création
    /// du dossier, la comparaison est LEXICALE (un `..` ne passe pas) : un
    /// chemin qui n'existe pas encore ne se résout pas comme un chemin qui
    /// existe (`/private` n'est retiré que du second). Après, symlinks résolus
    /// des deux côtés : un dossier de partage qui serait un lien ne passe pas.
    static func isInsideShare(_ destination: URL, mediaRoot: URL, shareId: String, resolvingSymlinks: Bool) -> Bool {
        let normalize: (URL) -> String = { url in
            (resolvingSymlinks ? url.resolvingSymlinksInPath() : url).standardizedFileURL.path
        }
        return normalize(destination.deletingLastPathComponent()) == normalize(mediaRoot) + "/" + shareId
    }

    // MARK: - Copie

    /// Copie `source` vers `destination` par tranches, et renvoie le nombre
    /// d'octets écrits. Une destination existante est REMPLACÉE — un résidu
    /// d'une tentative précédente ne doit jamais survivre. `admit` reçoit le
    /// total qu'atteindrait la tranche suivante AVANT qu'elle soit écrite :
    /// s'il lève, la copie s'arrête là.
    @discardableResult
    static func streamCopy(
        from source: URL,
        to destination: URL,
        bufferSize: Int,
        admit: (Int) throws -> Void = { _ in }
    ) throws -> Int {
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
            try admit(written + chunk.count)
            try writer.write(contentsOf: chunk)
            written += chunk.count
        }
        return written
    }

    /// Copie UN fichier reçu vers `<mediaRoot>/<shareId>/<index>.<ext>`.
    ///
    /// L'espace libre est contrôlé AVANT le premier octet : un disque plein en
    /// cours de copie produirait un fichier tronqué, donc une pièce jointe
    /// corrompue livrée sans un mot. Les octets se réservent dans `budget`,
    /// commun à toutes les copies du partage : la taille annoncée d'abord,
    /// puis ce que la copie lit au-delà (une taille illisible vaut 0). Une
    /// copie qui échoue ne laisse RIEN : ni fichier partiel, ni réservation.
    static func stage(
        source: URL,
        into mediaRoot: URL,
        shareId: String,
        index: Int,
        mime: String,
        freeBytes: Int,
        budget: ShareByteBudget = ShareByteBudget(limit: .max),
        suggestedName: String? = nil
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

        let ext = fileExtension(sourceExtension: source.pathExtension, mime: mime)
        let directory = mediaRoot.appendingPathComponent(shareId, isDirectory: true)
        let relPath = "\(shareId)/\(index).\(ext)"
        let destination = mediaRoot.appendingPathComponent(relPath)
        guard isInsideShare(destination, mediaRoot: mediaRoot, shareId: shareId, resolvingSymlinks: false) else {
            throw ShareMediaStagingError.destinationOutsideShare
        }
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        } catch {
            throw ShareMediaStagingError.copyFailed(error.localizedDescription)
        }
        guard isInsideShare(destination, mediaRoot: mediaRoot, shareId: shareId, resolvingSymlinks: true) else {
            throw ShareMediaStagingError.destinationOutsideShare
        }
        guard budget.reserve(bytes) else {
            throw ShareMediaStagingError.byteBudgetExceeded(total: budget.reservedBytes + bytes, limit: budget.limit)
        }
        var reserved = bytes
        let written: Int
        do {
            written = try streamCopy(from: source, to: destination, bufferSize: copyBufferSize) { total in
                guard total > reserved else { return }
                guard budget.reserve(total - reserved) else {
                    throw ShareMediaStagingError.byteBudgetExceeded(total: budget.reservedBytes - reserved + total, limit: budget.limit)
                }
                reserved = total
            }
        } catch {
            try? FileManager.default.removeItem(at: destination)
            budget.release(reserved)
            throw (error as? ShareMediaStagingError) ?? .copyFailed(error.localizedDescription)
        }
        budget.release(reserved - written)
        let kept = try withoutLocation(destination, mime: mime, copied: written, budget: budget)

        // Le nom de la copie du système d'abord (`IMG_0111.jpeg`) : le système
        // compose parfois `suggestedName` depuis la description LOCALISÉE du
        // type — même ordre que `ComposerDropResolver.originalFileName`.
        let originalName = sanitizedOriginalName(
            candidates: [source.lastPathComponent, suggestedName], fallbackExt: ext)
        return ShareStagedMedia(relPath: relPath, ext: ext, mime: mime, bytes: kept, originalName: originalName)
    }

    /// **Le lieu d'une photo partagée ne quitte pas l'appareil** (#11847,
    /// défaut validé de #11247) : il est retiré de la COPIE, sans décoder ni
    /// ré-encoder ses pixels. Une photo dont le lieu résiste n'est pas copiée
    /// (fail-closed). Rend les octets que la copie pèse désormais.
    static func withoutLocation(_ destination: URL, mime: String, copied: Int, budget: ShareByteBudget) throws -> Int {
        guard mime.hasPrefix("image/") else { return copied }
        switch OutgoingImageLocationRemoval.removeLocation(fromFileAt: destination) {
        case .untouched:
            return copied
        case .removed:
            let size = ((try? FileManager.default.attributesOfItem(atPath: destination.path))?[.size] as? NSNumber)?.intValue ?? copied
            if size <= copied {
                budget.release(copied - size)
            } else {
                _ = budget.reserve(size - copied)
            }
            return size
        case .failed:
            try? FileManager.default.removeItem(at: destination)
            budget.release(copied)
            throw ShareMediaStagingError.copyFailed("lieu de la photo non retirable")
        }
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
