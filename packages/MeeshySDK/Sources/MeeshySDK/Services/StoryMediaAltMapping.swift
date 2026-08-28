import Foundation

/// Traduction des clés d'un texte de média, entre l'espace d'ids du COMPOSER et
/// celui du SERVEUR.
///
/// **Générique par construction, et ça n'a pas eu à changer** (#4055) : la
/// fonction n'a jamais rien su du SENS du texte qu'elle re-clé — seul son NOM
/// prétendait le contraire. La légende emprunte donc le même site, sans une
/// ligne de logique nouvelle.
///
/// Le panneau d'accessibilité collecte sous l'id de l'élément de canevas
/// (`StoryMediaObject.id`) : au moment où l'auteur écrit, le média n'a pas
/// encore d'existence serveur. `CreatePostSchema.mediaAlt` n'accepte, lui, que
/// des ids de `mediaIds` — `PostService.applyMediaAlt` filtre les autres clés
/// et n'en dit rien. Envoyer les ids du composer produirait donc une requête
/// acceptée et un texte alternatif jamais enregistré.
public enum StoryMediaTextMapping {

    /// Re-clé `composerKeyed` sur les ids de `PostMedia`, d'après les objets
    /// média de la slide TELS QU'APRÈS UPLOAD (c'est l'upload qui renseigne
    /// `postMediaId`).
    ///
    /// Un objet dont l'upload n'a pas abouti (`postMediaId` vide — cas déjà
    /// journalisé par le publish, la couche est invisible aux lecteurs) est
    /// omis : son texte alternatif n'aurait aucun destinataire.
    public static func serverKeyed(
        composerKeyed: [String: String],
        mediaObjects: [StoryMediaObject]
    ) -> [String: String] {
        mediaObjects.reduce(into: [:]) { keyed, object in
            guard !object.postMediaId.isEmpty else { return }
            guard let text = composerKeyed[object.id], !text.isEmpty else { return }
            keyed[object.postMediaId] = text
        }
    }
}

/// Nom historique, conservé pour n'obliger aucun appelant hors dépôt à changer
/// dans le même lot. Le nom JUSTE est `StoryMediaTextMapping` : la traduction
/// sert les deux textes depuis #4055.
public typealias StoryMediaAltMapping = StoryMediaTextMapping
