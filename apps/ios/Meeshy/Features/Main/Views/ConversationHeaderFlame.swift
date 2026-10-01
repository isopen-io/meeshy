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

// MARK: - La lueur qui rejoint la flamme (#9031, #9044)

/// Loi PURE de l'effet, phase `0 → 1` : une lueur part de sous l'avatar, en
/// fait le tour et revient s'éteindre dans la flamme, qui grossit sur place
/// puis reprend sa taille ; au plus fort de la croissance, le compte du jour
/// passe à sa nouvelle valeur. La flamme ne bouge pas de sa place.
///
/// Tout se rend en TRANSFORMATIONS et en OPACITÉ (aucune mise en page) : le
/// rejeu à chaque envoi ne coûte que la composition.
nonisolated enum HeaderFlameOrbit {
    /// Part de la phase consacrée au tour de la lueur ; le reste est la croissance.
    static let orbitShare: CGFloat = 0.6
    static let peakScale: CGFloat = 1.7
    /// Longueur maximale de la traîne, en fraction du cercle.
    static let maxGlowLength: CGFloat = 0.32
    static let duration: Double = 1.6

    /// L'instant où le compte du jour prend sa nouvelle valeur : le sommet de la croissance.
    static var valueRelease: CGFloat { orbitShare + (1 - orbitShare) / 2 }

    /// La tête de la lueur : sous l'avatar (90°) au départ, un tour complet, et
    /// de retour sous l'avatar — sur la flamme — à l'arrivée.
    static func glowHead(at progress: CGFloat) -> Angle {
        let turn = min(clamped(progress) / orbitShare, 1)
        let eased = turn * turn * (3 - 2 * turn)
        return .degrees(90 + Double(eased) * 360)
    }

    /// La traîne naît de rien, s'étire à mi-tour, et rentre dans la flamme.
    static func glowLength(at progress: CGFloat) -> CGFloat {
        let phase = clamped(progress)
        guard phase < orbitShare else { return 0 }
        return maxGlowLength * sin(phase / orbitShare * .pi)
    }

    static func glowOpacity(at progress: CGFloat) -> Double {
        let phase = clamped(progress)
        guard phase < orbitShare else { return 0 }
        return min(1, Double(sin(phase / orbitShare * .pi)) * 3)
    }

    static func flameScale(at progress: CGFloat) -> CGFloat {
        let phase = clamped(progress)
        guard phase > orbitShare else { return 1 }
        let pulse = (phase - orbitShare) / (1 - orbitShare)
        return 1 + (peakScale - 1) * sin(pulse * .pi)
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

// MARK: - La flamme et sa lueur, posées sur l'avatar replié (#9031, #9044)

private struct HeaderFlamePulseEffect: GeometryEffect {
    var animatableData: CGFloat
    let grows: Bool

    func effectValue(size: CGSize) -> ProjectionTransform {
        guard grows else { return ProjectionTransform(.identity) }
        let scale = HeaderFlameOrbit.flameScale(at: animatableData)
        let transform = CGAffineTransform(translationX: -size.width / 2, y: -size.height / 2)
            .concatenating(CGAffineTransform(scaleX: scale, y: scale))
            .concatenating(CGAffineTransform(translationX: size.width / 2, y: size.height / 2))
        return ProjectionTransform(transform)
    }
}

private struct HeaderFlameGlow: View, Animatable {
    var phase: CGFloat
    let diameter: CGFloat
    let reduceMotion: Bool

    var animatableData: CGFloat {
        get { phase }
        set { phase = newValue }
    }

    var body: some View {
        let length = reduceMotion ? 1 : HeaderFlameOrbit.glowLength(at: phase)
        let span = Angle.degrees(Double(length) * 360)
        Circle()
            .trim(from: 0, to: length)
            .stroke(
                AngularGradient(colors: [.clear, MeeshyColors.warning, MeeshyColors.error, .yellow],
                                center: .center, startAngle: .zero, endAngle: span),
                style: StrokeStyle(lineWidth: 3, lineCap: .round)
            )
            .frame(width: diameter, height: diameter)
            .shadow(color: MeeshyColors.error.opacity(0.6), radius: 4)
            .rotationEffect(reduceMotion ? .zero : HeaderFlameOrbit.glowHead(at: phase) - span)
            .opacity(reduceMotion ? Double(sin(min(max(phase, 0), 1) * .pi)) : HeaderFlameOrbit.glowOpacity(at: phase))
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }
}

/// Le compte du jour sous l'avatar : « 🔥 M ». Feuille pure, `Equatable` ; le
/// chiffre défile vers sa nouvelle valeur.
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
                .contentTransition(.numericText())
                .animation(.spring(response: 0.4, dampingFraction: 0.7), value: todayPoints)
        }
        .lineLimit(1)
        .fixedSize()
        .padding(.horizontal, MeeshySpacing.xs)
        .padding(.vertical, 1)
        .background(Capsule(style: .continuous).fill(.ultraThinMaterial))
    }
}

/// Pose la flamme du jour JUSTE SOUS le cercle de l'avatar (jamais par-dessus)
/// et la lueur autour. L'hôte décide QUAND elle se montre
/// (`HeaderFlameVisibility`) ; ce modificateur porte le rendu, l'effet et son
/// rejeu.
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
    /// Le compte d'AVANT l'envoi, tenu jusqu'à ce que la lueur ait rejoint la flamme.
    @State private var heldPoints: Int?
    /// Le rejeu en cours : un envoi qui en relance un autre reprend la main.
    @State private var replayCount = 0

    private static let gapUnderAvatar: CGFloat = 2

    func body(content: Content) -> some View {
        let snapshot = store.displayed(for: conversationId, seed: seed, at: Date())
        let isShown = HeaderFlameVisibility.isShown(headerExpanded: headerExpanded, dismissed: dismissed,
                                                    hasEngagement: snapshot != nil)
        let shown = isShown ? snapshot : nil
        return content
            .overlay {
                if shown != nil && isPlaying {
                    HeaderFlameGlow(phase: phase, diameter: avatarDiameter + 8, reduceMotion: reduceMotion)
                }
            }
            .overlay(alignment: .bottom) {
                if let shown {
                    Button(action: onDismiss) {
                        HeaderFlameMark(todayPoints: heldPoints ?? shown.todayPoints)
                            .equatable()
                            .modifier(HeaderFlamePulseEffect(animatableData: phase, grows: !reduceMotion))
                    }
                    .buttonStyle(.plain)
                    .alignmentGuide(.bottom) { $0[.top] - Self.gapUnderAvatar }
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
                guard sentIn == conversationId, let shown else { return }
                replay(holding: shown.todayPoints)
            }
    }

    private func replay(holding current: Int) {
        heldPoints = heldPoints ?? current
        replayCount += 1
        let replay = replayCount
        phase = 0
        isPlaying = true
        let duration = reduceMotion ? 0.6 : HeaderFlameOrbit.duration
        let release = duration * Double(HeaderFlameOrbit.valueRelease)
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(16))
            withAnimation(.linear(duration: duration)) { phase = 1 }
            try? await Task.sleep(for: .seconds(release))
            guard replay == replayCount else { return }
            heldPoints = nil
            try? await Task.sleep(for: .seconds(duration - release))
            guard replay == replayCount else { return }
            isPlaying = false
        }
    }
}
