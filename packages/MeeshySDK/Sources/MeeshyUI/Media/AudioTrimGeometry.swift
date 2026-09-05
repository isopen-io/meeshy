import CoreGraphics
import Foundation

/// **La géométrie du rognage audio — pure, sans vue, sans lecteur** (#4657).
///
/// Elle répond à trois questions, et à elles seules : où tombe un instant sur
/// la bande, quel instant tombe sous une abscisse, et quelles bornes un
/// déplacement a le droit de produire.
///
/// ## Pourquoi elle est séparée de la vue
///
/// Le rognage est fait de gestes CONCURRENTS — un doigt qui fait défiler, deux
/// qui pincent, un qui traîne une poignée — et chacun modifie deux valeurs
/// (`offset`, `zoom`, `range`) que les autres relisent. Écrire ces conversions
/// dans le corps de la vue les rendrait ré-écrites à chaque geste, donc
/// divergentes : c'est le motif que ce dépôt paie en boucle.
///
/// Ici tout est arithmétique et se prouve sans monter une seule vue.
///
/// ## Le repère
///
/// - `width` est la largeur VISIBLE de la bande, jamais celle du contenu ;
/// - `zoom` vaut 1 quand la durée entière tient dans `width`. Au-delà, le
///   contenu déborde et `offset` dit de combien il est décalé vers la gauche ;
/// - `offset` est donc toujours ≥ 0 et ≤ `contentWidth - width`. **C'est cette
///   borne qui interdit le débordement hors viewport** que la directive exige :
///   elle n'est pas dessinée, elle est calculée.
/// `nonisolated` sur le TYPE : `MeeshyUI` compile sous
/// `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`, si bien qu'une arithmétique
/// pure deviendrait isolée sans le dire — et donc inappelable depuis un témoin,
/// qui, lui, compile en `nonisolated`. Même motif que `ShareSession` et
/// `ShareSender` (cf. `apps/ios/CLAUDE.md` § App Extensions).
public nonisolated struct AudioTrimGeometry: Equatable, Sendable {

    /// Durée totale de la piste, en secondes. Jamais nulle : une bande sans
    /// durée n'a pas de repère, et diviser par elle est ce qui produit des
    /// `NaN` qui traversent SwiftUI en silence.
    public let duration: TimeInterval
    /// Largeur VISIBLE de la bande.
    public let width: CGFloat
    /// 1 ⇒ la durée entière tient dans `width`.
    public let zoom: CGFloat

    /// Le segment minimal qu'un rognage peut laisser — sous cette durée, la
    /// piste n'est plus audible comme un son mais comme un clic.
    public static let minimumSegment: TimeInterval = 0.25

    /// Bornes du pincement. Au-delà de 40×, un point d'écran vaut moins d'une
    /// milliseconde sur une piste d'une minute : le gain de précision devient
    /// illusoire et le défilement, ingérable.
    public static let zoomRange: ClosedRange<CGFloat> = 1...40

    public init(duration: TimeInterval, width: CGFloat, zoom: CGFloat) {
        self.duration = max(0.001, duration)
        self.width = max(1, width)
        self.zoom = min(max(zoom, Self.zoomRange.lowerBound), Self.zoomRange.upperBound)
    }

    /// Largeur du contenu déroulé.
    public var contentWidth: CGFloat { width * zoom }

    /// Le décalage maximal admissible — au-delà, le contenu laisserait du vide
    /// à droite.
    public var maximumOffset: CGFloat { max(0, contentWidth - width) }

    /// Points par seconde à ce niveau de zoom. C'est LUI qui rend le défilement
    /// « visuellement plus ou moins rapide selon le zoom » : le doigt parcourt
    /// toujours les mêmes points, ils valent simplement moins de temps.
    public var pointsPerSecond: CGFloat { contentWidth / CGFloat(duration) }

    /// L'abscisse VISIBLE d'un instant, pour un décalage donné. Peut sortir de
    /// `0...width` — c'est à l'appelant de décider s'il dessine ou non ce qui
    /// tombe dehors.
    public func x(for time: TimeInterval, offset: CGFloat) -> CGFloat {
        CGFloat(min(max(time, 0), duration)) * pointsPerSecond - offset
    }

    /// L'instant sous une abscisse visible.
    public func time(atX x: CGFloat, offset: CGFloat) -> TimeInterval {
        let brut = TimeInterval((x + offset) / pointsPerSecond)
        return min(max(brut, 0), duration)
    }

    /// Le décalage ramené dans ses bornes.
    public func clampedOffset(_ offset: CGFloat) -> CGFloat {
        min(max(offset, 0), maximumOffset)
    }

    /// Le décalage qui place `time` au CENTRE de la bande — la position du
    /// curseur de précision, et celle que suit la lecture.
    public func offsetCentering(_ time: TimeInterval) -> CGFloat {
        clampedOffset(CGFloat(min(max(time, 0), duration)) * pointsPerSecond - width / 2)
    }

    /// Un zoom appliqué en gardant l'instant du CENTRE sous le centre.
    ///
    /// Sans cette conservation, pincer ferait fuir le contenu : l'auteur perd
    /// l'endroit qu'il regardait au moment même où il demande à le voir de plus
    /// près.
    public func zoomed(to nouveauZoom: CGFloat, offset: CGFloat) -> (geometry: AudioTrimGeometry, offset: CGFloat) {
        let instantCentre = time(atX: width / 2, offset: offset)
        let neuve = AudioTrimGeometry(duration: duration, width: width, zoom: nouveauZoom)
        return (neuve, neuve.offsetCentering(instantCentre))
    }

    // MARK: - Les bornes du segment

    /// Le début rogné, déplacé — jamais au-delà de la fin moins le segment
    /// minimal, jamais avant zéro.
    public func movedStart(to time: TimeInterval, end: TimeInterval) -> TimeInterval {
        min(max(0, time), max(0, end - Self.minimumSegment))
    }

    /// La fin rognée, déplacée — jamais avant le début plus le segment minimal,
    /// jamais au-delà de la durée.
    public func movedEnd(to time: TimeInterval, start: TimeInterval) -> TimeInterval {
        max(min(duration, time), min(duration, start + Self.minimumSegment))
    }

    /// Un intervalle ramené dans la piste, dans le bon ordre, et jamais plus
    /// court que le minimum.
    ///
    /// Sert au chargement — une piste plus courte que `minimumSegment` existe
    /// (un bip d'un dixième de seconde), et lui imposer le minimum rendrait un
    /// intervalle qui déborde. La durée entière est alors le seul segment
    /// possible.
    public func clampedRange(_ range: ClosedRange<TimeInterval>) -> ClosedRange<TimeInterval> {
        guard duration > Self.minimumSegment else { return 0...duration }
        let debut = min(max(0, range.lowerBound), duration - Self.minimumSegment)
        let fin = max(min(duration, range.upperBound), debut + Self.minimumSegment)
        return debut...fin
    }
}
