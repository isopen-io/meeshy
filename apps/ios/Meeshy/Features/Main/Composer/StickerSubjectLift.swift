import CoreImage
import CoreVideo
import Foundation
import ImageIO
import UIKit
import Vision
import MeeshySDK
import MeeshyUI

/// **Détourer le sujet d'une photo pour en faire un sticker** (#3955).
///
/// ## Où vit ce fichier, et pourquoi
///
/// Le SDK expose la surface (`StickerPickerView` et son onglet « Mes
/// stickers ») ; l'APP fournit la capacité. C'est la même partition que le
/// collage (`StoryPasteProvider`) et la caméra (`StoryCameraCaptureProvider`) :
/// une décision produit — « ce que le détourage produit, et à quelle taille il
/// entre dans la bibliothèque » — n'a rien à faire dans un SDK d'atomes.
///
/// ## iOS 17, et non 16
///
/// **La planche et l'issue affirment « API iOS 16 ✓ — pile notre plancher ».
/// C'est faux, et c'est vérifiable** : `VNGenerateForegroundInstanceMaskRequest`
/// comme `ImageAnalysisInteraction.image(for:)` sont iOS **17**. Le plancher du
/// projet est 16.0 (`apps/ios/project.yml`), donc la capacité est gardée par
/// disponibilité, et l'entrée qui l'offre **n'est pas rendue** en dessous —
/// jamais grisée (loi 4 : un outil non servi est ABSENT).
///
/// ## Vision plutôt que VisionKit
///
/// `ImageAnalysisInteraction` détoure aussi, mais il vit dans une INTERACTION
/// UIKit posée sur une vue : il faut monter l'image à l'écran, attendre que
/// l'analyse s'attache, et lire le résultat par un chemin qui n'existe que
/// pendant que la vue vit. `VNGenerateForegroundInstanceMaskRequest` fait la
/// même chose sur des octets, sans vue — donc testable, et utilisable depuis un
/// picker qui n'affiche jamais l'image en grand.
///
/// Le dépôt pratique déjà exactement ce motif : `VideoFilterPipeline` masque
/// l'arrière-plan d'un appel avec `VNGeneratePersonSegmentationRequest`.
nonisolated enum StickerSubjectLift {

    /// Ce qu'un détourage peut rendre — chaque échec porte son nom, parce que
    /// « ça n'a pas marché » ne dit pas à l'utilisateur s'il doit choisir une
    /// AUTRE photo ou mettre son téléphone à jour.
    enum Failure: Error, Hashable {
        /// L'appareil ne sait pas détourer (iOS < 17).
        case unsupported
        /// Les octets ne sont pas une image lisible.
        case unreadable
        /// L'image est lisible, mais Vision n'y trouve aucun sujet — le cas le
        /// plus fréquent, et le seul que l'utilisateur peut corriger seul.
        case noSubject
    }

    /// Le détourage est-il disponible sur CET appareil ? Lu par la surface pour
    /// décider si l'entrée existe.
    static var isAvailable: Bool {
        if #available(iOS 17.0, *) { return true }
        return false
    }

    /// Le côté long du sticker produit — la MÊME borne que le collage
    /// (`PasteDestination`, surface `.stickers`), lue plutôt que réécrite : deux
    /// bornes pour un même magasin divergeraient au premier ajustement.
    static var maxSide: Int {
        PasteDestination.resolve(surface: .stickers, ingest: .image).maxSide
    }

    /// Détoure le sujet principal et rend une image à canal alpha, bornée.
    ///
    /// **Le sujet PRINCIPAL, pas tous les sujets** : `.allInstances` sur une
    /// photo de groupe rendrait un sticker à trous, où le fond réapparaît entre
    /// les personnes. Vision ordonne ses instances par saillance ; la première
    /// est celle que l'utilisateur croit avoir désignée en choisissant la photo.
    @available(iOS 17.0, *)
    static func lift(imageData: Data) throws -> UIImage {
        guard let source = UIImage(data: imageData), let cgImage = source.cgImage else {
            throw Failure.unreadable
        }
        let request = VNGenerateForegroundInstanceMaskRequest()
        let handler = VNImageRequestHandler(cgImage: cgImage, orientation: source.cgOrientation)
        try handler.perform([request])
        guard let observation = request.results?.first,
              let principal = observation.allInstances.first else {
            throw Failure.noSubject
        }
        // `allInstances` est un `IndexSet` — un tableau ne compile pas, et
        // l'index 0 y désigne le FOND : c'est `first` qui donne la première
        // instance réelle, jamais `0`.
        let masked = try observation.generateMaskedImage(
            ofInstances: IndexSet(integer: principal),
            from: handler,
            croppedToInstancesExtent: true)
        // L'orientation est RÉAPPLIQUÉE : `generateMaskedImage(from:)` produit
        // son masque dans l'espace de l'image REMISE au handler — le `cgImage`
        // brut, non redressé. La passer au handler redresse l'ANALYSE, pas la
        // sortie.
        return try bounded(pixelBuffer: masked, orientation: source.imageOrientation)
    }

    /// Ramène le buffer de Vision à une `UIImage` bornée par `maxSide`.
    ///
    /// Le redimensionnement passe par un rendu à échelle 1 et fond
    /// TRANSPARENT : un `UIGraphicsImageRenderer` opaque remplirait le
    /// détourage de noir — l'exact contraire de ce qu'on vient de produire.
    @available(iOS 17.0, *)
    private static func bounded(pixelBuffer: CVPixelBuffer,
                                orientation: UIImage.Orientation) throws -> UIImage {
        let ciImage = CIImage(cvPixelBuffer: pixelBuffer)
        let context = CIContext()
        guard let cgImage = context.createCGImage(ciImage, from: ciImage.extent) else {
            throw Failure.unreadable
        }
        let lifted = UIImage(cgImage: cgImage, scale: 1, orientation: orientation)
        let longest = max(lifted.size.width, lifted.size.height)
        guard longest > CGFloat(maxSide) else { return lifted }

        let ratio = CGFloat(maxSide) / longest
        let target = CGSize(width: (lifted.size.width * ratio).rounded(),
                            height: (lifted.size.height * ratio).rounded())
        let format = UIGraphicsImageRendererFormat.default()
        format.opaque = false
        format.scale = 1
        return UIGraphicsImageRenderer(size: target, format: format).image { _ in
            lifted.draw(in: CGRect(origin: .zero, size: target))
        }
    }
}

private extension UIImage {
    /// L'orientation EXIF que Vision attend. Sans elle, une photo prise en
    /// portrait est analysée couchée : Vision y trouve un sujet différent, ou
    /// aucun — et l'utilisateur voit « aucun sujet » sur une photo qui en a un.
    var cgOrientation: CGImagePropertyOrientation {
        switch imageOrientation {
        case .up: return .up
        case .down: return .down
        case .left: return .left
        case .right: return .right
        case .upMirrored: return .upMirrored
        case .downMirrored: return .downMirrored
        case .leftMirrored: return .leftMirrored
        case .rightMirrored: return .rightMirrored
        @unknown default: return .up
        }
    }
}
