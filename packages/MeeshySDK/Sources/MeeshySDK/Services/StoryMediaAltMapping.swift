import Foundation

/// Traduction des clés du texte alternatif, entre l'espace d'ids du COMPOSER et
/// celui du SERVEUR.
///
/// Le panneau d'accessibilité collecte sous l'id de l'élément de canevas
/// (`StoryMediaObject.id`) : au moment où l'auteur écrit, le média n'a pas
/// encore d'existence serveur. `CreatePostSchema.mediaAlt` n'accepte, lui, que
/// des ids de `mediaIds` — `PostService.applyMediaAlt` filtre les autres clés
/// et n'en dit rien. Envoyer les ids du composer produirait donc une requête
/// acceptée et un texte alternatif jamais enregistré.
public enum StoryMediaAltMapping {

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
            guard let alt = composerKeyed[object.id], !alt.isEmpty else { return }
            keyed[object.postMediaId] = alt
        }
    }
}
