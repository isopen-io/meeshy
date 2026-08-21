import XCTest
@testable import Meeshy

/// Témoin de structure — R-133 livrait « l'écran n'existe pas drapeau OFF,
/// aucun modificateur monté » ; **R-135 recalibre en CONSCIENCE, sans
/// affaiblir** (discipline à deux positions : deux états, chacun prouvé par
/// son propre témoin, jamais un seul gardien qui s'efface).
///
/// **Position A — le MENU ne grise plus Rivière en dur (R-135, livré).**
/// `LentilleModeMenuModel.build` dérive désormais `isDisabled` pour Rivière
/// EXACTEMENT comme pour Focal/Script/Résumé
/// (`capabilities.availableModes.contains(mode)`) sur les DEUX surfaces de
/// liste (encoche `LentilleFocusCard`, sous-menu contextuel
/// `LentilleReadingModeSubmenu` — l'aperçu `LentillePeekView` est supprimé
/// depuis le 2026-08-21 ;
/// `LentilleReadingModeContext.capabilitiesInput` lit désormais
/// `LentilleFeatureFlag.isRiviereModeEnabled`). Voir `ModeMenuModelTests`
/// pour le comportement complet (grisée drapeau OFF, dégrisée drapeau ON +
/// éligible, grisée sous seuil, grisée en `direct`).
///
/// **Position B — l'ÉCRAN reste NON MONTÉ (inchangé).** `RiverStreamHost`
/// (l'hôte qui PEINT réellement les couloirs) n'a toujours AUCUN site de
/// montage : ni `ConversationView.swift` (dont le propre appel à
/// `resolveCapabilities`, dans son `init`, ne passe TOUJOURS PAS
/// `isRiverFlagEnabled` — re-vérifié par
/// `test_conversationView_stillDoesNotWireTheRiverFlag` ci-dessous), ni
/// aucun autre fichier du dépôt. Recalibrer le menu ne mène PAS,
/// mécaniquement, à monter l'écran : ce sont deux fichiers différents
/// (`LentilleReadingModeContext` pour la liste, `ConversationView` pour le
/// fil ouvert), et seul le premier a été touché par R-135. Une sélection
/// « Rivière » reste donc CLAMPÉE (`clamped-unavailable`,
/// `resolveOrchestratorDecision` rend `.focal`, que le clamp du RETRAIT
/// FOCAL iOS 2026-08-18 rabat sur `.script`) dès l'ouverture d'une conversation — la
/// loi documente elle-même ce cas : « un choix collant `riviere` mémorisé
/// avant l'extinction du drapeau Rivière rendrait un mode que personne ne
/// sait dessiner ». Monter `RiverStreamHost` (calculer une
/// `RiverLaneResolver.RiverGeometry` + un `[RiverBubbleContent]` depuis
/// `ConversationViewModel.messages`, brancher `RiverNavigationController`)
/// est un chantier de conteneur à part entière — hors périmètre « mux
/// menus » de R-135, réservé à un futur lot, documenté dans le rapport R-135.
///
/// Ce témoin verrouille les DEUX positions : si un futur lot monte
/// effectivement l'écran ET/OU rebranche `isRiverFlagEnabled` dans
/// `ConversationView`, il doit AUSSI mettre à jour/retirer la partie
/// concernée de cette suite — jamais la laisser rougir en silence en
/// croyant à une régression.
final class RiverScreenNotMountedTests: XCTestCase {

    private static var meeshyRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Riviere
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy")
    }

    /// Tout `.swift` sous `Meeshy/`, HORS `Features/Main/Riviere/` (le
    /// producteur légitime) — découvert, jamais recopié.
    private func nonRiviereSwiftFiles() throws -> [URL] {
        var results: [URL] = []
        let riviereRoot = Self.meeshyRoot.appendingPathComponent("Features/Main/Riviere")
        guard let enumerator = FileManager.default.enumerator(
            at: Self.meeshyRoot,
            includingPropertiesForKeys: [.isDirectoryKey],
            options: [.skipsHiddenFiles]
        ) else {
            XCTFail("Impossible d'énumérer \(Self.meeshyRoot.path)")
            return []
        }
        for case let url as URL in enumerator {
            if url.path.hasPrefix(riviereRoot.path) {
                enumerator.skipDescendants()
                continue
            }
            if url.pathExtension == "swift" {
                results.append(url)
            }
        }
        return results
    }

    func test_guardDiscoversFiles_neverSilentlyEmpty() throws {
        let files = try nonRiviereSwiftFiles()
        XCTAssertFalse(files.isEmpty, "Aucun fichier .swift découvert hors Riviere/ — vérifier le chemin de scan.")
    }

    /// `RiverStreamHost` — l'hôte de l'écran — n'apparaît NULLE PART hors de
    /// `Riviere/` : aucun call site ne le monte encore.
    func test_riverStreamHost_isReferencedNowhereOutsideRiviere() throws {
        for url in try nonRiviereSwiftFiles() {
            guard let code = try? String(contentsOf: url, encoding: .utf8) else { continue }
            XCTAssertFalse(
                code.contains("RiverStreamHost"),
                "\(url.lastPathComponent) référence `RiverStreamHost` — l'écran Rivière ne doit " +
                "être monté nulle part par ce lot (R-133 livre la peau, pas son point d'entrée " +
                "dans l'app — R-135). Si ce fichier est le nouveau site de montage légitime, " +
                "mettre à jour ce témoin en le documentant plutôt que de le supprimer."
            )
        }
    }

    /// Position A (R-135, livré) — le menu ne grise plus Rivière avec un
    /// booléen en dur : `isDisabled` est TOUJOURS un calcul (ternaire ou
    /// `if`/`else` sur `capabilities`), jamais un `isDisabled = true` posé
    /// hors de toute condition. Remplace `..._stillHardcodesRiviereAsAlways
    /// Disabled` (R-133/V3) : ce lot est précisément celui qui devait faire
    /// rougir cet ancien témoin — le voici mis à jour en conscience, pas
    /// supprimé.
    func test_modeMenu_noLongerHardcodesRiviereDisabled_derivesFromCapabilitiesLikeEveryEntry() throws {
        let url = Self.meeshyRoot.appendingPathComponent("Features/Main/Lentille/Mode/LentilleModeMenu.swift")
        let code = try String(contentsOf: url, encoding: .utf8)

        XCTAssertFalse(
            code.contains("isDisabled = true"),
            "`LentilleModeMenu.swift` grise encore une entrée avec un booléen EN DUR — R-135 " +
            "a retiré le dernier de ces cas (Rivière) ; toute réapparition doit dériver de " +
            "`capabilities.availableModes`, jamais d'un littéral."
        )
        XCTAssertTrue(
            code.contains("capabilities.availableModes.contains(mode)"),
            "Rivière doit suivre EXACTEMENT le même chemin que Focal/Script/Résumé — même " +
            "garde que `ModeMenuModelTests.test_modeMenu_delegatesEligibilityToTheFrozenMirror`."
        )
    }

    /// Position B (inchangée) — `ConversationView.init` ne câble TOUJOURS PAS
    /// `isRiverFlagEnabled` dans son propre appel à `resolveCapabilities` :
    /// c'est ce non-câblage, précisément, qui garde `RiverStreamHost`
    /// injoignable même si un développeur active `riviere_mode` ET dégrise
    /// une entrée de liste — la préférence collante `riviere` finirait
    /// CLAMPÉE (`clamped-unavailable`) à l'ouverture du fil, jamais rendue.
    /// Si un futur lot câble ce paramètre ICI, il DOIT dans le même commit
    /// monter `RiverStreamHost` (ou un hôte équivalent) — sinon la sélection
    /// deviendrait une promesse silencieusement rompue (Rivière choisie,
    /// bulles rendues).
    /// Chantier Rivière iOS, lot 1 (2026-08-21) — POSITION B LEVÉE : le drapeau
    /// `riviere_mode` est câblé dans `resolveCapabilities` ET un hôte de rendu
    /// (`RiverConversationHost`) est monté dans le MÊME fichier, derrière
    /// `mode == .river` — exactement l'exigence que l'ancienne garde énonçait.
    func test_conversationView_wiresTheRiverFlag_andMountsTheRiverHost_together() throws {
        let url = Self.meeshyRoot.appendingPathComponent("Features/Main/Views/ConversationView.swift")
        let raw = try String(contentsOf: url, encoding: .utf8)
        let code = AppSourceGuard.stripComments(raw)
            .components(separatedBy: .whitespacesAndNewlines).filter { !$0.isEmpty }.joined(separator: " ")

        XCTAssertTrue(
            code.contains("isFlagEnabled: isFlagEnabled, isRiverFlagEnabled: LentilleFeatureFlag.isRiviereModeEnabled, conversationType:"),
            "`ConversationView.init` câble `isRiverFlagEnabled` depuis le drapeau `riviere_mode` — la " +
            "sélection de Rivière à l'ouverture du fil suit désormais le drapeau ET l'éligibilité."
        )
        XCTAssertTrue(
            code.contains("if readingModeController.mode == .river { AnyView(RiverConversationHost("),
            "Un hôte de rendu est monté derrière `mode == .river` — jamais une sélection sans écran."
        )
        XCTAssertEqual(
            code.components(separatedBy: "RiverConversationHost(").count - 1, 1,
            "UN seul site de montage de l'hôte Rivière dans le fil."
        )
    }

    /// Le point d'entrée vit dans `Riviere/` (`RiverConversationHost`) : `RiverStreamHost`
    /// (la peau) reste référencé NULLE PART en dehors du dossier — le fil ne connaît
    /// que l'hôte de conversation, qui injecte le texte Prisme et possède la navigation.
    func test_theOnlyDoorIntoTheRiver_isTheConversationHost() throws {
        let hits = try nonRiviereSwiftFiles().filter { url in
            (try? String(contentsOf: url, encoding: .utf8))?.contains("RiverConversationHost(") == true
        }
        XCTAssertEqual(hits.map(\.lastPathComponent), ["ConversationView.swift"],
                       "Le fil est l'unique site hors `Riviere/` qui monte l'hôte de conversation.")
    }
}
