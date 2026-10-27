import Foundation

/// Où l'on colle, dans le composer. Deux surfaces, deux intentions.
nonisolated enum PasteSurface: Equatable {
    /// La scène elle-même — on compose du CONTENU.
    case scene
    /// Le panneau « Mes stickers » — on constitue une bibliothèque.
    case stickers
}

/// Ce qu'un collage produit dans le document.
nonisolated enum PasteProduct: Equatable {
    case mediaObject
    case sticker
    /// Une pièce jointe du document — ce que devient un fichier sans rendu dans
    /// le canevas (un PDF, une archive). **Jamais un rejet muet** : le
    /// presse-papier ne dit pas pourquoi rien ne s'est passé, donc avaler ce
    /// qu'on ne sait pas peindre serait le pire des comportements.
    case attachment
}

/// **Règle O12 — la surface décide.** Étendue le 2026-08-23 par la directive
/// produit : on colle des images, des documents et des stickers, et tout est
/// pris en compte et propagé, sur iOS comme sur iPadOS.
///
/// La règle a **deux axes indépendants**, jamais une table croisée :
///
/// - la **surface** décide du budget et de la mémorisation — coller dans la
///   scène produit du contenu pleine qualité et n'alimente JAMAIS la
///   bibliothèque ; coller dans le panneau Stickers produit un sticker au
///   budget réduit et le garde ;
/// - le **type collé** décide du produit — et une surface ne peut pas
///   transformer la NATURE de ce qui est collé : un PDF déposé dans le panneau
///   Stickers reste une pièce jointe, il ne devient pas un sticker.
///
/// Les croiser en une seule table aurait fabriqué huit cas dont six faux.
///
/// **Le pipeline de résolution n'est pas ici et n'a pas à l'être** :
/// `ComposerDropResolver` / `ComposerIngestRouter` savent déjà lire le
/// presse-papier (image avec ou sans fichier sous-jacent, document, vidéo,
/// audio, refus des dossiers, autorisation sandbox). Ce type ne décide QUE de
/// la destination, une fois la famille connue — en écrire un second lecteur
/// reviendrait à corriger deux fois chaque cas limite du presse-papier iOS.
nonisolated struct PasteDestination: Equatable {
    let product: PasteProduct
    /// Côté long maximal, en pixels, du média produit.
    let maxSide: Int
    /// Le collage alimente-t-il « Mes stickers » ? La promotion d'un média vers
    /// la bibliothèque existe par ailleurs, mais c'est une action EXPLICITE
    /// d'inspecteur — jamais un effet de bord d'un collage.
    let libraryWrite: Bool

    /// 2048 : un média collé dans la scène est du contenu, il doit survivre au
    /// zoom et à l'export. 512 : le budget d'un sticker, appliqué au
    /// downsample AVANT de matérialiser l'image (ImageIO) — décoder une photo
    /// de 12 Mpx pour la réduire ensuite ferait un pic mémoire pour rien.
    private static let sceneMaxSide = 2048
    private static let stickerMaxSide = 512

    static func resolve(surface: PasteSurface, ingest: ComposerIngestPipeline) -> PasteDestination {
        let product = resolveProduct(surface: surface, ingest: ingest)
        return PasteDestination(
            product: product,
            maxSide: surface == .stickers ? stickerMaxSide : sceneMaxSide,
            libraryWrite: product == .sticker
        )
    }

    /// Le second axe. Seule une IMAGE peut devenir un sticker ; tout ce qui a un
    /// rendu dans le canevas reste un objet média, et tout le reste devient une
    /// pièce jointe.
    private static func resolveProduct(surface: PasteSurface, ingest: ComposerIngestPipeline) -> PasteProduct {
        switch ingest {
        case .file: return .attachment
        case .image: return surface == .stickers ? .sticker : .mediaObject
        case .video, .audio: return .mediaObject
        }
    }
}
