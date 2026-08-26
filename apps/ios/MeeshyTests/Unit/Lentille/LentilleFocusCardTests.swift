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

    // MARK: - 2bis. Il n'y a plus de CARTE — la magnification EST la rangée
    //
    // **SUPERSÈDE** la famille de témoins qui gardait `LentilleFocusCard`
    // comme VUE (`test_ringOpacity_…`, `test_focusCard_paintsTheConversation_…`,
    // `test_cardHost_followsTheScrollRelay_…`, `test_localY_…`,
    // `test_conversationList_mountsTheCardHostOnce_…`). Ils attestaient une
    // couche peinte PAR-DESSUS la rangée élue ; deux directives produit du
    // 2026-08-23 l'ont dissoute :
    //
    // 1. « Pas de bordure, on complète juste les informations, directement sur
    //    le row existant. »
    // 2. « … qu'elle hérite des features du mode normal […] le mode
    //    magnificence doit permettre le swipe gauche et droite comme le mode
    //    normal. »
    //
    // Une couche posée SUR la rangée ne peut pas tenir les deux : transparente
    // aux touches, ses pastilles ne sont pas actionnables ; opaque, elle avale
    // swipe, glisser-déposer et appui long. Les témoins ci-dessous attestent
    // l'état NOUVEAU — la magnification est un PARAMÈTRE de la rangée — plutôt
    // que de disparaître en silence.

    /// Moitié POSITIVE de la garde (sans elle, supprimer un fichier ferait
    /// passer toutes les assertions négatives qui suivent).
    func test_magnification_isAParameterOfTheRow_notAViewAboveIt() throws {
        let row = try rowSource("LentilleConversationRow.swift")
        XCTAssertTrue(
            row.contains("var magnification: LentilleMagnification? = nil"),
            "La rangée reçoit la magnification en paramètre : c'est elle qui se rend magnifiée, " +
            "et c'est ce qui lui fait hériter de TOUTES ses features sans recopie."
        )
        XCTAssertTrue(row.contains("private var isMagnified: Bool { magnification != nil }"))

        let gate = try modeSource("LentilleMagnification.swift")
        XCTAssertTrue(
            gate.contains("scene.level > 0 && election.electedId == conversationId"),
            "Le portillon d'élection décide QUI est magnifié, et seulement pendant la scène."
        )
        XCTAssertTrue(gate.contains("@ObservedObject var election: LentilleFocusElection"))
        XCTAssertTrue(gate.contains("@ObservedObject var scene: LentilleSceneActivity"))
    }

    /// Moitié NÉGATIVE : rien de la carte ne revient — ni la vue, ni son hôte,
    /// ni son chrome.
    func test_noCardView_noCardHost_noCardChrome_anywhereInMode() throws {
        for source in try modeSources() {
            // Code NORMALISÉ : la prose d'un commentaire qui NOMME la règle
            // (l'en-tête de `LentilleFocusCard.swift` raconte précisément la
            // dissolution de la carte) ne doit pas la déclencher.
            let code = normalizedCode(source.code)
            for forbidden in ["LentilleFocusCardHost", "strokeBorder(accent", ".shadow(", "MeeshyColors.backgroundSecondary("] {
                XCTAssertFalse(
                    code.contains(forbidden),
                    "\(source.name) réintroduit « \(forbidden) » — la carte de magnification a été " +
                    "dissoute le 2026-08-23 (pas de bordure, pas d'ombre, pas de fond de carte, " +
                    "pas de couche au-dessus de la rangée)."
                )
            }
        }
        let list = normalizedCode(try listViewSource())
        XCTAssertEqual(
            occurrences(of: "LentilleFocusCardHost(", in: list), 0,
            "L'hôte de carte n'est plus monté : la rangée porte sa propre magnification."
        )
        XCTAssertTrue(
            list.contains("LentilleFocusElectionHost("),
            "L'hôte d'ÉLECTION, lui, reste — c'est lui qui désigne la rangée à magnifier."
        )
    }

    /// « L'objet reste le même » : la magnification réutilise la géométrie de
    /// la rangée au lieu de l'agrandir, et sa hauteur de LAYOUT ne bouge pas —
    /// sinon magnifier pousserait de 16 pt tout ce qui suit, à chaque
    /// changement d'élu, en pleine inertie de défilement.
    @MainActor
    func test_magnification_neverChangesTheLayoutHeight_soTheListNeverJumps() throws {
        let row = try rowSource("LentilleConversationRow.swift")
        XCTAssertTrue(
            row.contains(".frame(height: isMagnified ? LentilleMetrics.FocusInline.height : LentilleMetrics.Row.height)\n        .frame(height: LentilleMetrics.Row.height)"),
            "DEUX cadres : hauteur VISUELLE (100 magnifié / 84 au repos) puis hauteur de LAYOUT " +
            "constante. Le second est ce qui interdit le relayout (R2)."
        )
        XCTAssertEqual(
            LentilleMetrics.FocusInline.height,
            LentilleMetrics.Row.height + 2 * LentilleMetrics.Row.marginVertical,
            "La magnification déborde d'exactement une marge de chaque côté…"
        )
        XCTAssertEqual(
            LentilleMetrics.FocusCard.breathing, LentilleMetrics.Row.marginVertical,
            "… et la respiration écarte les voisines d'exactement autant : elle ne mord jamais."
        )
        XCTAssertEqual(LentilleMetrics.FocusInline.paddingVertical, LentilleMetrics.Row.paddingVertical)
        XCTAssertEqual(LentilleMetrics.FocusInline.avatarContext.size, LentilleMetrics.Avatar.context.size)
        XCTAssertLessThan(
            LentilleMetrics.FocusInline.height, LentilleMetrics.FocusCard.height,
            "La magnification en place déborde MOINS que l'ancienne carte : elle complète, elle n'agrandit plus."
        )
    }

    /// Les trois affordances demandées le 2026-08-23, chacune à sa place —
    /// et chacune un CONTRÔLE, jamais un décor.
    func test_theThreeMagnifiedAffordances_areMountedAndActionable() throws {
        let row = try rowSource("LentilleConversationRow.swift")
        // Catégorie + étiquettes : AU-DESSUS du titre.
        let header = try XCTUnwrap(row.range(of: "headerLine"))
        let top = try XCTUnwrap(row.range(of: "LentilleMagnifiedTopLine("))
        XCTAssertLessThan(
            top.lowerBound, header.lowerBound,
            "« La catégorie actionnable est au-dessus du titre à gauche, avant le listing ; " +
            "à la suite les tags si disponibles. »"
        )
        // Mode + effectif : sur la ligne de date, là où ils étaient déjà.
        XCTAssertTrue(row.contains("LentilleModePill("), "le pill de mode reste exactement où il est")
        XCTAssertTrue(row.contains("LentilleMemberCountChip("), "… avec l'effectif à côté")

        let mode = try modeSource("LentilleMagnification.swift")
        XCTAssertTrue(mode.contains("Button(action: onShowParticipants)"), "l'effectif OUVRE la liste des participants")
        XCTAssertTrue(mode.contains("onMoveToSection(section.id)"), "la catégorie DÉPLACE la conversation")
        XCTAssertTrue(mode.contains("onFilterByTag(tag.name)"), "l'étiquette filtre la liste — son seul écrivain")
        XCTAssertTrue(mode.contains("onRemoveTag(tag)"))
        XCTAssertTrue(
            mode.contains("suggestedMode: conversation.bridge?.suggestedMode"),
            "R6-5 — le pill lit le mode suggéré du pont, jamais un recalcul propre à lui"
        )
        XCTAssertTrue(
            mode.contains("LentilleModeLabels.notchText("),
            "… et délègue son texte à la source unique, jamais une seconde formule de « AUTO · … »"
        )
    }

    /// La magnification HÉRITE des features de la rangée parce qu'elle EST la
    /// rangée : rien de ce que la rangée sait faire n'est recopié dans
    /// `Lentille/Mode/`. Ce témoin garde l'absence de recopie — c'est elle qui
    /// interdit les deux vues de diverger (le ❤️ favori absent en
    /// magnification, la pastille de présence oubliée, l'anneau story perdu :
    /// trois régressions vécues du temps de la carte).
    func test_modeFolder_neverRepaintsWhatTheRowAlreadyPaints() throws {
        for source in try modeSources() {
            let code = normalizedCode(source.code)
            for painted in ["MeeshyAvatar(", "conversation.displayName", "resolvedLastMessagePreview(", "LentilleBridgeLine("] {
                XCTAssertFalse(
                    code.contains(painted),
                    "\(source.name) repeint « \(painted) », que `LentilleConversationRow` peint déjà. " +
                    "La magnification doit HÉRITER de la rangée, jamais la dupliquer."
                )
            }
        }
    }

    /// La date garde sa place ; seule sa PRÉCISION change.
    func test_theDateKeepsItsPlace_onlyItsPrecisionChanges() throws {
        let row = try rowSource("LentilleConversationRow.swift")
        XCTAssertTrue(row.contains("LentilleFocusCard.fullTimestamp("), "date complète sous la loupe")
        XCTAssertTrue(row.contains("LentilleRowTimestamp(date: conversation.lastMessageAt)"), "relatif court au repos")
        let dateLine = try XCTUnwrap(row.range(of: "private var dateLine: some View {"))
        let after = row[dateLine.upperBound...].prefix(1200)
        XCTAssertTrue(after.contains("Spacer(minLength: 0)"), "la date reste poussée à droite, magnifiée ou non")
    }

    /// L'aperçu coule sur DEUX lignes sous la loupe, une seule au repos.
    func test_thePreviewFlowsOnTwoLines_onlyWhenMagnified() throws {
        let row = try rowSource("LentilleConversationRow.swift")
        XCTAssertTrue(row.contains(".lineLimit(isMagnified ? 2 : 1)"))
        XCTAssertTrue(
            row.contains("(senderPrefix + Text(resolvedPreviewText)"),
            "« Auteur : texte » reste UN seul texte — deux `Text` côte à côte tronquaient le message avant le bord."
        )
    }

    /// Le portillon `.equatable()` doit voir la magnification, sinon la rangée
    /// élue resterait figée dans son état précédent ; il ne doit PAS voir les
    /// fermetures, sinon il raterait à chaque passe de body de la liste.
    @MainActor
    func test_theEquatableGateSeesTheMagnification_butNeverItsClosures() throws {
        let row = try rowSource("LentilleConversationRow.swift")
        XCTAssertTrue(row.contains("LentilleMagnification.rendersIdentically(lhs.magnification, rhs.magnification)"))

        var a = LentilleMagnification(isAnonymous: false, categories: [], activeTagFilter: nil)
        var b = LentilleMagnification(isAnonymous: false, categories: [], activeTagFilter: nil)
        a.onShowParticipants = { }
        b.onFilterByTag = { _ in }
        XCTAssertTrue(
            LentilleMagnification.rendersIdentically(a, b),
            "Deux magnifications aux mêmes DONNÉES rendent pareil, quelles que soient leurs fermetures."
        )
        XCTAssertFalse(LentilleMagnification.rendersIdentically(a, nil))
        XCTAssertFalse(
            LentilleMagnification.rendersIdentically(a, LentilleMagnification(isAnonymous: false, activeTagFilter: "MAIN")),
            "Le filtre actif change le rendu d'une chip : il doit passer le portillon."
        )
    }

    // MARK: - 3. Garde de source — Lentille/Mode/ et Lentille/Row/

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

    private static var rowDirectory: URL {
        iosRoot.appendingPathComponent("Meeshy/Features/Main/Lentille/Row")
    }

    /// Découverte DYNAMIQUE (leçon 257) — jamais une liste de noms recopiée :
    /// un fichier ajouté demain entre automatiquement dans le périmètre.
    private func modeSources() throws -> [(name: String, code: String)] {
        let entries = try FileManager.default.contentsOfDirectory(
            at: Self.modeDirectory, includingPropertiesForKeys: nil
        )
        return try entries
            .filter { $0.pathExtension == "swift" }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
            .map { ($0.lastPathComponent, try String(contentsOf: $0, encoding: .utf8)) }
    }

    private func modeSource(_ file: String) throws -> String {
        try String(contentsOf: Self.modeDirectory.appendingPathComponent(file), encoding: .utf8)
    }

    private func rowSource(_ file: String) throws -> String {
        try String(contentsOf: Self.rowDirectory.appendingPathComponent(file), encoding: .utf8)
    }

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
    /// aucun `frame(height:` dans les fichiers de carte) ». La hauteur de la
    /// magnification est une constante lue depuis `LentilleMetrics`, posée par
    /// la RANGÉE — `Lentille/Mode/` n'en pose aucune.
    func test_modeFiles_neverHardcodeFrameHeight() throws {
        for source in try modeSources() {
            XCTAssertEqual(
                occurrences(of: "frame(height:", in: normalizedCode(source.code)), 0,
                "\(source.name) contient « frame(height: » — la hauteur appartient à la rangée, " +
                "sur la constante `LentilleMetrics.FocusInline.height`, jamais une mesure de layout."
            )
        }
    }

    /// Règle dure du workshop : « Button(.plain) jamais .onTapGesture » — un
    /// `.onTapGesture` posé sur un contrôle interne à la rangée se fait AVALER
    /// par l'appui long du conteneur (régression #3010 WS-4), et n'est pas
    /// exposé comme un contrôle à VoiceOver.
    func test_modeFiles_neverUseOnTapGesture() throws {
        for source in try modeSources() {
            XCTAssertEqual(
                occurrences(of: ".onTapGesture", in: normalizedCode(source.code)), 0,
                "\(source.name) contient « .onTapGesture »."
            )
        }
    }

    func test_modePills_areNativeMenusOrButtons_neverAPopover() throws {
        let code = try modeSource("LentilleMagnification.swift")
        XCTAssertTrue(code.contains("Menu {"), "les pastilles de mode/catégorie/étiquette sont des `Menu` natifs")
        XCTAssertFalse(code.contains(".popover("), "plus jamais de `.popover` : feuille plein écran sur iPhone")
    }

    /// Un seul contour sur toute la magnification : le liseré BLANC qui dit
    /// quelle étiquette filtre la liste. Aucun contour d'accent nulle part —
    /// « pas de bordure ».
    func test_theOnlyBorder_isTheWhiteHairlineOfTheActiveTagFilter() throws {
        let code = try modeSource("LentilleMagnification.swift")
        XCTAssertTrue(code.contains("Color.white.opacity(isFiltering ? 0.95 : 0)"))
        XCTAssertEqual(
            occurrences(of: "strokeBorder", in: code), 1,
            "UN seul `strokeBorder` dans toute la magnification, et c'est celui-là."
        )
    }

    /// Redite volontaire de la garde `FocusCardElectionTests
    /// .test_electedState_neverLivesInTheListBody` : ce lot TOUCHE
    /// `ConversationListView.swift` et doit prouver qu'il n'a pas réintroduit
    /// la lecture directe que cette garde interdit — c'est elle qui empêche la
    /// liste entière de se ré-évaluer à chaque élection.
    func test_conversationListView_stillNeverReadsTheElectedIdDirectly() throws {
        let code = normalizedCode(try listViewSource())
        XCTAssertEqual(
            occurrences(of: "focusElection.electedId", in: code), 0,
            "`ConversationListView.swift` ne doit JAMAIS lire `focusElection.electedId` : " +
            "le magasin est passé PAR RÉFÉRENCE, et c'est le portillon d'élection " +
            "(`LentilleMagnifiableRow`) qui le lit, dans son fichier à lui."
        )
        XCTAssertTrue(
            code.contains("focusElection: focusElection,"),
            "… mais il le PASSE bien, sans quoi aucune rangée ne saurait qu'elle est élue."
        )
    }

    /// Respiration (2026-08-22) : les voisines s'écartent de la ligne de
    /// focus, la rangée élue ne bouge pas, jamais de saut au passage.
    func test_breathing_pushesNeighboursAway_neverTheElectedRow_andRampsSmoothly() {
        let full = LentilleMetrics.FocusCard.breathing
        let far = LentilleMetrics.FocusCard.breathingRampStart + LentilleMetrics.FocusCard.breathingRampLength + 1
        XCTAssertEqual(LentilleFocusBreathing.push(distance: 0, level: 1, reduceMotion: false), 0)
        XCTAssertEqual(LentilleFocusBreathing.push(distance: 20, level: 1, reduceMotion: false), 0, "dans la demi-rangée : l'élue")
        XCTAssertEqual(LentilleFocusBreathing.push(distance: far, level: 1, reduceMotion: false), -full, "au-dessus ⇒ vers le haut")
        XCTAssertEqual(LentilleFocusBreathing.push(distance: -far, level: 1, reduceMotion: false), full, "en dessous ⇒ vers le bas")
        XCTAssertEqual(LentilleFocusBreathing.push(distance: far, level: 0.5, reduceMotion: false), -full / 2, "suit le niveau de scène")
        XCTAssertEqual(LentilleFocusBreathing.push(distance: far, level: 1, reduceMotion: true), 0)
        let mid = LentilleMetrics.FocusCard.breathingRampStart + LentilleMetrics.FocusCard.breathingRampLength / 2
        XCTAssertEqual(LentilleFocusBreathing.push(distance: -mid, level: 1, reduceMotion: false), full / 2, accuracy: 0.001)
        XCTAssertEqual(LentilleFocusBreathing.push(distance: far, level: 0, reduceMotion: false), 0, "au repos, rien")
    }

    /// Le pont ✦ ne remplace l'aperçu que s'il reste des non-lus — même règle
    /// que la rangée plate.
    func test_showsBridge_requiresUnreadAndABridge() {
        let bridge = ConversationBridge(kind: .fallback, unreadCount: 3, suggestedMode: .focal)
        XCTAssertTrue(LentilleFocusCard.showsBridge(unreadCount: 3, bridge: bridge))
        XCTAssertFalse(LentilleFocusCard.showsBridge(unreadCount: 0, bridge: bridge))
        XCTAssertFalse(LentilleFocusCard.showsBridge(unreadCount: 3, bridge: nil))
    }

    /// La hauteur de l'ANCIENNE carte reste le miroir fidèle du token partagé
    /// que la peau WEB consomme toujours — la peau iOS ne le peint plus, mais
    /// le retirer du miroir ferait diverger les deux en silence.
    @MainActor
    func test_focusCardToken_stillMirrorsTheSharedDesignFile_forTheWebSkin() throws {
        let tokensURL = Self.iosRoot
            .deletingLastPathComponent()   // .../apps
            .deletingLastPathComponent()   // repo
            .appendingPathComponent("packages/shared/design/lentille-tokens.json")
        let data = try Data(contentsOf: tokensURL)
        let root = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        let list = try XCTUnwrap(root["list"] as? [String: Any])
        let focusCard = try XCTUnwrap(list["focusCard"] as? [String: Any])
        XCTAssertEqual(Double(LentilleMetrics.FocusCard.height), focusCard["height"] as? Double)
        XCTAssertEqual(Double(LentilleMetrics.FocusCard.avatarContext.size), focusCard["avatarSize"] as? Double)
        XCTAssertGreaterThan(LentilleMetrics.FocusCard.height, LentilleMetrics.Row.height)
    }
}
