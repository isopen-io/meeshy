import Foundation
import MeeshySDK
import MeeshyUI

// MARK: - Request

/// Requête « enregistrer en local » — indépendante du point d'entrée
/// (viewer image/vidéo/audio/document, galerie média, menu contextuel).
/// Le composant de choix de destination est le MÊME pour tous les types :
/// seules les destinations proposées varient (règle SDK
/// `MediaSaveDestination.available(for:)`).
struct MediaSaveRequest: Identifiable, Equatable {
    let id: UUID
    let kind: AttachmentKind
    let remoteURLString: String
    let suggestedFileName: String?
    /// Attachment id serveur — pour le report best-effort « downloaded »
    /// (panneau « Qui a vu ») au moment du câblage des points d'entrée.
    let attachmentId: String?

    init(kind: AttachmentKind,
         remoteURLString: String,
         suggestedFileName: String? = nil,
         attachmentId: String? = nil) {
        self.id = UUID()
        self.kind = kind
        self.remoteURLString = remoteURLString
        self.suggestedFileName = suggestedFileName
        self.attachmentId = attachmentId
    }

    var destinations: [MediaSaveDestination] {
        MediaSaveDestination.available(for: kind)
    }
}

// MARK: - Seams (protocols for tests)

/// Résout (télécharge si nécessaire) le fichier LOCAL d'un média à
/// enregistrer. La production cascade cache typé → réseau (orchestration
/// produit → app-side, cf. SDK purity).
protocol MediaSaveSourceResolving: Sendable {
    func resolveLocalFile(for request: MediaSaveRequest) async throws -> URL
}

/// Écriture dans la photothèque — seam de test au-dessus de
/// `PhotoLibraryManager` (SDK).
protocol PhotoLibrarySaving: Sendable {
    func saveImage(_ data: Data) async throws
    func saveVideo(at url: URL) async throws
}

/// Report best-effort de la consommation « downloaded » (panneau « Qui a
/// vu ») — parité P7-9 avec les chemins historiques ImageViewer/DocumentViewer.
protocol MediaSaveDownloadReporting: Sendable {
    func reportDownloaded(attachmentId: String) async
}

enum MediaSaveError: LocalizedError, Equatable {
    case sourceUnavailable
    case photoLibraryDenied
    case destinationUnsupported

    var errorDescription: String? {
        switch self {
        case .sourceUnavailable:
            return NSLocalizedString("media.save.error.source", value: "Fichier introuvable", comment: "")
        case .photoLibraryDenied:
            return NSLocalizedString("media.save.error.photos", value: "Accès Photos refusé", comment: "")
        case .destinationUnsupported:
            return NSLocalizedString("media.save.error.unsupported", value: "Destination non disponible pour ce fichier", comment: "")
        }
    }
}

// MARK: - Coordinator

/// Orchestrateur UNIQUE du flux « Enregistrer en local » : chaque point
/// d'entrée (image, son, vidéo, document) passe par `requestSave` → la même
/// sheet de destinations → `pick`. Remplace les 4 chemins hétérogènes
/// historiques (Photos silencieux / Documents invisible / ShareLink).
@MainActor
final class MediaSaveCoordinator: ObservableObject {
    enum Outcome: Equatable {
        case saved(MediaSaveDestination)
        case failed(String)
    }

    /// Non-nil quand la sheet de choix de destination doit s'afficher.
    @Published var pendingRequest: MediaSaveRequest?
    /// Non-nil quand le picker d'export Fichiers doit s'afficher (copie stagée).
    @Published var exportURL: URL?
    /// Non-nil quand la share sheet doit s'afficher (copie stagée).
    @Published var shareURL: URL?
    @Published private(set) var isProcessing = false
    @Published private(set) var lastOutcome: Outcome?

    /// Requête en cours de traitement (après le choix de destination) —
    /// portée jusqu'à la complétion différée de l'export Fichiers pour le
    /// report « downloaded ».
    private(set) var activeRequest: MediaSaveRequest?

    private let resolver: MediaSaveSourceResolving
    private let photoSaver: PhotoLibrarySaving
    private let downloadReporter: MediaSaveDownloadReporting

    init(resolver: MediaSaveSourceResolving = AttachmentMediaSaveResolver(),
         photoSaver: PhotoLibrarySaving = PhotoLibraryManagerAdapter(),
         downloadReporter: MediaSaveDownloadReporting = AttachmentStatusDownloadReporter()) {
        self.resolver = resolver
        self.photoSaver = photoSaver
        self.downloadReporter = downloadReporter
    }

    func requestSave(_ request: MediaSaveRequest) {
        lastOutcome = nil
        activeRequest = nil
        pendingRequest = request
    }

    func cancel() {
        pendingRequest = nil
    }

    func pick(_ destination: MediaSaveDestination) async {
        guard let request = pendingRequest else { return }
        pendingRequest = nil
        guard destination.accepts(request.kind) else {
            lastOutcome = .failed(MediaSaveError.destinationUnsupported.localizedDescription)
            return
        }
        activeRequest = request
        isProcessing = true
        defer { isProcessing = false }
        do {
            let localFile = try await resolver.resolveLocalFile(for: request)
            switch destination {
            case .photoLibrary:
                if request.kind == .image {
                    let data = try Data(contentsOf: localFile)
                    try await photoSaver.saveImage(data)
                } else {
                    try await photoSaver.saveVideo(at: localFile)
                }
                lastOutcome = .saved(.photoLibrary)
                await reportDownloadedOnce()
            case .files:
                // Le save n'est acquis qu'au retour du document picker — pas
                // d'outcome ici, l'hôte UI le rapporte à la complétion.
                exportURL = try Self.stageForExport(localFile, request: request)
            case .share:
                shareURL = try Self.stageForExport(localFile, request: request)
            }
        } catch {
            lastOutcome = .failed(error.localizedDescription)
            activeRequest = nil
        }
    }

    func reportExportCompleted() {
        exportURL = nil
        lastOutcome = .saved(.files)
        Task { await reportDownloadedOnce() }
    }

    func reportExportCancelled() {
        exportURL = nil
        activeRequest = nil
    }

    /// Report « downloaded » best-effort, UNE fois par requête servie
    /// (`activeRequest` est consommée). Sans attachment id (média local,
    /// story…), no-op.
    private func reportDownloadedOnce() async {
        guard let request = activeRequest else { return }
        activeRequest = nil
        guard let attachmentId = request.attachmentId, !attachmentId.isEmpty else { return }
        await downloadReporter.reportDownloaded(attachmentId: attachmentId)
    }

    // MARK: - Pure helpers (testables sans I/O réseau)

    /// Copie le fichier résolu vers un dossier temporaire UNIQUE sous son
    /// nom lisible (les fichiers du cache sont nommés par hash SHA256 —
    /// inutilisables tels quels comme nom d'export).
    nonisolated static func stageForExport(_ source: URL, request: MediaSaveRequest) throws -> URL {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("media-save-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let destination = directory.appendingPathComponent(exportFileName(for: request))
        try FileManager.default.copyItem(at: source, to: destination)
        return destination
    }

    /// Nom de fichier d'export : nom suggéré assaini, sinon dernier segment
    /// de l'URL distante, sinon défaut par famille — l'extension de l'URL
    /// est réappliquée quand le nom choisi n'en porte pas.
    nonisolated static func exportFileName(for request: MediaSaveRequest) -> String {
        let remoteExtension = URL(string: request.remoteURLString)?.pathExtension ?? ""
        let sanitized = request.suggestedFileName?
            .replacingOccurrences(of: "/", with: "-")
            .replacingOccurrences(of: ":", with: "-")
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        var name = sanitized
        if name.isEmpty {
            let remoteName = URL(string: request.remoteURLString)?.lastPathComponent ?? ""
            name = (remoteName.isEmpty || remoteName == "/") ? "" : remoteName
        }
        if name.isEmpty {
            name = "Meeshy-\(request.kind.rawValue)"
        }
        if (name as NSString).pathExtension.isEmpty && !remoteExtension.isEmpty {
            name += ".\(remoteExtension)"
        }
        return name
    }
}

// MARK: - Production adapters

/// Cascade produit : `file://` direct → cache typé (image/vidéo/audio, avec
/// téléchargement via le funnel réseau du store) → download direct pour les
/// familles sans cache typé (documents, archives…). Miroir des chemins
/// historiques `AttachmentDownloader` / `DocumentViewerView.saveDocument`.
struct AttachmentMediaSaveResolver: MediaSaveSourceResolving {
    func resolveLocalFile(for request: MediaSaveRequest) async throws -> URL {
        let raw = request.remoteURLString
        if raw.hasPrefix("file://") {
            guard let url = URL(string: raw),
                  FileManager.default.fileExists(atPath: url.path) else {
                throw MediaSaveError.sourceUnavailable
            }
            return url
        }
        guard let resolved = MeeshyConfig.resolveMediaURL(raw) else {
            throw MediaSaveError.sourceUnavailable
        }
        switch request.kind {
        case .image:
            return try await materialize(from: CacheCoordinator.shared.images, key: resolved.absoluteString, ext: resolved.pathExtension)
        case .video:
            return try await materialize(from: CacheCoordinator.shared.video, key: resolved.absoluteString, ext: resolved.pathExtension)
        case .audio:
            return try await materialize(from: CacheCoordinator.shared.audio, key: resolved.absoluteString, ext: resolved.pathExtension)
        default:
            let (tempURL, _) = try await URLSession.shared.download(from: resolved)
            let suffix = resolved.pathExtension.isEmpty ? "" : ".\(resolved.pathExtension)"
            let destination = FileManager.default.temporaryDirectory
                .appendingPathComponent("media-save-dl-\(UUID().uuidString)\(suffix)")
            try FileManager.default.moveItem(at: tempURL, to: destination)
            return destination
        }
    }

    /// `data(for:)` télécharge+cache sur miss ; le fichier disque du store est
    /// préféré, avec repli sur une écriture temporaire si le flush L2 n'a pas
    /// encore touché le disque (timing interne du store).
    private func materialize(from store: DiskCacheStore, key: String, ext: String) async throws -> URL {
        let data = try await store.data(for: key)
        if let onDisk = await store.localFileURL(for: key) {
            return onDisk
        }
        let suffix = ext.isEmpty ? "" : ".\(ext)"
        let destination = FileManager.default.temporaryDirectory
            .appendingPathComponent("media-save-dl-\(UUID().uuidString)\(suffix)")
        try data.write(to: destination)
        return destination
    }
}

/// Report production : `POST /attachments/:id/status` action `downloaded`
/// (même contrat que les chemins historiques ImageViewer/DocumentViewer —
/// P7-9). Best-effort : un échec ne dégrade jamais un enregistrement réussi.
struct AttachmentStatusDownloadReporter: MediaSaveDownloadReporting {
    func reportDownloaded(attachmentId: String) async {
        let body = AttachmentStatusBody(action: "downloaded", playPositionMs: 0, durationMs: 0, complete: true)
        let _: APIResponse<[String: String]>? = try? await APIClient.shared.post(
            endpoint: "/attachments/\(attachmentId)/status", body: body
        )
    }
}

/// Adapte l'API `Bool` de `PhotoLibraryManager` (SDK) au contrat throwing du
/// coordinateur — un `false` (permission refusée / échec d'écriture) devient
/// une erreur typée surfacée à l'utilisateur.
struct PhotoLibraryManagerAdapter: PhotoLibrarySaving {
    func saveImage(_ data: Data) async throws {
        guard await PhotoLibraryManager.shared.saveImage(data) else {
            throw MediaSaveError.photoLibraryDenied
        }
    }

    func saveVideo(at url: URL) async throws {
        guard await PhotoLibraryManager.shared.saveVideo(at: url) else {
            throw MediaSaveError.photoLibraryDenied
        }
    }
}
