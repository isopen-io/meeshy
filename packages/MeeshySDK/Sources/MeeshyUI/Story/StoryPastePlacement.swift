import Foundation

/// **Où va ce qu'on colle** (#4378, directive porteur 2026-08-30).
///
/// > « décide de comment coller ! Si le texte est > 10 mots il faut mettre dans
/// > la description, sinon créer un objet texte. Si c'est un audio mettre en
/// > foreground ; si c'est une image ou vidéo faire de même — sauf si aucun de
/// > ces éléments existe en fond. »
///
/// La règle est DÉCIDABLE, donc elle est pure : l'écrire dans le corps du
/// collage la rendrait invisible aux tests, et c'est une règle qu'on voudra
/// relire — « pourquoi mon image est-elle partie en fond ? » se répond en la
/// lisant, pas en instrumentant un écran.
///
/// **Le basculement fond / premier plan est le cas intéressant.** La même
/// matière va à deux endroits selon ce que la scène porte déjà : poser une image
/// en premier plan sur une scène vide donnerait une vignette flottant sur du
/// vide, là où l'auteur voulait manifestement un fond. C'est la loi 12 —
/// « la complexité se paie dans le CODE, jamais chez l'utilisateur » : il colle,
/// et c'est nous qui décidons.
public nonisolated enum StoryPastePlacement: Equatable, Sendable {
    /// Le texte long DÉCRIT la slide — il ne se pose pas dessus.
    case description(String)
    /// Le texte court est une matière de scène : il devient un objet.
    case textObject(String)
    /// La scène n'a pas de fond : cette matière le devient.
    case background
    /// La scène a déjà un fond : cette matière se pose dessus.
    case foreground
}

public nonisolated enum StoryPastePolicy {

    /// **Le seuil qui sépare « un texte » d'« une légende ».**
    ///
    /// Dix mots, et c'est un nombre de PRODUIT, pas une constante technique :
    /// au-delà, un texte posé sur une scène 9:16 la couvre au lieu de
    /// l'accompagner. Il vit ici, nommé, pour que le jour où le porteur le
    /// déplace, il se déplace en UN endroit.
    public static let descriptionWordThreshold = 10

    /// Compte les MOTS, pas les caractères : « anticonstitutionnellement » est
    /// un mot, « à la va comme je te pousse » en est six. Un seuil de caractères
    /// aurait envoyé le premier en description et gardé le second sur la scène,
    /// à rebours de ce que l'œil voit.
    ///
    /// La séparation se fait sur TOUT blanc (espaces, retours à la ligne,
    /// tabulations) et les vides sont écartés : un texte collé depuis une page
    /// web arrive volontiers avec des espaces doubles et des sauts de ligne.
    public static func wordCount(_ text: String) -> Int {
        text.split(whereSeparator: { $0.isWhitespace || $0.isNewline })
            .filter { !$0.isEmpty }
            .count
    }

    /// Le placement d'un TEXTE collé.
    ///
    /// Un texte VIDE ne place rien — `nil`. Coller le vide n'est pas une erreur
    /// à annoncer, c'est un geste sans matière ; lui donner une destination
    /// créerait un objet texte invisible que l'auteur devrait ensuite trouver
    /// pour le supprimer.
    public static func placement(forText text: String) -> StoryPastePlacement? {
        let propre = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !propre.isEmpty else { return nil }
        return wordCount(propre) > descriptionWordThreshold
            ? .description(propre)
            : .textObject(propre)
    }

    /// Le placement d'un MÉDIA collé — image, vidéo ou son.
    ///
    /// `sceneHasBackground` est la SEULE entrée, et c'est délibéré : le type du
    /// média ne change rien. La directive traite les trois de la même façon
    /// (« si c'est un audio mettre en foreground ; si c'est une image ou vidéo
    /// faire de même »), et un `switch` sur le type ici inviterait à les faire
    /// diverger sans qu'aucune règle ne le demande.
    public static func placement(forMediaWhenSceneHasBackground sceneHasBackground: Bool) -> StoryPastePlacement {
        sceneHasBackground ? .foreground : .background
    }
}
