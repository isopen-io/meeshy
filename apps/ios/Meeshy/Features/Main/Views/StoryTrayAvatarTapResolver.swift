import Foundation

/// Ce que déclenche un tap sur l'avatar « Moi » du tray de stories.
enum StoryTrayAvatarAction: Equatable {
    case manageStories
    case createStory
}

/// Décide où mène le tap sur l'avatar « Moi ».
///
/// La décision portait uniquement sur les stories PUBLIÉES. Quand tout a
/// échoué à publier, il n'y en a aucune : le tap ouvrait un composer vierge
/// alors que du travail récupérable attendait dans « Mes stories » — la seule
/// surface qui offre reprise, retry et suppression (user 2026-08-01, « le /!
/// dans le trail empêche d'afficher la liste des storys »).
///
/// Règle : dès qu'il EXISTE du travail — publié, en cours d'envoi ou en échec —
/// le tap mène à la liste. Créer reste le geste de l'ardoise vierge.
enum StoryTrayAvatarTapResolver {
    static func action(hasPublishedStory: Bool,
                       hasActiveUpload: Bool,
                       hasFailedItems: Bool) -> StoryTrayAvatarAction {
        hasPublishedStory || hasActiveUpload || hasFailedItems ? .manageStories : .createStory
    }
}
