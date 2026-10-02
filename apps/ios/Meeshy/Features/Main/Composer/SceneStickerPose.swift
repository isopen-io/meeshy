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
    }

    static func load(_ item: StickerPackItem) async -> Loaded? {
        let resolved = MeeshyConfig.resolveMediaURL(item.fileUrl)?.absoluteString ?? item.fileUrl
        guard let data = try? await CacheCoordinator.shared.images.data(for: resolved),
              let image = UIImage(data: data) else {
            Logger.media.error("Sticker pack image unavailable: \(item.key, privacy: .public)")
            return nil
        }
        return Loaded(image: image, data: data, isAnimated: item.kind == .cinematic)
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
        switch choice {
        case .emoji(let emoji):
            return viewModel.addSticker(emoji: emoji, scale: StorySticker.posedScale).id
        case .library(let item):
            return viewModel.addSticker(image: item.thumbnail,
                                        provider: StoryStickerLibraryItem.provider,
                                        scale: StorySticker.posedScale,
                                        animatedData: item.animatedData).id
        case .template(let gabarit, let emplacements):
            // L'échelle vient du GABARIT : `posedScale` ferait déborder un
            // cartouche qui mesure déjà son contenu.
            return viewModel.addSticker(template: gabarit, slots: emplacements).id
        case .locationTemplate(let lieu, let gabarit):
            // Un lieu décoré reste un `StoryLocationObject` : lui seul porte
            // les coordonnées que la plateforme LIT.
            return viewModel.addLocation(place: lieu, styleId: gabarit.id).id
        case .mee(let mee):
            return poseMee(mee, on: viewModel)
        case .instant(let instant, let slots):
            guard let image = instant.stillImage(slots: slots) else {
                return viewModel.addSticker(emoji: instant.emoji, scale: StorySticker.posedScale).id
            }
            return viewModel.addSticker(image: image, provider: meeProvider,
                                        scale: StorySticker.posedScale).id
        case .packItem:
            return nil
        }
    }

    @discardableResult
    static func posePackSticker(_ loaded: StickerPackItemImages.Loaded,
                                on viewModel: StoryComposerViewModel) -> String {
        viewModel.addSticker(image: loaded.image, provider: packProvider,
                             scale: StorySticker.posedScale,
                             animatedData: loaded.isAnimated ? loaded.data : nil).id
    }

    private static func poseMee(_ mee: MeeSticker, on viewModel: StoryComposerViewModel) -> String {
        guard let still = MeeStickerCatalog.stillImage(mee) else {
            return viewModel.addSticker(emoji: mee.emoji, scale: StorySticker.posedScale).id
        }
        let film = mee.animated
            ? MeeStickerCatalog.fileURL(for: mee).flatMap { try? Data(contentsOf: $0, options: .mappedIfSafe) }
            : nil
        return viewModel.addSticker(image: still, provider: meeProvider,
                                    scale: StorySticker.posedScale, animatedData: film).id
    }
}
