import CoreGraphics
import Foundation
import UIKit

/// Marque Meeshy **fixe** apposée sur une image enregistrée en local.
///
/// C'est le MÊME filigrane que celui gravé dans les exports de story
/// (`StoryExportWatermark`) — logo dashes + « meeshy » + « @pseudo » — mais
/// figé sur une seule frame : une image ne joue pas d'animation, donc on en
/// peint l'instant où le filigrane est au repos (voir `stillTime`).
///
/// SDK — atome : ne prend que des paramètres opaques (une image, un pseudo).
/// La décision « quelles familles reçoivent une marque, à quel moment » reste
/// app-side (`MediaSaveBranding`).
public enum MeeshyImageWatermark {

    /// Instant du filigrane animé dont on fige la frame.
    ///
    /// Choisi pour tomber sur un état de repos EXACT plutôt que sur un
    /// arbitraire :
    /// - `< 12 s` → premier segment, donc coin bas-droite (`isBottomRight`) ;
    /// - `≥ 0,4 s` → fondu d'entrée terminé, opacité pleine ;
    /// - `≥ 3 s` → les trois dashes sont intégralement tracés
    ///   (`logoTraceStagger * 2 + logoTraceBarDuration`) ;
    /// - `3,75 s` → mi-respiration (`breatheCycle` = 3 s), là où les opacités
    ///   des trois dashes se rejoignent au lieu d'être désaccordées comme aux
    ///   extrêmes du cycle.
    public static let stillTime: Double = 3.75

    /// Familles de fichiers image que la marque peut traverser sans rien
    /// détruire. Un GIF animé serait aplati en une image fixe par le rendu —
    /// on préfère l'enregistrer NU plutôt que de le casser.
    public static func supports(pathExtension: String) -> Bool {
        !["gif", "apng"].contains(pathExtension.lowercased())
    }

    /// Encodage de sortie pour une extension source donnée : PNG là où la
    /// transparence et le sans-perte comptent, JPEG partout ailleurs (HEIC
    /// compris — on ne sait pas ré-encoder en HEIC sans perte de métadonnées).
    public static func encoding(forPathExtension pathExtension: String) -> Encoding {
        ["png", "tiff", "tif"].contains(pathExtension.lowercased()) ? .png : .jpeg(quality: 0.95)
    }

    public enum Encoding: Equatable, Sendable {
        case png
        case jpeg(quality: CGFloat)

        /// Extension de fichier correspondante — l'appelant en a besoin : une
        /// image HEIC marquée ressort en JPEG, son nom d'export doit suivre.
        public var pathExtension: String {
            switch self {
            case .png: return "png"
            case .jpeg: return "jpg"
            }
        }
    }

    public enum WatermarkError: Error, Equatable, Sendable {
        case unsupportedFormat
        case unreadableImage
        case renderFailed
        case encodingFailed
    }

    // MARK: - Rendu

    /// Dimensions en PIXELS de l'image, orientation EXIF déjà appliquée
    /// (`UIImage.size` est en points et déjà redressée).
    public static func pixelSize(of image: UIImage) -> CGSize {
        CGSize(width: (image.size.width * image.scale).rounded(),
               height: (image.size.height * image.scale).rounded())
    }

    /// Retourne une copie de `image` marquée, à la résolution d'origine.
    @MainActor
    public static func stamped(_ image: UIImage, username: String?) -> UIImage? {
        guard let watermark = MeeshyExportWatermark.make(username: username) else { return nil }
        return stamped(image, watermark: watermark)
    }

    /// Variante prenant un filigrane déjà construit — c'est ce qui garantit
    /// que l'image et la vidéo d'une même sauvegarde portent la marque
    /// IDENTIQUE (même bloc texte pré-rendu).
    @MainActor
    public static func stamped(_ image: UIImage, watermark: StoryExportWatermark) -> UIImage? {
        let size = pixelSize(of: image)
        guard size.width >= 1, size.height >= 1 else { return nil }

        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = false
        // Le contexte d'`UIGraphicsImageRenderer` est déjà en repère UIKit
        // (origine haut-gauche) — exactement ce que `draw` attend du
        // compositeur d'export, qui l'y retourne explicitement.
        return UIGraphicsImageRenderer(size: size, format: format).image { context in
            image.draw(in: CGRect(origin: .zero, size: size))
            watermark.draw(in: context.cgContext, renderSize: size, at: stillTime)
        }
    }

    // MARK: - Fichier

    /// Écrit une copie marquée de l'image du fichier `fileURL` dans un dossier
    /// temporaire neuf, et retourne son URL.
    ///
    /// Ne touche JAMAIS `fileURL` : la source est très souvent le fichier du
    /// cache disque, qui doit rester la copie fidèle de l'original.
    ///
    /// Décodage, rendu et ré-encodage se font tous sur le MainActor : le rendu
    /// l'exige (`draw`), et les scinder ferait traverser un `UIImage` entre
    /// domaines d'isolation pour un gain nul sur une action ponctuelle déjà
    /// couverte par un indicateur de préparation.
    public static func stampedCopy(of fileURL: URL, username: String?) async throws -> URL {
        let sourceExtension = fileURL.pathExtension
        guard supports(pathExtension: sourceExtension) else {
            throw WatermarkError.unsupportedFormat
        }
        let outputEncoding = encoding(forPathExtension: sourceExtension)
        let baseName = fileURL.deletingPathExtension().lastPathComponent
        let outputName = (baseName.isEmpty ? "media" : baseName) + "." + outputEncoding.pathExtension

        return try await MainActor.run {
            guard let image = UIImage(contentsOfFile: fileURL.path) else {
                throw WatermarkError.unreadableImage
            }
            guard let marked = stamped(image, username: username) else {
                throw WatermarkError.renderFailed
            }
            let data: Data?
            switch outputEncoding {
            case .png: data = marked.pngData()
            case .jpeg(let quality): data = marked.jpegData(compressionQuality: quality)
            }
            guard let data else { throw WatermarkError.encodingFailed }

            let directory = FileManager.default.temporaryDirectory
                .appendingPathComponent("meeshy-branded-\(UUID().uuidString)", isDirectory: true)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let output = directory.appendingPathComponent(outputName)
            try data.write(to: output)
            return output
        }
    }
}
