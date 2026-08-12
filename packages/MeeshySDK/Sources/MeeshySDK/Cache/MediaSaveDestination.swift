import Foundation

/// Destination possible pour « Enregistrer en local » un attachment.
///
/// Atome paramétrique : encode UNIQUEMENT la contrainte plateforme (la
/// photothèque n'accepte que les images et les vidéos — limite
/// PHPhotoLibrary), jamais une cascade produit. L'orchestration (résolution
/// du fichier local, présentation de la sheet, exécution du save) vit
/// côté app (`MediaSaveCoordinator`).
public enum MediaSaveDestination: String, CaseIterable, Sendable, Equatable {
    /// Photothèque système (album Meeshy via `PhotoLibraryManager`).
    case photoLibrary
    /// App Fichiers — l'utilisateur choisit le dossier
    /// (`UIDocumentPickerViewController(forExporting:)`).
    case files
    /// Share sheet système (AirDrop, Messages, autres apps…).
    case share

    /// `true` si cette destination peut recevoir un fichier de cette famille.
    public func accepts(_ kind: AttachmentKind) -> Bool {
        switch self {
        case .photoLibrary: return kind == .image || kind == .video
        case .files, .share: return true
        }
    }

    /// Destinations proposées pour une famille d'attachment, dans l'ordre
    /// d'affichage (photothèque d'abord quand elle s'applique).
    public static func available(for kind: AttachmentKind) -> [MediaSaveDestination] {
        allCases.filter { $0.accepts(kind) }
    }

    /// SF Symbol de la destination (pure data — pas de dépendance SwiftUI).
    public var sfSymbolName: String {
        switch self {
        case .photoLibrary: return "photo.on.rectangle"
        case .files:        return "folder"
        case .share:        return "square.and.arrow.up"
        }
    }

    /// Libellé localisé (FR par défaut, miroir du pattern
    /// `AttachmentKind.shortLabel`).
    public var label: String {
        switch self {
        case .photoLibrary:
            return NSLocalizedString("media.save.photoLibrary", value: "Enregistrer dans Photos", comment: "Save destination: system photo library")
        case .files:
            return NSLocalizedString("media.save.files", value: "Enregistrer dans Fichiers…", comment: "Save destination: Files app, user picks the folder")
        case .share:
            return NSLocalizedString("media.save.share", value: "Partager…", comment: "Save destination: system share sheet")
        }
    }
}
