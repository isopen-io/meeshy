import Foundation
import CoreGraphics

// MARK: - MeeshySceneObject

/// **Ce que la planche appelle « un objet de scène », et que le code n'avait
/// pas** (#4591, directive porteur 2026-08-31).
///
/// ## Le manque
///
/// La planche du composer emploie `MeeshyObject` 78 fois. Le modèle n'avait ni
/// protocole ni type somme : les objets vivaient — et vivent toujours — dans
/// **cinq tableaux séparés** (`textObjects`, `mediaObjects`, `stickerObjects`,
/// `locationObjects`, `audioPlayerObjects`).
///
/// Conséquence mesurée : toute question posée à « l'objet d'id X » se réécrivait
/// en cascade sur les cinq. **Plus de 150 répétitions** dans le SDK et l'app —
/// 32 dans un seul fichier de timeline, 19 dans le canvas, 15 dans les éléments
/// du ViewModel.
///
/// > **La planche parle d'« un objet » ; le code n'avait pas d'objet.** Un
/// > renommage seul n'aurait pas rendu la relation naturelle : il aurait donné
/// > les bons mots à trois concepts sur cinq et laissé les deux manquants se
/// > dire en cascades.
///
/// ## Pourquoi une SOMME et non un protocole
///
/// Un protocole aurait donné la géométrie commune sans donner le KIND, or c'est
/// lui que la moitié des sites interroge — « est-ce un texte ? une vidéo ? ».
/// Il aurait aussi laissé les cinq tableaux se parcourir séparément : c'est
/// l'aplatissement qui ferme la cascade, pas l'abstraction des champs.
///
/// La somme donne les deux, et son `switch` exhaustif fait qu'une SIXIÈME
/// famille ne compilera pas tant qu'elle n'aura pas dit sa géométrie — la
/// question qu'on oublie de se poser en ajoutant un tableau.
///
/// ## Ce que ce type ne fait PAS
///
/// Il ne remplace pas les cinq tableaux : il les LIT. Les modèles restent la
/// source de vérité sérialisée, partagée avec le reader, l'export, Android et le
/// web. Cette somme est une VUE — construite à la demande, jamais persistée.
/// Le renommage des types Story appartient à l'étape 3 du même lot, et se fait
/// sur les trois plateformes ou pas du tout.
/// **`Sendable` mais PAS `Equatable`, et c'est le modèle qui le décide.**
///
/// Aucune des cinq familles ne conforme à `Equatable` — mesuré, après l'avoir
/// supposé et m'être fait reprendre par le compilateur. La somme ne peut donc
/// pas l'être sans que les cinq le deviennent d'abord, ce qui est un autre lot :
/// `Codable` ne synthétise pas `Equatable`, et certaines charges portent des
/// membres dont l'égalité n'a pas de sens évident (échantillons de forme d'onde,
/// données binaires).
///
/// Comparer deux objets se fait donc par leur `id`, ce que tous les sites font
/// déjà. Le jour où les cinq deviennent `Equatable`, cette ligne le devient
/// aussi — et pas avant.
public enum MeeshySceneObject: Sendable {
    case text(StoryTextObject)
    case media(StoryMediaObject)
    case sticker(StorySticker)
    case location(StoryLocationObject)
    case audio(StoryAudioPlayerObject)

    /// Le kind SANS la charge — pour les sites qui trient, comptent ou nomment
    /// sans avoir besoin de l'objet lui-même.
    public enum Kind: String, CaseIterable, Equatable, Sendable {
        case text, media, sticker, location, audio
    }

    public var kind: Kind {
        switch self {
        case .text:     return .text
        case .media:    return .media
        case .sticker:  return .sticker
        case .location: return .location
        case .audio:    return .audio
        }
    }

    public var id: String {
        switch self {
        case .text(let o):     return o.id
        case .media(let o):    return o.id
        case .sticker(let o):  return o.id
        case .location(let o): return o.id
        case .audio(let o):    return o.id
        }
    }

    // MARK: - La géométrie, et son ASYMÉTRIE assumée

    /// La position normalisée, `0…1` dans le repère de la scène.
    ///
    /// L'audio la porte en `CGFloat` là où les quatre autres l'ont en `Double` —
    /// même représentation sur 64 bits, deux types distincts pour le
    /// compilateur. La conversion vit ICI, une fois, plutôt que sur chaque site
    /// de lecture.
    public var x: Double {
        switch self {
        case .text(let o):     return o.x
        case .media(let o):    return o.x
        case .sticker(let o):  return o.x
        case .location(let o): return o.x
        case .audio(let o):    return Double(o.x)
        }
    }

    public var y: Double {
        switch self {
        case .text(let o):     return o.y
        case .media(let o):    return o.y
        case .sticker(let o):  return o.y
        case .location(let o): return o.y
        case .audio(let o):    return Double(o.y)
        }
    }

    /// **TOUT objet de scène se redimensionne** (directive porteur 2026-08-31) :
    ///
    /// > « Dans la V3, tout `MeeshySceneObject` a ces détails. Tout objet sur la
    /// > scène peut scale et roter. Il n'existe sur la scène que des
    /// > `MeeshySceneObject`. »
    ///
    /// La première version de ce type rendait `nil` pour l'audio et DOCUMENTAIT
    /// l'asymétrie comme une vérité produit. Elle n'en était pas une : le
    /// contrat `canvas-v3.ts` déclare `transform: { scale, rotation, opacity }`
    /// en champ REQUIS de tout `ObjectV3`, et le convertisseur du gateway
    /// fabriquait `num(o.scale, 1)` pour l'audio parce que le modèle Swift ne le
    /// portait pas.
    ///
    /// > **Documenter un trou comme une intention le rend permanent.** Le
    /// > commentaire était sincère, bien placé, et il aurait fait porter à
    /// > l'audio son absence de forme pendant encore un cycle.
    ///
    /// Les défauts sont ceux du convertisseur, à l'unité près : une publication
    /// existante rend exactement la même scène qu'avant.
    public var scale: Double {
        switch self {
        case .text(let o):     return o.scale
        case .media(let o):    return o.scale
        case .sticker(let o):  return o.scale
        case .location(let o): return o.scale
        case .audio(let o):    return o.scale ?? 1
        }
    }

    public var rotation: Double {
        switch self {
        case .text(let o):     return o.rotation
        case .media(let o):    return o.rotation
        case .sticker(let o):  return o.rotation
        case .location(let o): return o.rotation
        case .audio(let o):    return o.rotation ?? 0
        }
    }

    /// L'empilement. L'audio le porte optionnel ; `0` est le défaut que son
    /// propre décodeur applique déjà (`decodeIfPresent(...) ?? 0`), et le
    /// reprendre ici garde une seule réponse à la question « où est-il dans la
    /// pile ? ».
    public var zIndex: Int {
        switch self {
        case .text(let o):     return o.zIndex
        case .media(let o):    return o.zIndex
        case .sticker(let o):  return o.zIndex
        case .location(let o): return o.zIndex
        case .audio(let o):    return o.zIndex ?? 0
        }
    }

    /// **La DURÉE propre de l'objet — `nil` ⇒ il vit toute la slide.**
    ///
    /// Les CINQ familles en portent une (directive porteur 2026-08-31) :
    ///
    /// > « Tout `MeeshySceneObject` peut apparaître et disparaître quand il
    /// > souhaite, y compris la pastille de lieu. »
    ///
    /// > **La première version rendait `nil` pour un LIEU et le justifiait** —
    /// > « un lieu n'a pas de temps propre » — en lisant `timing: optional()`
    /// > dans `canvas-v3.ts` comme « cette famille n'a pas de temps ».
    /// > **`optional` décrit la PRÉSENCE d'un champ, jamais la CAPACITÉ d'une
    /// > famille.** Un objet peut ne pas avoir de fenêtre ; aucun ne peut être
    /// > privé du droit d'en avoir une.
    ///
    /// `nil` signifie donc « pas de fenêtre posée », pour les cinq — l'objet vit
    /// aussi longtemps que la slide.
    ///
    /// Le type est uniformisé en `Double?` : l'audio la porte en `Float?`, les
    /// quatre autres en `Double?`. La conversion vit ici, une fois.
    public var duration: Double? {
        switch self {
        case .text(let o):     return o.duration
        case .media(let o):    return o.duration
        case .sticker(let o):  return o.duration
        case .audio(let o):    return o.duration.map(Double.init)
        case .location(let o): return o.duration
        }
    }

    /// **Le plan de FOND**, que seuls un média et un audio peuvent occuper. Un
    /// texte, un sticker et un lieu sont toujours de premier plan — ce n'est pas
    /// une valeur par défaut, c'est le modèle qui ne leur donne pas le champ.
    public var isBackground: Bool {
        switch self {
        case .media(let o):    return o.isBackground
        case .audio(let o):    return o.isBackground == true
        case .text, .sticker, .location: return false
        }
    }
}

// MARK: - Les cinq tableaux, vus comme UNE scène

public extension StoryEffects {

    /// **Les objets de la scène, du FOND vers l'avant.**
    ///
    /// L'ordre est celui de l'empilement — c'est celui que le rendu applique, et
    /// le seul qui ait un sens produit. À `zIndex` égal, l'ordre des familles
    /// tranche : il est arbitraire mais STABLE, et une itération qui change
    /// d'ordre entre deux appels ferait clignoter tout ce qui la consomme.
    var sceneObjects: [MeeshySceneObject] {
        var tous: [MeeshySceneObject] = textObjects.map(MeeshySceneObject.text)
        tous += (mediaObjects ?? []).map(MeeshySceneObject.media)
        tous += (stickerObjects ?? []).map(MeeshySceneObject.sticker)
        tous += locationObjects.map(MeeshySceneObject.location)
        tous += (audioPlayerObjects ?? []).map(MeeshySceneObject.audio)
        return tous.enumerated()
            .sorted { ($0.element.zIndex, $0.offset) < ($1.element.zIndex, $1.offset) }
            .map(\.element)
    }

    /// **La question que 150 sites réécrivaient en cascade.**
    ///
    /// `nil` ⇒ l'id ne désigne plus rien — un objet supprimé pendant qu'une
    /// sélection le tenait encore. C'est un état NOMINAL, pas une erreur.
    func sceneObject(id: String) -> MeeshySceneObject? {
        if let o = textObjects.first(where: { $0.id == id }) { return .text(o) }
        if let o = mediaObjects?.first(where: { $0.id == id }) { return .media(o) }
        if let o = stickerObjects?.first(where: { $0.id == id }) { return .sticker(o) }
        if let o = locationObjects.first(where: { $0.id == id }) { return .location(o) }
        if let o = audioPlayerObjects?.first(where: { $0.id == id }) { return .audio(o) }
        return nil
    }
}

/// **Le projet de timeline voit les CINQ familles.**
///
/// Il n'en portait que quatre — sans `locationObjects` — et j'avais lu cette
/// absence comme une propriété : « une pastille de lieu n'a pas de piste ».
///
/// > Les deux absences se justifiaient l'une l'autre : le modèle n'avait pas de
/// > fenêtre parce que la timeline ne le portait pas, et la timeline ne le
/// > portait pas parce que le modèle n'avait pas de fenêtre. **Deux absences qui
/// > se soutiennent forment un cercle, et un cercle a l'air d'une cohérence.**
/// > Ce qui l'a brisé n'est pas une relecture — c'est une source EXTÉRIEURE au
/// > code.
///
/// Les tableaux sont NON-OPTIONNELS ici, là où `StoryEffects` en déclare trois
/// optionnels : une déclaration se lit dans SON bloc, jamais dans celui de sa
/// voisine.
public extension TimelineProject {

    var sceneObjects: [MeeshySceneObject] {
        var tous: [MeeshySceneObject] = textObjects.map(MeeshySceneObject.text)
        tous += mediaObjects.map(MeeshySceneObject.media)
        tous += stickerObjects.map(MeeshySceneObject.sticker)
        tous += locationObjects.map(MeeshySceneObject.location)
        tous += audioPlayerObjects.map(MeeshySceneObject.audio)
        return tous.enumerated()
            .sorted { ($0.element.zIndex, $0.offset) < ($1.element.zIndex, $1.offset) }
            .map(\.element)
    }

    func sceneObject(id: String) -> MeeshySceneObject? {
        if let o = textObjects.first(where: { $0.id == id }) { return .text(o) }
        if let o = mediaObjects.first(where: { $0.id == id }) { return .media(o) }
        if let o = stickerObjects.first(where: { $0.id == id }) { return .sticker(o) }
        if let o = locationObjects.first(where: { $0.id == id }) { return .location(o) }
        if let o = audioPlayerObjects.first(where: { $0.id == id }) { return .audio(o) }
        return nil
    }
}

public extension StorySlide {

    /// La scène de cette slide. Projection de `effects` — la slide ne porte pas
    /// ses objets, elle porte les effets qui les portent.
    var sceneObjects: [MeeshySceneObject] { effects.sceneObjects }

    func sceneObject(id: String) -> MeeshySceneObject? { effects.sceneObject(id: id) }
}
