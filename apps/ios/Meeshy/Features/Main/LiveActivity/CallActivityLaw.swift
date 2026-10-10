import Foundation

/// **Quand la Live Activity d'appel s'ouvre, ce qu'elle montre et quand elle
/// se ferme** (#9782).
///
/// La loi est PURE — l'état de l'appel entre, une action sort — pour que
/// « quand ouvrir, quand fermer, quel sous-titre montrer » se joue sans
/// ActivityKit (`CallActivityLawTests`). `CallLiveActivityCoordinator` n'en
/// fait que l'exécution, depuis `CallManager`, seule source de l'état d'appel.
///
/// Trois règles qui ne se lisent pas dans le code d'exécution :
/// - **un appel ENTRANT qui sonne n'ouvre rien** : l'écran d'appel de CallKit
///   le porte déjà, plein écran ; l'activité naît au décroché ;
/// - **pas de doublon avec CallKit** : quand le système affiche déjà l'appel
///   (pastille verte et sa durée), le compact de l'îlot ne répète pas la
///   durée — il montre le micro et la traduction, ce que CallKit ne sait pas ;
/// - **un sous-titre ne quitte l'appareil vers l'écran verrouillé que s'il est
///   SÛR** : un appel chiffré de bout en bout n'en montre aucun tant que la
///   traduction n'est pas faite sur l'appareil, et un chiffrement INCONNU
///   compte comme un chiffrement (fail-closed).
enum CallActivityLaw {

    enum CallPhase: Equatable, Sendable {
        case idle
        case ringing(isOutgoing: Bool)
        case connecting
        case connected
        case reconnecting
        case ended
    }

    /// Une phrase sous-titrée telle que l'écran d'appel la sert déjà au
    /// lecteur (traduction quand elle existe, `CallCaptionLine`).
    struct Caption: Equatable, Sendable {
        var speaker: String
        var text: String
        var languageTag: String?
        var isFinal: Bool
        var isTranslatedOnDevice: Bool
    }

    struct Input: Equatable, Sendable {
        var phase: CallPhase
        var title: String
        var accentHex: String
        var isVideo: Bool
        var isMuted: Bool
        var isOnHold: Bool
        var connectedSince: Date?
        var systemShowsCall: Bool
        /// `nil` tant que la conversation n'est pas résolue.
        var isEndToEndEncrypted: Bool?
        var captionsActive: Bool
        var caption: Caption?
    }

    struct Wording {
        let ringing: String
        let connecting: String
        let audioCall: String
        let videoCall: String
        let onHold: String
        let reconnecting: String
        let ended: String
    }

    enum Action: Equatable, Sendable {
        case none
        case start(CallActivitySnapshot)
        case update(CallActivitySnapshot)
        case end(CallActivitySnapshot)
    }

    struct Step: Equatable, Sendable {
        let running: CallActivitySnapshot?
        let action: Action
    }

    static let captionLimit = 140

    static func step(running: CallActivitySnapshot?, input: Input, wording: Wording) -> Step {
        guard let snapshot = snapshot(for: input, wording: wording) else {
            guard let running else { return Step(running: nil, action: .none) }
            return Step(running: nil, action: .end(ended(running, wording: wording)))
        }
        guard let running else { return Step(running: snapshot, action: .start(snapshot)) }
        return Step(running: snapshot, action: running == snapshot ? .none : .update(snapshot))
    }

    static func snapshot(for input: Input, wording: Wording) -> CallActivitySnapshot? {
        guard let phase = activityPhase(input) else { return nil }
        return CallActivitySnapshot(
            phase: phase,
            title: input.title,
            statusLabel: statusLabel(phase, isVideo: input.isVideo, wording: wording),
            initials: initials(of: input.title),
            accentHex: input.accentHex,
            isVideo: input.isVideo,
            isMuted: input.isMuted,
            connectedSince: input.connectedSince,
            showsDurationInCompact: !input.systemShowsCall,
            caption: servedCaption(input)
        )
    }

    /// Le sous-titre qui a le droit de partir vers l'îlot et l'écran
    /// verrouillé : sous-titres actifs, phrase FINALE (une révision partielle
    /// se remplace en quelques centaines de millisecondes), et jamais celle
    /// d'un appel chiffré que l'appareil n'a pas traduit lui-même.
    static func servedCaption(_ input: Input) -> CallActivitySnapshot.Caption? {
        guard input.captionsActive, let caption = input.caption, caption.isFinal else { return nil }
        let isEncrypted = input.isEndToEndEncrypted ?? true
        guard !isEncrypted || caption.isTranslatedOnDevice else { return nil }
        let text = caption.text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return nil }
        return CallActivitySnapshot.Caption(
            speaker: caption.speaker,
            text: clipped(text),
            languageTag: caption.languageTag
        )
    }

    /// Initiales d'un nom (« Alice Martin » → « AM »), une lettre pour un nom
    /// simple, rien pour un nom vide.
    static func initials(of name: String) -> String {
        name.split(whereSeparator: \.isWhitespace)
            .prefix(2)
            .compactMap(\.first)
            .map { String($0).uppercased() }
            .joined()
    }

    private static func activityPhase(_ input: Input) -> CallActivitySnapshot.Phase? {
        switch input.phase {
        case .idle, .ended, .ringing(isOutgoing: false):
            return nil
        case .ringing(isOutgoing: true):
            return .ringing
        case .connecting:
            return .connecting
        case .connected:
            return input.isOnHold ? .onHold : .connected
        case .reconnecting:
            return .reconnecting
        }
    }

    private static func statusLabel(
        _ phase: CallActivitySnapshot.Phase,
        isVideo: Bool,
        wording: Wording
    ) -> String {
        switch phase {
        case .ringing: return wording.ringing
        case .connecting: return wording.connecting
        case .connected: return isVideo ? wording.videoCall : wording.audioCall
        case .onHold: return wording.onHold
        case .reconnecting: return wording.reconnecting
        case .ended: return wording.ended
        }
    }

    private static func ended(_ running: CallActivitySnapshot, wording: Wording) -> CallActivitySnapshot {
        var final = running
        final.phase = .ended
        final.statusLabel = wording.ended
        final.caption = nil
        return final
    }

    private static func clipped(_ text: String) -> String {
        guard text.count > captionLimit else { return text }
        return "…" + String(text.suffix(captionLimit - 1))
    }
}
