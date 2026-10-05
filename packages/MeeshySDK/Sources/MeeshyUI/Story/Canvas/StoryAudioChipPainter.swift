import CoreMedia
import QuartzCore
import UIKit
import MeeshySDK

/// **Où et comment se pose la puce d'un son de premier plan** dans un rendu
/// « en un coup » (#8599, #8609) — l'export MP4 et la couverture statique.
///
/// Les mesures sont celles de `AudioForegroundChip` (capsule, icône 18,
/// contenu 54 ou 92, marges 12 × 8, espacement 8) exprimées pour une scène de
/// `StoryAudioChipPainter.referenceCanvasWidth` points de large, puis projetées
/// à la largeur rendue par `unit` : la puce garde la même part de la scène à
/// l'écran et dans la vidéo.
public struct StoryAudioChipPlacement: Equatable {
    public let audioId: String
    public let center: CGPoint
    /// Points de rendu par point de la vue de référence (échelle de l'auteur
    /// comprise).
    public let unit: CGFloat
    public let display: AudioChipDisplay
    public let muted: Bool
    /// Secondes écoulées depuis l'apparition de la puce — l'horloge de l'onde
    /// et du défilement du crédit.
    public let elapsed: TimeInterval

    static let padding = CGSize(width: 12, height: 8)
    static let iconSide: CGFloat = 18
    static let gap: CGFloat = 8

    var contentWidth: CGFloat {
        switch display {
        case .waveform: return 54
        case .marquee: return 92
        }
    }

    public var size: CGSize {
        CGSize(width: (Self.padding.width * 2 + Self.iconSide + Self.gap + contentWidth) * unit,
               height: (Self.padding.height * 2 + Self.iconSide) * unit)
    }

    public var frame: CGRect {
        CGRect(x: center.x - size.width / 2, y: center.y - size.height / 2,
               width: size.width, height: size.height)
    }

    /// La zone de l'onde ou du crédit — la seule qui change d'une image à
    /// l'autre.
    public var contentFrame: CGRect {
        CGRect(x: frame.minX + (Self.padding.width + Self.iconSide + Self.gap) * unit,
               y: frame.minY + Self.padding.height * unit,
               width: contentWidth * unit,
               height: Self.iconSide * unit)
    }
}

/// **Peint les puces des sons de premier plan telles que le lecteur les
/// montre** (#8609), à un coût par image borné (#8611).
///
/// À l'écran, la puce est une vue SwiftUI (`AudioForegroundChip`) posée
/// par-dessus le canvas : `layer.render(in:)` ne la voit pas. La première
/// version de l'export (#8599) la rasterisait en une capsule OPAQUE, une onde
/// FIGÉE et un crédit TRONQUÉ — trois écarts avec ce que voit un lecteur :
///
/// - **le verre** : `.ultraThinMaterial` floute ce qui est derrière. La puce
///   échantillonne donc les pixels DÉJÀ peints sous elle, les floute par
///   réduction puis agrandissement (une moyenne par blocs lissée), puis pose
///   la teinte et le liseré ;
/// - **l'onde** : la sinusoïde de `AudioForegroundSineWave`, même phase
///   (`t × 3 + x × 0,22`), au temps de l'export ;
/// - **le crédit** : il défile s'il déborde, par la loi pure
///   `AudioChipMarquee.scrollOffset` — même vitesse, même écart.
///
/// **Ce qui ne varie pas se rasterise une fois** (#8611) : capsule teintée,
/// liseré, icône et crédit forment un GABARIT mis en cache par forme de puce.
/// Une image exportée ne paie plus que l'échantillonnage du fond, l'onde (36
/// segments) ou le déplacement du crédit. `templateBuildCount` en est le
/// témoin.
///
/// Le contexte reçu est en repère UIKit (rangée 0 = haut), celui du compositor
/// et de `UIGraphicsImageRenderer`.
@MainActor
public final class StoryAudioChipPainter {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}

    /// La largeur de scène pour laquelle `AudioForegroundChip` est dessinée —
    /// celle d'un iPhone en portrait.
    public static let referenceCanvasWidth: CGFloat = 390

    /// Nombre de gabarits rasterisés depuis la création du peintre.
    public private(set) var templateBuildCount = 0

    private var templates: [StoryAudioChipTemplate.Key: StoryAudioChipTemplate] = [:]
    private static let templateLimit = 16

    public init() {}

    // MARK: - Placement

    /// Les puces visibles au temps `time`. La fenêtre de visibilité est celle
    /// du lecteur (`AudioForegroundReaderOverlay.visibleAudios`) : pas de puce
    /// pour le son de fond, ni hors de `startTime … startTime + duration`.
    /// `respectingWindow: false` montre toutes les puces de premier plan,
    /// comme le composer — c'est la forme de la couverture statique.
    public static func placements(for slide: StorySlide,
                                  into geometry: CanvasGeometry,
                                  at time: CMTime,
                                  respectingWindow: Bool = true) -> [StoryAudioChipPlacement] {
        let audios = slide.effects.audioPlayerObjects ?? []
        guard !audios.isEmpty else { return [] }
        let seconds = time.seconds.isFinite ? max(0, time.seconds) : 0
        let visibles = respectingWindow
            ? AudioForegroundReaderOverlay.visibleAudios(in: audios, elapsed: seconds,
                                                         slideDuration: slide.computedTotalDuration())
            : audios.filter { $0.isBackground != true }
        let size = geometry.renderSize
        return visibles.map { audio in
            StoryAudioChipPlacement(
                audioId: audio.id,
                center: CGPoint(x: max(0, min(size.width, audio.x * size.width)),
                                y: max(0, min(size.height, audio.y * size.height))),
                unit: size.width / referenceCanvasWidth
                    * CGFloat(SceneObjectScalePolicy.clamped(audio.scale ?? 1)),
                display: AudioChipDisplay.display(for: AudioChipDisplay.backgroundAnnouncement(
                    sound: AudioChipDisplay.borrowedSound(soundId: audio.soundId),
                    libraryTitle: audio.name,
                    libraryUsername: audio.soundAuthorUsername,
                    libraryDuration: nil)),
                muted: audio.isMuted,
                elapsed: max(0, seconds - Double(audio.startTime ?? 0)))
        }
    }

    // MARK: - Peinture

    /// Peint les puces de `slide` visibles à `time` dans `context`.
    ///
    /// - Parameter samplesBackdrop: `false` quand ce qui est déjà peint dans
    ///   le contexte n'est pas ce qui est sous la puce (un calque de
    ///   transparence ouvert) : la capsule prend alors une teinte pleine
    ///   plutôt qu'un fond faux.
    public func paint(slide: StorySlide,
                      into geometry: CanvasGeometry,
                      at time: CMTime,
                      in context: CGContext,
                      respectingWindow: Bool = true,
                      samplesBackdrop: Bool = true) {
        let placements = Self.placements(for: slide, into: geometry, at: time,
                                         respectingWindow: respectingWindow)
        guard !placements.isEmpty else { return }
        let deviceScale = Self.deviceScale(of: context)
        for placement in placements {
            paint(placement, in: context, deviceScale: deviceScale, samplesBackdrop: samplesBackdrop)
        }
    }

    private func paint(_ placement: StoryAudioChipPlacement,
                       in context: CGContext,
                       deviceScale: CGFloat,
                       samplesBackdrop: Bool) {
        let template = template(for: placement, deviceScale: deviceScale)
        let frame = placement.frame
        let capsule = CGPath(roundedRect: frame, cornerWidth: frame.height / 2,
                             cornerHeight: frame.height / 2, transform: nil)

        context.saveGState()
        context.addPath(capsule)
        context.clip()
        let frosted = samplesBackdrop
            ? StoryAudioChipGlass.frostedBackdrop(under: frame, unit: placement.unit, in: context)
            : nil
        if let frosted {
            context.interpolationQuality = .high
            Self.drawUpright(frosted.image, in: frosted.rect, context: context)
        } else {
            context.setFillColor(StoryAudioChipTemplate.opaqueSurface.cgColor)
            context.fill(frame)
        }
        context.restoreGState()

        Self.drawUpright(template.chrome, in: frame, context: context)

        context.saveGState()
        context.clip(to: placement.contentFrame)
        switch placement.display {
        case .waveform:
            if let wave = wavePath(placement) {
                stroke(wave, placement: placement, in: context)
            }
        case .marquee:
            if let credit = template.credit {
                drawCredit(credit, width: template.creditWidth, placement: placement, in: context)
            }
        }
        context.restoreGState()
    }

    private func template(for placement: StoryAudioChipPlacement,
                          deviceScale: CGFloat) -> StoryAudioChipTemplate {
        let key = StoryAudioChipTemplate.Key(placement: placement, deviceScale: deviceScale)
        if let cached = templates[key] { return cached }
        if templates.count >= Self.templateLimit { templates.removeAll() }
        let built = StoryAudioChipTemplate(placement: placement, deviceScale: deviceScale)
        templates[key] = built
        templateBuildCount += 1
        return built
    }

    // MARK: - Onde

    /// La sinusoïde de `AudioForegroundSineWave` : phase `t × 3 + x × 0,22`
    /// (x en points de la vue), amplitude 80 % de la demi-hauteur, pas de
    /// 1,5 pt. Une piste coupée fige l'onde, comme la pause de la vue.
    private func wavePath(_ placement: StoryAudioChipPlacement) -> CGPath? {
        let content = placement.contentFrame
        let unit = placement.unit
        guard unit > 0 else { return nil }
        let clock = placement.muted ? 0 : placement.elapsed
        let amplitude = StoryAudioChipPlacement.iconSide / 2 * 0.8 * unit
        let path = CGMutablePath()
        let points = stride(from: CGFloat(0), through: placement.contentWidth, by: 1.5).map { x -> CGPoint in
            let phase = clock * 3 + Double(x) * 0.22
            return CGPoint(x: content.minX + x * unit, y: content.midY + CGFloat(sin(phase)) * amplitude)
        }
        path.addLines(between: points)
        return path
    }

    private func stroke(_ path: CGPath, placement: StoryAudioChipPlacement, in context: CGContext) {
        context.addPath(path)
        context.setStrokeColor(UIColor.white.withAlphaComponent(placement.muted ? 0.9 * 0.35 : 0.9).cgColor)
        context.setLineWidth(1.6 * placement.unit)
        context.setLineCap(.round)
        context.setLineJoin(.round)
        context.strokePath()
    }

    // MARK: - Crédit

    /// Centré s'il tient ; sinon deux copies espacées de 24 pt qui défilent à
    /// 28 pt/s, sans couture — la loi de `AudioChipMarquee`.
    private func drawCredit(_ credit: CGImage, width: CGFloat,
                            placement: StoryAudioChipPlacement, in context: CGContext) {
        let content = placement.contentFrame
        let height = CGFloat(credit.height) / max(1, CGFloat(credit.width)) * width
        let y = content.midY - height / 2
        if placement.muted { context.setAlpha(0.55) }
        guard width > content.width else {
            Self.drawUpright(credit, in: CGRect(x: content.midX - width / 2, y: y, width: width, height: height),
                             context: context)
            return
        }
        let cycle = width + 24 * placement.unit
        let offset = AudioChipMarquee.scrollOffset(elapsed: placement.muted ? 0 : placement.elapsed,
                                                   cycle: cycle,
                                                   speed: 28 * placement.unit)
        for copy in 0..<2 {
            let x = content.minX + offset + CGFloat(copy) * cycle
            Self.drawUpright(credit, in: CGRect(x: x, y: y, width: width, height: height), context: context)
        }
    }

    // MARK: - Repère

    /// Pixels du périphérique par point du contexte — pour rasteriser le
    /// gabarit à la résolution où il sera posé.
    static func deviceScale(of context: CGContext) -> CGFloat {
        let transform = context.userSpaceToDeviceSpaceTransform
        let scale = hypot(transform.a, transform.b)
        return scale.isFinite && scale > 0 ? scale : 1
    }

    /// `CGContext.draw` suppose un repère Quartz (y vers le haut) : dans un
    /// repère UIKit, il peindrait l'image à l'envers.
    static func drawUpright(_ image: CGImage, in rect: CGRect, context: CGContext) {
        context.saveGState()
        context.translateBy(x: 0, y: rect.minY + rect.height)
        context.scaleBy(x: 1, y: -1)
        context.draw(image, in: CGRect(x: rect.minX, y: 0, width: rect.width, height: rect.height))
        context.restoreGState()
    }
}
