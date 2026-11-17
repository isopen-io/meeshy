import Foundation

/// **LA VITESSE D'UNE CARTE QUI DÉFILE** (#18671) — de ×0,5 à ×3, comme une
/// lecture qu'on ralentit ou qu'on accélère. ×1 est la lecture posée.
public enum MessageCardScrollSpeed: Double, CaseIterable, Sendable {
    case x0_5 = 0.5
    case x0_75 = 0.75
    case x1 = 1
    case x1_25 = 1.25
    case x1_5 = 1.5
    case x1_75 = 1.75
    case x2 = 2
    case x2_5 = 2.5
    case x3 = 3

    public static let standard = MessageCardScrollSpeed.x1

    public var factor: Double { rawValue }

    /// « ×0,75 » en français, « ×0.75 » en anglais : la décimale de la langue.
    public func label(locale: Locale = .current) -> String {
        let formatter = NumberFormatter()
        formatter.locale = locale
        formatter.numberStyle = .decimal
        formatter.minimumFractionDigits = 0
        formatter.maximumFractionDigits = 2
        return "×" + (formatter.string(from: NSNumber(value: rawValue)) ?? String(rawValue))
    }
}

/// **LE PLAN D'UNE VIDÉO QUI DÉFILE** (#18671) : la carte se montre d'abord
/// immobile, le temps de la reconnaître, puis glisse à vitesse constante sous
/// la fenêtre du format jusqu'à sa dernière ligne, qui reste un instant.
public struct MessageCardScrollPlan: Equatable, Sendable {
    /// La vitesse de lecture posée (×1), en pixels de carte par seconde : une
    /// ligne de réponse (88 px) toutes les 1,6 s environ.
    public static let pixelsPerSecond: Double = 54
    public static let leadIn: Double = 1.5
    public static let leadOut: Double = 2
    public static let fps: Double = 30
    /// La plus longue vidéo qu'on produit : au-delà, le défilement accélère pour tenir.
    public static let maxDuration: Double = 180
    /// Un GIF qui défile (#18806) garde le grain du GIF animé (`MessageCardMotionPlan`) :
    /// 10 images par seconde, à demi-résolution, et 30 s au plus — au-delà, le
    /// défilement accélère pour tenir, sans quoi le fichier pèserait des dizaines de Mo.
    public static let gifFPS: Double = 10
    public static let gifScale: Double = 0.5
    public static let gifMaxDuration: Double = 30

    public let output: MessageCardOutput
    public let travel: Double
    public let scrollDuration: Double
    public let duration: Double
    public let frameCount: Int

    /// Les images par seconde de CE plan : 30 en vidéo, 10 en GIF.
    public var framesPerSecond: Double { output == .gif ? Self.gifFPS : Self.fps }
    /// L'échelle des pixels de CE plan : pleine en vidéo, demie en GIF.
    public var pixelScale: Double { output == .gif ? Self.gifScale : 1 }

    /// `nil` quand la carte tient dans son format : il n'y a rien à faire défiler,
    /// ou quand la sortie est une image fixe, qui ne défile pas.
    public static func of(
        contentHeight: Double,
        viewportHeight: Double,
        speed: MessageCardScrollSpeed,
        output: MessageCardOutput = .video
    ) -> MessageCardScrollPlan? {
        let travel = contentHeight - viewportHeight
        guard output != .image, travel.isFinite, travel > 1, viewportHeight > 0 else { return nil }
        let longest = output == .gif ? gifMaxDuration : maxDuration
        let room = longest - leadIn - leadOut
        let scrollDuration = min(room, travel / (pixelsPerSecond * speed.factor))
        let duration = leadIn + scrollDuration + leadOut
        let fps = output == .gif ? gifFPS : fps
        return MessageCardScrollPlan(
            output: output,
            travel: travel,
            scrollDuration: scrollDuration,
            duration: duration,
            frameCount: max(1, Int((duration * fps).rounded(.up)))
        )
    }

    /// Le décalage de la carte, en pixels, à l'instant `time`.
    public func offset(at time: Double) -> Double {
        guard scrollDuration > 0 else { return 0 }
        let progress = min(1, max(0, (time - Self.leadIn) / scrollDuration))
        return travel * progress
    }

    public func time(ofFrame index: Int) -> Double { Double(index) / framesPerSecond }
}

/// **LE FOND CHOISI D'UNE CARTE** (#18672) — une photo ou une vidéo de la
/// photothèque, peinte sous un voile de la couleur de la palette : le texte
/// reste lisible, la carte garde sa teinte. Le filigrane passe au-dessus.
public struct MessageCardBackdrop: Equatable, Sendable {
    /// L'identifiant sous lequel l'application remet ses pixels (`MessageCardPictures`).
    public static let mediaID = "meeshy.backdrop"
    public static let veilRange: ClosedRange<Double> = 0...0.9
    public static let defaultVeil: Double = 0.55

    public let media: MessageCardMedia
    /// L'opacité du voile, de 0 (le fond tel quel) à 0,9.
    public let veil: Double

    public init(media: MessageCardMedia, veil: Double = MessageCardBackdrop.defaultVeil) {
        self.media = media
        let bounded = veil.isFinite ? veil : Self.defaultVeil
        self.veil = min(Self.veilRange.upperBound, max(Self.veilRange.lowerBound, bounded))
    }
}

public extension MessageCardOutput {
    /// L'offre, avec ce qui peut faire BOUGER une carte en plus de ses médias :
    /// une vidéo choisie en fond s'anime comme une vidéo jointe, et un texte qui
    /// dépasse son format se lit en GIF ou en vidéo qui défile (#18671, #18672,
    /// #18806) — sauf avec un son, qui n'a de sens qu'en vidéo avec sa piste.
    static func offered(for kinds: [MessageCardMediaKind], backdrop: MessageCardMediaKind?, scrolls: Bool) -> [MessageCardOutput] {
        let moving = kinds + (backdrop == .video ? [.video] : [])
        let offer = offered(for: moving)
        guard scrolls else { return offer }
        guard !moving.contains(.audio) else { return offer }
        return [.image, .gif, .video]
    }

    /// La sortie de départ : une carte dont le texte dépasse son format ne
    /// s'ouvre pas sur une image qui le tronquerait — elle part en vidéo qui
    /// défile (#18806). Un choix déjà fait par l'utilisateur n'est jamais repris.
    static func preferred(current: MessageCardOutput, scrolls: Bool, offered: [MessageCardOutput], userChose: Bool) -> MessageCardOutput {
        guard !userChose, scrolls, current == .image, offered.contains(.video) else { return current }
        return .video
    }
}

public extension MessageCardLayout {
    /// Ce qui touche la bande `[top, bottom]` de la carte — une image de la
    /// vidéo qui défile ne peint que ce que sa fenêtre montre (#18671). Un
    /// groupe incliné se garde toujours : sa rotation déplace ses enfants.
    func ops(between top: Double, and bottom: Double) -> [MessageCardOp] {
        ops.filter { op in
            guard let span = op.verticalSpan else { return true }
            return span.upperBound >= top && span.lowerBound <= bottom
        }
    }
}

extension MessageCardOp {
    /// La hauteur occupée, en pixels de carte — `nil` : on ne la connaît pas sans peindre.
    var verticalSpan: ClosedRange<Double>? {
        switch self {
        case let .text(text) where text.rotation == 0: return (text.y - text.font.size * 1.3)...(text.y + text.font.size * 0.5)
        case let .bar(rect), let .panel(rect): return rect.y...(rect.y + max(0, rect.height))
        case let .separator(line): return (line.y - line.radius - line.lineWidth)...(line.y + line.radius + line.lineWidth)
        case let .dot(dot): return (dot.y - dot.radius)...(dot.y + dot.radius)
        case let .media(media): return media.y...(media.y + max(0, media.height))
        case let .glyph(glyph): return (glyph.y - glyph.size)...(glyph.y + glyph.size)
        case .text, .group: return nil
        }
    }
}
