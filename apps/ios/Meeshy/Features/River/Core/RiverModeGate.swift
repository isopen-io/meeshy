import Foundation

/// Sélectionnabilité de la peau Rivière — R-133.
///
/// « Le mode n'est SÉLECTIONNABLE que quand `resolveCapabilities` l'ouvre »
/// (workshop §7/§7bis/§7ter, ligne R-133). `resolveCapabilities`
/// (`ReadingModeOrchestrator`, GELÉ) fait DÉJÀ toute la loi : `.river`
/// n'entre dans `availableModes` que si `isRiverFlagEnabled &&
/// riverEligible` (≥ 5 participants actifs, jamais `direct`). Ce fichier
/// n'ajoute AUCUNE règle — il nomme la question que la peau se pose,
/// exactement comme `capabilities.availableModes.contains(mode)` ailleurs
/// dans `LentilleModeMenuModel.build` : une seconde loi d'éligibilité
/// réécrite ici serait un bug de contrat.
///
/// `riviereMode` (`LentilleFeatureFlag`) vaut OFF en l'absence de tout choix
/// et suit la bascule « Activer les bêta » sinon (2026-08-21).
/// `ConversationView.init` le câble dans son propre `resolveCapabilities` et
/// monte `RiverConversationHost` derrière `mode == .river` dans le même
/// fichier (chantier Rivière iOS, lot 1) : la porte s'ouvre par la LOI —
/// drapeau ET éligibilité —, jamais par un gate applicatif qui pourrait être
/// contourné.
nonisolated public enum RiverModeGate {

    /// `true` UNIQUEMENT si `.river` figure dans le catalogue rendu par la
    /// loi — jamais un second calcul de seuil.
    public static func isSelectable(capabilities: ReadingModeOrchestrator.ReadingModeCapabilities) -> Bool {
        capabilities.availableModes.contains(.river)
    }
}
