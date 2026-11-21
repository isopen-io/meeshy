import AudioToolbox
import Foundation
import MeeshySDK
import MeeshyUI

/// Le temps d'une prise de parole (#19732) : depuis quand la voix part, et pour combien de temps au plus.
nonisolated struct TalkieTalkWindow: Equatable {
    let startedAt: Date
    let maxDuration: TimeInterval
}

/// Une prise de parole close et son issue (`nil` : la voix est partie). L'identifiant distingue deux issues pareilles.
nonisolated struct TalkieSettled: Equatable {
    let id: Int
    let outcome: TalkieSendOutcome?
}

/// Le décompte des trente secondes : un anneau qui se vide, des secondes arrondies au-dessus (la dernière se lit « 1 »),
/// et quelques paliers seulement dits à VoiceOver.
nonisolated enum TalkieCountdown {
    static let milestones: Set<Int> = [20, 10, 5]

    static func remaining(_ window: TalkieTalkWindow, at now: Date) -> TimeInterval {
        let elapsed = max(0, now.timeIntervalSince(window.startedAt))
        return max(0, window.maxDuration - elapsed)
    }

    static func fraction(_ window: TalkieTalkWindow, at now: Date) -> Double {
        guard window.maxDuration > 0 else { return 0 }
        return remaining(window, at: now) / window.maxDuration
    }

    static func seconds(_ window: TalkieTalkWindow, at now: Date) -> Int {
        Int(remaining(window, at: now).rounded(.up))
    }

    static func announces(_ seconds: Int) -> Bool {
        milestones.contains(seconds)
    }
}

/// Ce qui débloque un refus, quand quelque chose le débloque.
nonisolated enum TalkieUnblock: Equatable {
    case openSettings
}

/// Ce qu'une prise de parole close laisse sur la carte : envoyée (relâchée ou arrêtée à la limite, que le décompte a
/// montrée), partie en message vocal, ou refusée — et le refus se dit, il ne fait plus disparaître la carte.
nonisolated enum TalkieAftermath: Equatable {
    case sent
    case sentAsVoice
    case refused(TalkieSendOutcome)

    static func of(_ outcome: TalkieSendOutcome?) -> TalkieAftermath {
        switch outcome {
        case nil, .limit?: .sent
        case .voice?: .sentAsVoice
        case let refusal?: .refused(refusal)
        }
    }

    /// « Envoyé » s'efface vite ; un refus reste jusqu'au prochain appui.
    var fadesAfter: TimeInterval? {
        switch self {
        case .sent, .sentAsVoice: 1.6
        case .refused: nil
        }
    }

    /// Le bouton réessaie pour tout refus, sauf quand le cercle ne l'ouvre plus : rien ne débloquerait l'appui.
    var keepsHoldButton: Bool {
        self != .refused(.notAllowed)
    }

    var unblock: TalkieUnblock? {
        self == .refused(.micDenied) ? .openSettings : nil
    }
}

/// La ligne unique de la carte : la phase tant que la voix vit, l'issue de la dernière prise de parole au repos.
nonisolated enum TalkieCardLine: Equatable {
    case hold
    case connecting
    case talking
    case waking
    case recordingCopy
    case aftermath(TalkieAftermath)

    static func resolve(phase: TalkieSender.Phase, waking: Bool, aftermath: TalkieAftermath?) -> TalkieCardLine {
        switch phase {
        case .starting: return .connecting
        case .talking: return waking ? .waking : .talking
        case .recordingCopy: return .recordingCopy
        case .idle: return aftermath.map(TalkieCardLine.aftermath) ?? .hold
        }
    }
}

nonisolated enum TalkieHaptic: Equatable {
    case success
    case warning
    case attention
}

/// Deux sons système courts et doux, coupés par le mode silencieux du téléphone.
nonisolated enum TalkieSound: Equatable {
    case sent
    case incoming

    var systemSoundID: UInt32 {
        switch self {
        case .sent: 1004
        case .incoming: 1003
        }
    }
}

nonisolated struct TalkieCue: Equatable {
    let haptic: TalkieHaptic?
    let sound: TalkieSound?
}

/// Le retour au toucher et à l'oreille : une voix partie vibre « réussi » et sonne ; un refus vibre sans bruit ; une
/// voix reçue vibre, et sonne seulement si Meeshy n'est pas réglé en silence.
nonisolated enum TalkieCueLaw {
    static func afterRelease(_ aftermath: TalkieAftermath) -> TalkieCue {
        switch aftermath {
        case .sent, .sentAsVoice: TalkieCue(haptic: .success, sound: .sent)
        case .refused: TalkieCue(haptic: .warning, sound: nil)
        }
    }

    static func incoming(vibrationEnabled: Bool, soundEnabled: Bool) -> TalkieCue {
        TalkieCue(haptic: vibrationEnabled ? .attention : nil, sound: soundEnabled ? .incoming : nil)
    }
}

/// Joue un retour ; le seul endroit qui touche au moteur haptique et aux sons système.
enum TalkieCuePlayer {
    static func play(_ cue: TalkieCue) {
        switch cue.haptic {
        case .success?: HapticFeedback.success()
        case .warning?: HapticFeedback.warning()
        case .attention?: HapticFeedback.heavy()
        case nil: break
        }
        guard let sound = cue.sound else { return }
        AudioServicesPlaySystemSound(SystemSoundID(sound.systemSoundID))
    }

    static func incoming(preferences: UserPreferencesManager = .shared) {
        let notification = preferences.notification
        play(TalkieCueLaw.incoming(vibrationEnabled: notification.vibrationEnabled, soundEnabled: notification.soundEnabled))
    }
}
