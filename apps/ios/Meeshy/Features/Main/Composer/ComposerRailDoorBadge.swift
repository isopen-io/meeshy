import Foundation
import MeeshySDK

/// **Ce qu'une porte du rail PORTE DÉJÀ** (#4994, directive porteur
/// 2026-09-03).
///
/// > « lorsqu'une donnée a été faite (mise) pour un des composants, il faut
/// > insérer le compteur par dessus le composant ! »
///
/// ## Le défaut que ça ferme
///
/// Le rail *leading* peint dix portes identiques. Rien à l'écran ne disait
/// qu'une scène portait déjà trois textes, deux stickers et un lieu : pour le
/// savoir, il fallait ouvrir chaque porte. La matière était bien là — sur le
/// canvas pour ce qui se voit, dans la publication pour ce qui la qualifie —
/// et le rail restait muet sur la moitié qu'on ne voit pas.
///
/// ## Pourquoi une VALEUR entre le modèle et la règle
///
/// Les dix portes ne comptent pas dans le même magasin : cinq lisent la
/// `StorySlide`, quatre la `MeeshyPublication`, une le fond. Faire lire ces
/// deux mondes à une seule fonction l'aurait obligée à connaître l'état du
/// meuble — donc à cesser d'être éprouvable sans monter une vue.
///
/// `ComposerRailMatter` est le RELEVÉ ; `count(_:in:)` est la LOI. Le meuble
/// remplit le premier, la seconde n'a plus qu'à répondre — et les deux se
/// testent séparément, ce qui est exactement ce qui manque quand une règle
/// lit son entrée elle-même.
nonisolated struct ComposerRailMatter: Equatable, Sendable {

    /// Les objets texte POSÉS sur la scène. Pas la description, qui appartient
    /// à la slide et a sa propre porte.
    var texts: Int = 0

    /// Les médias de PREMIER PLAN. Un fond n'en est pas un : il n'a ni
    /// position ni puce, et `ComposerSceneObjectCount` l'exclut déjà pour la
    /// même raison — le compter ferait promettre à la porte un objet dont
    /// l'auteur ne trouverait jamais le dernier.
    var media: Int = 0

    /// Les pistes, fond COMPRIS — la porte `sound` ouvre la feuille des deux,
    /// et son placement (`.background` / premier plan) s'y choisit. Compter le
    /// seul premier plan laisserait un son de fond invisible sur la porte qui
    /// le sert.
    var sounds: Int = 0

    var stickers: Int = 0

    /// Le lieu de la PUBLICATION plus les pastilles posées sur la scène : la
    /// porte `place` sert les deux selon le format (`ComposerRailDoor.level`),
    /// donc son compte les additionne.
    var places: Int = 0

    /// Les balises DÉRIVÉES du texte de la publication. C'est `ComposerHashtags`
    /// qui les relit — la source unique, celle-là même que la feuille montre :
    /// tenir une liste à côté produirait deux vérités, celle qu'on lit et celle
    /// qu'on envoie.
    var hashtagsInText: Int = 0

    /// Les personnes nommées — `composerReferences`, jamais les `@` relus dans
    /// le texte : le second chemin dériverait du premier et les deux
    /// divergeraient au premier désaccord (`ComposerMentionQuery.payload` porte
    /// déjà cette décision).
    var mentions: Int = 0

    /// Les traits du calque de dessin.
    var strokes: Int = 0

    /// Un fond POSÉ — couleur choisie ou média de fond. Un booléen et non un
    /// compte : il n'y en a jamais deux, et « 1 » peint sur la palette dirait
    /// une quantité là où il n'y a qu'un état.
    var hasBackground: Bool = false

    /// La description de la slide, si elle est écrite.
    var hasDescription: Bool = false
}

nonisolated enum ComposerRailDoorBadge {

    /// **Le relevé, composé des DEUX magasins.**
    ///
    /// Il est PUR : la slide et les faits du meuble entrent, un relevé sort.
    /// C'est ce qui permet d'éprouver « un fond ne compte pas comme média de
    /// premier plan » sans monter le composer.
    static func matter(slide: StorySlide,
                       publicationText: String,
                       description: String,
                       mentions: Int,
                       hasDocumentLocation: Bool,
                       hasDocumentBackground: Bool) -> ComposerRailMatter {
        let effets = slide.effects
        let mediasDeFond = (effets.mediaObjects ?? []).filter { $0.isBackground }
        return ComposerRailMatter(
            texts: effets.textObjects.count,
            media: (effets.mediaObjects ?? []).filter { !$0.isBackground }.count,
            sounds: (effets.audioPlayerObjects ?? []).count,
            stickers: (effets.stickerObjects ?? []).count,
            places: effets.locationObjects.count + (hasDocumentLocation ? 1 : 0),
            hashtagsInText: ComposerHashtags.tags(in: publicationText).count,
            mentions: mentions,
            strokes: (effets.drawingStrokes ?? []).count,
            hasBackground: hasDocumentBackground || !mediasDeFond.isEmpty,
            hasDescription: !description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        )
    }

    /// **Ce que la pastille d'une porte affiche — `nil` quand il n'y a rien à
    /// dire.**
    ///
    /// Zéro ⇒ AUCUNE pastille, jamais un « 0 » grisé : c'est la loi 4 appliquée
    /// à un témoin plutôt qu'à un contrôle — un signe qui n'apprend rien occupe
    /// la place de ce qui apprend.
    ///
    /// Le `switch` est exhaustif : une onzième porte ne compile pas tant
    /// qu'elle n'a pas dit ce qu'elle porte. C'est très exactement la question
    /// qu'on oublie de se poser en ajoutant un bouton — et la porte `background`
    /// montre pourquoi elle mérite d'être posée : ce qu'elle porte n'est pas un
    /// nombre.
    static func count(_ door: ComposerRailDoor, in matter: ComposerRailMatter) -> Int? {
        let brut: Int
        switch door {
        case .description: brut = matter.hasDescription ? 1 : 0
        case .media:       brut = matter.media
        case .sound:       brut = matter.sounds
        case .text:        brut = matter.texts
        case .background:  brut = matter.hasBackground ? 1 : 0
        case .drawing:     brut = matter.strokes
        case .sticker:     brut = matter.stickers
        case .mention:     brut = matter.mentions
        case .hashtag:     brut = matter.hashtagsInText
        case .place:       brut = matter.places
        }
        return brut > 0 ? brut : nil
    }

    /// Le relevé COMPLET, une entrée par porte servie — ce que le rail reçoit.
    ///
    /// Les portes sans matière n'y entrent pas : le rail lit une carte, et une
    /// entrée absente est la même réponse que `count` rend, sans qu'il ait à
    /// re-poser la question.
    static func badges(for doors: [ComposerRailDoor],
                       in matter: ComposerRailMatter) -> [ComposerRailDoor: Int] {
        var carte: [ComposerRailDoor: Int] = [:]
        for door in doors {
            if let n = count(door, in: matter) { carte[door] = n }
        }
        return carte
    }
}
