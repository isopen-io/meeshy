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

/// Le micro du talkie et une voix reçue qui SONNE en même temps (#20579, parler et recevoir à la fois) : la session se
/// pose pour que la voix reçue reste audible (le traitement de la voix d'un appel l'éteindrait), et le micro qui
/// s'arrête ne rend pas la session sous elle — c'est la voix, à sa fin, qui la rend.
nonisolated enum TalkieMicSessionLaw {
    static func alongsideIncoming(_ voices: Set<TalkieVoiceKey>) -> Bool {
        voices.contains { $0.direction == .incoming }
    }

    static func handsBackSession(_ voices: Set<TalkieVoiceKey>) -> Bool {
        !alongsideIncoming(voices)
    }
}

extension TalkieBannerLaw {
    /// Celui à qui le bandeau répond pendant que je maintiens « Parler », ou après : on répond à la voix qui sonne, et le
    /// bandeau reste tant que ma réponse part. Répondre ne fait PAS taire la voix reçue (#20579) : on s'entend à deux.
    static func replyingTo(pressed: Bool, live: TalkieSpeaker?, current: TalkieSpeaker?, sending: Bool) -> TalkieSpeaker? {
        guard pressed else { return sending ? current : nil }
        return live ?? current
    }
}
