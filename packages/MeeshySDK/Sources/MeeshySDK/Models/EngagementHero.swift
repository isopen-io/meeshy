import Foundation

/// **Le succès que le tableau de bord met en AVANT** (#5831).
///
/// `ProgressionView` listait les succès à plat : le dernier obtenu pesait
/// exactement autant qu'un succès encore verrouillé, et rien ne donnait envie
/// d'y revenir. Un tableau de bord de progression sans héros ne raconte rien —
/// il compte.
///
/// La règle vit ICI, dans le SDK, et pas dans la vue : « lequel mettre en
/// avant » est une question de MODÈLE, elle se teste sans écran, et le jour où
/// la v3.1 web dessine le même tableau de bord elle lira la même loi plutôt
/// que d'en réécrire une deuxième (les jumelles divergent, mesuré trois fois
/// sur le Prisme).
public extension EngagementProgress {

    /// Le succès à mettre en héros, ou `nil` si le catalogue est vide.
    ///
    /// **Le DERNIER obtenu d'abord** — c'est la nouvelle la plus fraîche, et
    /// celle qu'on vient éventuellement de célébrer. Les dates sont des
    /// chaînes ISO 8601 : à fuseau normalisé (`Z`, ce que le gateway sert),
    /// leur ordre lexicographique EST leur ordre chronologique, et comparer
    /// les chaînes évite de faire dépendre un classement d'un décodage de
    /// date qui peut échouer en silence.
    ///
    /// **À défaut, le PROCHAIN à débloquer** — le premier verrouillé dans
    /// l'ordre du catalogue, qui est l'ordre des seuils croissants : c'est
    /// donc le plus proche, celui dont l'affichage a une chance de changer
    /// quelque chose. L'écran ne montre jamais un trou à la place du héros :
    /// quelqu'un qui n'a rien débloqué est exactement la personne à qui il
    /// faut dire quoi faire.
    var heroAchievement: EngagementAchievementProgress? {
        let obtenus = achievements.filter(\.unlocked)
        if !obtenus.isEmpty {
            // Un palier obtenu SANS date (charge ancienne, ou palier tenu par
            // le seul compteur) ne peut pas prétendre au titre de « dernier » :
            // il perd contre n'importe quelle date, et ne gagne que s'il est
            // seul. `""` trie avant toute date ISO, ce qui est exactement cela.
            return obtenus.max { ($0.reachedAt ?? "") < ($1.reachedAt ?? "") }
        }
        return achievements.first { !$0.unlocked }
    }
}
