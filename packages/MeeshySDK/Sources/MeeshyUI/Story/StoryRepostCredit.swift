import Foundation
import MeeshySDK

/// **Une republication ne porte plus aucune puce « Reposté de @auteur »**
/// (décision porteur 2026-10-13, #10524).
///
/// > « la puce « Reposté de @auteur » n'est plus nécessaire car on a cela dans
/// > les en-têtes après la date ! Inutile d'avoir du texte supplémentaire, que
/// > ce soit en story ou autre. »
///
/// Le crédit vit dans l'EN-TÊTE du lecteur, après la date
/// (`StoryViewerView+Header.swift`, `FeedPostCard+Header.swift`). Le composer
/// n'en pose plus, et la passerelle retire, à l'écriture comme à la lecture,
/// toute puce que les clients antérieurs posaient encore.
///
/// Reste ce que la puce a laissé derrière elle : un texte VERROUILLÉ dans le
/// canvas des stories publiées avant la règle. Le verrou n'existe que sur elle
/// (`StorySceneObjectPredicates.isLocked`) : republier ou recomposer une telle
/// story la retire, sans jamais toucher le texte éditable de l'auteur.
public nonisolated enum StoryRepostCredit {

    /// Les textes de `effects` débarrassés de toute puce héritée.
    public static func stripped(from texts: [StoryTextObject]) -> [StoryTextObject] {
        texts.filter { $0.isLocked != true }
    }
}
