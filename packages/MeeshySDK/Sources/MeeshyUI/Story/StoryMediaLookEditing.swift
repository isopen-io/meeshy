import Foundation
import MeeshySDK

// MARK: - Régler le look d'UN média dans le compositeur (#13840)

/// **La porte d'écriture du look d'un média**, pour l'app qui le choisit.
///
/// Le réglage s'écrit sur l'objet par les effets de la slide courante : même id,
/// même fichier ; l'historique d'annulation le couvre comme tout champ de la
/// slide, et la publication le cuit. Un id inconnu ou un look inchangé
/// n'écrivent rien.
public enum StoryMediaLookEditing {

    @MainActor
    public static func look(ofMedia id: String, in viewModel: StoryComposerViewModel) -> StoryMediaLook {
        viewModel.currentEffects.mediaLook(id: id)
    }

    @MainActor
    public static func apply(_ look: StoryMediaLook, toMedia id: String, in viewModel: StoryComposerViewModel) {
        guard let effets = viewModel.currentEffects.applyingMediaLook(look, toMedia: id) else { return }
        viewModel.currentEffects = effets
    }
}
