/// **Quelle VUE le meuble monte** — la règle qui distingue les quatre contextes
/// (#4070, planche § tâche 4.3).
///
/// ## Pourquoi elle est séparée de `ComposerSurfaceRouting`
///
/// `ComposerSurfaceRouting.surface(opening:format:)` est une fonction **PURE de
/// ce que la porte a décidé et du format COURANT** — sa doc le dit, et c'est
/// une propriété qu'on veut garder : elle rend le routage éprouvable sans
/// aucun état.
///
/// Elle ne lit plus aucun état depuis #13864 : la scène était « incrustée »
/// dans un document qui pouvait ne pas en avoir, et naissait d'un fond choisi
/// ou d'un média posé. Le document est parti ; la surface suffit à dire la vue.
nonisolated enum ComposerMountedView: Equatable, CaseIterable {

    /// L'atelier du SDK — story et réel, la scène plein écran.
    case atelier

    /// **La scène** (`ComposerSceneSurface`) — story, post et réel, quelle que soit la porte.
    case scene

    /// Le mood : dix emojis, 122 caractères, aucune pièce.
    case mood

    /// **La surface `.document` monte TOUJOURS la scène** (#13864, R1). Elle
    /// montait l'écran document tant que rien n'était posé sur un post : ouvert
    /// depuis le fil, un post vide n'avait ni scène, ni rails, et « Story » au
    /// chevron n'y changeait rien. La story, le post et le réel se composent
    /// désormais dans la même vue, quelle que soit la porte ; seule l'humeur
    /// garde la sienne. Ce qui reste juste de la restauration du 2026-09-02 —
    /// les rails à gauche pour ce qu'on POSE, à droite pour la PUBLICATION — est
    /// précisément ce que la scène porte.
    static func mounted(surface: ComposerSurfaceKind) -> ComposerMountedView {
        switch surface {
        case .scene:    return .atelier
        case .mood:     return .mood
        case .document: return .scene
        }
    }
}
