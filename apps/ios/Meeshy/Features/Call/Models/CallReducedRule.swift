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
}
