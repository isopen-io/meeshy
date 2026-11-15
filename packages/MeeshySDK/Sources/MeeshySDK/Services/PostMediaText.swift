import Foundation

/// Les DEUX textes qu'un média de publication porte, distingués par ce qu'ils
/// DISENT — jamais par la façon dont ils voyagent, qui est identique.
///
/// `PostMedia.alt` et `PostMedia.caption` sont des jumelles exactes de
/// transport : même clé (un id de `mediaIds`), même borne (`z.string().max(1000)`),
/// même règle d'ignorance côté gateway — un id absent de `mediaIds` est écarté
/// EN SILENCE, pour les deux colonnes. Le serveur l'a déjà acté en n'écrivant
/// la règle qu'une fois (`PostService.applyMediaText(column:)`, dont
/// `applyMediaAlt` et `applyMediaCaption` sont deux projections) ; ce type est
/// son miroir Swift.
///
/// **Pourquoi un type plutôt qu'un second paramètre.** `mediaAlt` existait
/// seul ; ajouter `mediaCaption` à côté de lui aurait mis DEUX dictionnaires
/// de même type dans chaque signature, où l'ordre positionnel devient la seule
/// chose qui les distingue — la faute que `ComposerMediaAccessibility` nommait
/// déjà en refusant de séparer ses deux champs. Ce qui les distingue est leur
/// SENS, et il se nomme :
///
/// - `alt` DÉCRIT le média pour qui ne le voit pas. C'est de l'accessibilité :
///   VoiceOver l'annonce, personne ne le lit à l'écran.
/// - `caption` est la LÉGENDE que l'auteur ÉCRIT. Elle s'affiche. En profil
///   Post, c'est la description de la `MeeshySlide` — distincte du `content`
///   du post, que la publication garde pour elle (modèle § 3, #4045).
///
/// Les confondre serait un défaut de PRODUIT, pas de transport : une légende
/// annoncée à VoiceOver à la place d'une description, ou une description
/// affichée sous une photo.
public enum PostMediaText: String, CaseIterable, Sendable, Equatable {

    /// `PostMedia.alt` — accessibilité. Miroir de `CreatePostSchema.mediaAlt`.
    case alt

    /// `PostMedia.caption` — la légende visible. Miroir de
    /// `CreatePostSchema.mediaCaption`.
    case caption

    /// Borne du TRANSPORT, jamais une préférence d'interface : le gateway
    /// déclare `z.string().max(1000)` pour les deux colonnes
    /// (`services/gateway/src/routes/posts/types.ts`). Collecter au-delà
    /// produirait une requête refusée ou un texte tronqué par quelqu'un
    /// d'autre que l'auteur.
    public static let maxLength = 1000
}

/// Les deux textes d'une composition, portés ENSEMBLE d'un bout à l'autre de
/// la chaîne de publication.
///
/// **Pourquoi un type et pas deux paramètres.** Ce n'est PAS pour empêcher une
/// interversion : Swift étiquette ses arguments, `mediaAlt:` et `mediaCaption:`
/// ne se confondent pas au site d'appel. La raison est le NOMBRE de relais.
///
/// La chaîne app (`StoryViewModel`) enfile huit signatures avant d'atteindre la
/// requête, et chacune ne fait que passer la valeur. Un texte par média de plus
/// = huit signatures et leurs appels à modifier, et surtout huit occasions d'en
/// oublier UN — un relais qui recopie champ par champ est un inventaire à tenir
/// à jour, et il retient en silence tout ce qu'on ajoute en amont. Les porter
/// ENSEMBLE fait que le relais n'a plus rien à énumérer.
///
/// C'est la raison que `ComposerMediaAccessibility` donnait déjà pour refuser
/// de séparer ses champs ; elle vaut au même titre un étage plus bas.
public struct ComposerMediaTexts: Equatable, Sendable {

    /// Keyés par ID D'ÉLÉMENT DU COMPOSER jusqu'à l'upload, puis re-keyés sur
    /// les ids de `PostMedia` (`StoryMediaTextMapping.serverKeyed`).
    public var alt: [String: String]
    public var caption: [String: String]

    public init(alt: [String: String] = [:], caption: [String: String] = [:]) {
        self.alt = alt
        self.caption = caption
    }

    /// L'auteur n'a écrit aucun des deux.
    public static let none = ComposerMediaTexts()

    public var isEmpty: Bool { alt.isEmpty && caption.isEmpty }

    /// Forme du TRANSPORT : `nil` quand rien n'a été saisi, jamais un
    /// dictionnaire vide — le gateway lit l'absence « n'y touche pas » et un
    /// `{}` explicite dirait autre chose.
    public func payload(_ kind: PostMediaText) -> [String: String]? {
        let collected = kind == .alt ? alt : caption
        return collected.isEmpty ? nil : collected
    }
}
