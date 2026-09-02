import Foundation

// MARK: - Ce qui MÉRITE un post

/// **La seule règle qui décide qu'une slide mérite d'être publiée** (#4741).
///
/// ## Pourquoi elle existe
///
/// Publier une story crée un post PAR slide. Deux sites décidaient de la même
/// chose, séparément, et divergeaient dans les DEUX sens :
///
/// | champ | `ComposerStoryCanvas.slideHasMatter` (armait la flèche) | `slideIsWorthPublishing` (filtrait ce qui part) |
/// |---|---|---|
/// | coquille de texte VIDE | comptait | ne comptait pas |
/// | pastille de LIEU | **ne comptait pas** | comptait |
/// | fond choisi | comptait | **ne comptait pas** |
/// | image de fond | ne la voyait pas | comptait |
/// | `mediaURL` / `mediaData` legacy | comptait | ne comptait pas |
///
/// Un auteur dont la seule matière était une pastille de lieu voyait donc la
/// flèche RESTER GRISE ; à l'inverse, une slide au fond choisi armait la flèche
/// puis se faisait jeter par le filtre. Deux écritures d'une règle sont deux
/// occasions de la corriger à moitié — celle-ci l'était des deux côtés.
///
/// ## Ce qu'elle n'est PAS
///
/// **Distincte de `slideHasContent`**, et volontairement. Cette dernière répond
/// « la page que je REGARDE est-elle vierge » — la page blanche de l'auteur —
/// et le fond auto-appliqué n'y compte légitimement pas : un fond ne remplit
/// pas une page aux yeux de qui la regarde. Ici la question est autre :
/// « cette slide mérite-t-elle un post ? », et un fond CHOISI y répond oui —
/// c'est le geste le plus court qui produise une story qu'on peut regarder
/// (décision testée, `ComposerStoryCanvasTests.test_unFOND_estDeLaMatière`).
///
/// Les fusionner ferait de deux questions justes une seule fausse.
public enum StorySlidePublishMatter {

    /// - Parameter hasBackgroundImage: la slide porte-t-elle un bitmap de fond ?
    ///   Il ne vit pas dans `effects` mais dans `slideImages`, sous l'id de la
    ///   slide. Requis, sans défaut : un défaut jetterait en silence une
    ///   story-photo, et le site d'appel ne rougirait pas.
    public static func deservesAPost(_ slide: StorySlide,
                                     hasBackgroundImage: Bool) -> Bool {
        if hasBackgroundImage { return true }
        if slide.mediaURL?.isEmpty == false { return true }
        if slide.mediaData != nil { return true }
        if slide.content?.isEmpty == false { return true }

        let effets = slide.effects
        if effets.background?.isEmpty == false { return true }
        // Un texte VIDE n'est pas de la matière : c'est la coquille que le tap
        // sur la page blanche pose AVANT la première frappe. La compter
        // armerait la flèche sur une intention qui n'existe pas encore.
        if effets.textObjects.contains(where: carriesRealText) { return true }
        if effets.mediaObjects?.isEmpty == false { return true }
        if effets.stickerObjects?.isEmpty == false { return true }
        if !effets.locationObjects.isEmpty { return true }
        if effets.drawingStrokes?.isEmpty == false { return true }
        if effets.drawingData != nil { return true }
        // Le SON est de la matière : une story « fond + musique » n'a aucun
        // contenu visuel et se publie parfaitement.
        if effets.audioPlayerObjects?.isEmpty == false { return true }
        if effets.backgroundAudioId != nil { return true }
        return false
    }

    /// Y a-t-il, dans TOUT le composer, de quoi publier ?
    ///
    /// - Parameter slideImageIds: les slides qui portent un bitmap de fond.
    public static func anySlideDeservesAPost(_ slides: [StorySlide],
                                             slideImageIds: Set<String>) -> Bool {
        slides.contains { deservesAPost($0, hasBackgroundImage: slideImageIds.contains($0.id)) }
    }

    /// Un `StoryTextObject` au texte vide — ou fait d'espaces — ne porte aucune
    /// intention. Même trim que `exitTextEditingMode`, qui fait le ménage à la
    /// sortie de l'éditeur : les deux règles doivent voir la même chose, sinon
    /// la fenêtre se rouvre entre la saisie d'un espace et la fermeture.
    public static func carriesRealText(_ text: StoryTextObject) -> Bool {
        !text.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}
