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
    /// Les étapes déjà franchies sans photo gardée (#9961, #9962) : la première de chaque piste est ouverte,
    /// les suivantes l'attendent. Un moment en attente d'une piste suivie ne se montre QUE là.
    @Published private(set) var catchUp: [PhotoCatchUpEntry] = []
    @Published private(set) var thumbnails: [String: UIImage] = [:]
    @Published private(set) var isLoaded = false
    @Published private(set) var removalFailed = false

    private let notebook: GamePhotoNotebooking
    /// Où en est le jeu, lu dans le CACHE (la même clé que Progression) — jamais le réseau : le carnet
    /// s'ouvre instantanément, hors ligne comme en ligne. `nil` : rien de connu, aucun rattrapage.
    private let standing: @MainActor () async -> PhotoCatchUpStanding?

    init(
        notebook: GamePhotoNotebooking? = nil,
        currentUserId: String = AuthManager.shared.currentUser?.id ?? "",
        standing: (@MainActor () async -> PhotoCatchUpStanding?)? = nil
    ) {
        self.notebook = notebook ?? GamePhotoNotebook.standard(userId: currentUserId)
        if let standing {
            self.standing = standing
        } else {
            let source = EngagementPlayerBannerSource(userId: currentUserId)
            self.standing = { await source.cached().map(PhotoCatchUpStanding.init(game:)) }
        }
    }

    var isEmpty: Bool { kept.isEmpty && pending.isEmpty && catchUp.isEmpty }

    func load() async {
        let entries = await notebook.list()
        let keptEntries = entries.filter { $0.status == .kept }
        let keptIds = Set(keptEntries.map(\.momentId))
        let steps = await standing().map { GamePhotoCatchUp.catchUp($0, kept: keptIds) } ?? []
        let stepIds = Set(steps.map(\.id))
        kept = keptEntries
        pending = entries.filter { $0.status == .pending && !stepIds.contains($0.momentId) }
        catchUp = steps
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
        await load()
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

    /// Le déroulé d'une étape à rattraper — le même carnet : la photo gardée ouvre l'étape suivante.
    func makeSession(for step: PhotoCatchUpEntry) -> GamePhotoSession {
        GamePhotoSession(moment: step.moment, notebook: notebook)
    }

    /// Le titre de l'étape qu'une étape verrouillée attend — celui qu'elle cite dans « Prends d'abord ».
    func title(ofStep id: String) -> String? {
        catchUp.first { $0.id == id }?.moment.title
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
