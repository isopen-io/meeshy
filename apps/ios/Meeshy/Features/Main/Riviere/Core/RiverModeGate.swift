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
/// `riviereMode` (`LentilleFeatureFlag`) reste défaut OFF ET non câblé dans
/// `isRiverFlagEnabled` par aucun site de montage à ce jour (R-135 : le
/// dégrisage du menu, hors périmètre de ce lot) — la porte reste donc fermée
/// PAR CONSTRUCTION, pas par un gate applicatif qui pourrait être contourné.
nonisolated public enum RiverModeGate {

    /// `true` UNIQUEMENT si `.river` figure dans le catalogue rendu par la
    /// loi — jamais un second calcul de seuil.
    public static func isSelectable(capabilities: ReadingModeOrchestrator.ReadingModeCapabilities) -> Bool {
        capabilities.availableModes.contains(.river)
    }
}
