import Foundation
import CoreGraphics

/// **La fenêtre de source d'un média posé sur une scène — des BORNES, jamais un
/// fichier cuit.**
///
/// La doctrine de publication d'une story interdit de stocker un composite : le
/// serveur reçoit le média d'ORIGINE et les objets qui le décrivent. Rogner ne
/// peut donc pas ré-encoder — ce que font pourtant les trois éditeurs existants
/// du dépôt (`MeeshyVideoEditorView`, `MeeshyAudioEditorView` et le moteur
/// `AudioEditEngine`, dont le `onConfirm` rend des bornes factices `(0, durée)`
/// parce que l'édition est déjà dans le fichier livré).
///
/// Ces bornes voyagent sur `StoryMediaObject.sourceStart` / `.sourceEnd` et
/// leurs jumelles de `StoryAudioPlayerObject`, qui existaient déjà, écrites et
/// relues par la migration de canvas — mais que personne ne CONSOMMAIT.
public struct MediaTrimBounds: Equatable, Sendable {

    /// Seconde du fichier source où la lecture commence.
    public let start: Double
    /// Seconde du fichier source où elle s'arrête.
    public let end: Double

    public init(start: Double, end: Double) {
        self.start = start
        self.end = end
    }

    public var duration: Double { max(0, end - start) }

    /// **`nil` ⇒ ne rien écrire.** Une fenêtre qui couvre le fichier entier
    /// n'est pas une fenêtre : la persister remplirait `sourceStart`/`sourceEnd`
    /// sur tout média jamais rogné, et rendrait indiscernable « l'auteur a
    /// choisi tout le clip » de « l'auteur n'a rien choisi ». L'absence de
    /// bornes est la valeur qui dit « le fichier tel quel ».
    public func persisted(sourceDuration: Double) -> MediaTrimBounds? {
        let couvreTout = start <= Self.epsilon
            && end >= sourceDuration - Self.epsilon
        return couvreTout ? nil : self
    }

    private static let epsilon = 0.01
}

/// **La règle de rognage, pure et sans vue.**
///
/// Elle vit hors de tout `View` parce qu'elle est ce qui doit être éprouvé :
/// une poignée qui traverse l'autre, une fenêtre qui sort du fichier, un clip
/// réduit à zéro sont trois défauts qui ne se voient pas sur une capture et se
/// prouvent en une ligne ici.
public nonisolated enum MediaTrimRule {

    /// La fenêtre la plus courte qu'on laisse produire. En dessous, la poignée
    /// pousse l'autre plutôt que de la traverser — jamais d'échange silencieux
    /// des deux bornes, qui donnerait un clip qui se lit à l'envers.
    public static let minimumDuration: Double = 0.4

    /// Toute la source, du premier au dernier instant.
    public static func full(sourceDuration: Double) -> MediaTrimBounds {
        MediaTrimBounds(start: 0, end: max(0, sourceDuration))
    }

    /// **Ce que les bornes persistées VALENT à la lecture.** `nil` (jamais
    /// rogné) et des bornes aberrantes (source ré-encodée plus courte, fichier
    /// remplacé) rendent la même chose : la source entière. Un lecteur ne doit
    /// jamais se retrouver avec une fenêtre vide parce qu'une donnée a vieilli.
    public static func resolved(start: Double?,
                                end: Double?,
                                sourceDuration: Double) -> MediaTrimBounds {
        let entier = full(sourceDuration: sourceDuration)
        guard sourceDuration > 0 else { return entier }
        let debut = max(0, min(start ?? 0, sourceDuration))
        let fin = min(sourceDuration, max(end ?? sourceDuration, 0))
        guard fin - debut >= minimumDuration else { return entier }
        return MediaTrimBounds(start: debut, end: fin)
    }

    /// Déplacer la poignée de GAUCHE de `delta` secondes.
    ///
    /// Elle ne franchit jamais la droite : arrivée à `minimumDuration` de sa
    /// voisine, elle s'arrête. La borne opposée n'est PAS déplacée — pousser
    /// l'autre poignée en tirant sur celle-ci changerait la durée sans que le
    /// doigt l'ait demandé.
    public static func movingStart(_ bounds: MediaTrimBounds,
                                   by delta: Double,
                                   sourceDuration: Double) -> MediaTrimBounds {
        let plafond = bounds.end - minimumDuration
        let debut = min(max(0, bounds.start + delta), max(0, plafond))
        return MediaTrimBounds(start: debut, end: bounds.end)
    }

    /// Déplacer la poignée de DROITE de `delta` secondes. Symétrique.
    public static func movingEnd(_ bounds: MediaTrimBounds,
                                 by delta: Double,
                                 sourceDuration: Double) -> MediaTrimBounds {
        let plancher = bounds.start + minimumDuration
        let fin = max(min(sourceDuration, bounds.end + delta),
                      min(plancher, sourceDuration))
        return MediaTrimBounds(start: bounds.start, end: fin)
    }

    /// Convertit une translation en POINTS, telle que la rend `ClipTrimHandles`,
    /// en secondes de source. La largeur rendue représente toujours la source
    /// ENTIÈRE — c'est ce qui laisse voir ce qu'on retire, et non seulement ce
    /// qu'on garde.
    public static func seconds(forHandleDelta points: CGFloat,
                               stripWidth: CGFloat,
                               sourceDuration: Double) -> Double {
        guard stripWidth > 0 else { return 0 }
        return Double(points / stripWidth) * sourceDuration
    }
}

// MARK: - Ce que rogner ÉCRIT

public extension MediaTrimRule {

    /// **Rogner écrit TROIS champs, jamais deux.**
    ///
    /// `sourceStart` et `sourceEnd` disent où lire DANS LE FICHIER ; `duration`
    /// dit combien de temps l'objet occupe la slide. Les deux premiers sans le
    /// troisième laisseraient `StoryEffects.contentDerivedDuration` compter
    /// l'ancienne longueur, et `StorySlide.computedTotalDuration()` avec elle :
    /// la story attendrait dans le vide après la fin du clip rogné, sans que
    /// rien n'ait l'air faux.
    ///
    /// Les rendre ENSEMBLE, depuis un seul site, est ce qui interdit qu'un
    /// appelant en oublie un.
    static func fields(for bounds: MediaTrimBounds,
                       sourceDuration: Double) -> (start: Double?, end: Double?, duration: Double) {
        guard let fenetre = bounds.persisted(sourceDuration: sourceDuration) else {
            // Jamais rogné : aucune borne n'est écrite, et la durée est celle du
            // fichier. C'est ce qui garde `sourceStart`/`sourceEnd` porteurs de
            // sens — leur présence DÉCLARE un rognage.
            return (nil, nil, max(0, sourceDuration))
        }
        return (fenetre.start, fenetre.end, fenetre.duration)
    }
}

// MARK: - Ce que rogner FAIT LIRE

public extension StoryMediaObject {

    /// La fenêtre de source EFFECTIVE de ce média, bornes vieillies comprises.
    func trimBounds(sourceDuration: Double) -> MediaTrimBounds {
        MediaTrimRule.resolved(start: sourceStart, end: sourceEnd, sourceDuration: sourceDuration)
    }
}

public extension StoryAudioPlayerObject {

    /// Jumelle de `StoryMediaObject.trimBounds` — même règle, mêmes bornes
    /// vieillies tolérées. Deux surcharges plutôt qu'un protocole : les deux
    /// types n'ont en commun que ces deux champs, et un protocole pour deux
    /// propriétés coûterait plus qu'il ne dirait.
    func trimBounds(sourceDuration: Double) -> MediaTrimBounds {
        MediaTrimRule.resolved(start: sourceStart, end: sourceEnd, sourceDuration: sourceDuration)
    }
}
