import AVFoundation
import Foundation

/// LE SYMBOLE D'UN BOUTON DU TALKIE, le même sur la fiche, l'en-tête et le micro du bandeau reçu (#20579) : il dit à
/// chaque instant ce que devient ma voix — on se connecte, elle part en direct, elle réveille un destinataire hors
/// ligne, elle s'enregistre en message vocal, elle est partie. Seul le REPOS garde le symbole propre à la surface
/// (le micro de la fiche et du bandeau, l'antenne de l'en-tête, qui la distingue de l'appel posé à côté).
nonisolated enum TalkieHoldGlyph: Equatable, Sendable {
    case rest
    /// Au repos, le téléphone du destinataire injoignable : le geste laisse un message vocal (#20241).
    case leaveVoice
    case connecting
    case live
    case waking
    case recording
    case sent

    static func resolve(phase: TalkieSender.Phase, waking: Bool, aftermath: TalkieAftermath?,
                        delivery: TalkieDelivery) -> TalkieHoldGlyph {
        switch phase {
        case .starting: return .connecting
        case .talking: return waking ? .waking : .live
        case .recordingCopy: return .recording
        case .idle: return resting(aftermath: aftermath, delivery: delivery)
        }
    }

    private static func resting(aftermath: TalkieAftermath?, delivery: TalkieDelivery) -> TalkieHoldGlyph {
        if let aftermath, aftermath.fadesAfter != nil { return .sent }
        return delivery == .voiceMessage ? .leaveVoice : .rest
    }

    /// `rest` : le symbole de repos de la surface.
    func symbol(rest: String) -> String {
        switch self {
        case .rest: rest
        case .leaveVoice, .recording: "envelope.fill"
        case .connecting: "antenna.radiowaves.left.and.right"
        case .live: "waveform"
        case .waking: "bell.and.waves.left.and.right"
        case .sent: "checkmark"
        }
    }
}

/// Ce que l'en-tête et le bandeau — qui n'ont pas de ligne de texte — disent en bandeau neutre quand le sort de ma voix
/// change pendant qu'elle part (#20579) : le réveil d'un destinataire hors ligne, et le repli en message vocal dès qu'il
/// commence, plutôt qu'une fois la voix partie. Un message vocal CHOISI (#20241) ne s'annonce pas : le geste le disait.
nonisolated enum TalkieLiveNotice: Equatable, Sendable {
    case waking
    case fallback

    static func on(previous: TalkieHeaderDelivery?, current: TalkieHeaderDelivery?,
                   delivery: TalkieDelivery) -> TalkieLiveNotice? {
        guard let current, current != previous else { return nil }
        switch current {
        case .relayed: return .waking
        case .recorded: return delivery == .live ? .fallback : nil
        case .live: return nil
        }
    }

    @MainActor
    func text(name: String) -> String {
        switch self {
        case .waking: ProfileTalkieWording.waking(name: name)
        case .fallback: ProfileTalkieWording.notice(.voice)
        }
    }
}

extension TalkieVoiceHostLaw {
    /// Le sens dont l'orbe d'un bouton du talkie montre la voix (#20579) : MA voix tant qu'elle part — celle du pair,
    /// qui peut parler en même temps, vit alors dans le spectre du bandeau reçu — ; sinon la sienne ; sinon rien.
    static func orbDirection(userId: String, voices: Set<TalkieVoiceKey>) -> TalkieVoiceDirection? {
        if voices.contains(TalkieVoiceKey(userId: userId, direction: .outgoing)) { return .outgoing }
        return incoming(userId: userId, voices: voices) ? .incoming : nil
    }
}

/// Le micro du talkie et une voix reçue qui SONNE en même temps (#20579, parler et recevoir à la fois).
///
/// - Le mode du micro se choisit par la SORTIE, jamais par l'ordre des voix : qu'elle arrive avant ou après l'ouverture
///   du micro, une voix reçue trouve la même session. Sur une sortie personnelle (écouteurs, casque, Bluetooth), le
///   micro n'entend pas la voix reçue : mode `.default`, sans traitement de la voix qui l'éteindrait. Sur le haut-parleur
///   ou l'écouteur de l'iPhone, il l'entendrait : mode `.voiceChat`, pour son annulation d'écho.
/// - Sur ces sorties-là, la voix reçue se tait tant que mon micro est ouvert, sans quoi il la renverrait à son
///   expéditeur ; son spectre continue de se voir. Elle se réentend dès que le micro se ferme (#20583 mesurera s'il
///   peut en être autrement).
/// - Le micro qui s'arrête pendant qu'elle sonne ne rend pas la session sous elle, et ne la passe pas en lecture de
///   contenu (`.playback` ignorerait le bouton silencieux) : la session redevient celle de la voix
///   (`RecordingSessionHandBack.returnToInterruptingVoice` — `.soloAmbient` quand rien d'autre ne joue), elle
///   n'appartient plus au micro, et c'est la voix, à sa fin, qui la rend.
nonisolated enum TalkieMicSessionLaw {
    private static let acousticPorts: Set<AVAudioSession.Port> = [.builtInSpeaker, .builtInReceiver]

    /// Une sortie que le micro de l'iPhone entend.
    static func acoustic(_ outputs: [AVAudioSession.Port]) -> Bool {
        !outputs.isEmpty && outputs.allSatisfy(acousticPorts.contains)
    }

    static func alongsidePlayback(outputs: [AVAudioSession.Port]) -> Bool {
        !acoustic(outputs)
    }

    static func incomingAudible(micOpen: Bool, outputs: [AVAudioSession.Port]) -> Bool {
        !micOpen || !acoustic(outputs)
    }

    static func micOpen(_ voices: Set<TalkieVoiceKey>) -> Bool {
        voices.contains { $0.direction == .outgoing }
    }

    static func alongsideIncoming(_ voices: Set<TalkieVoiceKey>) -> Bool {
        voices.contains { $0.direction == .incoming }
    }
}

extension TalkieBannerLaw {
    /// Celui à qui le bandeau répond pendant que je maintiens « Parler », ou après : on répond à la voix qui sonne, et le
    /// bandeau reste tant que ma réponse part. Répondre ne COUPE pas la voix reçue (#20579) : avec des écouteurs on
    /// s'entend à deux ; sur le haut-parleur, elle se tait le temps que mon micro est ouvert (`TalkieMicSessionLaw`).
    static func replyingTo(pressed: Bool, live: TalkieSpeaker?, current: TalkieSpeaker?, sending: Bool) -> TalkieSpeaker? {
        guard pressed else { return sending ? current : nil }
        return live ?? current
    }
}
