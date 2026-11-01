import Foundation

/// **Le clavier matériel du compositeur** (#13839, L6, spec iOS § 2.5).
///
/// Échap referme ce qui est ouvert, du plus proche au plus large : la feuille, puis le viseur (comme « Revenir à la
/// scène »), puis l'outil (dessin, frappe), puis la sélection. Au repos seulement, il demande la fermeture du compositeur, qui passe par la confirmation d'un brouillon
/// non vide. Retour valide le OK des feuilles ; Tab parcourt les rails, des boutons ordinaires.
nonisolated enum ComposerHardwareKeys {

    enum Escape: Equatable, Sendable {
        case closeSheet
        case leaveViewfinder
        case endTool
        case deselect
        case close
    }

    static func escape(sheetIsOpen: Bool, cameraIsArmed: Bool, toolIsOpen: Bool, objectIsSelected: Bool) -> Escape {
        if sheetIsOpen { return .closeSheet }
        if cameraIsArmed { return .leaveViewfinder }
        if toolIsOpen { return .endTool }
        if objectIsSelected { return .deselect }
        return .close
    }
}

/// Ce que le ⌘ maintenu affiche du raccourci.
nonisolated enum ComposerHardwareKeysCopy {
    static var escape: String {
        String(localized: "composer.keys.escape", defaultValue: "Fermer ou désélectionner", bundle: .main)
    }
}
