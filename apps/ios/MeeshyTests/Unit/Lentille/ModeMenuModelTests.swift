import XCTest
@testable import Meeshy

/// `LentilleModeMenuModel` — le catalogue Auto 🪄 / Script / Résumé /
/// Rivière (contrat LWS-8/I-072, amendé par le RETRAIT FOCAL iOS
/// 2026-08-18 : « Focal » sort du menu, Script est le mode nominal —
/// `docs/focal-retrait-ios-2026-08-18.md`).
///
/// **Suite COMPLÉTÉE par I-073.** I-072 verrouillait ce que la mission
/// nommait explicitement — Rivière grisée + sa raison réelle sur des seuils
/// VIVANTS, et la structure des cinq entrées. **I-073 ajoutait** le témoin du
/// défaut réel documenté, non corrigé : une conversation `.direct` recevait la
/// MÊME formule numérique que n'importe quel groupe sous seuil, faute d'un
/// amendement à la loi gelée S1.
///
/// **REV-3/B3 corrige ce défaut** (amendement S1 autorisé par la porte) : la
/// raison Rivière se trifurque — « jamais » (`direct`), « seuil seul » (compte
/// inconnu), « seuil et compte » (nominal). Les deux témoins concernés
/// verrouillent désormais le comportement CORRIGÉ, plus le défaut.
///
/// **Nommage** — aucun jeton de `FINAL_PHASE_CLASS_PATTERN`
/// (`apps/ios/meeshy.sh:1591`) : `ModeMenuModelTests`, phase 1 (nom repris
/// tel quel du contrat §LWS-8).
final class ModeMenuModelTests: XCTestCase {

    // MARK: - Fabrique

    private func capabilities(
        isAnonymous: Bool = false,
        isFlagEnabled: Bool = true,
        /// R-135 — défaut `false` : la plupart des témoins existants
        /// vérifient le comportement drapeau `riviere_mode` ÉTEINT (état
        /// réel de production tant que R-133/R-135 restent OFF par défaut).
        isRiverFlagEnabled: Bool = false,
        conversationType: ReadingModeOrchestrator.ConversationType = .group,
        /// `nil` = compte d'actifs INCONNU (amendement S1, REV-3/B3) — la
        /// valeur que `LentilleReadingModeContext.activeParticipantCount` rend
        /// désormais en production, là où elle fabriquait un `0`.
        activeParticipantCount: Int? = 0
    ) -> ReadingModeOrchestrator.ReadingModeCapabilities {
        ReadingModeOrchestrator.resolveCapabilities(
            ReadingModeOrchestrator.ResolveCapabilitiesInput(
                identity: ReadingModeOrchestrator.ReadingModeIdentity(isAnonymous: isAnonymous),
                isFlagEnabled: isFlagEnabled,
                isRiverFlagEnabled: isRiverFlagEnabled,
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

    // MARK: - 1. Les quatre entrées, toujours, dans l'ordre

    /// RETRAIT FOCAL iOS (2026-08-18) : « Focal » sort du menu — quatre
    /// entrées, plus cinq. Une entrée « Focal » qui réapparaîtrait ici
    /// signifierait que le retrait a été partiellement défait.
    func test_model_alwaysHasExactlyTheFourEntries_inContractOrder() {
        let model = LentilleModeMenuModel.build(capabilities: capabilities(), currentPreference: .auto)
        XCTAssertEqual(
            model.entries.map(\.id),
            [.auto, .focal, .script, .bulles, .resume, .riviere],
            "Ordre du contrat amendé (retrait Focal) : « Auto 🪄 / Script / Résumé / Rivière »."
        )
    }

    // MARK: - 2. Rivière — TOUJOURS présente, grisée avec raison réelle SAUF quand éligible (R-135)

    /// Discrimine la cause du grisage : numériquement éligible mais le
    /// drapeau `riviere_mode` reste ÉTEINT (état réel de production
    /// aujourd'hui, R-133/R-135 tous deux défaut OFF) ⇒ toujours grisée.
    /// Remplace l'ancien `..._evenWhenNumericallyEligible` (R-133/V3) : ce
    /// n'est plus « toujours », c'est « tant que le drapeau est éteint » —
    /// voir `test_riviere_isEnabled_whenFlagOnAndEligible` ci-dessous pour
    /// l'AUTRE position, tout aussi verrouillée.
    func test_riviere_staysDisabled_whenFlagOff_evenIfNumericallyEligible() throws {
        let eligibleCapsFlagOff = capabilities(
            isRiverFlagEnabled: false, conversationType: .group, activeParticipantCount: 12
        )
        XCTAssertTrue(eligibleCapsFlagOff.riverEligible, "Prérequis : ces capacités DOIVENT être éligibles.")

        let model = LentilleModeMenuModel.build(capabilities: eligibleCapsFlagOff, currentPreference: .auto)
        let riviere = try entry(.riviere, in: model)

        XCTAssertTrue(
            riviere.isDisabled,
            "Rivière doit rester grisée quand `riviere_mode` est éteint, MÊME si " +
            "`resolveCapabilities` la juge numériquement éligible — le drapeau, distinct de " +
            "l'éligibilité, reste la seconde porte (amendement R, §7)."
        )
        XCTAssertNotNil(riviere.disabledReason, "Grisée ⇒ une raison réelle doit accompagner l'entrée.")
    }

    /// R-135 — l'AUTRE position : drapeau ON **et** numériquement éligible ⇒
    /// dégrisée, exactement comme Focal/Script/Résumé suivent
    /// `capabilities.availableModes`. Aucune raison affichée (elle n'a plus
    /// lieu d'être : l'entrée est sélectionnable).
    func test_riviere_isEnabled_whenFlagOnAndEligible() throws {
        let eligibleCapsFlagOn = capabilities(
            isRiverFlagEnabled: true, conversationType: .group, activeParticipantCount: 12
        )
        XCTAssertTrue(eligibleCapsFlagOn.availableModes.contains(.river), "Prérequis : `.river` doit entrer au catalogue.")

        let model = LentilleModeMenuModel.build(capabilities: eligibleCapsFlagOn, currentPreference: .auto)
        let riviere = try entry(.riviere, in: model)

        XCTAssertFalse(
            riviere.isDisabled,
            "Drapeau `riviere_mode` ON + ≥5 actifs, jamais `direct` ⇒ Rivière doit devenir " +
            "sélectionnable, comme n'importe quelle autre entrée dérivée de " +
            "`capabilities.availableModes`."
        )
        XCTAssertNil(
            riviere.disabledReason,
            "Une entrée dégrisée ne doit plus porter de raison « s'ouvrira à… » à côté de " +
            "son propre nom sélectionnable."
        )
    }

    /// Drapeau ON mais SOUS le seuil ⇒ reste grisée, avec sa raison réelle —
    /// le drapeau seul ne suffit pas, l'éligibilité reste l'autre moitié de
    /// la porte (§7ter, « Ce n'est PAS l'éligibilité » vaut aussi à l'envers :
    /// le drapeau n'est pas non plus l'éligibilité).
    func test_riviere_staysDisabled_whenFlagOnButBelowThreshold() throws {
        let belowThreshold = capabilities(isRiverFlagEnabled: true, conversationType: .group, activeParticipantCount: 3)
        XCTAssertFalse(belowThreshold.riverEligible)

        let model = LentilleModeMenuModel.build(capabilities: belowThreshold, currentPreference: .auto)
        let riviere = try entry(.riviere, in: model)
        XCTAssertTrue(riviere.isDisabled)
        XCTAssertNotNil(riviere.disabledReason)
    }

    /// Drapeau ON mais conversation `direct` ⇒ `neverEligible`, reste
    /// grisée — jamais dégrisée, quel que soit le drapeau (structurel).
    func test_riviere_staysDisabled_whenFlagOnButDirect() throws {
        let direct = capabilities(isRiverFlagEnabled: true, conversationType: .direct, activeParticipantCount: 12)
        XCTAssertEqual(direct.riverEligibilityReason.riverReason, .neverEligible)

        let model = LentilleModeMenuModel.build(capabilities: direct, currentPreference: .auto)
        let riviere = try entry(.riviere, in: model)
        XCTAssertTrue(riviere.isDisabled)
        XCTAssertNotNil(riviere.disabledReason)
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

    /// I-073 signalait ici un DÉFAUT RÉEL, documenté et NON corrigé : sur une
    /// conversation `.direct`, la raison Rivière rendait la MÊME formule
    /// numérique que sur un groupe sous seuil — « s'ouvrira à 5 personnes
    /// actives — N aujourd'hui » — alors que `riverEligible` exclut `direct`
    /// STRUCTURELLEMENT, quel que soit N. Le texte promettait une porte qui ne
    /// s'ouvrirait JAMAIS. La correction vivait dans la loi PARTAGÉE gelée S1,
    /// hors des dossiers que LWS-8 possède : elle a donc attendu son
    /// amendement.
    ///
    /// REV-3/B3 l'apporte : `riverReason == .neverEligible` ⇒ une clé i18n
    /// DÉDIÉE (`lentille.mode.river.never`), sans le moindre nombre. Ce témoin
    /// verrouille désormais le comportement CORRIGÉ.
    ///
    /// Résolution locale-agnostique : la valeur attendue est composée par le
    /// MÊME `String(localized:defaultValue:bundle:)` que la production (patron
    /// du dépôt, cf. `A11yLabelComposerTests`) — sous la locale `en` du CI elle
    /// rend l'anglais, en `fr` le français ; ce qui est verrouillé est
    /// l'IDENTITÉ de la clé résolue, jamais une langue.
    func test_riviere_reasonOnADirectConversation_saysNever_withoutAnyFabricatedNumber() throws {
        let directCaps = capabilities(conversationType: .direct, activeParticipantCount: 3)
        XCTAssertFalse(directCaps.riverEligible, "Prérequis : `direct` reste structurellement inéligible.")
        XCTAssertEqual(
            directCaps.riverEligibilityReason.riverReason, .neverEligible,
            "Prérequis : la loi amendée doit qualifier `direct` de « jamais éligible »."
        )

        let model = LentilleModeMenuModel.build(capabilities: directCaps, currentPreference: .auto)
        let reason = try XCTUnwrap(try entry(.riviere, in: model).disabledReason)

        let expected = String(
            localized: "lentille.mode.river.never",
            defaultValue: "jamais en conversation directe",
            bundle: .main
        )
        XCTAssertEqual(
            reason, expected,
            "Une conversation directe doit dire « jamais », pas « pas encore » : la Rivière " +
            "n'y a pas de porte fermée, elle n'y a pas de porte."
        )
        XCTAssertFalse(
            reason.contains(where: \.isNumber),
            "Aucun nombre ne doit survivre dans la raison « jamais » — ni le seuil (qui ne " +
            "sera jamais atteint ici), ni un compte courant (qui ne changerait rien). " +
            "Rendu : « \(reason) »."
        )

        // Discrimination (leçon 266) : le MÊME compte sur un GROUPE rend
        // l'autre libellé. Sans ce contraste, un libellé « jamais » servi
        // partout passerait ce témoin au vert.
        let groupCaps = capabilities(conversationType: .group, activeParticipantCount: 3)
        let groupReason = try XCTUnwrap(
            try entry(.riviere, in: LentilleModeMenuModel.build(capabilities: groupCaps, currentPreference: .auto))
                .disabledReason
        )
        XCTAssertNotEqual(
            reason, groupReason,
            "« jamais en conversation directe » et « s'ouvrira à 5 — 3 aujourd'hui » sont deux " +
            "phrases différentes ; les confondre était précisément le défaut corrigé."
        )
    }

    /// AMENDEMENT S1 (REV-3/B3) — compte d'actifs INCONNU : la raison cite le
    /// SEUIL et se tait sur le reste. C'est la contrepartie du passage de
    /// `LentilleReadingModeContext.activeParticipantCount` à `nil` : sans cette
    /// forme, l'app affichait « — 0 aujourd'hui » sur des conversations pleines
    /// de monde, un chiffre que personne n'avait mesuré.
    func test_riviere_reasonWithAnUnknownCount_citesTheThresholdOnly_neverAFabricatedZero() throws {
        let unknownCaps = capabilities(conversationType: .group, activeParticipantCount: nil)
        XCTAssertNil(
            unknownCaps.riverEligibilityReason.current,
            "Prérequis : un compte inconnu doit rester inconnu à la sortie de la loi."
        )

        let model = LentilleModeMenuModel.build(capabilities: unknownCaps, currentPreference: .auto)
        let reason = try XCTUnwrap(try entry(.riviere, in: model).disabledReason)

        let format = String(
            localized: "lentille.mode.river.threshold_only",
            defaultValue: "s'ouvrira à %d personnes actives",
            bundle: .main
        )
        XCTAssertEqual(
            reason,
            String(format: format, ReadingModeOrchestrator.riverEligibilityThreshold),
            "Compte inconnu ⇒ le seuil SEUL, composé par le même format que la production."
        )
        XCTAssertTrue(
            reason.contains("\(ReadingModeOrchestrator.riverEligibilityThreshold)"),
            "Le seuil vivant doit rester visible — il est, lui, une valeur RÉELLE."
        )

        // Discrimination : « inconnu » et « zéro » ne doivent PAS rendre la
        // même phrase — c'est tout l'objet de l'amendement.
        let zeroCaps = capabilities(conversationType: .group, activeParticipantCount: 0)
        let zeroReason = try XCTUnwrap(
            try entry(.riviere, in: LentilleModeMenuModel.build(capabilities: zeroCaps, currentPreference: .auto))
                .disabledReason
        )
        XCTAssertNotEqual(
            reason, zeroReason,
            "Un compte INCONNU et un compte MESURÉ à zéro sont deux états différents ; " +
            "les afficher pareil est exactement le « 0 aujourd'hui » fabriqué que B3 retire."
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
    /// grisé, Script non (Focal n'est plus au menu — retrait 2026-08-18).
    func test_anonymousCatalog_disablesResume_keepsScriptEnabled() throws {
        let model = LentilleModeMenuModel.build(capabilities: capabilities(isAnonymous: true), currentPreference: .auto)

        XCTAssertTrue(try entry(.resume, in: model).isDisabled)
        XCTAssertFalse(try entry(.script, in: model).isDisabled)
    }

    /// Catalogue INSCRIT : les deux modes numériques restants (Script/Résumé)
    /// sont tous sélectionnables.
    func test_registeredCatalog_enablesScriptAndResume() throws {
        let model = LentilleModeMenuModel.build(capabilities: capabilities(isAnonymous: false), currentPreference: .auto)

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
