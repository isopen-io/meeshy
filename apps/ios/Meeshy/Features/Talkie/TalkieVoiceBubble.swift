import Combine
import MeeshySDK
import MeeshyUI
import SwiftUI

/// LA BULLE SPECTRALE DU TALKIE (#20531) : les 120 bandes de la voix d'une personne, en pointes autour de son avatar,
/// reliées par un contour qui respire. Le grave est en haut, l'aigu tourne dans le sens horaire, et chaque rayon prend
/// la couleur de sa fréquence : orange au grave, ambre, bleu clair, puis bleu à l'aigu, qui reboucle sur l'orange.
///
/// Le cadre est un carré de côté `frameSide(for:)` : la bulle entière (`baseRadius + maxAmplitude`) plus la moitié du
/// trait le plus large, centrée — rien ne se dessine hors du cadre. Au silence, c'est un cercle parfait au
/// `baseRadius` : c'est l'hôte qui décide quand la monter. Le remplissage ne couvre que l'anneau entre le cercle de
/// base et le contour, si bien que la bulle se pose devant ou derrière l'avatar sans le voiler.
///
/// Chaque image relit le registre (verrou + copie), sans rien publier : la vue ne change ni d'identité ni d'état, seul
/// le `TimelineView` la redessine. Sous « réduire les animations », dix images par seconde d'un cercle dont l'épaisseur
/// suit le niveau moyen.
struct TalkieVoiceBubble: View {
    let userId: String
    let geometry: TalkieBubbleGeometry
    let stage: TalkieVoiceStage

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// L'épaisseur du contour en mouvement.
    nonisolated static let strokeWidth: CGFloat = 2

    nonisolated private static let rayWidth: CGFloat = 1
    nonisolated private static let fillOpacity: Double = 0.18
    nonisolated private static let rayOpacity: Double = 0.6
    nonisolated private static let spectrum = Gradient(colors: [
        MeeshyColors.orange500, MeeshyColors.amber500, MeeshyColors.info, MeeshyColors.blue500, MeeshyColors.orange500,
    ])

    init(userId: String, geometry: TalkieBubbleGeometry, stage: TalkieVoiceStage = .shared) {
        self.userId = userId
        self.geometry = geometry
        self.stage = stage
    }

    /// Le côté du cadre : le diamètre de la bulle pleine, plus la moitié du trait le plus large de chaque côté.
    nonisolated static func frameSide(for geometry: TalkieBubbleGeometry) -> CGFloat {
        let widest = max(strokeWidth, TalkieBubbleLaw.reducedMotionStroke(level: 1))
        return 2 * (geometry.baseRadius + geometry.maxAmplitude) + widest
    }

    var body: some View {
        let side = Self.frameSide(for: geometry)
        TimelineView(.animation(minimumInterval: reduceMotion ? 0.1 : nil)) { _ in
            let bands = stage.bands(for: userId, now: TalkieVoiceStage.hostNow() - TalkieVoiceStage.readLag)
            let reduced = reduceMotion
            let geometry = geometry
            Canvas { graphics, size in
                let center = CGPoint(x: size.width / 2, y: size.height / 2)
                if reduced {
                    Self.drawCircle(level: TalkieBubbleLaw.meanLevel(bands: bands), geometry: geometry, center: center, in: &graphics)
                } else {
                    Self.drawBubble(bands: bands, geometry: geometry, center: center, in: &graphics)
                }
            }
        }
        .frame(width: side, height: side)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    nonisolated private static func shading(center: CGPoint) -> GraphicsContext.Shading {
        .conicGradient(spectrum, center: center, angle: .degrees(-90))
    }

    /// Une image : les pointes une fois, le contour une fois, puis l'anneau, les 120 rayons en UN tracé et le trait.
    nonisolated private static func drawBubble(bands: [Float], geometry: TalkieBubbleGeometry, center: CGPoint,
                                               in graphics: inout GraphicsContext) {
        let tips = TalkieBubbleLaw.tips(bands: bands, geometry: geometry, center: center)
        let outline = TalkieBubbleLaw.outline(tips: tips, geometry: geometry, center: center)
        let shading = shading(center: center)
        var ring = outline
        ring.addPath(baseCircle(geometry: geometry, center: center))
        var fill = graphics
        fill.opacity = fillOpacity
        fill.fill(ring, with: shading, style: FillStyle(eoFill: true))
        var rayContext = graphics
        rayContext.opacity = rayOpacity
        rayContext.stroke(rays(tips: tips, geometry: geometry, center: center), with: shading, lineWidth: rayWidth)
        graphics.stroke(outline, with: shading, style: StrokeStyle(lineWidth: strokeWidth, lineJoin: .round))
    }

    nonisolated private static func drawCircle(level: Float, geometry: TalkieBubbleGeometry, center: CGPoint,
                                               in graphics: inout GraphicsContext) {
        let circle = baseCircle(geometry: geometry, center: center)
        graphics.stroke(circle, with: shading(center: center), lineWidth: TalkieBubbleLaw.reducedMotionStroke(level: level))
    }

    nonisolated private static func baseCircle(geometry: TalkieBubbleGeometry, center: CGPoint) -> Path {
        let radius = geometry.baseRadius
        return Path(ellipseIn: CGRect(x: center.x - radius, y: center.y - radius, width: 2 * radius, height: 2 * radius))
    }

    /// Chaque rayon part du cercle de base, sur la droite du centre à sa pointe : aucune trigonométrie de plus.
    nonisolated private static func rays(tips: [CGPoint], geometry: TalkieBubbleGeometry, center: CGPoint) -> Path {
        var path = Path()
        for tip in tips {
            let dx = tip.x - center.x
            let dy = tip.y - center.y
            let radius = hypot(dx, dy)
            guard radius > geometry.baseRadius else { continue }
            let scale = geometry.baseRadius / radius
            path.move(to: CGPoint(x: center.x + dx * scale, y: center.y + dy * scale))
            path.addLine(to: tip)
        }
        return path
    }
}

/// LE COMPTEUR DU TALKIE (#20531) : « ● 0:04 », un point rouge qui bat une fois par seconde (fixe sous « réduire
/// les animations ») et le temps écoulé depuis le début de la voix, en chiffres à chasse fixe. Chaque seconde relit le
/// début de la voix au registre : rien tant que personne ne parle, même monté avant que la voix commence. VoiceOver lit
/// « Enregistrement, 4 secondes ».
struct TalkieVoiceClock: View {
    let userId: String
    let stage: TalkieVoiceStage

    init(userId: String, stage: TalkieVoiceStage = .shared) {
        self.userId = userId
        self.stage = stage
    }

    var body: some View {
        TimelineView(.periodic(from: stage.startedAt(for: userId) ?? Date(), by: 1)) { context in
            if let seconds = Self.seconds(startedAt: stage.startedAt(for: userId), now: context.date) {
                HStack(spacing: MeeshySpacing.xs) {
                    TalkieClockDot()
                    Text(Self.text(seconds: seconds))
                        .font(.caption.weight(.semibold).monospacedDigit())
                        .lineLimit(1)
                        .fixedSize()
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(Self.accessibilityLabel(seconds: seconds))
            }
        }
    }

    /// Les secondes écoulées depuis le début de la voix ; `nil` quand aucune voix n'a commencé.
    nonisolated static func seconds(startedAt: Date?, now: Date) -> Int? {
        startedAt.map { elapsedSeconds(since: $0, now: now) }
    }

    /// Les secondes entières écoulées, jamais négatives (une horloge en avance sur le début compte 0).
    nonisolated static func elapsedSeconds(since startedAt: Date, now: Date) -> Int {
        MediaFormat.wholeSeconds(from: now.timeIntervalSince(startedAt))
    }

    /// « 0:04 », « 1:15 ».
    nonisolated static func text(seconds: Int, locale: Locale = .current) -> String {
        MediaFormat.duration(seconds, style: .clock, locale: locale)
    }

    /// « Enregistrement, 4 secondes » : la durée se dit dans la langue de l'appareil, accord compris.
    static func accessibilityLabel(seconds: Int) -> String {
        let duration = MediaFormat.duration(seconds, style: .spoken)
        return String(format: String(localized: "talkie.clock.a11y", defaultValue: "Enregistrement, %@", bundle: .main), duration)
    }
}

/// Le point rouge du compteur : une demi-seconde qui s'éteint, une demi-seconde qui revient, en boucle, sans horloge
/// d'images ; immobile sous « réduire les animations ».
private struct TalkieClockDot: View {
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion
    @State private var dimmed = false

    private var reduceMotion: Bool { MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion) }

    var body: some View {
        Circle()
            .fill(MeeshyColors.error)
            .frame(width: 8, height: 8)
            .opacity(reduceMotion || !dimmed ? 1 : 0.3)
            .onAppear { blink(reduceMotion: reduceMotion) }
            .onDisappear { dimmed = false }
            .adaptiveOnChange(of: reduceMotion) { _, reduce in blink(reduceMotion: reduce) }
    }

    private func blink(reduceMotion: Bool) {
        guard !reduceMotion else {
            dimmed = false
            return
        }
        withAnimation(.easeInOut(duration: 0.5).repeatForever(autoreverses: true)) { dimmed = true }
    }
}

#if DEBUG
/// Un registre à part, qui pousse des bandes sinusoïdales : la bulle et le compteur tels qu'ils vivent.
private struct TalkieVoiceBubblePreview: View {
    private static let userId = "preview"

    @State private var stage: TalkieVoiceStage = {
        let stage = TalkieVoiceStage()
        stage.begin(userId: userId, direction: .outgoing, at: Date())
        return stage
    }()

    private var userId: String { Self.userId }

    var body: some View {
        VStack(spacing: MeeshySpacing.lg) {
            ZStack {
                TalkieVoiceBubble(userId: userId, geometry: TalkieBubbleGeometry(baseRadius: 60, maxAmplitude: 28), stage: stage)
                Circle().fill(MeeshyColors.indigo500).frame(width: 120, height: 120)
            }
            TalkieVoiceClock(userId: userId, stage: stage)
        }
        .onReceive(Timer.publish(every: 0.023, on: .main, in: .common).autoconnect()) { _ in
            let now = TalkieVoiceStage.hostNow()
            let bands = (0..<TalkieBubbleLaw.bandCount).map { index in
                let x = Double(index) / Double(TalkieBubbleLaw.bandCount)
                let wave = (sin(2 * .pi * (3 * x + now)) + 1) / 2
                return Float(wave * (1 - x) * (0.6 + 0.4 * sin(now * 1.7)))
            }
            stage.push(userId: userId, direction: .outgoing, bands: bands, at: now)
        }
    }
}

#Preview("Bulle spectrale") {
    TalkieVoiceBubblePreview()
}
#endif
