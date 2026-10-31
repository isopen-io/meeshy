import CoreMedia
import QuartzCore
import UIKit
import MeeshySDK

/// **Une pastille de son ENFOUIE, vue comme un objet de la scène** (#13901).
///
/// Une pastille qu'un autre objet recouvre (`SceneAudioStageRule.isBuried`) se
/// peint dans l'arbre de calques, à son rang, comme un sticker : c'est ce qui
/// la fait passer SOUS le texte ou le sticker posé au-dessus d'elle, sur le
/// lecteur, la carte du fil, le composeur, la couverture et l'export — le même
/// ordre qu'Android (`StorySceneStack`). Les autres pastilles restent dans la
/// surcouche, au-dessus de tout.
public struct StoryAudioChipItem: RenderableItem {
    public let audio: StoryAudioPlayerObject

    public init(audio: StoryAudioPlayerObject) {
        self.audio = audio
    }

    public var id: String { audio.id }
    public var x: Double { Double(audio.x) }
    public var y: Double { Double(audio.y) }
    public var scale: Double { audio.scale ?? 1 }
    public var rotation: Double { audio.rotation ?? 0 }
    public var zIndex: Int { audio.zIndex ?? 0 }
    public var anchor: CGPoint { CGPoint(x: 0.5, y: 0.5) }
    public var startTime: Double? { audio.startTime.map(Double.init) }
    public var duration: Double? { audio.duration.map(Double.init) }
    public var fadeIn: Double? { nil }
    public var fadeOut: Double? { nil }
}

/// Le calque d'une pastille enfouie : la capsule de `StoryAudioChipPainter`,
/// en teinte pleine (un calque ne voit pas les pixels qu'il recouvre), posée à
/// la place et au rang de son son.
public final class StoryAudioChipLayer: CALayer {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free au démontage hors d'une tâche.
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}

    /// L'onde se redessine au plus trente fois par seconde, comme l'export.
    nonisolated static let framesPerSecond: Double = 30

    public private(set) var audio: StoryAudioPlayerObject?
    var paintedFrame: Int?
    var renderSize: CGSize = .zero
    var painter: StoryAudioChipPainter?

    public override nonisolated init() { super.init() }
    public override nonisolated init(layer: Any) { super.init(layer: layer) }

    @available(*, unavailable)
    public required nonisolated init?(coder: NSCoder) {
        fatalError("StoryAudioChipLayer does not support NSCoder")
    }

    @MainActor
    public func configure(with item: StoryAudioChipItem,
                          geometry: CanvasGeometry,
                          elapsed: TimeInterval,
                          renderScale: CGFloat = StoryCanvasDisplayScale.ambient) {
        audio = item.audio
        renderSize = geometry.renderSize
        contentsScale = renderScale
        let pose = StoryAudioChipPainter.placement(for: item.audio, renderSize: geometry.renderSize,
                                                   elapsed: elapsed)
        anchorPoint = CGPoint(x: 0.5, y: 0.5)
        bounds = CGRect(origin: .zero, size: pose.size)
        position = pose.center
        transform = CATransform3DMakeRotation(StoryAudioChipPainter.radians(pose.rotation), 0, 0, 1)
        zPosition = CGFloat(item.zIndex)
        name = item.id
        paintedFrame = nil
        repaint(elapsed: elapsed)
    }

    /// Dans la boucle de lecture du moteur : l'onde d'une pastille enfouie suit
    /// le temps, comme celle de la surcouche ; hors du cache, comme le fondu.
    @MainActor
    public static func advance(_ layer: CALayer, playing item: any RenderableItem, at seconds: Double,
                               reduceMotion: Bool) {
        guard let pastille = layer as? StoryAudioChipLayer, let chip = item as? StoryAudioChipItem else { return }
        pastille.advance(to: seconds - (chip.startTime ?? 0), reduceMotion: reduceMotion)
    }

    /// Avance l'onde (ou le crédit défilant) à `elapsed` — sans rien repeindre
    /// tant que l'image ne change pas.
    @MainActor
    public func advance(to elapsed: TimeInterval, reduceMotion: Bool) {
        repaint(elapsed: reduceMotion ? 0 : elapsed)
    }

    @MainActor
    private func repaint(elapsed: TimeInterval) {
        guard let audio, bounds.width > 0, bounds.height > 0 else { return }
        let clock = audio.isMuted ? 0 : max(0, elapsed)
        let frame = Int((clock * Self.framesPerSecond).rounded(.down))
        guard frame != paintedFrame else { return }
        paintedFrame = frame
        let pose = StoryAudioChipPainter.placement(for: audio, renderSize: renderSize, elapsed: clock)
        let local = StoryAudioChipPlacement(audioId: pose.audioId,
                                            center: CGPoint(x: bounds.midX, y: bounds.midY),
                                            unit: pose.unit, display: pose.display, rotation: 0,
                                            muted: pose.muted, elapsed: pose.elapsed)
        let peintre = painter ?? StoryAudioChipPainter()
        painter = peintre
        let format = UIGraphicsImageRendererFormat()
        format.scale = contentsScale
        format.opaque = false
        let image = UIGraphicsImageRenderer(size: bounds.size, format: format).image { context in
            peintre.paint(local, in: context.cgContext, samplesBackdrop: false)
        }
        contents = image.cgImage
    }
}
