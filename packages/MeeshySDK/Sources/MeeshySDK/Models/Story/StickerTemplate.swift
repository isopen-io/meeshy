import Foundation

// MARK: - Sticker Template

/// **Ce qu'un sticker DÉCORÉ est** (#4716, directive porteur 2026-09-01).
///
/// Un gabarit, c'est un cadre + des EMPLACEMENTS. Il ne dessine rien ici : ce
/// type est du modèle PUR — aucune I/O, aucun UIKit, aucune chaîne localisée.
/// Le dessin vit dans `MeeshyUI` (`StickerTemplateRenderer`), les mots aussi
/// (`MeeshySDK` n'a **aucune ressource de localisation** — seul `MeeshyUI` en
/// déclare, cf. `Package.swift`).
///
/// ## La ligne de partage qui décide où un gabarit se pose
///
/// **Une FAMILLE de scène existe quand la plateforme LIT la donnée ; sinon
/// c'est un sticker avec un gabarit.**
///
/// - un lieu porte des coordonnées et un id de POI, que la plateforme lit
///   (`/posts/nearby`) ⇒ il reste un `StoryLocationObject`, décoré par un
///   `styleId` ;
/// - une heure figée, un cœur ⇒ un `StorySticker` de nature `.template`.
///
/// Le contraire — tout mettre en sticker — ferait de la pastille de lieu
/// décorée la JUMELLE de `StoryLocationObject`, dont seule l'une des deux
/// porterait la donnée géographique. Et une famille par thème (`time`, `love`,
/// …) rouvrirait les +150 cascades que `MeeshySceneObject` a fermées au #4591.
public struct StickerTemplate: Identifiable, Equatable, Sendable {

    public let id: String
    public let family: StickerTemplateFamily
    public let slots: [StickerTemplateSlot]

    /// **Ce que voit un lecteur qui ne sait pas rendre ce gabarit** — un web
    /// ou un Android non mis à jour, un iOS d'une version antérieure.
    ///
    /// Il lit `StorySticker.emoji` ; sans repli il verrait un vide. Même
    /// patron que `StorySticker.imageFallbackEmoji`, dont l'existence prouve
    /// que le cas s'est déjà produit une fois.
    public let fallbackEmoji: String

    /// **L'échelle à laquelle CE gabarit se pose — et ce n'est PAS
    /// `StorySticker.posedScale`.**
    ///
    /// Le `2.2` de `StorySticker` agrandit un GLYPHE NU : sans lui, un emoji se
    /// pose minuscule et l'auteur doit faire un second geste sans valeur. Un
    /// gabarit, lui, porte déjà du texte et de la mise en page — il MESURE son
    /// contenu. Le poser à 2,2 le ferait déborder de la scène.
    public let posedScale: Double

    /// **Le mouvement avec lequel CE gabarit se pose** (#4821) — `nil` = il se
    /// pose immobile. Un cœur qui bat se pose battant : la complexité est dans
    /// le code, l'auteur n'a rien à régler. Copié dans `StorySticker.animation`
    /// à la pose, où l'auteur peut ensuite l'ôter.
    public let animation: StickerAnimation?

    public init(id: String,
                family: StickerTemplateFamily,
                slots: [StickerTemplateSlot] = [],
                fallbackEmoji: String,
                posedScale: Double,
                animation: StickerAnimation? = nil) {
        self.id = id
        self.family = family
        self.slots = slots
        self.fallbackEmoji = fallbackEmoji
        self.posedScale = posedScale
        self.animation = animation
    }
}

// MARK: - Sticker Template Family

/// Le rangement de la palette, et rien d'autre.
///
/// Ce n'est **pas** une famille de `MeeshySceneObject` : `love` et `time` n'en
/// sont pas, et ne doivent pas le devenir — « amour » est un THÈME, pas une
/// nature d'objet, et une nature de plus rouvrirait chaque `switch` exhaustif
/// de scène.
public enum StickerTemplateFamily: String, CaseIterable, Sendable {
    case location
    case time
    case love
    /// Le temps qu'il FAIT — soleil, pluie, neige (#4820).
    case weather
    /// Les MOTS de l'auteur, dans une bulle, un ruban, un néon (#4822) — la
    /// seule famille dont un emplacement est de nature `.prose`.
    case text
    /// Les ÉMOTIONS et les mots de tous les jours (#4820) — joie, stupeur,
    /// humeur, salutations, réactions, fête, disponibilité. Des THÈMES de
    /// palette, jamais des natures de scène.
    case joy
    case surprise
    case mood
    case greeting
    case reaction
    case party
    case availability
    /// Le second lot de thèmes (#4820, vers les 200) — la nature et les
    /// animaux, l'encouragement, les réponses d'un mot.
    case nature
    case cheer
    case answer
}

// MARK: - Sticker Template Slot

/// Un emplacement de donnée dans un gabarit.
public struct StickerTemplateSlot: Equatable, Sendable {

    /// **La nature d'un emplacement tranche le Prisme Linguistique.**
    ///
    /// C'est l'EMPLACEMENT qui porte la distinction, jamais l'objet : un
    /// booléen « traduisible » posé sur le sticker entier ne saurait pas dire
    /// qu'un même gabarit peut porter une valeur ET une légende.
    public enum Nature: String, Equatable, Sendable {
        /// Une heure, une date, un nom de lieu. Porte une **donnée**, pas un
        /// discours : ne part **jamais** à la traduction. Envoyer « 14:32 » au
        /// pipeline NLLB n'a aucun sens et coûte un aller-retour.
        case value
        /// Une légende écrite par l'auteur. Suit le Prisme comme
        /// `StoryTextObject.translations`. **Aucun gabarit du premier lot n'en
        /// porte** — le cas est ouvert au #4721, et un témoin d'inventaire
        /// tombe le jour où le premier arrive.
        case prose
    }

    public let name: String
    public let nature: Nature

    public init(name: String, nature: Nature) {
        self.name = name
        self.nature = nature
    }
}
