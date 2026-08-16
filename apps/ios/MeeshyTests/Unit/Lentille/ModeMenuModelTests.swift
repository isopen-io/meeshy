import XCTest
@testable import Meeshy

/// `LentilleModeMenuModel` — le catalogue Auto 🪄 / Focal / Script / Résumé /
/// Rivière (contrat LWS-8/I-072).
///
/// **Suite COMPLÉTÉE par I-073.** I-072 verrouillait ce que la mission
/// nommait explicitement — Rivière grisée + sa raison réelle sur des seuils
/// VIVANTS, et la structure des cinq entrées. **I-073 ajoute** : le témoin
/// (défaut réel documenté, non corrigé — la loi vit dans le miroir gelé
/// `ReadingModeOrchestrator`, hors `Lentille/Mode|Perspective`) qui verrouille
/// qu'une conversation `.direct` reçoit la MÊME formule numérique que
/// n'importe quel groupe sous seuil, plutôt qu'un message dédié.
///
/// **Nommage** — aucun jeton de `FINAL_PHASE_CLASS_PATTERN`
/// (`apps/ios/meeshy.sh:1591`) : `ModeMenuModelTests`, phase 1 (nom repris
/// tel quel du contrat §LWS-8).
final class ModeMenuModelTests: XCTestCase {

    // MARK: - Fabrique

    private func capabilities(
        isAnonymous: Bool = false,
        isFlagEnabled: Bool = true,
        conversationType: ReadingModeOrchestrator.ConversationType = .group,
        activeParticipantCount: Int = 0
    ) -> ReadingModeOrchestrator.ReadingModeCapabilities {
        ReadingModeOrchestrator.resolveCapabilities(
            ReadingModeOrchestrator.ResolveCapabilitiesInput(
                identity: ReadingModeOrchestrator.ReadingModeIdentity(isAnonymous: isAnonymous),
                isFlagEnabled: isFlagEnabled,
                conversationType: conversationType,
                activeParticipantCount: activeParticipantCount
            )
        )
    }

    private func entry(
        _ id: ReadingModeOrchestrator.ReadingModePreference,
        in model: LentilleModeMenuModel
    ) throws -> LentilleModeMenuModel.Entry {
        try XCTUnwrap(model.entries.first { $0.id == id }, "Entrée « \(id) » absente du modèle.")
    }

    // MARK: - 1. Les cinq entrées, toujours, dans l'ordre

    func test_model_alwaysHasExactlyTheFiveEntries_inContractOrder() {
        let model = LentilleModeMenuModel.build(capabilities: capabilities(), currentPreference: .auto)
        XCTAssertEqual(
            model.entries.map(\.id),
            [.auto, .focal, .script, .resume, .riviere],
            "Ordre du contrat, mot pour mot : « Auto 🪄 / Focal / Script / Résumé / Rivière »."
        )
    }

    // MARK: - 2. Rivière — TOUJOURS présente, TOUJOURS grisée (V3)

    /// Critère d'acceptation LWS-8 : « Rivière : entrée toujours présente,
    /// toujours grisée, avec la valeur courante réelle composée dans la
    /// raison ».
    func test_riviere_isAlwaysPresent_andAlwaysDisabled_evenWhenNumericallyEligible() throws {
        // Entrée numériquement ÉLIGIBLE (≥5 actifs, jamais direct) — et
        // pourtant grisée quand même : V3 n'a pas encore le drapeau
        // `riviere_mode` (amendement R, R-133 hors périmètre LWS-8).
        let eligibleCaps = capabilities(conversationType: .group, activeParticipantCount: 12)
        XCTAssertTrue(eligibleCaps.riverEligible, "Prérequis : ces capacités DOIVENT être éligibles.")

        let model = LentilleModeMenuModel.build(capabilities: eligibleCaps, currentPreference: .auto)
        let riviere = try entry(.riviere, in: model)

        XCTAssertTrue(
            riviere.isDisabled,
            "Rivière doit rester grisée en V3 MÊME quand `resolveCapabilities` la juge " +
            "numériquement éligible — le drapeau `riviere_mode` qui la débloquerait " +
            "n'existe pas encore côté iOS."
        )
    }

    /// Discrimination (leçon 266) : sur une conversation INÉLIGIBLE (directe),
    /// Rivière doit AUSSI être grisée — sinon le témoin précédent pourrait
    /// passer par accident (toujours grisée, quelle que soit la cause).
    func test_riviere_isDisabled_onIneligibleConversationsToo() throws {
        let ineligibleCaps = capabilities(conversationType: .direct, activeParticipantCount: 12)
        XCTAssertFalse(ineligibleCaps.riverEligible, "Prérequis : `direct` n'est JAMAIS éligible.")

        let model = LentilleModeMenuModel.build(capabilities: ineligibleCaps, currentPreference: .auto)
        XCTAssertTrue(try entry(.riviere, in: model).isDisabled)
    }

    /// La raison est composée depuis les seuils VIVANTS de
    /// `resolveCapabilities` — jamais un texte statique. Deux comptes
    /// d'actifs différents doivent produire deux raisons DIFFÉRENTES.
    func test_riviere_reason_isComposedFromLiveThresholds_neverAPlaceholder() throws {
        let threeActive = capabilities(conversationType: .group, activeParticipantCount: 3)
        let zeroActive = capabilities(conversationType: .group, activeParticipantCount: 0)

        let modelThree = LentilleModeMenuModel.build(capabilities: threeActive, currentPreference: .auto)
        let modelZero = LentilleModeMenuModel.build(capabilities: zeroActive, currentPreference: .auto)

        let reasonThree = try XCTUnwrap(try entry(.riviere, in: modelThree).disabledReason)
        let reasonZero = try XCTUnwrap(try entry(.riviere, in: modelZero).disabledReason)

        // Valeur attendue composée par le MÊME format que la production
        // (`LentilleModeLabels.riverReason`, clé `lentille.mode.river.reason`),
        // résolu par catalogue au moment du test (même patron que
        // `A11yLabelComposerTests`/`CallsViewModelTests`) — sous la locale
        // `en` du CI il rend l'anglais, plus le repli `defaultValue` français.
        // La langue est donc libre ; ce qui reste verrouillé (leçon 264/266)
        // est que les DEUX nombres vivants (seuil, compte réel) apparaissent
        // dans la chaîne rendue.
        let format = String(
            localized: "lentille.mode.river.reason",
            defaultValue: "s'ouvrira à %d personnes actives — %d aujourd'hui",
            bundle: .main
        )
        let expectedReasonThree = String(format: format, ReadingModeOrchestrator.riverEligibilityThreshold, 3)
        XCTAssertEqual(
            reasonThree,
            expectedReasonThree,
            "Composée depuis le MÊME format que la production, avec le seuil du miroir " +
            "(jamais « 5 » écrit en dur ici) et le compte réel (3)."
        )
        XCTAssertTrue(
            reasonThree.contains("\(ReadingModeOrchestrator.riverEligibilityThreshold)")
                && reasonThree.contains("3"),
            "Les DEUX seuils vivants (le plancher et le compte réel) doivent apparaître " +
            "dans la raison rendue, quelle que soit la langue résolue."
        )
        XCTAssertNotEqual(
            reasonThree, reasonZero,
            "Deux comptes d'actifs différents (3 vs 0) doivent produire deux raisons " +
            "DIFFÉRENTES — sinon la raison serait un texte figé, pas composée depuis les " +
            "seuils vivants (leçon 266 : sans ce témoin, un texte statique passerait le " +
            "précédent au vert)."
        )
    }

    /// I-073 — DÉFAUT RÉEL DOCUMENTÉ, NON CORRIGÉ (hors périmètre LWS-8 :
    /// la loi vit dans le miroir GELÉ `ReadingModeOrchestrator.resolveCapabilities`,
    /// `Focal/Core/`, propriété M-042 — pas `Lentille/Mode/`).
    ///
    /// Ce témoin verrouille le comportement RÉEL d'aujourd'hui plutôt qu'un
    /// oubli : sur une conversation `.direct`, la raison Rivière reste la
    /// MÊME formule numérique que sur un groupe — « s'ouvrira à 5 personnes
    /// actives — N aujourd'hui » — alors que `riverEligible` EXCLUT les
    /// conversations directes STRUCTURELLEMENT
    /// (`conversationType != .direct`), quel que soit `N`. Amener une
    /// conversation directe à 5 participants actifs est de toute façon
    /// impossible (elle n'a que deux), mais le TEXTE promet une porte qui
    /// s'ouvrira "à 5" alors qu'elle ne s'ouvrira JAMAIS pour ce type de
    /// conversation — un texte du type « jamais disponible en conversation
    /// directe » serait honnête là où le comptage ne l'est qu'à moitié.
    /// `resolveCapabilities` (`ReadingModeOrchestrator.swift`) ET son miroir
    /// TypeScript (`packages/shared/utils/reading-modes.ts`) composent la
    /// MÊME `RiverEligibilityReason(threshold:current:)` sans branche sur
    /// `conversationType` — ce n'est donc pas une divergence iOS↔loi
    /// (auquel cas la garde source trivial l'aurait autorisée à corriger),
    /// c'est un trait de la loi PARTAGÉE, gelée S1, hors des deux dossiers
    /// que possède LWS-8 (`Lentille/Perspective/`, `Lentille/Mode/`).
    func test_riviere_reasonOnADirectConversation_staysTheSameNumericFormula_neverADedicatedMessage() throws {
        let directCaps = capabilities(conversationType: .direct, activeParticipantCount: 3)
        XCTAssertFalse(directCaps.riverEligible, "Prérequis : `direct` reste structurellement inéligible.")

        let model = LentilleModeMenuModel.build(capabilities: directCaps, currentPreference: .auto)
        let reason = try XCTUnwrap(try entry(.riviere, in: model).disabledReason)

        // Même patron que le témoin ci-dessus : la langue vient du catalogue
        // (résolue au moment du test, pas figée), les deux nombres vivants
        // restent verrouillés.
        let format = String(
            localized: "lentille.mode.river.reason",
            defaultValue: "s'ouvrira à %d personnes actives — %d aujourd'hui",
            bundle: .main
        )
        let expectedReason = String(format: format, ReadingModeOrchestrator.riverEligibilityThreshold, 3)
        XCTAssertEqual(
            reason,
            expectedReason,
            "Comportement RÉEL, verrouillé : la raison d'une conversation directe est " +
            "composée par la MÊME formule qu'un groupe sous le seuil — le miroir gelé ne " +
            "distingue pas « inéligible par nature » de « inéligible par manque de " +
            "participants ». Rapporté comme défaut réel non trivial (mission I-073) : " +
            "SANS correction, la loi vivant hors `Lentille/Mode|Perspective`."
        )
    }

    /// Les quatre AUTRES entrées ne portent JAMAIS de raison — le champ est
    /// réservé à Rivière, jamais un texte générique pour un mode simplement
    /// hors catalogue (invité, ex. Résumé).
    func test_onlyRiviere_carriesADisabledReason() {
        let anonymousCaps = capabilities(isAnonymous: true)
        let model = LentilleModeMenuModel.build(capabilities: anonymousCaps, currentPreference: .auto)
        for entry in model.entries where entry.id != .riviere {
            XCTAssertNil(
                entry.disabledReason,
                "« \(entry.id) » porte une raison — seule Rivière doit en avoir une " +
                "(contrat : la raison Rivière est réelle et vivante ; les autres entrées " +
                "hors catalogue n'ont pas de texte explicatif prescrit)."
            )
        }
    }

    // MARK: - 3. Les quatre autres entrées suivent `capabilities.availableModes`

    /// `.auto` n'est JAMAIS désactivé — l'orchestrateur a toujours un repli.
    func test_auto_isNeverDisabled() throws {
        let anonymousCaps = capabilities(isAnonymous: true)
        let model = LentilleModeMenuModel.build(capabilities: anonymousCaps, currentPreference: .auto)
        XCTAssertFalse(try entry(.auto, in: model).isDisabled)
    }

    /// Catalogue INVITÉ (Résumé masqué, `/analysis` `requiredAuth`) — Résumé
    /// grisé, Focal/Script non.
    func test_anonymousCatalog_disablesResume_keepsFocalAndScriptEnabled() throws {
        let model = LentilleModeMenuModel.build(capabilities: capabilities(isAnonymous: true), currentPreference: .auto)

        XCTAssertTrue(try entry(.resume, in: model).isDisabled)
        XCTAssertFalse(try entry(.focal, in: model).isDisabled)
        XCTAssertFalse(try entry(.script, in: model).isDisabled)
    }

    /// Catalogue INSCRIT : les trois modes numériques (Focal/Script/Résumé)
    /// sont tous sélectionnables.
    func test_registeredCatalog_enablesFocalScriptAndResume() throws {
        let model = LentilleModeMenuModel.build(capabilities: capabilities(isAnonymous: false), currentPreference: .auto)

        XCTAssertFalse(try entry(.focal, in: model).isDisabled)
        XCTAssertFalse(try entry(.script, in: model).isDisabled)
        XCTAssertFalse(try entry(.resume, in: model).isDisabled)
    }

    // MARK: - 4. Sélection courante

    func test_isSelected_marksExactlyTheCurrentPreference() {
        let model = LentilleModeMenuModel.build(capabilities: capabilities(), currentPreference: .script)
        for entry in model.entries {
            XCTAssertEqual(
                entry.isSelected, entry.id == .script,
                "« \(entry.id) » a un `isSelected` incorrect pour la préférence courante " +
                "`.script`."
            )
        }
    }

    // MARK: - 5. Garde de source — Lentille/Mode/, aucune seconde loi d'éligibilité

    private static var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }

    private func modeMenuSource() throws -> String {
        try String(
            contentsOf: Self.iosRoot.appendingPathComponent(
                "Meeshy/Features/Main/Lentille/Mode/LentilleModeMenu.swift"
            ),
            encoding: .utf8
        )
    }

    private func normalizedCode(_ source: String) -> String {
        AppSourceGuard.stripComments(source)
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }

    /// Le modèle doit déléguer l'éligibilité à `resolveCapabilities` (miroir
    /// GELÉ) — jamais recalculer un seuil de participants ou une exclusion
    /// `direct` en dur, ce qui ferait diverger la Lentille de la loi
    /// partagée au premier ajustement.
    func test_modeMenu_delegatesEligibilityToTheFrozenMirror() throws {
        let code = normalizedCode(try modeMenuSource())
        XCTAssertTrue(
            code.contains("capabilities.availableModes.contains(mode)"),
            "`LentilleModeMenuModel.build` doit lire `capabilities.availableModes` — la " +
            "borne réelle publiée par `ReadingModeOrchestrator.resolveCapabilities`."
        )
        XCTAssertTrue(
            code.contains("LentilleModeLabels.riverReason(capabilities.riverEligibilityReason)"),
            "La raison Rivière doit venir de `RiverEligibilityReason` (miroir gelé), jamais " +
            "d'un texte composé ici à partir de nombres recopiés."
        )
    }

    // MARK: - 6. Montage du sous-menu — APRÈS « Marquer lu », derrière le drapeau

    private func overlaysSource() throws -> String {
        try String(
            contentsOf: Self.iosRoot.appendingPathComponent(
                "Meeshy/Features/Main/Views/ConversationListView+Overlays.swift"
            ),
            encoding: .utf8
        )
    }

    /// Critère d'acceptation LWS-8 : « sous-menu "Mode de lecture" ajouté à
    /// `nativeContextMenuView` APRÈS "Marquer lu" ». Position vérifiée par
    /// l'ORDRE des offsets dans le fichier — pas seulement la présence des
    /// deux morceaux, ce qui laisserait passer un sous-menu placé n'importe
    /// où ailleurs dans `conversationContextMenu(for:)`.
    func test_readingModeSubmenu_isMountedOnce_afterMarkRead_behindTheFlag() throws {
        let raw = try overlaysSource()

        XCTAssertEqual(
            raw.components(separatedBy: "LentilleReadingModeSubmenu(").count - 1, 1,
            "UN seul montage du sous-menu : un second site divergerait la préférence " +
            "affichée d'un endroit à l'autre du même menu contextuel."
        )

        let markReadRange = try XCTUnwrap(
            raw.range(of: "context.mark_read"),
            "Repère « Marquer lu » introuvable — l'ancrage du contrat (§LWS-8) a bougé, " +
            "cette garde doit être re-pointée avant tout le reste."
        )
        let submenuRange = try XCTUnwrap(
            raw.range(of: "LentilleReadingModeSubmenu("),
            "Le sous-menu doit être monté dans ce fichier."
        )
        XCTAssertTrue(
            submenuRange.lowerBound > markReadRange.lowerBound,
            "Le sous-menu « Mode de lecture » doit apparaître APRÈS « Marquer lu » dans " +
            "`conversationContextMenu(for:)`, mot pour mot le placement du contrat."
        )

        let detailsRange = try XCTUnwrap(
            raw.range(of: "context.details"),
            "Repère « Détails » introuvable — ancrage à re-pointer."
        )
        XCTAssertTrue(
            submenuRange.lowerBound < detailsRange.lowerBound,
            "Le sous-menu doit se glisser AVANT « Détails » — juste après « Marquer lu », " +
            "pas ailleurs dans le menu."
        )

        let normalized = normalizedCode(raw)
        XCTAssertTrue(
            normalized.contains("if LentilleFeatureFlag.isLentilleListEnabled { LentilleReadingModeSubmenu("),
            "Le sous-menu doit être monté DERRIÈRE le drapeau Lentille — drapeau OFF, le " +
            "menu contextuel doit rester bit-à-bit identique à aujourd'hui."
        )
    }
}
