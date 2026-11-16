import Foundation

/// **LE CADRAGE D'UNE PHOTO DANS SON CADRE** (#18805) — LOI PURE.
///
/// Une photo qui ne tient pas dans son cadre y est recadrée (`cover`). Le
/// cadrage dit QUELLE partie on en montre : un ZOOM (1 = la photo couvre
/// juste le cadre, borné par `zoomRange`) et un POINT FOCAL, le point de la
/// photo (normalisé entre 0 et 1) posé au milieu du cadre.
///
/// La loi garantit qu'une photo cadrée COUVRE toujours son cadre : aucun vide
/// n'apparaît, quel que soit le cadrage demandé — le point focal se borne à ce
/// que le zoom permet d'atteindre. Le cadrage par défaut (`centered`) rend
/// exactement le recadrage centré de `MessageCardMediaFit.cover`.
public struct MessageCardFraming: Equatable, Hashable, Sendable {
    public static let zoomRange: ClosedRange<Double> = 1...4
    public static let centered = MessageCardFraming()

    public let zoom: Double
    public let focusX: Double
    public let focusY: Double

    public init(zoom: Double = 1, focusX: Double = 0.5, focusY: Double = 0.5) {
        self.zoom = zoom.isFinite ? min(Self.zoomRange.upperBound, max(Self.zoomRange.lowerBound, zoom)) : 1
        self.focusX = Self.unit(focusX)
        self.focusY = Self.unit(focusY)
    }

    public var isCentered: Bool { self == .centered }

    /// Ce qui distingue ce cadrage dans une clé de peinture.
    public var key: String { "\(zoom):\(focusX):\(focusY)" }

    /// Un geste appliqué : le cadrage obtenu, et s'il a BUTÉ sur une borne
    /// (bord de la photo, zoom minimal ou maximal) — l'appelant le fait sentir.
    public struct Move: Equatable, Sendable {
        public let framing: MessageCardFraming
        public let hitEdge: Bool

        public init(framing: MessageCardFraming, hitEdge: Bool) {
            self.framing = framing
            self.hitEdge = hitEdge
        }
    }

    /// Où poser une image de `pixelWidth × pixelHeight` pour qu'elle couvre `frame` sous ce cadrage.
    public func drawn(pixelWidth: Double, pixelHeight: Double, in frame: MessageCardFrame) -> MessageCardFrame {
        guard pixelWidth > 0, pixelHeight > 0, frame.width > 0, frame.height > 0 else { return frame }
        let size = Self.size(pixelWidth: pixelWidth, pixelHeight: pixelHeight, in: frame, zoom: zoom)
        let x = frame.x + (frame.width - size.width) / 2 + (0.5 - focusX) * size.width
        let y = frame.y + (frame.height - size.height) / 2 + (0.5 - focusY) * size.height
        return MessageCardFrame(
            x: min(frame.x, max(frame.x + frame.width - size.width, x)),
            y: min(frame.y, max(frame.y + frame.height - size.height, y)),
            width: size.width, height: size.height
        )
    }

    /// Le doigt a glissé de (`dx`, `dy`) points de carte : la photo le suit, jusqu'à son bord.
    public func panned(dx: Double, dy: Double, pixelWidth: Double, pixelHeight: Double, in frame: MessageCardFrame) -> Move {
        guard pixelWidth > 0, pixelHeight > 0, frame.width > 0, frame.height > 0 else { return Move(framing: self, hitEdge: false) }
        let size = Self.size(pixelWidth: pixelWidth, pixelHeight: pixelHeight, in: frame, zoom: zoom)
        let wantedX = Self.reachable(focusX, extent: size.width, window: frame.width) - (dx.isFinite ? dx : 0) / size.width
        let wantedY = Self.reachable(focusY, extent: size.height, window: frame.height) - (dy.isFinite ? dy : 0) / size.height
        let x = Self.reachable(wantedX, extent: size.width, window: frame.width)
        let y = Self.reachable(wantedY, extent: size.height, window: frame.height)
        let hit = abs(x - wantedX) > 1e-9 || abs(y - wantedY) > 1e-9
        return Move(framing: MessageCardFraming(zoom: zoom, focusX: x, focusY: y), hitEdge: hit)
    }

    /// Les doigts ont pincé d'un facteur `factor` autour d'un point du cadre
    /// (`anchorX`, `anchorY`, normalisés ; le milieu par défaut) : ce point de
    /// la photo reste sous les doigts, autant que la couverture le permet.
    public func zoomed(by factor: Double, anchorX: Double = 0.5, anchorY: Double = 0.5,
                       pixelWidth: Double, pixelHeight: Double, in frame: MessageCardFrame) -> Move {
        let wanted = zoom * (factor.isFinite && factor > 0 ? factor : 1)
        let next = MessageCardFraming(zoom: wanted, focusX: focusX, focusY: focusY)
        let hit = abs(next.zoom - wanted) > 1e-9
        guard pixelWidth > 0, pixelHeight > 0, frame.width > 0, frame.height > 0 else { return Move(framing: next, hitEdge: hit) }
        let before = Self.size(pixelWidth: pixelWidth, pixelHeight: pixelHeight, in: frame, zoom: zoom)
        let after = Self.size(pixelWidth: pixelWidth, pixelHeight: pixelHeight, in: frame, zoom: next.zoom)
        let ax = (Self.unit(anchorX) - 0.5) * frame.width
        let ay = (Self.unit(anchorY) - 0.5) * frame.height
        let startX = Self.reachable(focusX, extent: before.width, window: frame.width)
        let startY = Self.reachable(focusY, extent: before.height, window: frame.height)
        let x = startX + ax / before.width - ax / after.width
        let y = startY + ay / before.height - ay / after.height
        return Move(framing: MessageCardFraming(
            zoom: next.zoom,
            focusX: Self.reachable(x, extent: after.width, window: frame.width),
            focusY: Self.reachable(y, extent: after.height, window: frame.height)
        ), hitEdge: hit)
    }

    /// La taille peinte : celle qui couvre juste le cadre, multipliée par le zoom.
    private static func size(pixelWidth: Double, pixelHeight: Double, in frame: MessageCardFrame, zoom: Double) -> (width: Double, height: Double) {
        let scale = max(frame.width / pixelWidth, frame.height / pixelHeight) * zoom
        return (pixelWidth * scale, pixelHeight * scale)
    }

    /// Le point focal borné à ce que la couverture laisse atteindre sur un axe :
    /// la moitié du cadre doit tenir de chaque côté du point.
    private static func reachable(_ focus: Double, extent: Double, window: Double) -> Double {
        let half = window / (2 * extent)
        guard half < 0.5 else { return 0.5 }
        return min(1 - half, max(half, focus))
    }

    private static func unit(_ value: Double) -> Double {
        value.isFinite ? min(1, max(0, value)) : 0.5
    }
}

/// Un média que la carte peint RECADRÉ, et donc qu'on peut cadrer (#18805) :
/// son identifiant, sa nature, et son cadre en pixels de la carte.
public struct MessageCardFramedMedia: Equatable, Sendable {
    public let mediaID: String
    public let kind: MessageCardMediaKind
    public let frame: MessageCardFrame
    /// L'arrondi des coins du cadre, en pixels de la carte.
    public let radius: Double
    /// Le média couvre la carte entière, sous le texte : un fond.
    public let isBackdrop: Bool

    public init(mediaID: String, kind: MessageCardMediaKind, frame: MessageCardFrame, radius: Double, isBackdrop: Bool) {
        self.mediaID = mediaID
        self.kind = kind
        self.frame = frame
        self.radius = radius
        self.isBackdrop = isBackdrop
    }
}

public extension MessageCardLayout {
    /// Les médias recadrés de la carte, le fond d'abord puis de haut en bas —
    /// jamais un sticker, qui s'inscrit en entier et ne se recadre pas.
    var framedMedia: [MessageCardFramedMedia] {
        let backdrop = backdrop.compactMap { Self.framed($0, isBackdrop: true) }
        return backdrop + ops.compactMap { Self.framed($0, isBackdrop: false) }
    }

    private static func framed(_ op: MessageCardOp, isBackdrop: Bool) -> MessageCardFramedMedia? {
        guard case let .media(media) = op, media.fit == .cover, media.kind.isVisual, media.width > 0, media.height > 0 else { return nil }
        return MessageCardFramedMedia(
            mediaID: media.mediaID, kind: media.kind,
            frame: MessageCardFrame(x: media.x, y: media.y, width: media.width, height: media.height),
            radius: media.radius,
            isBackdrop: isBackdrop
        )
    }
}
