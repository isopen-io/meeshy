import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

// MARK: - La mémoire de l'en-tête, par conversation (#9031)

/// Ce que l'en-tête d'une conversation retient d'une ouverture à l'autre, SUR
/// L'APPAREIL : l'en-tête déplié, et la flamme du jour que le lecteur a touchée
/// pour la faire disparaître. Deux ensembles d'identifiants de conversation —
/// seules les conversations dépliées ou à flamme masquée y figurent.
protocol ConversationHeaderMemoryProviding: AnyObject {
    func isExpanded(_ conversationId: String) -> Bool
    func setExpanded(_ expanded: Bool, for conversationId: String)
    func isFlameDismissed(_ conversationId: String) -> Bool
    func setFlameDismissed(_ dismissed: Bool, for conversationId: String)
}

final class ConversationHeaderMemory: ConversationHeaderMemoryProviding {
    static let shared = ConversationHeaderMemory()

    static let expandedKey = "meeshy.conversationHeader.expanded"
    static let flameDismissedKey = "meeshy.conversationHeader.flameDismissed"

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func isExpanded(_ conversationId: String) -> Bool {
        ids(Self.expandedKey).contains(conversationId)
    }

    func setExpanded(_ expanded: Bool, for conversationId: String) {
        write(expanded, conversationId, Self.expandedKey)
    }

    func isFlameDismissed(_ conversationId: String) -> Bool {
        ids(Self.flameDismissedKey).contains(conversationId)
    }

    func setFlameDismissed(_ dismissed: Bool, for conversationId: String) {
        write(dismissed, conversationId, Self.flameDismissedKey)
    }

    private func ids(_ key: String) -> Set<String> {
        Set(defaults.stringArray(forKey: key) ?? [])
    }

    private func write(_ isMember: Bool, _ conversationId: String, _ key: String) {
        guard !conversationId.isEmpty else { return }
        let current = ids(key)
        let next = isMember ? current.union([conversationId]) : current.subtracting([conversationId])
        guard next != current else { return }
        defaults.set(next.sorted(), forKey: key)
    }
}

// MARK: - Ce que l'en-tête montre de la flamme (#9031)

/// Loi PURE : la flamme du jour vit sous l'avatar de l'en-tête REPLIÉ, tant
/// que la conversation a rapporté des points et que le lecteur ne l'a pas
/// touchée. Déplier l'en-tête la ramène : le masquage tombe dès le dépliement,
/// et la flamme reparaît au repli.
nonisolated enum HeaderFlameVisibility {
    static func isShown(headerExpanded: Bool, dismissed: Bool, hasEngagement: Bool) -> Bool {
        !headerExpanded && !dismissed && hasEngagement
    }

    static func dismissed(afterHeaderExpanded expanded: Bool, wasDismissed: Bool) -> Bool {
        expanded ? false : wasDismissed
    }
}

// MARK: - La trajectoire de la flamme (#9031)

/// Loi PURE de l'effet, phase `0 → 1` : la flamme quitte sa place sous
/// l'avatar, en fait le tour, puis grossit sur place avant d'y revenir. La
/// lueur tourne autour de l'avatar pendant ce temps et s'éteint au retour.
///
/// Tout se rend en TRANSFORMATIONS et en OPACITÉ (aucune mise en page) : le
/// rejeu à chaque envoi ne coûte que la composition.
nonisolated enum HeaderFlameOrbit {
    /// Part de la phase consacrée au tour de l'avatar ; le reste est la pulsation.
    static let orbitShare: CGFloat = 0.62
    static let peakScale: CGFloat = 1.9
    static let glowTurns: Double = 1.5
    static let duration: Double = 1.5

    struct Pose: Equatable {
        let offset: CGSize
        let scale: CGFloat
    }

    /// `radius` : distance du centre de l'avatar au centre de la flamme au repos
    /// (posée sous l'avatar). Le décalage est relatif à cette place de repos.
    static func pose(at progress: CGFloat, radius: CGFloat) -> Pose {
        let phase = clamped(progress)
        guard phase < orbitShare else {
            let pulse = (phase - orbitShare) / (1 - orbitShare)
            return Pose(offset: .zero, scale: 1 + (peakScale - 1) * sin(pulse * .pi))
        }
        let turn = phase / orbitShare
        let eased = turn * turn * (3 - 2 * turn)
        let angle = CGFloat.pi / 2 + eased * 2 * .pi
        return Pose(
            offset: CGSize(width: radius * cos(angle), height: radius * sin(angle) - radius),
            scale: 1 + 0.2 * sin(turn * .pi)
        )
    }

    static func glowOpacity(at progress: CGFloat) -> Double {
        Double(sin(clamped(progress) * .pi))
    }

    static func glowRotation(at progress: CGFloat) -> Angle {
        .degrees(Double(clamped(progress)) * 360 * glowTurns)
    }

    private static func clamped(_ value: CGFloat) -> CGFloat {
        min(max(value, 0), 1)
    }
}

// MARK: - Le rejeu à chaque envoi (#9031)

/// Le signal d'un message qui PART, posé au seul point de passage de tous les
/// envois (`ConversationViewModel.sendMessage`, après la garde d'éligibilité) :
/// texte, médias, autocollants, lieux. La flamme de la conversation concernée
/// rejoue son effet.
enum HeaderFlameReplay {
    static let sent = PassthroughSubject<String, Never>()

    static func messageSent(in conversationId: String) {
        sent.send(conversationId)
    }
}

// MARK: - La flamme et sa lueur, posées sur l'avatar replié (#9031)

private struct HeaderFlameOrbitEffect: GeometryEffect {
    var radius: CGFloat
    var orbits: Bool
    var animatableData: CGFloat

    func effectValue(size: CGSize) -> ProjectionTransform {
        guard orbits else { return ProjectionTransform(.identity) }
        let pose = HeaderFlameOrbit.pose(at: animatableData, radius: radius)
        let anchor = CGAffineTransform(translationX: -size.width / 2, y: -size.height / 2)
        let scaled = anchor
            .concatenating(CGAffineTransform(scaleX: pose.scale, y: pose.scale))
            .concatenating(CGAffineTransform(translationX: size.width / 2 + pose.offset.width,
                                             y: size.height / 2 + pose.offset.height))
        return ProjectionTransform(scaled)
    }
}

private struct HeaderFlameGlow: View, Animatable {
    var phase: CGFloat
    let diameter: CGFloat

    var animatableData: CGFloat {
        get { phase }
        set { phase = newValue }
    }

    var body: some View {
        Circle()
            .trim(from: 0, to: 0.42)
            .stroke(
                AngularGradient(colors: [.clear, MeeshyColors.warning, MeeshyColors.error, .yellow],
                                center: .center),
                style: StrokeStyle(lineWidth: 3, lineCap: .round)
            )
            .frame(width: diameter, height: diameter)
            .shadow(color: MeeshyColors.error.opacity(0.6), radius: 4)
            .rotationEffect(HeaderFlameOrbit.glowRotation(at: phase))
            .opacity(HeaderFlameOrbit.glowOpacity(at: phase))
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }
}

/// Le compte du jour sous l'avatar : « 🔥 M ». Feuille pure, `Equatable`.
private struct HeaderFlameMark: View, Equatable {
    let todayPoints: Int

    var body: some View {
        HStack(spacing: 2) {
            Image(systemName: "flame.fill")
                .font(MeeshyFont.relative(MeeshyIconSize.xxs, weight: .bold))
                .foregroundStyle(
                    LinearGradient(colors: [.yellow, MeeshyColors.warning, MeeshyColors.error],
                                   startPoint: .top, endPoint: .bottom)
                )
            Text(verbatim: "\(todayPoints)")
                .font(MeeshyFont.relative(MeeshyFont.microSize, weight: .bold, design: .rounded).monospacedDigit())
                .foregroundColor(MeeshyColors.error)
        }
        .lineLimit(1)
        .fixedSize()
        .padding(.horizontal, MeeshySpacing.xs)
        .padding(.vertical, 1)
        .background(Capsule(style: .continuous).fill(.ultraThinMaterial))
    }
}

/// Pose la flamme du jour sous l'avatar et sa lueur autour. L'hôte décide
/// QUAND elle se montre (`HeaderFlameVisibility`) ; ce modificateur porte le
/// rendu, l'effet et son rejeu.
struct HeaderFlameDecoration: ViewModifier {
    let conversationId: String
    let seed: ConversationEngagementSnapshot?
    let headerExpanded: Bool
    let dismissed: Bool
    let avatarDiameter: CGFloat
    let onDismiss: () -> Void

    @ObservedObject private var store: ConversationEngagementStore = .shared
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var phase: CGFloat = 1
    @State private var isPlaying = false

    private var restRadius: CGFloat { avatarDiameter / 2 + 6 }

    func body(content: Content) -> some View {
        let snapshot = store.displayed(for: conversationId, seed: seed, at: Date())
        let isShown = HeaderFlameVisibility.isShown(headerExpanded: headerExpanded, dismissed: dismissed,
                                                    hasEngagement: snapshot != nil)
        let shown = isShown ? snapshot : nil
        return content
            .overlay {
                if shown != nil && isPlaying {
                    HeaderFlameGlow(phase: phase, diameter: avatarDiameter + 8)
                }
            }
            .overlay(alignment: .bottom) {
                if let shown {
                    Button(action: onDismiss) {
                        HeaderFlameMark(todayPoints: shown.todayPoints)
                            .equatable()
                            .modifier(HeaderFlameOrbitEffect(radius: restRadius, orbits: !reduceMotion,
                                                             animatableData: phase))
                    }
                    .buttonStyle(.plain)
                    .offset(y: 12)
                    .transition(.scale(scale: 0.4).combined(with: .opacity))
                    .accessibilityLabel(String(
                        localized: "conversation.header.flame.a11y",
                        defaultValue: "Points du jour : \(shown.todayPoints)",
                        bundle: .main
                    ))
                    .accessibilityHint(String(
                        localized: "conversation.header.flame.hint",
                        defaultValue: "Masque la flamme jusqu'au prochain dépliement de l'en-tête",
                        bundle: .main
                    ))
                    .accessibilityIdentifier("conversation.header.flame")
                }
            }
            .animation(.spring(response: 0.35, dampingFraction: 0.75), value: shown != nil)
            .task(id: seed) { store.seed(seed) }
            .onReceive(HeaderFlameReplay.sent.receive(on: DispatchQueue.main)) { sentIn in
                guard sentIn == conversationId, shown != nil else { return }
                replay()
            }
    }

    private func replay() {
        phase = 0
        isPlaying = true
        let duration = reduceMotion ? 0.6 : HeaderFlameOrbit.duration
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(16))
            withAnimation(.easeInOut(duration: duration)) { phase = 1 }
            try? await Task.sleep(for: .seconds(duration))
            isPlaying = false
        }
    }
}
