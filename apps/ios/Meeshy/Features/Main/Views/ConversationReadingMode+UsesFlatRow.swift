import MeeshySDK
import MeeshyUI

/// §3.1 du contrat Focal — le miroir GELÉ `ReadingModeOrchestrator.
/// ConversationReadingMode` (`typealias ConversationReadingMode`, F-080,
/// `Focal/Preferences/ReadingModePreferenceStore.swift`) n'a que ses 5 cas
/// bruts, sans la computed property `usesFlatRow` que le contrat §3.1
/// documente sur le type top-level qui n'a jamais atterri (RE-PREUVE
/// F-080/F-083). Ajoutée ICI (fichier propriété WS-6, F-085) plutôt que
/// dans le Core figé — un simple regroupement de cas, aucune loi, aucune
/// constante numérique (garde R15). RETRAIT FOCAL iOS (2026-08-18) :
/// `usesPerspective` est parti avec le pass — `usesFlatRow` reste (Script).
extension ConversationReadingMode {
    /// `.script` et `.focal` rendent la MÊME rangée plate uniforme ; Focal y
    /// ajoute la perspective minimale au défilement (`FocalScrollPerspective`,
    /// 2026-08-21 — transform + opacity CALayer, zéro relayout).
    var usesFlatRow: Bool { self == .focal || self == .script }
}
