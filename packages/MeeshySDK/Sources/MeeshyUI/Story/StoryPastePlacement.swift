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
/// **Elle ne porte QUE le texte, et c'est une décision.** La directive demande
/// aussi qu'un média collé aille en fond quand la scène n'en a pas, en premier
/// plan sinon — et **cette règle existe déjà**, deux fois, à l'endroit où
/// l'insertion se fait :
///
/// | matière | où la règle vit |
/// |---|---|
/// | image, vidéo | `shouldBeBackground = resolvedBackgroundMedia == nil && !hasSlideLevelBgImage` (`StoryComposerViewModel+Elements`) |
/// | son | `ComposerAudioPlacement.isBackground(sceneAlreadyHasBackgroundAudio:)` |
///
/// La réécrire ici aurait donné DEUX règles pour une question — et la seconde
/// aurait divergé au premier ajustement, en silence, puisque rien ne compare des
/// règles qui ne s'appellent pas. Ce qui manquait n'était donc pas la décision
/// du média : c'était le TEXTE, que le vocabulaire d'entrée du canvas ne nommait
/// pas du tout.
public nonisolated enum StoryPastePlacement: Equatable, Sendable {
    /// Le texte long DÉCRIT la slide — il ne se pose pas dessus.
    case description(String)
    /// Le texte court est une matière de scène : il devient un objet.
    case textObject(String)
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

}
