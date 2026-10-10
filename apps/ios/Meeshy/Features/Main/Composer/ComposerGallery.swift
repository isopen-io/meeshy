import Foundation
import MeeshySDK

/// Ce que la capture enregistre en galerie : le RENDU (le brut y part déjà,
/// à la prise, par `CameraModel`), en OCTETS encodés qui portent l'EXIF de la prise.
nonisolated protocol ComposerGalleryProviding: AnyObject, Sendable {
    @concurrent func saveImage(_ data: Data) async -> Bool
    @concurrent func saveVideo(at url: URL) async -> Bool
}

/// **La galerie de la capture** (#9351, spec § 3.4) — l'album Meeshy, octets tels
/// quels (`saveImageFile` : aucun aller-retour par `UIImage`), et un refus qui se dit.
nonisolated final class ComposerGallery: ComposerGalleryProviding, @unchecked Sendable {
    static let shared = ComposerGallery()

    nonisolated deinit {}

    @concurrent
    func saveImage(_ data: Data) async -> Bool {
        let nom = ComposerPhotoEncoding.fileName(for: data, id: UUID().uuidString)
        let enregistre = await PhotoLibraryManager.shared.saveImageFile(data, fileName: nom)
        if !enregistre { await CameraModel.reportPhotoLibraryRefusal() }
        return enregistre
    }

    @concurrent
    func saveVideo(at url: URL) async -> Bool {
        let enregistre = await PhotoLibraryManager.shared.saveVideo(at: url)
        if !enregistre { await CameraModel.reportPhotoLibraryRefusal() }
        return enregistre
    }
}

// MARK: - Ce que la prise de vue écrit dans Photos (#9684)

/// Quand la version avec effets et cadre rejoint Photos.
nonisolated enum CaptureRenderedSaveMode: String, CaseIterable, Sendable {
    /// À la demande : la flèche ⬇︎ de la retouche.
    case manual
    /// À la validation de la retouche, sans geste de plus.
    case automatic
}

/// **La politique d'enregistrement de la capture** (#9684, demande porteur
/// 2026-10-08) : l'ORIGINAL ne rejoint plus Photos par défaut, et la version
/// avec effets et cadre s'y enregistre à la demande. Les deux se règlent dans
/// Réglages › Médias ; ce type est la seule règle que la caméra, la retouche et
/// la flèche consultent.
nonisolated struct CaptureSavePolicy: Equatable, Sendable {
    static let savesOriginalKey = "meeshy.capture.saveOriginalToPhotos"
    static let renderedModeKey = "meeshy.capture.renderedSaveMode"

    var savesOriginal: Bool
    var renderedMode: CaptureRenderedSaveMode

    static let standard = CaptureSavePolicy(savesOriginal: false, renderedMode: .manual)

    static func stored(in defaults: UserDefaults = .standard) -> CaptureSavePolicy {
        let mode = defaults.string(forKey: renderedModeKey).flatMap(CaptureRenderedSaveMode.init(rawValue:))
        return CaptureSavePolicy(savesOriginal: defaults.object(forKey: savesOriginalKey) as? Bool ?? standard.savesOriginal,
                                 renderedMode: mode ?? standard.renderedMode)
    }

    /// « Terminé » n'enregistre le rendu qu'en mode automatique, et jamais une
    /// prise que la flèche a déjà enregistrée.
    func savesRenderOnFinish(alreadySaved: Bool) -> Bool {
        renderedMode == .automatic && !alreadySaved
    }

    /// Un rendu identique à l'original (une vidéo sans effet, ni cadrage, ni
    /// découpe) ne s'écrit que si l'original n'est pas déjà dans Photos.
    var writesUntouchedTake: Bool { !savesOriginal }
}

/// Où en est l'enregistrement de la prise retouchée : une fois par prise.
nonisolated enum ComposerTakeSaveState: Equatable, Sendable {
    case idle
    case saving
    case saved

    var offersSave: Bool { self == .idle }
}
