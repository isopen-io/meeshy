import Foundation
import MeeshySDK

/// Répond à « cette story a-t-elle quoi que ce soit à restituer ? ».
///
/// Des stories entièrement vides existent bel et bien en base — constaté le
/// 2026-07-26 sur le compte de démonstration : `media: []`,
/// `storyEffects: {"textObjects": []}`, `content: null`. Le lecteur les
/// affichait en écran NOIR pendant toute la durée de slide ; pour qui ouvrait
/// cet anneau, c'était huit écrans noirs d'affilée. Le rendu n'était pas en
/// faute : il n'y avait rien à rendre.
///
/// Deux précautions gouvernent ce prédicat :
///
/// 1. **Conservateur par construction.** Au moindre champ porteur, la story
///    est déclarée affichable. Un faux positif ferait disparaître du contenu
///    réel — infiniment plus grave qu'un écran noir de six secondes. En cas de
///    doute sur un champ, l'ajouter ici plutôt que l'omettre.
///
/// 2. **« Rien à voir » n'est pas « rien à restituer ».** Une story purement
///    sonore (note vocale, audio de fond) n'a aucun visuel et reste un message
///    à part entière. La sauter reviendrait à supprimer la parole de son
///    auteur.
///
/// Ce prédicat ne dit RIEN d'un chargement en cours : il lit des métadonnées
/// déjà en main. Une story dont le média n'est pas encore téléchargé porte
/// quand même son entrée `media` / `mediaObjects` et reste donc affichable.
nonisolated enum StoryContentPresence {

    static func hasRenderableContent(_ story: StoryItem) -> Bool {
        if story.content?.isMeaningful == true { return true }
        if !story.media.isEmpty { return true }
        if story.audioUrl?.isMeaningful == true { return true }
        if story.backgroundAudio != nil { return true }
        // Un repost restitue la story d'origine : le contenu vit ailleurs.
        if story.repostOfId?.isMeaningful == true { return true }

        guard let effects = story.storyEffects else { return false }

        if effects.background?.isMeaningful == true { return true }
        if effects.textObjects.contains(where: { $0.text.isMeaningful }) { return true }
        if effects.mediaObjects?.isEmpty == false { return true }
        if effects.audioPlayerObjects?.isEmpty == false { return true }
        if effects.stickerObjects?.isEmpty == false { return true }
        if effects.stickers?.isEmpty == false { return true }
        if effects.drawingStrokes?.isEmpty == false { return true }
        if effects.drawingData?.isEmpty == false { return true }
        if effects.backgroundAudioId?.isMeaningful == true { return true }
        if effects.backgroundAudioVariants?.isEmpty == false { return true }

        return false
    }
}

// `nonisolated` obligatoire : le projet compile en
// `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`, qui isole jusqu'aux extensions
// privées — et `hasRenderableContent`, elle, est nonisolated.
private nonisolated extension String {
    /// Non vide une fois les blancs retirés. Le composer laisse des chaînes
    /// blanches derrière lui ; les compter pour du contenu ferait déclarer
    /// affichable une story qui rend un écran noir.
    var isMeaningful: Bool {
        !trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}
