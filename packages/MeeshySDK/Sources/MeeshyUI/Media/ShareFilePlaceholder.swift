import Foundation
import ImageIO
import UniformTypeIdentifiers

/// **Le placeholder RÉEL d'un fichier rendu à la demande** (#9682).
///
/// Une feuille de partage décide de ses activités sur les PLACEHOLDERS, avant
/// que le vrai fichier n'existe : `UIActivityItemSource.activityViewControllerPlaceholderItem(_:)`
/// sert à « déterminer le type de données » et donc les activités proposées
/// (documentation Apple de `UIActivityItemSource` et de `UIActivityItemProvider`,
/// dont `item` n'est appelé, sur un fil secondaire, qu'APRÈS le choix de
/// l'activité). Or « Enregistrer la vidéo » (`UIActivity.ActivityType.saveToCameraRoll`)
/// n'accepte qu'une vidéo que la photothèque sait lire —
/// `UIVideoAtPathIsCompatibleWithSavedPhotosAlbum(_:)` — et « Enregistrer dans
/// Fichiers » qu'une adresse de fichier qui existe. Une adresse vers un fichier
/// absent ne garantit ni l'un ni l'autre.
///
/// D'où un fichier VRAI et minuscule, copié sous le nom final : une vidéo H.264
/// d'une image noire 16×16 (1,5 Ko, ressource du module) ou un PNG 1×1 écrit par
/// ImageIO. Le rendu réel le remplace au moment du choix.
public enum ShareFilePlaceholder {

    /// Copie, dans un dossier temporaire propre, la vidéo minuscule sous `fileName`.
    public static func video(named fileName: String) -> URL? {
        guard let source = Bundle.module.url(forResource: "share-placeholder", withExtension: "mp4"),
              let destination = stagedURL(fileName) else { return nil }
        do {
            try FileManager.default.copyItem(at: source, to: destination)
            return destination
        } catch {
            return nil
        }
    }

    /// Un PNG 1×1 sous `fileName`.
    public static func image(named fileName: String) -> URL? {
        guard let destination = stagedURL(fileName),
              let context = CGContext(data: nil, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 0,
                                      space: CGColorSpaceCreateDeviceRGB(),
                                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue),
              let pixel = context.makeImage(),
              let output = CGImageDestinationCreateWithURL(destination as CFURL, UTType.png.identifier as CFString, 1, nil)
        else { return nil }
        CGImageDestinationAddImage(output, pixel, nil)
        return CGImageDestinationFinalize(output) ? destination : nil
    }

    private static func stagedURL(_ fileName: String) -> URL? {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("share-placeholder-\(UUID().uuidString)", isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        } catch {
            return nil
        }
        return directory.appendingPathComponent(fileName)
    }
}
