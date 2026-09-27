import SwiftUI
import MeeshySDK
import MeeshyUI

/// Comment la célébration bouge : le feu d'artifice, ou — Reduce Motion — un
/// fondu sobre, sans aucune particule.
nonisolated enum ArrivalCelebrationMotion: Equatable {
    case fireworks
    case fade

    init(reduceMotion: Bool) {
        self = reduceMotion ? .fade : .fireworks
    }

    var showsParticles: Bool { self == .fireworks }
}

/// Le feu d'artifice, en loi PURE du temps : chaque étincelle se calcule depuis
/// l'instant écoulé, donc le dessin ne garde aucun état et s'arrête de lui-même
/// après `showDuration`.
nonisolated enum ArrivalFireworks {
    struct Spark: Equatable {
        /// Position en fraction de la surface (0…1 sur chaque axe).
        let x: Double
        let y: Double
        let radius: Double
        let opacity: Double
        let colorIndex: Int
    }

    static let burstCount = 5
    static let sparksPerBurst = 16
    static let burstInterval = 0.32
    static let burstLife = 1.3
    static let showDuration = Double(burstCount - 1) * burstInterval + burstLife
    static let paletteCount = 5

    static func sparks(at time: Double, burstCount: Int = burstCount, sparksPerBurst: Int = sparksPerBurst) -> [Spark] {
        (0..<burstCount).flatMap { burst -> [Spark] in
            let progress = (time - Double(burst) * burstInterval) / burstLife
            guard progress >= 0, progress <= 1 else { return [] }
            return burstSparks(burst: burst, progress: progress, count: sparksPerBurst)
        }
    }

    private static func burstSparks(burst: Int, progress: Double, count: Int) -> [Spark] {
        let centerX = 0.18 + 0.64 * noise(Double(burst) * 3.1 + 0.7)
        let centerY = 0.16 + 0.30 * noise(Double(burst) * 5.3 + 1.9)
        let eased = 1 - pow(1 - progress, 3)
        return (0..<count).map { index in
            let angle = 2 * Double.pi * Double(index) / Double(count) + noise(Double(burst * 31 + index)) * 0.35
            let reach = 0.16 + 0.10 * noise(Double(burst * 17 + index) + 0.3)
            return Spark(
                x: centerX + cos(angle) * reach * eased,
                y: centerY + sin(angle) * reach * eased * 0.75 + 0.10 * progress * progress,
                radius: 3.2 * (1 - progress * 0.55),
                opacity: max(0, min(1, 1 - progress)),
                colorIndex: (burst + index) % paletteCount
            )
        }
    }

    /// Un pseudo-aléa DÉTERMINISTE dans 0…1 : la même graine rend la même fête.
    private static func noise(_ seed: Double) -> Double {
        let value = sin(seed * 12.9898) * 43758.5453
        return value - value.rounded(.down)
    }
}

/// La célébration de l'arrivée (#8089) : l'adresse est confirmée, la session
/// ouverte ; l'écran fête l'instant pendant que les caches se remplissent,
/// puis laisse place à l'onboarding. Le fond est celui de l'onboarding : le
/// passage de l'un à l'autre ne change que le premier plan.
struct ArrivalCelebrationView: View {
    let onSkip: () -> Void

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var systemReduce
    @Environment(\.meeshyForceReduceMotion) private var userForced

    @State private var appeared = false
    @State private var startDate = Date()

    private var isDark: Bool { colorScheme == .dark }
    private var motion: ArrivalCelebrationMotion {
        ArrivalCelebrationMotion(reduceMotion: MeeshyMotion.shouldReduce(system: systemReduce, userForced: userForced))
    }

    var body: some View {
        ZStack {
            OnboardingBackdrop(isDark: isDark)
            if motion.showsParticles {
                fireworks
            }
            VStack(spacing: MeeshySpacing.lg) {
                badge
                Text(String(localized: "arrival.celebration.title", defaultValue: "Adresse confirmée !", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.largeTitleSize, weight: .bold, design: .rounded))
                    .foregroundStyle(MeeshyColors.textPrimary(isDark: isDark))
                    .multilineTextAlignment(.center)
                    .accessibilityAddTraits(.isHeader)
                Text(String(localized: "arrival.celebration.lead", defaultValue: "Nous préparons vos conversations…", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .medium, design: .rounded))
                    .foregroundStyle(MeeshyColors.textSecondary(isDark: isDark))
                    .multilineTextAlignment(.center)
            }
            .padding(.horizontal, MeeshySpacing.xl)
            .opacity(appeared ? 1 : 0)
        }
        .contentShape(Rectangle())
        .onTapGesture(perform: onSkip)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isModal)
        .accessibilityAction(named: Text(String(localized: "arrival.celebration.skip", defaultValue: "Continuer", bundle: .main)), onSkip)
        .accessibilityIdentifier("arrival.celebration")
        .onAppear {
            startDate = Date()
            withAnimation(motion == .fade ? .easeOut(duration: 0.4) : .spring(response: 0.55, dampingFraction: 0.62)) {
                appeared = true
            }
            if motion.showsParticles { HapticFeedback.success() }
            UIAccessibility.post(
                notification: .announcement,
                argument: String(localized: "arrival.celebration.status", defaultValue: "Adresse confirmée — connexion…", bundle: .main)
            )
        }
    }

    private var badge: some View {
        ZStack {
            Circle()
                .fill(MeeshyColors.success.opacity(0.16))
                .frame(width: 104, height: 104)
            Image(systemName: "checkmark.seal.fill")
                .font(.system(.largeTitle).weight(.semibold))
                .imageScale(.large)
                .foregroundStyle(MeeshyColors.success)
        }
        .dynamicTypeSize(...DynamicTypeSize.accessibility1)
        .scaleEffect(motion == .fade || appeared ? 1 : 0.4)
        .accessibilityHidden(true)
    }

    private static let palette: [Color] = [
        MeeshyColors.indigo400, MeeshyColors.purple500, MeeshyColors.success, MeeshyColors.warning, MeeshyColors.info,
    ]

    private var fireworks: some View {
        TimelineView(.animation) { timeline in
            Canvas { context, size in
                let elapsed = timeline.date.timeIntervalSince(startDate)
                for spark in ArrivalFireworks.sparks(at: elapsed) {
                    let radius = spark.radius
                    let rect = CGRect(x: spark.x * size.width - radius, y: spark.y * size.height - radius,
                                      width: radius * 2, height: radius * 2)
                    context.fill(Path(ellipseIn: rect),
                                 with: .color(Self.palette[spark.colorIndex % Self.palette.count].opacity(spark.opacity)))
                }
            }
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}
