import Foundation
import MeeshySDK

/// **Le rôle d'un média VISUEL qui entre dans le composer** (#4724) — jumeau
/// exact de `ComposerAudioRole`, pour l'autre matière.
///
/// > Directive porteur 2026-09-01 : « Il faut t'assurer que Meeshy Composer
/// > puisse faire la différence entre les medias sur la scene en foreground et
/// > les media en background (apparaissent comme nouveau tuile en haut sur la
/// > rangé des headers). »
///
/// Le modèle porte la distinction depuis toujours — `StoryMediaObject.isBackground`.
/// Ce qui manquait est un mot pour la DEMANDER à l'entrée : l'ingestion posait
/// tout média visuel comme une page du carrousel, quelle que soit la porte, et
/// laissait `addMediaObject` deviner le reste.
nonisolated enum ComposerMediaRole: String, Equatable, Hashable, CaseIterable, Sendable {
    /// Le FOND de sa slide — une page. Il gagne une tuile dans la rangée haute.
    case background
    /// Un objet parmi les autres sur la slide COURANTE. Aucune tuile, aucune page.
    case foreground
}

/// **Par quelle porte un média est entré.**
///
/// Deux portes, deux gestes — et c'est la porte qui porte l'intention, pas le
/// fichier : le même JPEG vaut une page quand il arrive par la rangée du
/// document, et un objet posé quand il arrive par le rail de la scène.
nonisolated enum ComposerMediaDoor: Equatable, Sendable {
    /// La rangée d'outils du DOCUMENT (photothèque, caméra, fichiers).
    /// Doctrine de la vue `1g` : en Post, une slide EST un média.
    case documentRow
    /// La porte du rail, ouverte SUR la scène. Elle ajoute « en additif » —
    /// créer une page est le geste de `[+]`, et lui seul (directive porteur
    /// 2026-08-30).
    case sceneRail
}

/// **Où se range un média visuel posé — la loi du #4724.**
///
/// Elle a une jumelle qui l'a précédée d'un an de commits : `ComposerAudioPlacement`,
/// qui range un SON. Les deux disent la même chose dans deux matières, et c'est
/// délibérément deux règles et non une : un son n'a pas de place de fond VISUEL
/// (`applyContentMedia` le refuse en toutes lettres), et un média n'a pas de
/// crédit d'auteur. Les fondre aurait donné une règle qui doit demander de quoi
/// elle parle avant de répondre.
nonisolated enum ComposerMediaPlacement {

    /// **Le rail ne pose en premier plan que s'il a un fond SUR QUOI poser.**
    ///
    /// C'est la moitié de la règle qu'on oublie en la résumant à « rail ⇒ premier
    /// plan ». Une slide vierge n'a pas de fond : le premier média qu'on y pose
    /// le DEVIENT — `addMediaObject` l'y range depuis toujours
    /// (`resolvedBackgroundMedia == nil`), et l'auteur le voit plein cadre. Le
    /// déclarer « premier plan » ici donnerait un objet que le modèle marque
    /// pourtant `isBackground: true` : la rangée haute et la scène se
    /// contrediraient sur le MÊME média, ce qui est pire que le défaut qu'on
    /// ferme.
    ///
    /// > **Un rôle déclaré à l'entrée doit être celui que le modèle écrira à la
    /// > sortie**, sinon ce n'est pas un rôle, c'est un vœu.
    static func role(door: ComposerMediaDoor, currentSlideHasBackground: Bool) -> ComposerMediaRole {
        switch door {
        case .documentRow:
            return .background
        case .sceneRail:
            return currentSlideHasBackground ? .foreground : .background
        }
    }
}

/// **Ce qui gagne une TUILE dans la rangée haute** — et rien d'autre (#4724).
///
/// > **Une tuile de la rangée haute dit le FOND d'une slide.** Un média posé en
/// > premier plan vit sur la scène ; un son vit dans sa carte ; un document part
/// > en pièce jointe. Aucun des trois n'est une page, donc aucun des trois n'a
/// > de tuile.
///
/// La rangée était alimentée par `documentLocalMedia` — la liste ENTIÈRE — donc
/// elle montrait une tuile pour tout ce qui entre, jusqu'au son et au PDF. Le
/// symptôme se lisait comme un carrousel qui grossit sans qu'on ait ajouté de
/// page.
///
/// **La règle lit l'INDEX des fondations, pas une seconde vérité.**
/// `slideIdByMediaURL` dit déjà « ce média a fondé cette slide » ; c'est
/// exactement l'ensemble des fonds. Reconstruire la liste depuis les
/// `mediaObjects` du modèle aurait donné une deuxième source à faire diverger —
/// et une tuile a besoin de la VIGNETTE, que seul `ComposerDocumentMedia` porte.
nonisolated enum ComposerHeaderTiles {

    /// Les médias qui ont droit à une tuile, dans l'ordre de la liste du
    /// document — le seul ordre que l'auteur puisse prévoir.
    static func tiles(_ media: [ComposerDocumentMedia],
                      founding slideIdByMediaURL: [URL: String]) -> [ComposerDocumentMedia] {
        media.filter { slideIdByMediaURL[$0.url] != nil }
    }
}
