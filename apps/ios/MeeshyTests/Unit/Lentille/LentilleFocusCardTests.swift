import XCTest
import MeeshySDK
@testable import Meeshy

/// Focus card — décision affichée + chip (contrat LWS-8/I-071, §4.2/§4.3).
///
/// **Suite PARTIELLE, ouverte** : `FocusCardElectionTests` (I-070) couvre
/// l'ÉLECTION (quel rang) ; `LentillePerspectiveCurveTests` (I-069) couvre la
/// PERSPECTIVE (opacité/échelle). Celle-ci couvre ce que I-071 ajoute par-
/// dessus les deux : le TEXTE de l'encoche (« AUTO · <décision> » vs chip du
/// mode forcé) et la garde de source propre au dossier neuf (`Lentille/Mode/`,
/// pas `Lentille/Perspective/` — voir le commentaire d'en-tête de
/// `LentilleFocusCard.swift` pour la ré-preuve d'ancrage qui explique ce
/// choix de dossier).
///
/// **Nommage** — aucun jeton de `FINAL_PHASE_CLASS_PATTERN`
/// (`apps/ios/meeshy.sh:1591`, qui contient notamment `Conversation`) :
/// `LentilleFocusCardTests`, phase 1.
final class LentilleFocusCardTests: XCTestCase {

    // MARK: - Fabrique

    /// Même piège que `LentilleRowEquatableTests`/`BridgeFingerprintTests` :
    /// `MeeshyConversation.init` défaute `lastMessageAt`/`createdAt` à
    /// `Date()` — une date FIXE évite toute dépendance au moment d'exécution.
    private static let now = Date(timeIntervalSince1970: 1_700_000_000)

    private func makeConversation(
        unreadCount: Int = 0,
        lastReadAt: Date? = LentilleFocusCardTests.now,
        type: MeeshyConversation.ConversationType = .group
    ) -> MeeshyConversation {
        MeeshyConversation(
            id: "conv-1",
            identifier: "conv-1",
            type: type,
            title: "Equipe Produit",
            lastMessageAt: Self.now,
            createdAt: Self.now,
            updatedAt: Self.now,
            userState: ConversationUserState(unreadCount: unreadCount, lastReadAt: lastReadAt)
        )
    }

    private func decision(
        for conversation: MeeshyConversation,
        preference: ReadingModeOrchestrator.ReadingModePreference = .auto,
        isAnonymous: Bool = false,
        isLentilleFlagEnabled: Bool = true,
        now: Date = LentilleFocusCardTests.now
    ) -> ReadingModeOrchestrator.OrchestratorDecision {
        LentilleReadingModeContext.decision(
            for: conversation,
            preference: preference,
            isAnonymous: isAnonymous,
            isLentilleFlagEnabled: isLentilleFlagEnabled,
            now: now
        )
    }

    // MARK: - 1. Décision affichée — quatre branches + collant

    /// Branche 1/5 : drapeau désactivé ⇒ `.bubbles`/`flag-disabled` — clampée
    /// NULLE PART (l'orchestrateur ne clampe jamais cette branche, §4.4 de
    /// `ReadingModeOrchestrator`). Testée pour la SURFACE de la glue
    /// d'intégration, même si `LentilleFocusCardHost` ne passe jamais `false`
    /// en pratique (montée derrière le même drapeau).
    func test_decision_branch1_flagDisabled() {
        let result = decision(for: makeConversation(), isLentilleFlagEnabled: false)
        XCTAssertEqual(result.mode, .bubbles)
        XCTAssertEqual(result.reason, .flagDisabled)
    }

    /// Branche 2/5 : choix COLLANT (préférence mémorisée, M-048) — PRIME sur
    /// tout le reste, y compris un non-lu élevé qui basculerait autrement en
    /// Résumé.
    func test_decision_branch2_stickyChoicePrimes() {
        let conversation = makeConversation(unreadCount: 999, lastReadAt: nil)
        let result = decision(for: conversation, preference: .script)
        XCTAssertEqual(
            result.mode, .script,
            "Un choix mémorisé DOIT primer même sur un non-lu massif — sinon la préférence " +
            "de l'utilisateur serait silencieusement écrasée par l'orchestrateur."
        )
        XCTAssertEqual(result.reason, .sticky)
    }

    /// Branche 3/5 : non-lus au-delà du plafond (`ReadingModeOrchestrator
    /// .unreadCap`, jamais un « 25 » écrit ici) ⇒ Résumé.
    func test_decision_branch3_unreadOverCap() {
        let conversation = makeConversation(unreadCount: ReadingModeOrchestrator.unreadCap + 1)
        let result = decision(for: conversation)
        XCTAssertEqual(result.mode, .summary)
        XCTAssertEqual(result.reason, .unreadOverCap)
    }

    /// Branche 4/5 : absence prolongée (> `absenceWindowMs`) ET non-lus au-
    /// dessus du plancher (`absenceUnreadFloor`) ⇒ Résumé, raison distincte
    /// de la branche 3.
    func test_decision_branch4_staleAbsence() {
        let staleDate = Self.now.addingTimeInterval(-(ReadingModeOrchestrator.absenceWindowMs / 1000 + 3600))
        let conversation = makeConversation(
            unreadCount: ReadingModeOrchestrator.absenceUnreadFloor,
            lastReadAt: staleDate
        )
        let result = decision(for: conversation)
        XCTAssertEqual(result.mode, .summary)
        XCTAssertEqual(result.reason, .staleAbsence)
    }

    /// Branche 5/5 : le défaut — peu de non-lus, lecture récente ⇒ Focal.
    func test_decision_branch5_default() {
        let conversation = makeConversation(unreadCount: 2, lastReadAt: Self.now)
        let result = decision(for: conversation)
        XCTAssertEqual(result.mode, .focal)
        XCTAssertEqual(result.reason, .default)
    }

    // MARK: - 2. Texte de l'encoche — « AUTO · <décision> » vs chip

    /// `.auto` ⇒ « AUTO · <nom du mode RENDU> », jamais un libellé générique.
    func test_notchText_whenAuto_showsAutoPrefixedWithTheRenderedMode() {
        let conversation = makeConversation(unreadCount: 2, lastReadAt: Self.now)
        let result = decision(for: conversation)
        XCTAssertEqual(result.mode, .focal)

        let text = LentilleModeLabels.notchText(decision: result, preference: .auto)
        XCTAssertEqual(
            text, "AUTO · Focal",
            "L'utilisateur doit voir ce qui VA se passer (contrat LWS-8) — pas une " +
            "étiquette générique « Auto » seule."
        )
    }

    /// Un mode mémorisé (M-048) ⇒ CHIP du mode forcé, à la place d'AUTO — le
    /// texte ne doit plus contenir « AUTO · » du tout.
    func test_notchText_whenPreferenceForced_showsTheChip_neverAutoPrefix() {
        let conversation = makeConversation(unreadCount: 999, lastReadAt: nil)
        let result = decision(for: conversation, preference: .script)
        XCTAssertEqual(result.mode, .script, "Prérequis : le collant a bien primé.")

        let text = LentilleModeLabels.notchText(decision: result, preference: .script)
        XCTAssertEqual(text, "Script")
        XCTAssertFalse(
            text.contains("AUTO"),
            "Un mode forcé est un CHIP, pas une prévision : « AUTO · » ne doit plus " +
            "apparaître une fois qu'un choix est mémorisé."
        )
    }

    /// Discrimination (leçon 266) : deux préférences (`.auto` vs `.script`)
    /// sur la MÊME décision sous-jacente doivent rendre des textes DIFFÉRENTS
    /// — sinon le témoin précédent ne prouve rien.
    func test_notchText_differsBetweenAutoAndForced_onTheSameDecision() {
        let conversation = makeConversation(unreadCount: 2, lastReadAt: Self.now)
        let baseDecision = decision(for: conversation)

        let autoText = LentilleModeLabels.notchText(decision: baseDecision, preference: .auto)
        let forcedText = LentilleModeLabels.notchText(decision: baseDecision, preference: .resume)

        XCTAssertNotEqual(autoText, forcedText)
        // Valeur attendue résolue par CATALOGUE au moment du test (même patron
        // que `A11yLabelComposerTests`/`CallsViewModelTests`) — sous la locale
        // `en` du CI la clé rend l'anglais, plus le repli `defaultValue`
        // français : c'est le CÂBLAGE (le chip du mode forcé nomme bien
        // `lentille.mode.name.resume`) qui est verrouillé, jamais la langue.
        XCTAssertEqual(
            forcedText,
            String(localized: "lentille.mode.name.resume", defaultValue: "Résumé", bundle: .main)
        )
    }

    // MARK: - 2ter. R6-5 — suggestedMode du pont prime sur le recalcul local

    /// Témoin discriminant (a) : `suggestedMode` PRÉSENT et CONTRAIRE à ce que
    /// recalculerait `resolveOrchestratorDecision` localement (`.resume`
    /// alors que le recalcul local, sur ces données, vaut `.focal`, branche
    /// 5/défaut) ⇒ l'encoche affiche la valeur du SERVEUR, jamais le recalcul
    /// local.
    func test_notchText_whenSuggestedModePresent_winsOverTheLocallyRecomputedDecision() {
        let conversation = makeConversation(unreadCount: 2, lastReadAt: Self.now)
        let localDecision = decision(for: conversation)
        XCTAssertEqual(localDecision.mode, .focal, "Prérequis : le recalcul local, seul, dirait Focal.")

        let text = LentilleModeLabels.notchText(
            decision: localDecision,
            preference: .auto,
            suggestedMode: .resume
        )

        // Résolution locale-agnostique (patron du dépôt, cf.
        // `ModeMenuModelTests`) : l'attendu est composé par les MÊMES clés
        // que la production — sous la locale `en` du CI il rend « Summary »,
        // en `fr` « Résumé » ; ce qui est verrouillé est l'IDENTITÉ du mode
        // affiché (le suggéré), jamais une langue.
        let notchFormat = String(localized: "lentille.mode.notch.auto", defaultValue: "AUTO · %@", bundle: .main)
        let expected = String(format: notchFormat, LentilleModeLabels.decisionModeTitle(for: .summary))
        XCTAssertEqual(
            text, expected,
            "`bridge.suggestedMode` (précalculé par le serveur/le substitut) DOIT primer sur " +
            "`decision.mode` (recalcul local) — jamais l'inverse (R6-5)."
        )
        XCTAssertNotEqual(
            text,
            String(format: notchFormat, LentilleModeLabels.decisionModeTitle(for: localDecision.mode)),
            "Discrimination : le libellé du recalcul LOCAL ne doit pas être celui affiché — " +
            "sinon ce témoin passerait au vert même si le suggéré était ignoré."
        )
    }

    /// Témoin discriminant (b) : `suggestedMode` ABSENT (`nil`, pas de pont)
    /// ⇒ le repli local reste EXACTEMENT ce qu'il était avant le branchement
    /// (garde de non-régression) — jamais un vide, jamais une invention.
    func test_notchText_whenSuggestedModeAbsent_fallsBackToTheLocalDecision_unchanged() {
        let conversation = makeConversation(unreadCount: 2, lastReadAt: Self.now)
        let localDecision = decision(for: conversation)

        let text = LentilleModeLabels.notchText(decision: localDecision, preference: .auto)

        XCTAssertEqual(text, "AUTO · Focal")
    }

    /// Le point d'appel réel (`LentilleFocusCard.notchText`) doit lire
    /// `conversation.bridge?.suggestedMode` — jamais un recalcul propre à la
    /// carte. Garde de SOURCE (comme `test_focusCard_delegatesNotchTextTo
    /// LentilleModeLabels` ci-dessus), pour que le câblage lui-même reste
    /// prouvé même sans toolchain pour exécuter la vue.
    func test_focusCard_passesConversationBridgeSuggestedModeToNotchText() throws {
        let source = try modeSources().first { $0.name == "LentilleFocusCard.swift" }
        let code = try XCTUnwrap(source?.code, "LentilleFocusCard.swift introuvable dans Lentille/Mode/.")
        XCTAssertTrue(
            normalizedCode(code).contains("suggestedMode: conversation.bridge?.suggestedMode"),
            "R6-5 — l'encoche doit passer `conversation.bridge?.suggestedMode` à " +
            "`LentilleModeLabels.notchText` — c'est le SEUL branchement attendu au point d'appel."
        )
    }

    // MARK: - 2bis. Reduce motion ⇒ fond seul (ring)

    func test_ringOpacity_isZero_underReduceMotion_oneOtherwise() {
        XCTAssertEqual(LentilleFocusCard.ringOpacity(reduceMotion: true), 0)
        XCTAssertEqual(LentilleFocusCard.ringOpacity(reduceMotion: false), 1)
    }

    // MARK: - 3. Garde de source — Lentille/Mode/

    private static var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Lentille
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
    }

    private static var modeDirectory: URL {
        iosRoot.appendingPathComponent("Meeshy/Features/Main/Lentille/Mode")
    }

    /// Découverte DYNAMIQUE (leçon 257) — jamais une liste de noms recopiée :
    /// un fichier ajouté demain (la vue `LentilleModeMenu`, un sélecteur de
    /// plus) entre automatiquement dans le périmètre.
    private func modeSources() throws -> [(name: String, code: String)] {
        let entries = try FileManager.default.contentsOfDirectory(
            at: Self.modeDirectory, includingPropertiesForKeys: nil
        )
        return try entries
            .filter { $0.pathExtension == "swift" }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
            .map { ($0.lastPathComponent, try String(contentsOf: $0, encoding: .utf8)) }
    }

    private func occurrences(of needle: String, in haystack: String) -> Int {
        haystack.components(separatedBy: needle).count - 1
    }

    func test_guardDiscoversAtLeastOneModeFile_neverSilentlyEmpty() throws {
        XCTAssertFalse(
            try modeSources().isEmpty,
            "La garde n'a chargé AUCUN fichier depuis `\(Self.modeDirectory.path)` — elle " +
            "passerait alors au vert sans rien vérifier (leçon 257)."
        )
    }

    /// Critère d'acceptation I-071, mot pour mot : « garde source (hauteur :
    /// aucun `frame(height:` dans les fichiers de carte) ». La carte est un
    /// fond/overlay du rang élu — imposer une hauteur LUE depuis le layout
    /// serait la porte d'entrée du relayout que le contrat interdit.
    /// Code NORMALISÉ (commentaires retirés, même patron que
    /// `LentillePerspectiveCurveTests.test_perspective_neverTouchesLayout`) :
    /// ce sont des gardes de PATRON de code, pas de littéraux R15 — la prose
    /// d'un commentaire qui nomme la règle (comme celui-ci) ne doit pas la
    /// déclencher.
    func test_modeFiles_neverHardcodeFrameHeight() throws {
        for source in try modeSources() {
            XCTAssertEqual(
                occurrences(of: "frame(height:", in: normalizedCode(source.code)), 0,
                "\(source.name) contient « frame(height: » — la carte doit contraindre sa " +
                "hauteur via `.frame(width:height:)` (les deux, jamais `height:` seul), " +
                "sur la constante `LentilleMetrics.Row.height`, jamais une mesure de layout."
            )
        }
    }

    /// Règle dure du workshop : « Button(.plain) jamais .onTapGesture ».
    func test_modeFiles_neverUseOnTapGesture() throws {
        for source in try modeSources() {
            XCTAssertEqual(
                occurrences(of: ".onTapGesture", in: normalizedCode(source.code)), 0,
                "\(source.name) contient « .onTapGesture » — l'encoche et toute action de " +
                "`Lentille/Mode/` doivent être des `Button` en style `.plain`, jamais un " +
                "geste de tap nu (accessibilité : un `.onTapGesture` n'est pas exposé comme " +
                "un contrôle au VoiceOver)."
            )
        }
    }

    /// La carte doit déléguer son texte à `LentilleModeLabels` — jamais une
    /// seconde formule de « AUTO · … » écrite en dur dans la vue.
    func test_focusCard_delegatesNotchTextToLentilleModeLabels() throws {
        let source = try modeSources().first { $0.name == "LentilleFocusCard.swift" }
        let code = try XCTUnwrap(source?.code, "LentilleFocusCard.swift introuvable dans Lentille/Mode/.")
        XCTAssertTrue(
            code.contains("LentilleModeLabels.notchText(decision:"),
            "`LentilleFocusCard` doit appeler `LentilleModeLabels.notchText(decision:" +
            "preference:)` — le texte de l'encoche est calculé UNE fois, réutilisé partout " +
            "(menu, aperçu, chip)."
        )
    }

    // MARK: - 4. Montage — un seul hôte, derrière le drapeau, sans lecture directe de l'élu

    private func listViewSource() throws -> String {
        try String(
            contentsOf: Self.iosRoot.appendingPathComponent("Meeshy/Features/Main/Views/ConversationListView.swift"),
            encoding: .utf8
        )
    }

    private func normalizedCode(_ source: String) -> String {
        AppSourceGuard.stripComments(source)
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }

    func test_conversationList_mountsTheCardHostOnce_behindTheFlag_besideTheElectionHost() throws {
        let code = normalizedCode(try listViewSource())

        XCTAssertEqual(
            occurrences(of: "LentilleFocusCardHost(", in: code), 1,
            "UN seul hôte de carte : deux hôtes peindraient deux cartes concurrentes sur le " +
            "même élu."
        )
        XCTAssertTrue(
            code.contains(
                "if LentilleFeatureFlag.isLentilleListEnabled { LentilleFocusElectionHost("
            ),
            "L'hôte de carte doit rester dans le MÊME bloc `if` que l'hôte d'élection — pas " +
            "un second garde-fou de drapeau qui pourrait diverger du premier."
        )
        XCTAssertTrue(
            code.contains("LentilleFocusCardHost( election: focusElection,"),
            "L'hôte de carte reçoit le magasin PAR RÉFÉRENCE (`election: focusElection`) — " +
            "jamais une valeur déjà lue (`focusElection.electedId`) : c'est lui, dans SON " +
            "fichier, qui doit lire l'élu."
        )
    }

    /// Redite volontaire de la garde `FocusCardElectionTests
    /// .test_electedState_neverLivesInTheListBody` : ce lot AJOUTE du code à
    /// `ConversationListView.swift` et doit prouver qu'il n'a pas réintroduit
    /// la lecture directe que cette garde interdit.
    func test_conversationListView_stillNeverReadsTheElectedIdDirectly() throws {
        let code = normalizedCode(try listViewSource())
        XCTAssertEqual(
            occurrences(of: "focusElection.electedId", in: code), 0,
            "`ConversationListView.swift` ne doit JAMAIS lire `focusElection.electedId` : " +
            "la carte comme l'élection le lisent chacun dans LEUR hôte."
        )
    }
}

// MARK: - Carte MAGNIFIÉE (2026-08-21) — suit la rangée, menu natif, contenu réel

extension LentilleFocusCardTests {

    private static var repoRoot: URL {
        iosRoot
            .deletingLastPathComponent()   // .../apps
            .deletingLastPathComponent()   // repo
    }

    private func modeSource(_ file: String) throws -> String {
        try String(contentsOf: Self.modeDirectory.appendingPathComponent(file), encoding: .utf8)
    }

    /// La hauteur de la carte vient d'un token partagé (R17) — et elle DÉBORDE
    /// de la rangée (64) : c'est la loupe, jamais un agrandissement de la rangée.
    @MainActor
    func test_focusCardHeight_isTheMagnifiedToken_andExceedsTheRow() throws {
        let tokensURL = Self.repoRoot.appendingPathComponent("packages/shared/design/lentille-tokens.json")
        let data = try Data(contentsOf: tokensURL)
        let root = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        let list = try XCTUnwrap(root["list"] as? [String: Any])
        let focusCard = try XCTUnwrap(list["focusCard"] as? [String: Any])
        XCTAssertEqual(Double(LentilleMetrics.FocusCard.height), focusCard["height"] as? Double)
        let avatarSize = Double(LentilleMetrics.FocusCard.avatarContext.size)
        XCTAssertEqual(avatarSize, focusCard["avatarSize"] as? Double)
        XCTAssertGreaterThan(LentilleMetrics.FocusCard.height, LentilleMetrics.Row.height)
    }

    /// L'encoche est un `Menu` SYSTÈME : un `.popover` devient une feuille
    /// plein écran sur iPhone (retour user 2026-08-21).
    /// 2026-08-21 : la catégorie est une encoche HAUT-GAUCHE (miroir exact de
    /// l'encoche de mode) dont le menu déplace la conversation ; les étiquettes
    /// sont des chips sur le bord BAS dont le menu filtre / retire le filtre /
    /// supprime ; la date est la date COMPLÈTE du fil (« Aujourd'hui à 5:49 »),
    /// plus jamais le relatif court ; le dernier expéditeur s'affiche pour
    /// TOUTES les conversations.
    func test_focusCard_hasCategoryNotchTopLeading_tagChipsBottomEdge_andTheFullTimestamp() throws {
        let code = try modeSource("LentilleFocusCard.swift")
        XCTAssertTrue(code.contains(".overlay(alignment: .topLeading) {"), "encoche catégorie en haut à gauche")
        XCTAssertTrue(code.contains("categoryNotch"))
        XCTAssertTrue(code.contains("onMoveToSection("), "toucher la catégorie déplace la conversation")
        XCTAssertTrue(code.contains(".overlay(alignment: .bottomLeading) {"), "chips d'étiquettes sur le bord bas")
        XCTAssertTrue(code.contains("onFilterByTag(tag.name)"))
        XCTAssertTrue(code.contains("onFilterByTag(nil)"), "une étiquette qui filtre propose de RETIRER le filtre")
        XCTAssertTrue(code.contains("onRemoveTag(tag)"))
        XCTAssertTrue(code.contains("FocalFocusTimestamp.listLabel("), "la date complète vient de la loi du fil")
        XCTAssertFalse(code.contains("RelativeTimeFormatter.shortString"), "plus de relatif court sur la carte")
        XCTAssertFalse(
            code.contains("conversation.type != .direct,\n               let sender"),
            "le dernier expéditeur s'affiche pour toutes les conversations"
        )
    }

    func test_categoryText_isTheCurrentCategoryUppercased_orTheFallback() {
        XCTAssertEqual(LentilleFocusCard.categoryText(current: "Travail", fallback: "Catégorie"), "TRAVAIL")
        XCTAssertEqual(LentilleFocusCard.categoryText(current: nil, fallback: "Catégorie"), "CATÉGORIE")
    }

    func test_notch_isANativeMenu_neverAPopover() throws {
        let code = try modeSource("LentilleFocusCard.swift")
        XCTAssertTrue(code.contains("Menu {"), "l'encoche doit être un `Menu` natif")
        XCTAssertFalse(code.contains(".popover("), "plus jamais de `.popover` : feuille plein écran sur iPhone")
    }

    /// La carte peint la conversation (nom, heure, aperçu Prisme / pont ✦),
    /// pas un cadre vide posé sur la rangée.
    func test_focusCard_paintsTheConversation_notAnEmptyFrame() throws {
        let code = try modeSource("LentilleFocusCard.swift")
        XCTAssertTrue(code.contains("conversation.displayName"))
        XCTAssertTrue(code.contains("resolvedLastMessagePreview(preferredLanguages:"))
        XCTAssertTrue(code.contains("LentilleBridgeLine("))
        XCTAssertTrue(code.contains("MeeshyAvatar("))
    }

    /// L'hôte suit le défilement : abonné au MÊME relais que l'élection, il
    /// relit le `midY` vivant de l'élu à chaque tick. Sans cela la carte dérivait
    /// jusqu'à une demi-bande (45 pt) de la rangée entre deux élections.
    func test_cardHost_followsTheScrollRelay_andReadsTheLiveRowPosition() throws {
        let code = try modeSource("LentilleFocusCard.swift")
        XCTAssertTrue(code.contains("@ObservedObject var relay: ScrollOffsetRelay"))
        XCTAssertTrue(code.contains("registry.midYById[conversation.id]"))
    }

    /// Rangée sortie de l'écran (plus dans le registre) ⇒ pas de carte : elle
    /// ne flotte jamais dans le vide en fin de liste.
    func test_localY_isNil_whenTheRowIsNoLongerMounted() {
        XCTAssertNil(LentilleFocusCardHost.localY(rowMidY: nil, hostMinY: 100))
        XCTAssertEqual(LentilleFocusCardHost.localY(rowMidY: 640, hostMinY: 100), 540)
    }

    /// Le pont ✦ ne remplace l'aperçu que s'il reste des non-lus — même règle
    /// que la rangée plate.
    func test_showsBridge_requiresUnreadAndABridge() {
        let bridge = ConversationBridge(kind: .fallback, unreadCount: 3, suggestedMode: .focal)
        XCTAssertTrue(LentilleFocusCard.showsBridge(unreadCount: 3, bridge: bridge))
        XCTAssertFalse(LentilleFocusCard.showsBridge(unreadCount: 0, bridge: bridge))
        XCTAssertFalse(LentilleFocusCard.showsBridge(unreadCount: 3, bridge: nil))
    }
}
