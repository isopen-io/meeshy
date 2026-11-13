import Foundation

/// La phrase que VoiceOver lit sur la puce de durée d'un appel VIDÉO — le seul
/// endroit du chrome vidéo qui dit l'état de l'appel. Elle porte tout ce que
/// l'écran montre : signal, micro coupé du correspondant (#8787, même
/// vocabulaire que la disposition audio), réseau du contact, reconnexion.
enum CallVideoBadgeAccessibility {
    static func label(
        title: String? = nil,
        participants: Int? = nil,
        includesDuration: Bool = true,
        signalDegraded: String?,
        peerMuted: Bool,
        peerNetworkWeak: Bool,
        reconnecting: Bool
    ) -> String {
        let parts: [String?] = [
            title,
            participants.map { String(localized: "calls.detail.participants", defaultValue: "Participants", bundle: .main) + " \($0)" },
            includesDuration ? String(localized: "call.duration.a11y.label") : nil,
            signalDegraded,
            peerMuted ? String(localized: "call.status.peer.muted", defaultValue: "Contact en sourdine", bundle: .main) : nil,
            peerNetworkWeak ? String(localized: "call.status.peer.network", defaultValue: "Réseau faible (contact)", bundle: .main) : nil,
            reconnecting ? String(localized: "call.reconnecting", defaultValue: "Reconnexion…", bundle: .main) : nil,
        ]
        return parts.compactMap { $0 }.joined(separator: ", ")
    }
}
