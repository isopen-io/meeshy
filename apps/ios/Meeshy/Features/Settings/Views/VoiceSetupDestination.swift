import Foundation
import MeeshySDK

/// **Un indicateur de consentement vocal mène à la configuration de la voix** (#16418).
///
/// Ce qui manque, vu d'un indicateur : la voix elle-même (consentement vocal,
/// traduction, clonage) ou la seule transcription. La passerelle le dit par le
/// code de son refus ; une note de bulle ne connaît que « la voix ».
enum VoiceSetupGap: Equatable {
    case voice
    case transcription

    /// Le code d'un refus de la passerelle (`AttachmentConsentError.code`) :
    /// seul `AUDIO_TRANSCRIPTION_NOT_ENABLED` désigne la transcription.
    init(consentCode: String?) {
        self = consentCode == "AUDIO_TRANSCRIPTION_NOT_ENABLED" ? .transcription : .voice
    }
}

/// Ce que l'appareil sait SANS réseau : les consentements que la passerelle a
/// confirmés et la préférence de transcription.
struct VoiceSetupState: Equatable {
    var voiceConsentGranted: Bool
    var transcriptionEnabled: Bool

    @MainActor
    static func current(_ prefs: UserPreferencesManager = .shared) -> VoiceSetupState {
        VoiceSetupState(
            voiceConsentGranted: prefs.voiceConsentGranted,
            transcriptionEnabled: prefs.audio.transcriptionEnabled
        )
    }
}

/// LA loi de destination, unique pour tous les indicateurs.
///
/// - Sans consentement vocal, aucun profil ne peut exister : l'assistant, qui
///   recueille le consentement, ouvre directement, que le manque soit la voix
///   ou la transcription (le consentement vient d'abord).
/// - Consentement donné et transcription manquante : la section Transcription.
/// - Sinon : la gestion du profil, qui ouvre l'assistant si elle n'en trouve aucun.
enum VoiceSetupDestination: Hashable, Identifiable {
    case manageProfile
    case createProfile
    case transcription

    var id: Self { self }

    static func resolve(_ gap: VoiceSetupGap, state: VoiceSetupState) -> VoiceSetupDestination {
        guard state.voiceConsentGranted else { return .createProfile }
        return gap == .transcription ? .transcription : .manageProfile
    }

    var settingsFocus: SettingsFocus {
        switch self {
        case .manageProfile: return .voiceProfile
        case .createProfile: return .voiceProfileCreation
        case .transcription: return .transcription
        }
    }
}

/// Le geste d'un indicateur : résoudre la destination, la désigner aux
/// Réglages, puis les ouvrir.
enum VoiceSetupLauncher {
    @MainActor
    static func open(
        _ gap: VoiceSetupGap,
        state: VoiceSetupState? = nil,
        focus: SettingsFocusRequest = .shared,
        openSettings: () -> Void
    ) {
        let destination = VoiceSetupDestination.resolve(gap, state: state ?? .current())
        focus.request(destination.settingsFocus)
        openSettings()
    }
}
