import Foundation
import MeeshySDK
import UIKit

/// **Une prise de la caméra entre dans la story par ses OCTETS** (#11847) : ceux
/// que le viseur a écrits une fois, carte de gain et profil couleur compris. Le
/// fichier du média est écrit tel quel, sous l'extension que les octets disent ;
/// aucune seconde génération JPEG. Le lieu, s'il y en a un, est retiré à l'envoi
/// par la loi unique (`OutgoingImagePreparer`), jamais ici.
public nonisolated enum StoryCapturedPhotoFile {

    /// `nil` pour des octets qui ne sont pas une photo que la story sait poser.
    public static func fileName(objectId: String, data: Data) -> String? {
        switch OutgoingImageFormat(sniffing: data) {
        case .jpeg: return objectId + ".jpg"
        case .heic: return objectId + ".heic"
        case .png: return objectId + ".png"
        case .gif, .webp, .unknown: return nil
        }
    }

    /// Les octets écrits tels quels dans `directory` ; `nil` si ce n'est pas une
    /// photo connue ou si l'écriture échoue.
    public static func write(_ data: Data, objectId: String, in directory: URL) -> URL? {
        guard let name = fileName(objectId: objectId, data: data) else { return nil }
        let url = directory.appendingPathComponent(name)
        return (try? data.write(to: url)) != nil ? url : nil
    }

    /// Le média d'une prise, prêt à poser : le fichier (les octets de la prise
    /// quand le viseur en remet, sinon UN encodage JPEG de l'image décodée) et
    /// l'image affichée, décodée à 1080 sans encodage. `nil` ⇒ rien n'a pu
    /// s'écrire.
    @MainActor
    public static func place(_ image: UIImage, data: Data?, objectId: String) async -> (image: UIImage, url: URL)? {
        let directory = FileManager.default.temporaryDirectory
        if let data,
           let url = await Task.detached(priority: .userInitiated, operation: {
               StoryCapturedPhotoFile.write(data, objectId: objectId, in: directory)
           }).value {
            let shown = await StoryMediaLoader.shared.loadImage(data: data, maxDimension: 1080) ?? image
            return (shown, url)
        }
        let url = directory.appendingPathComponent(objectId + ".jpg")
        guard let encoded = await StoryMediaLoader.shared.downsampledJPEG(
                image: image, maxDimension: 1080, compressionQuality: 0.92),
              (try? encoded.data.write(to: url)) != nil else { return nil }
        return (encoded.image, url)
    }
}
