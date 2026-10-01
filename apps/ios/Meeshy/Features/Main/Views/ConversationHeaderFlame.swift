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
/// qu'une série court dans la conversation et que le lecteur ne l'a pas
/// touchée. Déplier l'en-tête la ramène : le masquage tombe dès le dépliement,
/// et la flamme reparaît au repli.
nonisolated enum HeaderFlameVisibility {
    static func isShown(headerExpanded: Bool, dismissed: Bool, hasEngagement: Bool) -> Bool {
        !headerExpanded && !dismissed && hasEngagement
    }

    static func dismissed(afterHeaderExpanded expanded: Bool, wasDismissed: Bool) -> Bool {
        expanded ? false : wasDismissed
    }

    /// Sans série EN COURS, la conversation ne montre ni flamme ni points (#9044).
    static func hasRunningStreak(_ snapshot: ConversationEngagementSnapshot?) -> Bool {
        (snapshot?.streakDays ?? 0) > 0
    }
}

// MARK: - La lueur qui allume la flamme (#9031, #9044)

/// Loi PURE de l'effet, phase `0 → 1` :
/// 1. la flamme s'assombrit pendant qu'une lueur part de sous l'avatar, en fait
///    le tour et revient s'éteindre dans la flamme ;
/// 2. à son arrivée la flamme S'ALLUME : elle grossit en vacillant et des
///    mèches montent d'elle ;
/// 3. une fois la flamme prise (`valueRelease`), le compte du jour monte.
/// La flamme ne quitte jamais sa place.
///
/// Tout se rend en TRANSFORMATIONS et en OPACITÉ (aucune mise en page) : le
/// rejeu à chaque envoi ne coûte que la composition.
nonisolated enum HeaderFlameOrbit {
    /// Fin du tour de la lueur : la flamme s'allume.
    static let orbitShare: CGFloat = 0.45
    /// Fin de l'embrasement.
    static let ignitionEnd: CGFloat = 0.8
    /// L'instant où le compte du jour prend sa nouvelle valeur.
    static let valueRelease: CGFloat = 0.82
    static let peakScale: CGFloat = 1.6
    /// Longueur maximale de la traîne, en fraction du cercle.
    static let maxGlowLength: CGFloat = 0.32
    static let duration: Double = 2.0
    static let tongueCount = 3

    /// Le vacillement d'une flamme qui brûle : étirement vertical et inclinaison.
    struct Burn: Equatable {
        let scaleY: CGFloat
        let degrees: Double

        static let still = Burn(scaleY: 1, degrees: 0)
    }

    /// Une mèche : sa montée (`0 → 1`) et son opacité.
    struct Tongue: Equatable {
        let rise: CGFloat
        let opacity: Double
    }

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

    /// La flamme baisse dès que la lueur part, et se rallume à son arrivée.
    static func flameOpacity(at progress: CGFloat) -> Double {
        let phase = clamped(progress)
        guard phase < orbitShare else { return 1 }
        let dim = min(phase / orbitShare / 0.3, 1)
        return 1 - 0.65 * Double(dim * dim * (3 - 2 * dim))
    }

    static func flameScale(at progress: CGFloat) -> CGFloat {
        guard let burning = ignition(at: progress) else { return 1 }
        return 1 + (peakScale - 1) * sin(burning * .pi)
    }

    static func burn(at progress: CGFloat) -> Burn {
        guard let burning = ignition(at: progress) else { return .still }
        let envelope = sin(burning * .pi)
        return Burn(scaleY: 1 + 0.18 * sin(burning * 7 * .pi) * envelope,
                    degrees: Double(6 * sin(burning * 9 * .pi) * envelope))
    }

    static func tongue(_ index: Int, at progress: CGFloat) -> Tongue {
        let start = orbitShare + CGFloat(index) * 0.07
        let local = (clamped(progress) - start) / 0.22
        guard local > 0, local < 1 else { return Tongue(rise: 0, opacity: 0) }
        return Tongue(rise: local, opacity: Double(sin(local * .pi)))
    }

    /// La part de l'embrasement écoulée (`0 → 1`), `nil` hors de l'embrasement.
    private static func ignition(at progress: CGFloat) -> CGFloat? {
        let phase = clamped(progress)
        guard phase > orbitShare, phase < ignitionEnd else { return nil }
        return (phase - orbitShare) / (ignitionEnd - orbitShare)
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

/// La flamme seule, sans capsule : elle baisse pendant le tour de la lueur,
/// puis s'allume — grossit en vacillant, des mèches montent d'elle.
private struct HeaderFlameBurner: View, Animatable {
    var phase: CGFloat
    let animates: Bool

    var animatableData: CGFloat {
        get { phase }
        set { phase = newValue }
    }

    private static let tongueOffsets: [CGFloat] = [-3, 3, 0]

    var body: some View {
        let progress = animates ? phase : 1
        let burn = HeaderFlameOrbit.burn(at: progress)
        let scale = HeaderFlameOrbit.flameScale(at: progress)
        flame(size: MeeshyIconSize.xs)
            .overlay(alignment: .top) {
                ZStack {
                    ForEach(0..<HeaderFlameOrbit.tongueCount, id: \.self) { index in
                        let tongue = HeaderFlameOrbit.tongue(index, at: progress)
                        flame(size: MeeshyIconSize.xs)
                            .scaleEffect(0.38 * (1 - 0.4 * tongue.rise), anchor: .bottom)
                            .offset(x: Self.tongueOffsets[index % Self.tongueOffsets.count],
                                    y: -6 - tongue.rise * 10)
                            .opacity(tongue.opacity)
                    }
                }
            }
            .scaleEffect(x: scale, y: scale * burn.scaleY, anchor: .bottom)
            .rotationEffect(.degrees(burn.degrees), anchor: .bottom)
            .opacity(animates ? HeaderFlameOrbit.flameOpacity(at: progress) : 1)
            .shadow(color: MeeshyColors.error.opacity(scale > 1 ? 0.7 : 0), radius: 4)
            .accessibilityHidden(true)
    }

    private func flame(size: CGFloat) -> some View {
        Image(systemName: "flame.fill")
            .font(MeeshyFont.relative(size, weight: .bold))
            .foregroundStyle(
                LinearGradient(colors: [.yellow, MeeshyColors.warning, MeeshyColors.error],
                               startPoint: .top, endPoint: .bottom)
            )
    }
}

/// La flamme du jour, immobile : le même dégradé que celle qui brûle sous
/// l'avatar, pour la pastille de l'en-tête déplié (#9044).
struct HeaderFlameGlyph: View, Equatable {
    var size: CGFloat = MeeshyIconSize.xs

    var body: some View {
        Image(systemName: "flame.fill")
            .font(MeeshyFont.relative(size, weight: .bold))
            .foregroundStyle(
                LinearGradient(colors: [.yellow, MeeshyColors.warning, MeeshyColors.error],
                               startPoint: .top, endPoint: .bottom)
            )
            .accessibilityHidden(true)
    }
}

/// Le compte du jour, sans fond : chiffres ROUGES cerclés de 1 pt blanc, en
/// clair comme en sombre (directive porteur 2026-10-01).
/// Feuille `Equatable` ; le chiffre défile vers sa nouvelle valeur.
struct HeaderFlameCount: View, Equatable {
    let text: String

    private static let outline: [CGSize] = stride(from: 0, to: 360, by: 30).map { degrees in
        let radians = Double(degrees) * .pi / 180
        return CGSize(width: cos(radians), height: sin(radians))
    }

    var body: some View {
        ZStack {
            ForEach(Self.outline.indices, id: \.self) { index in
                digits.foregroundColor(.white).offset(Self.outline[index])
            }
            digits.foregroundColor(MeeshyColors.error)
        }
        .padding(1)
        .animation(.spring(response: 0.4, dampingFraction: 0.7), value: text)
        .accessibilityHidden(true)
    }

    private var digits: some View {
        Text(verbatim: text)
            .font(MeeshyFont.relative(MeeshyFont.microSize, weight: .heavy, design: .rounded).monospacedDigit())
            .contentTransition(.numericText())
            .lineLimit(1)
            .fixedSize()
    }
}

/// Pose la flamme du jour JUSTE SOUS le cercle de l'avatar, sans le toucher,
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
    /// Les points du jour d'AVANT l'envoi, tenus jusqu'à ce que la flamme se soit allumée.
    @State private var heldPoints: Int?
    /// Le rejeu en cours : un envoi qui en relance un autre reprend la main.
    @State private var replayCount = 0

    private static let gapUnderAvatar: CGFloat = 4

    func body(content: Content) -> some View {
        let snapshot = store.displayed(for: conversationId, seed: seed, at: Date())
        let isShown = HeaderFlameVisibility.isShown(headerExpanded: headerExpanded, dismissed: dismissed,
                                                    hasEngagement: HeaderFlameVisibility.hasRunningStreak(snapshot))
        let shown = isShown ? snapshot : nil
        return content
            .overlay {
                if shown != nil && isPlaying {
                    HeaderFlameGlow(phase: phase, diameter: avatarDiameter + 8, reduceMotion: reduceMotion)
                }
            }
            .overlay(alignment: .bottom) {
                // Une ancre de hauteur nulle au BAS de l'avatar : la flamme y
                // pend par le haut, donc toujours sous le cercle, sans le
                // toucher. Un `alignmentGuide` posé sur le bouton était ignoré
                // par l'overlay — la flamme recouvrait le bas du cercle.
                if let shown {
                    Color.clear
                        .frame(width: 0, height: 0)
                        .overlay(alignment: .top) {
                            flameButton(shown)
                                .fixedSize()
                                .padding(.top, Self.gapUnderAvatar)
                        }
                        .transition(.scale(scale: 0.4).combined(with: .opacity))
                }
            }
            .animation(.spring(response: 0.35, dampingFraction: 0.75), value: shown != nil)
            .task(id: seed) { store.seed(seed) }
            .onReceive(HeaderFlameReplay.sent.receive(on: DispatchQueue.main)) { sentIn in
                guard sentIn == conversationId, let shown else { return }
                replay(holding: shown.todayPoints)
            }
    }

    private func flameButton(_ shown: ConversationEngagementSnapshot) -> some View {
        Button(action: onDismiss) {
            HStack(alignment: .center, spacing: 2) {
                HeaderFlameBurner(phase: phase, animates: isPlaying && !reduceMotion)
                HeaderFlameCount(text: "\(shown.streakDays) ·")
                HeaderFlameCount(text: CompactCountLabel.text(heldPoints ?? shown.todayPoints))
                    .equatable()
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(ConversationEngagementPill.accessibilityText(for: shown))
        .accessibilityHint(String(
            localized: "conversation.header.flame.hint",
            defaultValue: "Masque la flamme jusqu'au prochain dépliement de l'en-tête",
            bundle: .main
        ))
        .accessibilityIdentifier("conversation.header.flame")
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
