import SwiftUI
import MeeshySDK
import MeeshyUI

/// « Maintenir pour parler » sur la fiche d'un Proche ou d'un Sang (#16927, iso `user-profile-talkie.tsx`) : on
/// MAINTIENT, on parle, on relâche — la voix sort chez l'autre sans qu'il ait à décrocher (D-4). Sur la face Actions,
/// c'est la carte « Talkie » de la planche `Autre-Actions` (#19433), épurée par #19732 : l'étiquette et son (i), le
/// bouton, UNE ligne.
///
/// - Présent dès Proche (`ProfileCircleViewModel.offersTalkie`) : la décision se prend avant l'affichage. La passerelle
///   rejuge à chaque appui ; un refus ne fait plus disparaître la carte, il se dit sur sa ligne (`TalkieAftermath`).
/// - Pendant la parole, un anneau se vide et les secondes restantes s'affichent ; VoiceOver en dit quelques paliers.
/// - Au relâchement, « Envoyé » s'affiche un instant, avec la vibration et le son de `TalkieHoldModifier`.
/// - Un micro refusé propose « Ouvrir les réglages » ; tout autre refus laisse le bouton, qui réessaie.
struct ProfileTalkieRow: View {
    @StateObject private var sender: TalkieSender
    let userId: String
    let displayName: String
    var tint: Color = MeeshyColors.brandPrimary
    @State private var holding = false
    @State private var shown: TalkieSettled?
    @State private var remainingSeconds: Int?
    @ScaledMetric(relativeTo: .title) private var holdDiameter: CGFloat = MeeshyControlSize.tapTarget * 1.5
    @Environment(\.openURL) private var openURL
    private var theme: ThemeManager { ThemeManager.shared }

    init(userId: String, displayName: String, tint: Color = MeeshyColors.brandPrimary) {
        _sender = StateObject(wrappedValue: TalkieSender())
        self.userId = userId
        self.displayName = displayName
        self.tint = tint
    }

    private var aftermath: TalkieAftermath? { shown.map { TalkieAftermath.of($0.outcome) } }

    private var line: TalkieCardLine {
        TalkieCardLine.resolve(phase: sender.phase, waking: sender.waking, aftermath: aftermath)
    }

    var body: some View {
        card
            .padding(.bottom, MeeshySpacing.xxl)
            .adaptiveOnChange(of: sender.lastSettled) { _, settled in
                guard let settled else { return }
                shown = settled
                let said = ProfileTalkieWording.text(for: .aftermath(TalkieAftermath.of(settled.outcome)), name: displayName)
                UIAccessibility.post(notification: .announcement, argument: said)
            }
            .adaptiveOnChange(of: holding) { _, pressed in
                guard pressed else { return }
                shown = nil
            }
            .task(id: shown) { await fade(shown) }
            .task(id: sender.talkWindow) { await countDown(sender.talkWindow) }
    }

    private var card: some View {
        VStack(spacing: MeeshySpacing.md) {
            MeeshyBadge(.label(ProfileTalkieWording.tag), leading: .systemImage("dot.radiowaves.left.and.right"),
                        kind: .accent, tint: tint, size: .s28)
                .frame(maxWidth: .infinity)
                .overlay(alignment: .trailing) { TalkieInfoButton(tint: tint) }
            if aftermath?.keepsHoldButton != false {
                holdButton
                    .padding(.vertical, MeeshySpacing.sm)
            }
            Text(ProfileTalkieWording.text(for: line, name: displayName))
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                .foregroundStyle(lineColor)
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
                .contentTransition(.opacity)
                .accessibilityIdentifier("talkie.line")
            if aftermath?.unblock == .openSettings {
                MeeshyButton(ProfileTalkieWording.openSettings, kind: .tinted, size: .s44, tint: tint) {
                    guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
                    openURL(url)
                }
                .accessibilityIdentifier("talkie.openSettings")
            }
        }
        .padding(MeeshySpacing.lg)
        .frame(maxWidth: .infinity)
        .meeshyAnimation(.easeOut(duration: 0.2), reduced: nil, value: line)
        .meeshyGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.xxl), tone: .theme, tint: tint)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("talkie.card")
    }

    private var lineColor: Color {
        switch line {
        case .aftermath(.sent), .aftermath(.sentAsVoice): tint
        case .aftermath(.refused): theme.textSecondary
        default: theme.textPrimary
        }
    }

    /// Le bouton plein : un disque de l'accent, le micro au repos, les secondes restantes pendant la parole, la coche
    /// une fois la voix partie. Un anneau fin l'entoure : il respire au repos, il se vide pendant la parole.
    private var holdButton: some View {
        let live = holding || sender.isActive
        return glyph(live: live)
            .foregroundStyle(MeeshyColors.indigo950)
            .frame(width: holdDiameter, height: holdDiameter)
            .background(Circle().fill(tint))
            .scaleEffect(live ? TalkieHoldHalo.pressedScale : 1)
            .background(ring(live: live))
            .contentShape(Circle())
            .modifier(TalkieHoldModifier(sender: sender, userId: userId, pressed: $holding))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(ProfileTalkieWording.holdA11y(name: displayName))
            .accessibilityValue(live ? spokenValue : "")
            .accessibilityHint(ProfileTalkieWording.holdHint)
            .accessibilityAddTraits([.isButton, .updatesFrequently])
            .accessibilityIdentifier("talkie.send")
    }

    @ViewBuilder
    private func glyph(live: Bool) -> some View {
        if live, let remainingSeconds {
            Text(remainingSeconds, format: .number)
                .font(MeeshyFont.relative(MeeshyFont.title3Size, weight: .bold))
                .monospacedDigit()
                .contentTransition(.numericText(countsDown: true))
        } else {
            Image(systemName: live ? "waveform" : (aftermath?.fadesAfter != nil ? "checkmark" : "mic.fill"))
                .font(MeeshyFont.relative(MeeshyIconSize.xl, weight: .bold))
                .contentTransition(.opacity)
        }
    }

    @ViewBuilder
    private func ring(live: Bool) -> some View {
        if live, let window = sender.talkWindow {
            TalkieCountdownRing(window: window, diameter: holdDiameter * TalkieHoldHalo.rings[0], tint: tint)
        } else {
            TalkieHoldHalo(diameter: holdDiameter, tint: tint, isLive: live)
        }
    }

    private var spokenValue: String {
        let text = ProfileTalkieWording.text(for: line, name: displayName)
        guard let remainingSeconds else { return text }
        return "\(text), \(ProfileTalkieWording.remaining(seconds: remainingSeconds))"
    }

    /// « Envoyé » s'efface de lui-même ; un refus attend le prochain appui.
    private func fade(_ settled: TalkieSettled?) async {
        guard let settled, let delay = TalkieAftermath.of(settled.outcome).fadesAfter else { return }
        do {
            try await Task.sleep(for: .seconds(delay))
        } catch {
            return
        }
        guard shown == settled else { return }
        shown = nil
    }

    /// Les secondes restantes, relues quatre fois par seconde ; quelques paliers sont dits à VoiceOver.
    private func countDown(_ window: TalkieTalkWindow?) async {
        guard let window else {
            remainingSeconds = nil
            return
        }
        while !Task.isCancelled {
            let seconds = TalkieCountdown.seconds(window, at: Date())
            if seconds != remainingSeconds {
                remainingSeconds = seconds
                if TalkieCountdown.announces(seconds) {
                    UIAccessibility.post(notification: .announcement, argument: ProfileTalkieWording.remaining(seconds: seconds))
                }
            }
            guard seconds > 0 else { return }
            do {
                try await Task.sleep(for: .milliseconds(250))
            } catch {
                return
            }
        }
    }
}

/// L'anneau du décompte : plein à l'ouverture, vide à la limite. Sous « Réduire les animations », il avance par
/// secondes au lieu de glisser.
struct TalkieCountdownRing: View {
    let window: TalkieTalkWindow
    let diameter: CGFloat
    let tint: Color

    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var userForcedReduceMotion

    var body: some View {
        let reduce = MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: userForcedReduceMotion)
        TimelineView(.periodic(from: window.startedAt, by: reduce ? 1 : 1.0 / 30)) { context in
            ZStack {
                Circle()
                    .stroke(tint.opacity(MeeshyOpacity.light), lineWidth: MeeshyBorder.strong)
                Circle()
                    .trim(from: 0, to: TalkieCountdown.fraction(window, at: context.date))
                    .stroke(tint, style: StrokeStyle(lineWidth: MeeshyBorder.strong, lineCap: .round))
                    .rotationEffect(.degrees(-90))
            }
            .frame(width: diameter, height: diameter)
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// Le halo du bouton talkie : un anneau fin, juste autour du disque, qui respire lentement au repos (#19732 : un seul,
/// sans débord démesuré). Sous « Réduire les animations », il reste posé, immobile. Décoratif, il ne reçoit pas le doigt.
struct TalkieHoldHalo: View {
    static let pressedScale: CGFloat = 0.94
    /// Le rayon du halo, en multiples du bouton.
    static let rings: [CGFloat] = [1.22]

    let diameter: CGFloat
    let tint: Color
    let isLive: Bool

    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var userForcedReduceMotion

    var body: some View {
        let reduce = MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: userForcedReduceMotion)
        TimelineView(.animation(minimumInterval: nil, paused: reduce)) { context in
            let phase = reduce ? 0 : Self.phase(at: context.date, isLive: isLive)
            ZStack {
                ForEach(Array(Self.rings.enumerated()), id: \.offset) { index, ring in
                    Circle()
                        .stroke(tint.opacity(Self.opacity(ring: index, phase: phase, isLive: isLive)),
                                lineWidth: MeeshyBorder.strong)
                        .frame(width: diameter * ring, height: diameter * ring)
                        .scaleEffect(1 + Self.breath(ring: index, phase: phase, isLive: isLive))
                }
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    /// Une respiration de trois secondes au repos, d'une seconde pendant la prise de parole.
    static func phase(at date: Date, isLive: Bool) -> Double {
        let period = isLive ? 1.0 : 3.0
        return date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: period) / period
    }

    static func breath(ring: Int, phase: Double, isLive: Bool) -> CGFloat {
        let amplitude = isLive ? 0.08 : 0.04
        let shifted = phase + Double(ring) * 0.25
        return CGFloat(amplitude * sin(shifted * 2 * .pi))
    }

    static func opacity(ring: Int, phase: Double, isLive: Bool) -> Double {
        let base = isLive ? 0.55 : 0.35
        let fade = Double(ring) * 0.15
        return max(0.1, base - fade + 0.1 * sin((phase + Double(ring) * 0.25) * 2 * .pi))
    }
}

/// Les phrases du talkie émis, une clé par sens, au tutoiement du profil (sept langues dans `Localizable.xcstrings`).
/// L'explication vit derrière le (i) (`TalkieInfoWording`) ; la carte n'a qu'une ligne.
enum ProfileTalkieWording {
    static var hold: String { String(localized: "talkie.send.hold", defaultValue: "Maintenir pour parler", bundle: .main) }

    static var tag: String { String(localized: "talkie.card.tag", defaultValue: "Talkie", bundle: .main) }

    static var sent: String { String(localized: "talkie.card.sent", defaultValue: "Envoyé", bundle: .main) }

    static var sentAsVoice: String {
        String(localized: "talkie.card.sentAsVoice", defaultValue: "Parti en message vocal", bundle: .main)
    }

    static var openSettings: String {
        String(localized: "talkie.card.openSettings", defaultValue: "Ouvrir les réglages", bundle: .main)
    }

    /// « Encore 10 secondes » : la durée se dit dans la langue de l'appareil, accord compris.
    static func remaining(seconds: Int) -> String {
        let duration = MediaFormat.duration(seconds, style: .spoken)
        return String(format: String(localized: "talkie.card.remaining", defaultValue: "Encore %@", bundle: .main), duration)
    }

    /// La ligne unique de la carte.
    static func text(for line: TalkieCardLine, name: String) -> String {
        switch line {
        case .hold: hold
        case .connecting: connecting
        case .talking: talking(name: name)
        case .waking: waking(name: name)
        case .recordingCopy: recordingCopy
        case .aftermath(.sent): sent
        case .aftermath(.sentAsVoice): sentAsVoice
        case .aftermath(.refused(let outcome)): notice(outcome)
        }
    }

    static func holdA11y(name: String) -> String {
        String(format: String(localized: "talkie.send.hold.a11y", defaultValue: "Maintenir pour parler à %@", bundle: .main), name)
    }

    static var holdHint: String {
        String(localized: "talkie.send.hold.hint", defaultValue: "Touche deux fois et maintiens, parle, puis relâche.", bundle: .main)
    }

    static var connecting: String { String(localized: "talkie.send.connecting", defaultValue: "Connexion…", bundle: .main) }

    static func talking(name: String) -> String {
        String(format: String(localized: "talkie.send.talking", defaultValue: "Tu parles à %@…", bundle: .main), name)
    }

    static func waking(name: String) -> String {
        String(format: String(localized: "talkie.send.waking", defaultValue: "Réveil de %@…", bundle: .main), name)
    }

    static var recordingCopy: String {
        String(localized: "talkie.send.recordingCopy", defaultValue: "Enregistrement du message vocal…", bundle: .main)
    }

    /// Une issue qui n'est pas une erreur : le repli fait partir la voix en message vocal (#17141).
    static func isInformation(_ outcome: TalkieSendOutcome) -> Bool {
        outcome == .voice
    }

    /// Dit l'issue : une information neutre pour le repli, une erreur pour le reste.
    @MainActor
    static func present(_ outcome: TalkieSendOutcome, toasts: FeedbackToastManager = .shared) {
        guard isInformation(outcome) else {
            toasts.showError(notice(outcome))
            return
        }
        toasts.show(notice(outcome), type: .info)
    }

    static func notice(_ outcome: TalkieSendOutcome) -> String {
        switch outcome {
        case .voice:
            String(localized: "talkie.header.announce.recorded", defaultValue: "Le talkie ne passe pas : ta voix part en message vocal", bundle: .main)
        case .notAllowed:
            String(localized: "talkie.send.notClose", defaultValue: "Le talkie ne s’ouvre qu’entre proches.", bundle: .main)
        case .e2ee:
            String(localized: "talkie.send.e2ee", defaultValue: "Pas de talkie dans une conversation chiffrée : il ne l’est pas de bout en bout.", bundle: .main)
        case .rateLimited:
            String(localized: "talkie.send.rateLimited", defaultValue: "Trop de prises de parole : réessaie dans un instant.", bundle: .main)
        case .offline:
            String(localized: "talkie.send.offline", defaultValue: "Hors ligne : le talkie n’a pas pu partir.", bundle: .main)
        case .failed:
            String(localized: "talkie.send.failed", defaultValue: "Le talkie n’a pas pu partir.", bundle: .main)
        case .micDenied:
            String(localized: "talkie.send.micDenied", defaultValue: "Autorise le micro pour parler en talkie.", bundle: .main)
        case .limit:
            String(localized: "talkie.send.limit", defaultValue: "Trente secondes au plus : la prise de parole s’est arrêtée.", bundle: .main)
        }
    }
}
