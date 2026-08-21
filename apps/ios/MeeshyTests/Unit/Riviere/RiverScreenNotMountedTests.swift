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
/// **Position B — l'ÉCRAN EST MONTÉ, et les deux gestes vont ENSEMBLE**
/// (chantier Rivière iOS, lot 1 — 2026-08-21). La version antérieure de
/// cette position affirmait le contraire (« `RiverStreamHost` n'a AUCUN site
/// de montage », « `ConversationView.init` ne câble TOUJOURS PAS
/// `isRiverFlagEnabled` ») et se terminait par une consigne explicite : le
/// lot qui monterait l'écran devrait mettre cette suite à jour EN LA
/// DOCUMENTANT plutôt que de la supprimer. C'est ce qui est fait ici.
///
/// Ce que la position B vérifie désormais, et pourquoi c'est la MÊME
/// exigence, pas une plus faible : le danger qu'elle nommait n'a jamais été
/// « monter l'écran », c'était la DISSOCIATION des deux gestes — un drapeau
/// câblé sans écran (Rivière choisie, bulles rendues : une promesse
/// silencieusement rompue, `clamped-unavailable`), ou un écran monté que
/// rien ne rend joignable. Le témoin exige donc les deux DANS LE MÊME
/// fichier : `ConversationView.init` câble `isRiverFlagEnabled` ET
/// `ConversationView.body` monte `RiverConversationHost` derrière
/// `mode == .river`, en UN seul site. Retirer l'un des deux fait rougir.
///
/// `RiverStreamHost` — la PEAU qui peint les couloirs — reste, lui,
/// référencé nulle part hors de `Riviere/` : le fil ne connaît que la porte
/// (`RiverConversationHost`), jamais la peinture.
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
        // Le TEST porte sur le FAIT (un hôte est monté derrière `mode ==
        // .river`), pas sur son emballage : la forme littérale
        // `{ AnyView(RiverConversationHost(` a vécu un jour, puis le pane a dû
        // être borné à l'écran (`Color.clear.overlay { … }`, sans quoi la
        // largeur de la Rivière poussait l'en-tête du fil hors écran). Épingler
        // l'emballage aurait fait rougir une garde qui n'avait rien à
        // reprocher. On exige donc les deux ancres, dans l'ordre, à courte
        // distance l'une de l'autre.
        let riverBranch = try XCTUnwrap(
            code.range(of: "if readingModeController.mode == .river {"),
            "La branche de montage `mode == .river` a disparu de `ConversationView` — Rivière " +
            "redeviendrait une promesse rompue (choisie au menu, jamais rendue)."
        )
        let windowEnd = code.index(riverBranch.upperBound, offsetBy: 220, limitedBy: code.endIndex) ?? code.endIndex
        XCTAssertTrue(
            code[riverBranch.upperBound..<windowEnd].contains("RiverConversationHost("),
            "La branche `mode == .river` ne monte plus d'hôte de rendu — jamais une sélection " +
            "sans écran."
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
