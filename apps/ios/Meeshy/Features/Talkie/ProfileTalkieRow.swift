import SwiftUI
import MeeshySDK
import MeeshyUI

/// « Maintenir pour parler » sur la fiche d'un Proche ou d'un Sang (#16927, iso `user-profile-talkie.tsx`) : on
/// MAINTIENT, on parle, on relâche — la voix sort chez l'autre sans qu'il ait à décrocher (D-4). Sur la face Actions,
/// c'est la carte « Talkie » de la planche `Autre-Actions` (#19433) : l'étiquette, le gros bouton rond, « Maintenir
/// pour parler · Ta voix part en direct », puis la phrase qui dit ce qu'il est et son (i).
///
/// - Présent dès Proche (`ProfileCircleViewModel.offersTalkie`) ; la passerelle rejuge à chaque appui et un
///   `TALKIE_NOT_ALLOWED` retire la carte, ni grisée ni expliquée.
/// - Relâcher, glisser hors du doigt ou quitter la fiche termine la prise de parole.
/// - Les refus se disent sans fuite : un blocage et un repli rendent la même INFORMATION, jamais en rouge — la voix part
///   en message vocal dans la conversation la plus récente (#17141).
/// - Un destinataire hors ligne se réveille : « Réveil de X… » ; le (i) dit l'usage d'urgence.
struct ProfileTalkieRow: View {
    @StateObject private var sender: TalkieSender
    let userId: String
    let displayName: String
    var tint: Color = MeeshyColors.brandPrimary
    @State private var holding = false
    @State private var withdrawn = false
    @ScaledMetric(relativeTo: .title) private var holdDiameter: CGFloat = MeeshyControlSize.tapTarget * 2
    private var theme: ThemeManager { ThemeManager.shared }

    init(userId: String, displayName: String, tint: Color = MeeshyColors.brandPrimary) {
        _sender = StateObject(wrappedValue: TalkieSender())
        self.userId = userId
        self.displayName = displayName
        self.tint = tint
    }

    var body: some View {
        Group {
            if withdrawn {
                Color.clear.frame(height: 0)
            } else {
                card.padding(.bottom, MeeshySpacing.xxl)
            }
        }
        .adaptiveOnChange(of: sender.notice) { _, new in
            guard let new else { return }
            sender.notice = nil
            guard new != .notAllowed else {
                withdrawn = true
                return
            }
            ProfileTalkieWording.present(new)
        }
    }

    /// La carte de la planche `Autre-Actions` : l'étiquette TALKIE centrée, le (i) dans l'angle, le gros bouton plein
    /// entouré de ses halos qui respirent, « Maintenir pour parler · Ta voix part en direct », puis la phrase qui dit ce
    /// qu'il est.
    private var card: some View {
        VStack(spacing: MeeshySpacing.lg) {
            MeeshyBadge(.label(ProfileTalkieWording.tag), leading: .systemImage("dot.radiowaves.left.and.right"),
                        kind: .accent, tint: tint, size: .s28)
                .frame(maxWidth: .infinity)
                .overlay(alignment: .trailing) { TalkieInfoButton(tint: tint) }
            holdButton
                .padding(.vertical, MeeshySpacing.xxl)
            VStack(spacing: MeeshySpacing.xs) {
                Text(label)
                    .font(MeeshyFont.relative(MeeshyFont.title3Size, weight: .bold))
                    .foregroundStyle(theme.textPrimary)
                    .contentTransition(.opacity)
                Text(ProfileTalkieWording.live)
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                    .foregroundStyle(tint)
            }
            .multilineTextAlignment(.center)
            .accessibilityHidden(true)
            Text(ProfileTalkieWording.explain(name: displayName))
                .font(.footnote)
                .foregroundStyle(theme.textSecondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(MeeshySpacing.lg)
        .frame(maxWidth: .infinity)
        .background(
            RadialGradient(colors: [tint.opacity(MeeshyOpacity.light), .clear], center: .center,
                           startRadius: 0, endRadius: holdDiameter * 2)
                .accessibilityHidden(true)
        )
        .meeshyGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.xxl), tone: .theme, tint: tint)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("talkie.card")
    }

    private var label: String {
        switch sender.phase {
        case .idle: ProfileTalkieWording.hold
        case .starting: ProfileTalkieWording.connecting
        case .talking where sender.waking: ProfileTalkieWording.waking(name: displayName)
        case .talking: ProfileTalkieWording.talking(name: displayName)
        case .recordingCopy: ProfileTalkieWording.recordingCopy
        }
    }

    /// Le bouton plein de la planche : un disque de l'accent, le micro sombre au centre, deux halos concentriques qui
    /// respirent au repos et s'élancent pendant la prise de parole.
    private var holdButton: some View {
        let live = holding || sender.isActive
        return Image(systemName: live ? "waveform" : "mic.fill")
            .font(MeeshyFont.relative(MeeshyIconSize.xxl, weight: .bold))
            .foregroundStyle(MeeshyColors.indigo950)
            .frame(width: holdDiameter, height: holdDiameter)
            .background(Circle().fill(tint))
            .scaleEffect(live ? TalkieHoldHalo.pressedScale : 1)
            .background(TalkieHoldHalo(diameter: holdDiameter, tint: tint, isLive: live))
            .contentShape(Circle())
            .modifier(TalkieHoldModifier(sender: sender, userId: userId, pressed: $holding))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(ProfileTalkieWording.holdA11y(name: displayName))
            .accessibilityValue(live ? label : "")
            .accessibilityHint(ProfileTalkieWording.holdHint)
            .accessibilityAddTraits([.isButton, .updatesFrequently])
            .accessibilityIdentifier("talkie.send")
    }
}

/// Les deux halos du bouton talkie : ils respirent lentement au repos et battent plus vite pendant la prise de parole.
/// Sous « Réduire les animations », ils restent posés, immobiles. Décoratifs, ils ne reçoivent pas le doigt.
struct TalkieHoldHalo: View {
    static let pressedScale: CGFloat = 0.94
    /// Le rayon de chaque halo, en multiples du bouton.
    static let rings: [CGFloat] = [1.32, 1.66]

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

/// Les phrases du talkie émis, une clé par sens (sept langues dans `Localizable.xcstrings`, adoptées du catalogue web).
enum ProfileTalkieWording {
    static func explain(name: String) -> String {
        String(format: String(localized: "talkie.send.explain", defaultValue: "Talkie d’urgence, pour vos très proches : maintenez et parlez, votre voix sort chez %@ sans décrocher.", bundle: .main), name)
    }

    static var hold: String { String(localized: "talkie.send.hold", defaultValue: "Maintenir pour parler", bundle: .main) }

    static var tag: String { String(localized: "talkie.card.tag", defaultValue: "Talkie", bundle: .main) }

    static var live: String { String(localized: "talkie.card.live", defaultValue: "Ta voix part en direct", bundle: .main) }

    static func holdA11y(name: String) -> String {
        String(format: String(localized: "talkie.send.hold.a11y", defaultValue: "Maintenir pour parler à %@", bundle: .main), name)
    }

    static var holdHint: String {
        String(localized: "talkie.send.hold.hint", defaultValue: "Touchez deux fois et maintenez, parlez, puis relâchez.", bundle: .main)
    }

    static var connecting: String { String(localized: "talkie.send.connecting", defaultValue: "Connexion…", bundle: .main) }

    static func talking(name: String) -> String {
        String(format: String(localized: "talkie.send.talking", defaultValue: "Vous parlez à %@…", bundle: .main), name)
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
            String(localized: "talkie.header.announce.recorded", defaultValue: "Le talkie ne passe pas : votre voix part en message vocal", bundle: .main)
        case .notAllowed:
            String(localized: "talkie.send.voice", defaultValue: "Le talkie ne passe pas en ce moment : envoyez plutôt un message vocal.", bundle: .main)
        case .e2ee:
            String(localized: "talkie.send.e2ee", defaultValue: "Pas de talkie dans une conversation chiffrée : il ne l’est pas de bout en bout.", bundle: .main)
        case .rateLimited:
            String(localized: "talkie.send.rateLimited", defaultValue: "Trop de prises de parole : réessayez dans un instant.", bundle: .main)
        case .offline:
            String(localized: "talkie.send.offline", defaultValue: "Hors ligne : le talkie n’a pas pu partir.", bundle: .main)
        case .failed:
            String(localized: "talkie.send.failed", defaultValue: "Le talkie n’a pas pu partir.", bundle: .main)
        case .micDenied:
            String(localized: "talkie.send.micDenied", defaultValue: "Autorisez le micro pour parler en talkie.", bundle: .main)
        case .limit:
            String(localized: "talkie.send.limit", defaultValue: "Trente secondes au plus : la prise de parole s’est arrêtée.", bundle: .main)
        }
    }
}
