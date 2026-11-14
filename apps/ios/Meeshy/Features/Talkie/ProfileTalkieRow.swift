import SwiftUI
import MeeshySDK
import MeeshyUI

/// « Maintenir pour parler » sur la fiche d'un Proche ou d'un Sang (#16927, iso `user-profile-talkie.tsx`) : on
/// MAINTIENT, on parle, on relâche — la voix sort chez l'autre sans qu'il ait à décrocher (D-4).
///
/// - Présent dès Proche (`ProfileCircleViewModel.offersTalkie`) ; la passerelle rejuge à chaque appui et un
///   `TALKIE_NOT_ALLOWED` retire la ligne, ni grisée ni expliquée.
/// - Relâcher, glisser hors du doigt ou quitter la fiche termine la prise de parole.
/// - Les refus se disent sans fuite : un blocage et un repli rendent la même INFORMATION, jamais en rouge — la voix part
///   en message vocal dans la conversation la plus récente (#17141).
/// - Un destinataire hors ligne se réveille : « Réveil de X… » ; le (i) dit l'usage d'urgence.
struct ProfileTalkieRow: View {
    @StateObject private var sender: TalkieSender
    let userId: String
    let displayName: String
    @State private var holding = false
    @State private var withdrawn = false
    private var theme: ThemeManager { ThemeManager.shared }

    init(userId: String, displayName: String) {
        _sender = StateObject(wrappedValue: TalkieSender())
        self.userId = userId
        self.displayName = displayName
    }

    var body: some View {
        Group {
            if withdrawn {
                Color.clear.frame(height: 0)
            } else {
                VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                    Text(ProfileTalkieWording.explain(name: displayName))
                        .font(.footnote)
                        .foregroundStyle(theme.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                    HStack(spacing: MeeshySpacing.xs) {
                        holdButton
                        TalkieInfoButton()
                    }
                }
                .padding(MeeshySpacing.md)
                .background(MeeshyColors.brandPrimary.opacity(MeeshyOpacity.subtle))
                .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.smPlus))
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

    private var label: String {
        switch sender.phase {
        case .idle: ProfileTalkieWording.hold
        case .starting: ProfileTalkieWording.connecting
        case .talking where sender.waking: ProfileTalkieWording.waking(name: displayName)
        case .talking: ProfileTalkieWording.talking(name: displayName)
        case .recordingCopy: ProfileTalkieWording.recordingCopy
        }
    }

    private var holdButton: some View {
        let live = holding || sender.isActive
        return HStack(spacing: MeeshySpacing.sm) {
            Image(systemName: live ? "waveform" : "mic.fill")
                .accessibilityHidden(true)
            Text(label)
        }
        .font(.subheadline.weight(.bold))
        .foregroundStyle(live ? Color.white : MeeshyColors.brandPrimary)
        .frame(maxWidth: .infinity, minHeight: MeeshyControlSize.tapTarget)
        .background(
            Capsule().fill(live ? MeeshyColors.brandPrimary : Color.clear)
        )
        .overlay(Capsule().stroke(MeeshyColors.brandPrimary, lineWidth: 1.5))
        .contentShape(Capsule())
        .modifier(TalkieHoldModifier(sender: sender, userId: userId, pressed: $holding))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(ProfileTalkieWording.holdA11y(name: displayName))
        .accessibilityValue(live ? label : "")
        .accessibilityHint(ProfileTalkieWording.holdHint)
        .accessibilityAddTraits([.isButton, .updatesFrequently])
        .accessibilityIdentifier("talkie.send")
    }
}

/// Les phrases du talkie émis, une clé par sens (sept langues dans `Localizable.xcstrings`, adoptées du catalogue web).
enum ProfileTalkieWording {
    static func explain(name: String) -> String {
        String(format: String(localized: "talkie.send.explain", defaultValue: "Maintenez et parlez : votre voix sort directement chez %@, sans décrocher.", bundle: .main), name)
    }

    static var hold: String { String(localized: "talkie.send.hold", defaultValue: "Maintenir pour parler", bundle: .main) }

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
            String(
                localized: "talkie.send.voiceCopy",
                defaultValue: "L’utilisateur n’est pas disponible pour un accès d’urgence. Un message sera créé et envoyé dans votre conversation la plus récente avec lui.",
                bundle: .main
            )
        case .notAllowed:
            String(localized: "talkie.send.voice", defaultValue: "Ne passe pas : envoyé en message vocal.", bundle: .main)
        case .e2ee:
            String(localized: "talkie.send.e2ee", defaultValue: "Indisponible dans une conversation chiffrée.", bundle: .main)
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
