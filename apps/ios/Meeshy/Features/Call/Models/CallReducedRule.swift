import Foundation

/// P18 · S1 — ce que l'appel réduit dit de lui : la bulle et la bannière ne font
/// que dessiner le texte que cette loi compose.
nonisolated enum CallReducedRule {
    /// Le nom de la personne (ou du groupe) en tête de l'étiquette : le nom que
    /// j'ai donné à la personne, sinon son nom d'affichage ; en groupe, le nom
    /// du groupe. Mêmes noms que la capsule de l'en-tête (`CallHeaderNames`).
    static func title(givenName: String?, groupName: String?, displayName: String?) -> String? {
        CallFrameTextsRule.meaningful(groupName)
            ?? CallFrameTextsRule.meaningful(givenName)
            ?? CallFrameTextsRule.meaningful(displayName)
    }

    /// « nom · durée » ; sans nom connu, la durée seule.
    static func caption(title: String?, duration: String) -> String {
        guard let title else { return duration }
        return "\(title) · \(duration)"
    }

    /// P18.3 — l'étiquette unique de l'appel réduit, quelle que soit sa forme : « nom ·
    /// durée » une fois l'appel établi ; avant, le nom seul (la phase est un glyphe),
    /// jamais une durée de « 00:00 ».
    static func label(title: String?, duration: String, isConnected: Bool, unknown: String) -> String {
        guard isConnected else { return title ?? unknown }
        return caption(title: title, duration: duration)
    }

    /// P18.2 — la clé de la couleur de l'autre sur l'appel réduit : son identifiant,
    /// sinon son nom, sur la MÊME palette (Android `CallTileRim.peerAvatar`) ; sans l'un
    /// ni l'autre, aucune couleur inventée.
    static func colorKey(peerId: String?, peerName: String?) -> String? {
        CallFrameTextsRule.meaningful(peerId) ?? CallFrameTextsRule.meaningful(peerName)
    }
}
