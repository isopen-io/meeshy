import UIKit
import os
import MeeshySDK
import MeeshyUI

// MARK: - L'image d'un sticker de pack (#9190)

/// **Les octets d'un sticker de pack, servis par le cache des images.**
///
/// Un sticker de tiers voyage par son image de REPLI (`StickerPackItem.fileUrl`,
/// que le web joint aussi) : le fichier tel quel — un WebP ou un GIF animé le
/// reste sur la scène, qui reçoit ses octets. Le cache des images sert les
/// suivants sans réseau.
enum StickerPackItemImages {
    struct Loaded {
        let image: UIImage
        let data: Data
        /// Un sticker CINÉMATIQUE : ses octets suivent l'image sur la scène.
        let isAnimated: Bool
        /// Le type du fichier du pack — celui qui part avec ses octets.
        var mimeType: String = "image/png"

        /// **Ce qui part dans une conversation** (#9210) : le fichier du pack
        /// TEL QUEL quand il anime — réencodé en PNG depuis sa première image,
        /// il arrivait figé chez tout le monde. `nil` ⇒ le PNG d'hier.
        var outgoingFile: StickerSendPipeline.OriginalFile? {
            isAnimated ? StickerSendPipeline.OriginalFile(data: data, mimeType: mimeType) : nil
        }
    }

    static func load(_ item: StickerPackItem) async -> Loaded? {
        let resolved = MeeshyConfig.resolveMediaURL(item.fileUrl)?.absoluteString ?? item.fileUrl
        guard let data = try? await CacheCoordinator.shared.images.data(for: resolved),
              let image = UIImage(data: data) else {
            Logger.media.error("Sticker pack image unavailable: \(item.key, privacy: .public)")
            return nil
        }
        return Loaded(image: image, data: data, isAnimated: item.isAnimated, mimeType: item.mimeType)
    }
}

// MARK: - Poser un choix de la feuille sur la scène (#9189)

/// **Chaque famille de la feuille se POSE sur la scène**, par le viewmodel —
/// `currentEffects` est la seule source de vérité de la scène, et c'est ce qui
/// garde publication, reader et export d'accord.
///
/// La scène ne savait poser ni un Mee (film animé), ni un Instant, ni un
/// sticker de pack : la feuille ne lui montrait donc pas leurs onglets. Ils se
/// posent en sticker IMAGE — la première image du film, et ses octets animés
/// sous le même id (#3956), que la publication téléverse comme ceux d'un GIF
/// de « Mes stickers ».
@MainActor
enum SceneStickerPose {

    /// Provenance écrite dans `StorySticker.provider` — métadonnée, elle ne
    /// pilote aucun chargement.
    static let meeProvider = "mee"
    static let packProvider = "pack"

    /// Pose `choice` et rend l'id de l'objet posé. `nil` pour un sticker de
    /// pack, dont les octets se chargent d'abord (`posePackSticker`).
    @discardableResult
    static func pose(_ choice: StickerSheetChoice, on viewModel: StoryComposerViewModel) -> String? {
        guard let id = posed(choice, on: viewModel) else { return nil }
        settle(id, on: viewModel)
        return id
    }

    /// **Le sticker posé se décale hors des objets existants** (#13839, L5) :
    /// posé au centre, il couvrait le texte qu'on venait d'écrire.
    static func settle(_ id: String, on viewModel: StoryComposerViewModel) {
        var slide = viewModel.currentSlide
        guard var stickers = slide.effects.stickerObjects,
              let index = stickers.firstIndex(where: { $0.id == id }) else { return }
        let place = SceneStickerSpot.spot(avoiding: ComposerScenePosedObjects.positions(on: slide, excluding: id))
        stickers[index].x = Double(place.x)
        stickers[index].y = Double(place.y)
        slide.effects.stickerObjects = stickers
        viewModel.currentSlide = slide
    }

    private static func posed(_ choice: StickerSheetChoice, on viewModel: StoryComposerViewModel) -> String? {
        switch choice {
        case .emoji(let emoji):
            return viewModel.addSticker(emoji: emoji, scale: StorySticker.posedScale)?.id
        case .library(let item):
            return viewModel.addSticker(image: item.thumbnail,
                                        provider: StoryStickerLibraryItem.provider,
                                        scale: StorySticker.posedScale,
                                        animatedData: item.animatedData)?.id
        case .template(let gabarit, let emplacements):
            // L'échelle vient du GABARIT : `posedScale` ferait déborder un
            // cartouche qui mesure déjà son contenu.
            return viewModel.addSticker(template: gabarit, slots: emplacements)?.id
        case .locationTemplate(let lieu, let gabarit):
            // Un lieu décoré reste un `StoryLocationObject` : lui seul porte
            // les coordonnées que la plateforme LIT.
            return viewModel.addLocation(place: lieu, styleId: gabarit.id).id
        case .mee(let mee):
            return poseMee(mee, on: viewModel)
        case .instant(let instant, let slots):
            guard let image = instant.stillImage(slots: slots) else {
                return viewModel.addSticker(emoji: instant.emoji, scale: StorySticker.posedScale)?.id
            }
            return viewModel.addSticker(image: image, provider: meeProvider,
                                        scale: StorySticker.posedScale)?.id
        case .packItem:
            return nil
        }
    }

    @discardableResult
    static func posePackSticker(_ loaded: StickerPackItemImages.Loaded,
                                on viewModel: StoryComposerViewModel) -> String? {
        guard let id = viewModel.addSticker(image: loaded.image, provider: packProvider,
                                            scale: StorySticker.posedScale,
                                            animatedData: loaded.isAnimated ? loaded.data : nil)?.id else { return nil }
        settle(id, on: viewModel)
        return id
    }

    private static func poseMee(_ mee: MeeSticker, on viewModel: StoryComposerViewModel) -> String? {
        guard let still = MeeStickerCatalog.stillImage(mee) else {
            return viewModel.addSticker(emoji: mee.emoji, scale: StorySticker.posedScale)?.id
        }
        // Les octets animés partent tels quels dans la story publiée : un PNG
        // animé, que les trois clients lisent — jamais le `.lottie` (#10639).
        let film = MeeStickerCatalog.animatedImageData(for: mee)
        return viewModel.addSticker(image: still, provider: meeProvider,
                                    scale: StorySticker.posedScale, animatedData: film)?.id
    }
}

// MARK: - La place libre d'un sticker posé (#13839, L5)

/// **Où poser un sticker sans couvrir ce qui existe** — une règle pure, sur une
/// liste de places connues : le centre d'abord, puis autour. La première place
/// assez loin de tous les objets gagne ; à défaut, la plus éloignée.
nonisolated enum SceneStickerSpot {

    /// L'écart minimal, en unités de scène (0…1), entre un sticker posé et le
    /// centre d'un objet existant.
    static let clearance: CGFloat = 0.18

    static let candidates: [CGPoint] = [
        CGPoint(x: 0.5, y: 0.5), CGPoint(x: 0.5, y: 0.3), CGPoint(x: 0.5, y: 0.7),
        CGPoint(x: 0.28, y: 0.4), CGPoint(x: 0.72, y: 0.4), CGPoint(x: 0.28, y: 0.6),
        CGPoint(x: 0.72, y: 0.6), CGPoint(x: 0.5, y: 0.18), CGPoint(x: 0.5, y: 0.82)
    ]

    static func spot(avoiding objects: [CGPoint]) -> CGPoint {
        func ecart(_ place: CGPoint) -> CGFloat {
            objects.map { hypot($0.x - place.x, $0.y - place.y) }.min() ?? .greatestFiniteMagnitude
        }
        if let libre = candidates.first(where: { ecart($0) >= clearance }) { return libre }
        return candidates.max { ecart($0) < ecart($1) } ?? candidates[0]
    }
}
