import QuartzCore
import UIKit
import MeeshySDK

/// **La puce d'un son de premier plan, rasterisée pour les rendus « en un
/// coup »** (#8599) — l'export MP4 d'abord.
///
/// À l'écran, la puce est une vue SwiftUI (`AudioForegroundChip`) posée
/// par-dessus le canvas : elle porte des gestes et un état d'écoute que Core
/// Animation ne sait pas porter. `layer.render(in:)` ne voit pas SwiftUI : sans
/// cette couche, un son posé sur la scène disparaissait du fichier exporté.
///
/// Même patron que `StoryLocationLayer` : une image pré-rasterisée posée en
/// `contents`, qui survit à `render(in:)` exactement comme les autres objets.
/// Les mesures sont celles de la vue (capsule, icône 18, contenu 54 ou 92,
/// marges 12 × 8) exprimées pour une scène de `referenceCanvasWidth` points de
/// large, puis projetées à la largeur rendue — la puce garde la même part de
/// la scène à l'écran et dans la vidéo.
public final class StoryAudioChipLayer: CALayer {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}

    /// La largeur de scène pour laquelle `AudioForegroundChip` est dessinée —
    /// celle d'un iPhone en portrait.
    static let referenceCanvasWidth: CGFloat = 390

    static let surfaceColor: UIColor =
        (StoryTextLayer.parseHexColorNonisolated(MeeshyColors.indigo900Hex) ?? .black)
            .withAlphaComponent(0.72)
    static let hairlineColor: UIColor = UIColor.white.withAlphaComponent(0.25)
    static let audibleTint: UIColor =
        StoryTextLayer.parseHexColorNonisolated(MeeshyColors.indigo300Hex) ?? .white
    static let mutedTint: UIColor = UIColor.white.withAlphaComponent(0.55)
    static let contentColor: UIColor = .white

    public override nonisolated init() { super.init() }
    public override nonisolated init(layer: Any) { super.init(layer: layer) }

    @available(*, unavailable)
    public required nonisolated init?(coder: NSCoder) {
        fatalError("StoryAudioChipLayer does not support NSCoder")
    }

    @MainActor
    public func configure(with audio: StoryAudioPlayerObject, geometry: CanvasGeometry) {
        let unit = geometry.renderSize.width / Self.referenceCanvasWidth
            * CGFloat(SceneObjectScalePolicy.clamped(audio.scale ?? 1))
        let display = AudioChipDisplay.display(for: AudioChipDisplay.backgroundAnnouncement(
            sound: AudioChipDisplay.borrowedSound(soundId: audio.soundId),
            libraryTitle: audio.name,
            libraryUsername: audio.soundAuthorUsername,
            libraryDuration: nil))
        let image = Self.chipImage(display: display, muted: audio.isMuted, unit: unit)
        contents = image.cgImage
        contentsScale = 1
        bounds = CGRect(origin: .zero, size: image.size)
        let size = geometry.renderSize
        position = CGPoint(x: max(0, min(size.width, audio.x * size.width)),
                           y: max(0, min(size.height, audio.y * size.height)))
        zPosition = 10_000
        name = audio.id
    }

    @MainActor
    static func chipImage(display: AudioChipDisplay, muted: Bool, unit: CGFloat) -> UIImage {
        let contentWidth: CGFloat
        switch display {
        case .waveform: contentWidth = 54
        case .marquee: contentWidth = 92
        }
        let padding = CGSize(width: 12 * unit, height: 8 * unit)
        let icon = 18 * unit
        let gap = 8 * unit
        let size = CGSize(width: padding.width * 2 + icon + gap + contentWidth * unit,
                          height: padding.height * 2 + icon)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = false
        return UIGraphicsImageRenderer(size: size, format: format).image { context in
            let capsule = UIBezierPath(roundedRect: CGRect(origin: .zero, size: size)
                .insetBy(dx: unit / 2, dy: unit / 2), cornerRadius: size.height / 2)
            surfaceColor.setFill()
            capsule.fill()
            hairlineColor.setStroke()
            capsule.lineWidth = unit
            capsule.stroke()

            let iconRect = CGRect(x: padding.width, y: padding.height, width: icon, height: icon)
            drawIcon(muted: muted, in: iconRect, unit: unit)

            let contentRect = CGRect(x: iconRect.maxX + gap, y: padding.height,
                                     width: contentWidth * unit, height: icon)
            switch display {
            case .waveform:
                drawSine(in: contentRect, unit: unit, muted: muted, context: context.cgContext)
            case .marquee(let text):
                drawCredit(text, in: contentRect, unit: unit)
            }
        }
    }

    @MainActor
    private static func drawIcon(muted: Bool, in rect: CGRect, unit: CGFloat) {
        let configuration = UIImage.SymbolConfiguration(pointSize: 14 * unit, weight: .bold)
        guard let symbol = UIImage(systemName: muted ? "waveform.slash" : "waveform",
                                   withConfiguration: configuration)?
            .withTintColor(muted ? mutedTint : audibleTint, renderingMode: .alwaysOriginal) else { return }
        let origin = CGPoint(x: rect.midX - symbol.size.width / 2, y: rect.midY - symbol.size.height / 2)
        symbol.draw(at: origin)
    }

    /// L'onde figée à sa phase de repos : un fichier exporté n'a pas l'horloge
    /// d'animation de la vue.
    private static func drawSine(in rect: CGRect, unit: CGFloat, muted: Bool, context: CGContext) {
        let path = UIBezierPath()
        let steps = 48
        for step in 0...steps {
            let progress = CGFloat(step) / CGFloat(steps)
            let point = CGPoint(x: rect.minX + progress * rect.width,
                                y: rect.midY + sin(progress * .pi * 4) * rect.height * 0.35)
            if step == 0 { path.move(to: point) } else { path.addLine(to: point) }
        }
        contentColor.withAlphaComponent(muted ? 0.35 : 1).setStroke()
        path.lineWidth = 2 * unit
        path.lineCapStyle = .round
        path.stroke()
    }

    /// Le crédit d'un son emprunté, tronqué à la largeur de la puce — la vue le
    /// fait défiler, une image ne peut qu'en montrer le début.
    private static func drawCredit(_ text: String, in rect: CGRect, unit: CGFloat) {
        let paragraph = NSMutableParagraphStyle()
        paragraph.lineBreakMode = .byTruncatingTail
        let attributes: [NSAttributedString.Key: Any] = [
            .font: UIFont.systemFont(ofSize: 12 * unit, weight: .semibold),
            .foregroundColor: contentColor,
            .paragraphStyle: paragraph
        ]
        let measured = (text as NSString).size(withAttributes: attributes)
        let line = CGRect(x: rect.minX, y: rect.midY - measured.height / 2,
                          width: rect.width, height: measured.height)
        (text as NSString).draw(in: line, withAttributes: attributes)
    }
}
