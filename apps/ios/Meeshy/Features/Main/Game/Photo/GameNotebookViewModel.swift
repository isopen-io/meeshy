import SwiftUI
import ImageIO
import MeeshySDK

/// LE CARNET DE PROGRESSION, vu de l'écran (#9382) — conception, partie VI : « le
/// carnet de progression garde ces photos et montre le chemin parcouru ». Il est
/// LOCAL à l'appareil : un disque qui refuse se lit « carnet vide », jamais une
/// erreur ; aucune lecture réseau — l'écran s'ouvre instantanément, hors ligne
/// comme en ligne. Miroir de `apps/web/src/routes/progression-carnet.tsx`.
@MainActor
final class GameNotebookViewModel: ObservableObject {
    nonisolated deinit {}

    /// Les photos gardées, la plus récente d'abord.
    @Published private(set) var kept: [NotebookEntry] = []
    /// Les moments laissés « plus tard » : sept jours pour les photographier.
    @Published private(set) var pending: [NotebookEntry] = []
    @Published private(set) var thumbnails: [String: UIImage] = [:]
    @Published private(set) var isLoaded = false
    @Published private(set) var removalFailed = false

    private let notebook: GamePhotoNotebooking

    init(notebook: GamePhotoNotebooking? = nil, currentUserId: String = AuthManager.shared.currentUser?.id ?? "") {
        self.notebook = notebook ?? GamePhotoNotebook.standard(userId: currentUserId)
    }

    var isEmpty: Bool { kept.isEmpty && pending.isEmpty }

    func load() async {
        let entries = await notebook.list()
        kept = entries.filter { $0.status == .kept }
        pending = entries.filter { $0.status == .pending }
        isLoaded = true
        for entry in kept where thumbnails[entry.momentId] == nil {
            guard let data = await notebook.imageData(for: entry, square: false) else { continue }
            let image = await Task.detached(priority: .utility) { Self.thumbnail(from: data, maxPixel: 320) }.value
            if let image { thumbnails[entry.momentId] = image }
        }
    }

    func remove(_ entry: NotebookEntry) async {
        let ok = await notebook.remove(momentId: entry.momentId)
        removalFailed = !ok
        guard ok else { return }
        kept.removeAll { $0.momentId == entry.momentId }
        pending.removeAll { $0.momentId == entry.momentId }
        thumbnails.removeValue(forKey: entry.momentId)
    }

    /// L'image pleine d'une photo gardée, pour la partager.
    func fullImage(of entry: NotebookEntry, square: Bool) async -> UIImage? {
        guard let data = await notebook.imageData(for: entry, square: square) else { return nil }
        return UIImage(data: data)
    }

    func moment(of entry: NotebookEntry) -> PhotoMoment {
        PhotoMoment(id: entry.momentId, emblem: entry.emblem, kicker: entry.kicker, title: entry.title)
    }

    /// Le déroulé d'un moment resté en attente — le même carnet, pas une copie.
    func makeSession(for entry: NotebookEntry) -> GamePhotoSession {
        GamePhotoSession(moment: moment(of: entry), notebook: notebook)
    }

    /// La vignette se décode À LA TAILLE DE LA LISTE : une photo 1080 × 1920 décodée
    /// en entier pèse huit Mo, vingt photos ne tiendraient pas dans une liste fluide.
    nonisolated static func thumbnail(from data: Data, maxPixel: Int) -> UIImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixel,
        ]
        guard let cg = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
        return UIImage(cgImage: cg)
    }
}
