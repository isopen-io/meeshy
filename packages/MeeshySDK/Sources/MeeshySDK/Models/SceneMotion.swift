import Foundation

/// **Ce qui distingue une scène qui BOUGE d'une scène qui ne bouge pas**
/// (directive porteur 2026-09-06).
///
/// > « Une scène cinématique (qui n'est pas statique) doit être considérée
/// > comme une vidéo ! Le bouton stop et play permet d'arrêter tout ou de
/// > poursuivre tout. »
///
/// ## Pourquoi la question doit se poser une fois, et ailleurs que dans une vue
///
/// Trois surfaces en dépendaient sans jamais l'écrire :
///
/// | surface | ce qu'elle faisait sans la règle |
/// |---|---|
/// | carte du fil | concourait à l'élection d'autoplay pour TOUTE scène — un canvas de texte occupait l'unique place jouante du fil et TAISAIT la vidéo voisine |
/// | plein écran | levait `isPlaying` à l'apparition, sans savoir s'il y avait quoi que ce soit à jouer |
/// | mosaïque | peignait la même tuile pour une photo et pour un clip |
///
/// > **Un contrôle de lecture posé sur une image fixe est un contrôle inerte**
/// > (loi 4). Et une scène fixe qui remporte l'élection d'autoplay est pire
/// > qu'inerte : elle prive de lecture la scène qui en avait besoin.
///
/// ## Le mouvement, jamais la durée
///
/// `timelineDuration` mesure un temps de SÉJOUR — le composer le stampe sur
/// des slides parfaitement fixes. Le retenir comme critère rendrait
/// cinématique à peu près tout ce qui sort du composer, et la règle ne dirait
/// plus rien.
public nonisolated enum SceneMotion {

    /// **Cette scène bouge-t-elle ?**
    ///
    /// Cinq témoins, et ils sont indépendants : une vidéo, un son, une
    /// décoration animée, un objet qui apparaît ou disparaît dans le temps,
    /// une transition.
    public static func isCinematic(_ scene: SceneV3) -> Bool {
        if scene.opening != nil || scene.closing != nil { return true }
        if scene.clipTransitions?.isEmpty == false { return true }
        return scene.objects.contains(where: objectMoves)
    }

    /// **Ce document porte-t-il du mouvement ?** — une scène qui bouge, ou un
    /// son de fond, qui appartient au document et non à une scène.
    public static func isCinematic(_ document: CanvasV3) -> Bool {
        if document.sound != nil { return true }
        return document.scenes.contains(where: isCinematic)
    }

    /// **Ce document a-t-il quelque chose à FAIRE ENTENDRE ?**
    ///
    /// Distincte de `isCinematic`, et la distinction porte : une vidéo MUETTE
    /// bouge sans rien faire entendre ; un son de fond s'entend sans rien
    /// montrer. Le fil joue ses scènes MUETTES par construction
    /// (`ScenePlayerConfig.locksMute` sur le mode `.card`, #4084) — l'indicateur
    /// « haut-parleur barré » que le porteur demande dit donc à l'utilisateur
    /// *pourquoi* il n'entend rien, et il ne doit paraître que là où il y a
    /// effectivement quelque chose à couper.
    ///
    /// > Répondre à « y a-t-il du son ? » avec « est-ce que ça bouge ? »
    /// > poserait un haut-parleur barré sur une photo animée sans piste : un
    /// > indicateur qui ment sur l'état qu'il annonce.
    public static func isAudible(_ document: CanvasV3) -> Bool {
        if document.sound != nil { return true }
        return document.scenes.contains { scene in
            scene.objects.contains(where: objectSounds)
        }
    }

    /// Cet objet porte-t-il une piste sonore ?
    ///
    /// Une vidéo compte SAUF si elle se déclare muette — la migration écrit
    /// `payload["muted"]` depuis `StoryMediaObject.isMuted`, et une vidéo sans
    /// la clé porte sa piste.
    public static func objectSounds(_ object: ObjectV3) -> Bool {
        if object.kind == .audio { return true }
        guard isVideo(object) else { return false }
        if case .bool(true)? = object.payload["muted"] { return false }
        return true
    }

    /// **Cet objet bouge-t-il ?**
    ///
    /// Exposé parce qu'une surface qui peint UNE tuile a besoin de savoir si
    /// c'est un clip qu'elle montre — pas seulement si la scène bouge quelque
    /// part.
    public static func objectMoves(_ object: ObjectV3) -> Bool {
        if object.kind == .audio { return true }
        if isVideo(object) { return true }
        if object.kind == .sticker, case .string(let animation)? = object.payload["animation"],
           !animation.isEmpty { return true }
        if hasTimeWindow(object) { return true }
        return false
    }

    /// **Un média est une VIDÉO quand il le déclare.** Le payload porte
    /// `mediaType`, écrit par la migration comme par le composer ; le préfixe
    /// couvre autant `"video"` que `"video/mp4"`.
    public static func isVideo(_ object: ObjectV3) -> Bool {
        guard object.kind == .media,
              case .string(let type)? = object.payload["mediaType"] else { return false }
        return type.lowercased().hasPrefix("video")
    }

    /// Un objet qui n'est pas là du début à la fin ANIME la scène — c'est la
    /// négation exacte de `RenderableItem.isStatic`, côté rendu.
    ///
    /// Les deux écritures comptent : `timing` (où la migration range `start`)
    /// **et** le payload (`fadeIn`, `fadeOut`, `duration`), où elle range les
    /// autres. N'en lire qu'une rendrait statique la moitié du corpus.
    ///
    /// > **`duration` ne dit pas la même chose selon le porteur.** Sur un
    /// > MÉDIA, c'est la longueur du clip — une image affichée dix secondes en
    /// > porte une sans bouger d'un pixel. Sur un texte ou un sticker, c'est
    /// > une fenêtre d'apparition, donc une animation. La lire sans distinguer
    /// > rendrait cinématique toute publication photo.
    private static func hasTimeWindow(_ object: ObjectV3) -> Bool {
        if let timing = object.timing {
            if timing.start != nil || timing.end != nil { return true }
            if timing.keyframes?.isEmpty == false { return true }
        }
        var cles = ["fadeIn", "fadeOut"]
        if object.kind != .media { cles.append("duration") }
        return cles.contains { key in
            if case .number(let v)? = object.payload[key] { return v > 0 }
            return false
        }
    }
}
