import Foundation
import os
import MeeshySDK

/// « Mes stickers » — le magasin qui retient ce que l'utilisateur a collé
/// dans le panneau `.stickers` (règle O12, `PasteDestination`).
///
/// **Pourquoi ce n'est pas `DiskCacheStore` réutilisé tel quel** : le store
/// SDK fait déjà l'éviction LRU par mtime (`evictOverBudget`), mais
/// n'énumère jamais ses clés — aucune de ses méthodes publiques ne liste le
/// contenu du dossier. Une grille « récents » a donc besoin d'un index tenu
/// à côté, sur le même patron que le sidecar `.pins.json` du store SDK : un
/// fichier JSON caché (point initial) pour ne jamais devenir lui-même un
/// candidat à l'éviction.
///
/// Magasin pur : aucune UI, aucune dépendance au composer. Il reçoit des
/// octets et un identifiant opaque, il rend des octets et une liste
/// d'identifiants ordonnée du plus récent au plus ancien.
actor StickerLibraryStore {

    /// Une entrée de l'index. L'ORDRE du tableau porte la récence — le
    /// premier élément est le plus récent, le dernier le prochain candidat à
    /// l'éviction. Pas de timestamp : coller à nouveau un sticker existant le
    /// remonte en tête sans avoir à comparer des dates.
    private struct Entry: Codable, Equatable {
        let id: String
        let byteCount: Int
    }

    /// 64 Mo — le budget produit du panneau « Mes stickers ».
    static let defaultBudgetBytes = 64 * 1024 * 1024

    private let baseDirectory: URL
    private let budgetBytes: Int
    private let fileManager = FileManager.default
    private let logger = Logger(subsystem: "me.meeshy.app", category: "sticker-library")

    private var entries: [Entry] = []
    private var indexLoaded = false

    init(baseDirectory: URL? = nil, budgetBytes: Int = StickerLibraryStore.defaultBudgetBytes) {
        self.budgetBytes = budgetBytes
        if let baseDirectory {
            self.baseDirectory = baseDirectory
        } else {
            let root = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
            self.baseDirectory = root.appendingPathComponent("MeeshyStickers", isDirectory: true)
        }
        FileManager.default.createDirectoryLogging(at: self.baseDirectory, context: "sticker library root", logger: logger)
    }

    /// Enregistre un sticker collé. Un `id` déjà présent est remplacé (mêmes
    /// octets ou non) et remonté en tête des récents — c'est le même geste
    /// produit qu'un premier collage, jamais un doublon dans la liste.
    func save(_ data: Data, id: String) async {
        loadIndexIfNeeded()
        do {
            try data.write(to: fileURL(for: id), options: .atomic)
        } catch {
            logger.error("Sticker write failed for \(id, privacy: .public): \(error.localizedDescription, privacy: .public)")
            return
        }
        entries.removeAll { $0.id == id }
        entries.insert(Entry(id: id, byteCount: data.count), at: 0)
        persistIndex()
        evictOverBudgetIfNeeded()
    }

    /// Identifiants des stickers, du plus récent au plus ancien.
    func recentIDs() async -> [String] {
        loadIndexIfNeeded()
        return entries.map(\.id)
    }

    func data(forID id: String) async -> Data? {
        loadIndexIfNeeded()
        guard entries.contains(where: { $0.id == id }) else { return nil }
        return try? Data(contentsOf: fileURL(for: id))
    }

    func totalBytes() async -> Int {
        loadIndexIfNeeded()
        return entries.reduce(0) { $0 + $1.byteCount }
    }

    private func evictOverBudgetIfNeeded() {
        while entries.reduce(0, { $0 + $1.byteCount }) > budgetBytes, entries.count > 1 {
            let oldest = entries.removeLast()
            fileManager.removeItemLogging(atPath: fileURL(for: oldest.id).path, context: "sticker library eviction", logger: logger)
        }
        persistIndex()
    }

    private func fileURL(for id: String) -> URL {
        baseDirectory.appendingPathComponent(id)
    }

    private var indexURL: URL {
        baseDirectory.appendingPathComponent(".sticker-index.json")
    }

    /// Robuste à un index absent (première utilisation) ou corrompu (JSON
    /// invalide, écriture interrompue) : dans les deux cas, on repart d'une
    /// bibliothèque vide plutôt que de planter.
    private func loadIndexIfNeeded() {
        guard !indexLoaded else { return }
        indexLoaded = true
        guard fileManager.fileExists(atPath: indexURL.path) else { return }
        do {
            let data = try Data(contentsOf: indexURL)
            entries = try JSONDecoder().decode([Entry].self, from: data)
        } catch {
            logger.error("Sticker index unreadable, starting empty: \(error.localizedDescription, privacy: .public)")
            entries = []
        }
    }

    private func persistIndex() {
        do {
            let data = try JSONEncoder().encode(entries)
            try data.write(to: indexURL, options: .atomic)
        } catch {
            logger.error("Sticker index write failed: \(error.localizedDescription, privacy: .public)")
        }
    }
}
