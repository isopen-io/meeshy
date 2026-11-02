import Foundation

/// La couleur d'auteur d'une scène — celle que la barre des stories donne à
/// l'auteur, d'après son nom affiché puis son pseudo (`APIAuthor.name`). Une
/// scène qui ne déclare aucun fond se lit sur le dégradé de cette couleur : la
/// story et le post d'un même auteur la lisent ici, comme Android
/// (`ApiAuthor.storyAccentHex`, #14223), et un même document ne montre jamais
/// deux fonds (#14258).
public extension APIAuthor {
    var storyAccentHex: String { DynamicColorGenerator.colorForName(name) }
}

public extension FeedPost {
    /// `FeedPost.author` porte `APIAuthor.name` (`APIPost.toFeedPost`).
    var storyAccentHex: String { DynamicColorGenerator.colorForName(author) }
}
