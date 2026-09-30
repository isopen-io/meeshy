import Foundation
import UIKit
import os

/// Le magasin des brouillons du meuble (#8848).
///
/// `save` et `delete` sont ASYNCHRONES et ORDONNÉES : elles passent par une file
/// série hors du fil principal, si bien qu'une suppression après publication
/// n'est jamais doublée par une sauvegarde encore en vol. `load` attend la fin
/// des écritures en vol — ce qu'on relit est toujours la dernière chose écrite.
nonisolated protocol ComposerAutosaveProviding: AnyObject, Sendable {
    func save(_ write: ComposerAutosaveWrite, account: ComposerAutosaveAccount, slot: ComposerAutosaveSlot)
    func hasDraft(account: ComposerAutosaveAccount, slot: ComposerAutosaveSlot) -> Bool
    func load(account: ComposerAutosaveAccount, slot: ComposerAutosaveSlot) -> ComposerAutosaveRestored?
    func delete(account: ComposerAutosaveAccount, slot: ComposerAutosaveSlot)
    func deleteAll()
    func waitForPendingWrites()
}

/// `Application Support/ComposerAutosave/<compte+environnement>/<slot>/` :
/// `snapshot.json` et `media/`. Hors de `tmp/` (que l'OS purge) et hors de
/// `Documents/` (que l'utilisateur voit dans Fichiers) ; exclu de la sauvegarde
/// iCloud, comme toute donnée locale qu'un autre appareil n'a pas à rejouer.
nonisolated final class ComposerAutosaveStore: ComposerAutosaveProviding, @unchecked Sendable {

    static let shared = ComposerAutosaveStore()

    private let root: URL
    private let sessionRoot: URL
    private let queue = DispatchQueue(label: "me.meeshy.composer.autosave", qos: .utility)
    private let fileManager = FileManager.default
    private var writtenBitmaps: [String: ObjectIdentifier] = [:]
    private let logger = os.Logger(subsystem: "me.meeshy.app", category: "composer-autosave")

    init(root: URL? = nil, sessionRoot: URL? = nil) {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        self.root = root ?? support.appendingPathComponent("ComposerAutosave", isDirectory: true)
        self.sessionRoot = sessionRoot ?? FileManager.default.temporaryDirectory
            .appendingPathComponent(ComposerAutosaveFileName.sessionDirectoryName, isDirectory: true)
    }

    func save(_ write: ComposerAutosaveWrite, account: ComposerAutosaveAccount, slot: ComposerAutosaveSlot) {
        queue.async { [self] in
            persist(write, directory: directory(account: account, slot: slot))
        }
    }

    func load(account: ComposerAutosaveAccount, slot: ComposerAutosaveSlot) -> ComposerAutosaveRestored? {
        queue.sync { [self] in
            restore(directory: directory(account: account, slot: slot))
        }
    }

    func hasDraft(account: ComposerAutosaveAccount, slot: ComposerAutosaveSlot) -> Bool {
        queue.sync { [self] in
            fileManager.fileExists(atPath: directory(account: account, slot: slot)
                .appendingPathComponent("snapshot.json").path)
        }
    }

    func delete(account: ComposerAutosaveAccount, slot: ComposerAutosaveSlot) {
        queue.async { [self] in
            let dossier = directory(account: account, slot: slot)
            forgetBitmaps(under: dossier)
            try? fileManager.removeItem(at: dossier)
        }
    }

    func deleteAll() {
        queue.async { [self] in
            writtenBitmaps.removeAll()
            try? fileManager.removeItem(at: root)
        }
    }

    /// Pour les témoins : rend la main une fois toutes les écritures en vol
    /// terminées.
    func waitForPendingWrites() {
        queue.sync {}
    }

    // MARK: - Écriture (file série)

    private func directory(account: ComposerAutosaveAccount, slot: ComposerAutosaveSlot) -> URL {
        root.appendingPathComponent(account.directoryName, isDirectory: true)
            .appendingPathComponent(slot.directoryName, isDirectory: true)
    }

    private func persist(_ write: ComposerAutosaveWrite, directory: URL) {
        let media = directory.appendingPathComponent("media", isDirectory: true)
        do {
            try fileManager.createDirectory(at: media, withIntermediateDirectories: true)
            excludeFromBackup(root)
        } catch {
            logger.error("autosave: dossier non créé — \(error.localizedDescription, privacy: .public)")
            return
        }
        for (fichier, source) in write.files {
            let cible = media.appendingPathComponent(fichier)
            guard source.standardizedFileURL != cible.standardizedFileURL,
                  !fileManager.fileExists(atPath: cible.path) else { continue }
            do {
                try fileManager.copyItem(at: source, to: cible)
            } catch {
                logger.error("autosave: copie ratée \(fichier, privacy: .public) — \(error.localizedDescription, privacy: .public)")
            }
        }
        for (fichier, image) in write.bitmaps {
            let cible = media.appendingPathComponent(fichier)
            let cle = cible.path
            guard writtenBitmaps[cle] != ObjectIdentifier(image) || !fileManager.fileExists(atPath: cle) else { continue }
            guard let jpeg = image.jpegData(compressionQuality: 0.9) else { continue }
            do {
                try jpeg.write(to: cible, options: .atomic)
                writtenBitmaps[cle] = ObjectIdentifier(image)
            } catch {
                logger.error("autosave: image non écrite \(fichier, privacy: .public)")
            }
        }
        for (fichier, blob) in write.blobs {
            try? blob.write(to: media.appendingPathComponent(fichier), options: .atomic)
        }
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        guard let json = try? encoder.encode(write.snapshot) else {
            logger.error("autosave: instantané non encodable")
            return
        }
        do {
            try json.write(to: directory.appendingPathComponent("snapshot.json"), options: .atomic)
        } catch {
            logger.error("autosave: instantané non écrit — \(error.localizedDescription, privacy: .public)")
            return
        }
        reconcile(media: media, keeping: write.referencedFiles)
    }

    /// Un média retiré de la création quitte aussi le disque — après
    /// l'instantané, jamais avant : un kill entre les deux laisse un fichier en
    /// trop, jamais un instantané qui désigne un fichier absent.
    private func reconcile(media: URL, keeping fichiers: Set<String>) {
        let presents = (try? fileManager.contentsOfDirectory(atPath: media.path)) ?? []
        for nom in presents where !fichiers.contains(nom) {
            let url = media.appendingPathComponent(nom)
            writtenBitmaps.removeValue(forKey: url.path)
            try? fileManager.removeItem(at: url)
        }
    }

    private func forgetBitmaps(under directory: URL) {
        let prefixe = directory.path
        writtenBitmaps = writtenBitmaps.filter { !$0.key.hasPrefix(prefixe) }
    }

    private func excludeFromBackup(_ url: URL) {
        var valeurs = URLResourceValues()
        valeurs.isExcludedFromBackup = true
        var cible = url
        try? cible.setResourceValues(valeurs)
    }

    // MARK: - Lecture

    private func restore(directory: URL) -> ComposerAutosaveRestored? {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        guard let data = try? Data(contentsOf: directory.appendingPathComponent("snapshot.json")),
              let snapshot = try? decoder.decode(ComposerAutosaveSnapshot.self, from: data) else { return nil }
        let media = directory.appendingPathComponent("media", isDirectory: true)
        let session = sessionRoot.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try? fileManager.createDirectory(at: session, withIntermediateDirectories: true)

        let bitmapFiles = Set(snapshot.images.values).union(snapshot.slideImages.values)
        let blobFiles = Set(snapshot.stickerAnimations.values)
        // Tout fichier source du brouillon revient — ceux des porteurs, des
        // dictionnaires du ViewModel ET ceux que les scènes désignent
        // (`ComposerAutosaveCodec.portable`) : une liste recomposée en oublierait
        // une famille.
        let fileNames = ((try? fileManager.contentsOfDirectory(atPath: media.path)) ?? [])
            .filter { $0.hasPrefix(ComposerAutosaveFileName.sourcePrefix) }

        let urls: [String: URL] = fileNames.reduce(into: [:]) { carte, nom in
            let source = media.appendingPathComponent(nom)
            guard fileManager.fileExists(atPath: source.path) else { return }
            let copie = session.appendingPathComponent(nom)
            if (try? fileManager.copyItem(at: source, to: copie)) != nil {
                carte[nom] = copie
            }
        }
        let bitmaps: [String: UIImage] = bitmapFiles.reduce(into: [:]) { carte, nom in
            carte[nom] = UIImage(contentsOfFile: media.appendingPathComponent(nom).path)
        }
        let blobs: [String: Data] = blobFiles.reduce(into: [:]) { carte, nom in
            carte[nom] = try? Data(contentsOf: media.appendingPathComponent(nom))
        }
        return ComposerAutosaveRestored(snapshot: snapshot, urlByFile: urls,
                                        bitmapByFile: bitmaps, blobByFile: blobs)
    }
}
