import Foundation
import UIKit
import os
import MeeshySDK
import MeeshyUI

/// **La retouche d'une image du brouillon d'un message** (#8524, suivi #8416).
///
/// Trois défauts mesurés sur la première livraison :
/// - la scène partait de la VIGNETTE du plateau (1 024 px) : une image qu'on
///   rouvrait sans rien changer revenait moins définie ;
/// - un GIF s'y aplatissait en JPEG fixe ;
/// - l'ancien fichier était supprimé AVANT de savoir si le nouveau était écrit.
///
/// Ce site porte les trois règles ; la couverture de `ConversationView` ne fait
/// que les appeler.
enum ConversationImageRetouche {

    /// La borne de la source décodée pour la scène : assez pour un rendu plein
    /// écran, et décodée HORS du fil principal.
    static let sourceMaxPixelSize: CGFloat = 2048

    /// Un GIF ne s'offre pas à la retouche : la scène le rendrait en image fixe.
    static func offersRetouche(mimeType: String) -> Bool {
        mimeType.lowercased() != "image/gif"
    }

    /// La source de la scène — le FICHIER de la pièce jointe, borné à 2 048 px,
    /// décodé sur une tâche détachée. `nil` si le fichier a disparu.
    static func loadSource(fileURL: URL) async -> UIImage? {
        await SOTAImageThumbnail.thumbnailAsync(from: fileURL, maxPixelSize: sourceMaxPixelSize)
    }

    struct Written: Equatable {
        let url: URL
        let fileName: String
        let mimeType: String
        let byteCount: Int
    }

    /// Écrit l'image retouchée et VÉRIFIE l'écriture (fichier présent, taille
    /// non nulle). `nil` ⇒ rien n'a changé : l'appelant garde l'ancien fichier.
    static func writeEdited(_ image: UIImage,
                            directory: URL = FileManager.default.temporaryDirectory) async -> Written? {
        let compressed = await MediaCompressor.shared.compressImage(image)
        let fileName = "edited_\(UUID().uuidString).\(compressed.fileExtension)"
        let url = directory.appendingPathComponent(fileName)
        do {
            try compressed.data.write(to: url, options: .atomic)
        } catch {
            os.Logger(subsystem: "me.meeshy.app", category: "media")
                .error("retouche: écriture ratée — l'image d'origine est gardée (\(error.localizedDescription, privacy: .public))")
            return nil
        }
        let taille = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
        guard taille > 0 else {
            try? FileManager.default.removeItem(at: url)
            return nil
        }
        return Written(url: url, fileName: fileName, mimeType: compressed.mimeType, byteCount: taille)
    }
}
