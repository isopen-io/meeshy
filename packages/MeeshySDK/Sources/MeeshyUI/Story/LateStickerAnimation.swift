import Foundation
import MeeshySDK

/// **Les octets animés qui arrivent APRÈS la pose d'un sticker** (#17040).
///
/// Le film d'un Mee se rasterise hors du toucher qui le pose : le rendre dans
/// le toucher tenait le fil principal jusqu'à 1,09 s sur iPhone. La scène
/// montre la première image le temps qu'il arrive ; ses octets rejoignent
/// alors le sticker s'il est encore sur une diapo, et sont ignorés s'il a été
/// retiré entre-temps — un résultat périmé ne ressuscite rien.
public enum LateStickerAnimation {

    /// Retient `data` sous le sticker `id` s'il est toujours posé. Rend `true`
    /// quand les octets ont été retenus.
    @discardableResult
    public static func attach(_ data: Data, to id: String, on viewModel: StoryComposerViewModel) -> Bool {
        let stillPosed = viewModel.slides.contains { slide in
            slide.effects.stickerObjects?.contains { $0.id == id } == true
        }
        guard stillPosed else { return false }
        viewModel.registerLoadedStickerAnimation(data, for: id)
        return true
    }
}
