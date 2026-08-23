import XCTest
@testable import Meeshy

/// Suite COMPLÈTE de la géométrie du squelette Lentille (contrat LWS-7,
/// workshop I-068 — nom cité par le contrat §LWS-7). `LentilleSkeletonRowTests`
/// (I-066) verrouillait déjà que `LentilleSkeletonRow`, LUE SEULE, dérive
/// chacune de ses cotes de `LentilleMetrics` plutôt que d'un littéral. Cette
/// suite la COMPLÈTE sur deux axes qu'elle ne couvrait pas :
///
/// 1. **Parité inter-fichiers** — « aucun saut à l'hydratation » exige que le
///    rang RÉEL (`LentilleConversationRow.swift`) lise les MÊMES symboles
///    `LentilleMetrics` que le squelette, pas seulement que le squelette en
///    lise. Un squelette parfaitement tokenisé à côté d'un rang réel qui
///    aurait dérivé vers un littéral concurrent produirait quand même un
///    saut visible — aucun témoin existant ne vérifiait le CÔTÉ RÉEL de cette
///    paire.
/// 2. **Le mux de la Partie B (I-067bis)** — `ConversationListView.swift`,
///    branche cache vide (`ConversationListEmptyBranch.skeleton`, gardée par
///    `groupedConversations.isEmpty`) : drapeau ON ⇒ `LentilleSkeletonRow()`,
///    OFF ⇒ `SkeletonConversationRow()` inchangé. Ce fichier reste hors
///    périmètre de `Lentille/Row/` (exception de périmètre Partie B), donc
///    hors `LentilleRowSourceGuardTests` — la garde de structure sur le mux
///    lui-même vit ici, à la manière de `LentilleRowMuxSourceGuardTests`
///    pour le mux de RANG (I-067).
final class LentilleSkeletonGeometryTests: XCTestCase {

    // MARK: - Localisation des sources

    private static var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Lentille
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
    }

    private func source(at relativePath: String) throws -> String {
        try String(contentsOf: Self.iosRoot.appendingPathComponent(relativePath), encoding: .utf8)
    }

    private func skeletonSource() throws -> String {
        try source(at: "Meeshy/Features/Main/Lentille/Row/LentilleSkeletonRow.swift")
    }

    private func realRowSource() throws -> String {
        try source(at: "Meeshy/Features/Main/Lentille/Row/LentilleConversationRow.swift")
    }

    private func listViewSource() throws -> String {
        try source(at: "Meeshy/Features/Main/Views/ConversationListView.swift")
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

    // MARK: - 1. Parité inter-fichiers — le rang RÉEL lit les MÊMES symboles que le squelette
    //
    // « Géométrie == métriques du rang » (critère du contrat) ne se prouve
    // pas en lisant le squelette seul : il faut que `LentilleConversationRow`
    // lise EXACTEMENT les mêmes quatre symboles de géométrie de conteneur.

    /// Les deux sources, chargées UNE fois — évite tout `try` imbriqué dans
    /// un littéral de tuple/tableau (ambiguïté syntaxique à éviter, même si
    /// Swift l'admettrait).
    private func rowAndSkeletonSources() throws -> [(name: String, code: String)] {
        [
            ("LentilleConversationRow.swift", try realRowSource()),
            ("LentilleSkeletonRow.swift", try skeletonSource()),
        ]
    }

    func test_bothRowAndSkeleton_useRowHeightMetric() throws {
        for (name, code) in try rowAndSkeletonSources() {
            XCTAssertTrue(
                normalizedCode(code).contains("frame(height: LentilleMetrics.Row.height)"),
                "\(name) doit fixer sa hauteur avec LentilleMetrics.Row.height — un littéral 64 " +
                "recopié d'un seul côté produirait un saut visible à l'hydratation (contrat §LWS-7)."
            )
        }
    }

    func test_bothRowAndSkeleton_useRowPaddingMetrics() throws {
        for (name, code) in try rowAndSkeletonSources() {
            let normalized = normalizedCode(code)
            XCTAssertTrue(
                normalized.contains("padding(.horizontal, LentilleMetrics.Row.paddingHorizontal)"),
                "\(name) doit reprendre LentilleMetrics.Row.paddingHorizontal — même remarque que la hauteur."
            )
            XCTAssertTrue(
                normalized.contains("padding(.vertical, LentilleMetrics.Row.paddingVertical)"),
                "\(name) doit reprendre LentilleMetrics.Row.paddingVertical — même remarque que la hauteur."
            )
        }
    }

    /// Le squelette dimensionne son placeholder directement par
    /// `LentilleMetrics.Avatar.size` ; le rang réel délègue l'avatar à
    /// `MeeshyAvatar` via `LentilleMetrics.Avatar.context` (§0 — « avatar 44
    /// → `AvatarContext.conversationHeaderCollapsed`, pas de `.custom(44)` »)
    /// et redimensionne SON PROPRE anneau accent par `LentilleMetrics.Avatar.size`
    /// (`avatarView`, l'anneau `strokeBorder` englobant l'avatar). Les deux
    /// symboles (`.size`, `.context`) partagent la MÊME source de vérité
    /// (`LentilleMetrics.Avatar`, contrat §LWS-5) — `.size` est même DÉFINI
    /// comme `context.size` (`LentilleMetrics.swift`) : ce test verrouille
    /// que le rang réel référence bien `LentilleMetrics.Avatar` (par l'un ou
    /// l'autre de ses deux symboles), jamais un diamètre 44 concurrent.
    func test_realRow_avatarRing_and_skeleton_avatarPlaceholder_shareTheSameAvatarMetricNamespace() throws {
        let skeletonCode = normalizedCode(try skeletonSource())
        XCTAssertTrue(
            skeletonCode.contains("width: LentilleMetrics.Avatar.size, height: LentilleMetrics.Avatar.size"),
            "LentilleSkeletonRow.swift doit dimensionner son placeholder d'avatar par LentilleMetrics.Avatar.size"
        )

        let realRowCode = normalizedCode(try realRowSource())
        XCTAssertTrue(
            realRowCode.contains("LentilleMetrics.Avatar.size + LentilleMetrics.Avatar.ringWidth"),
            "LentilleConversationRow.swift doit dimensionner l'anneau de son avatar avec LentilleMetrics.Avatar.size, même namespace que le placeholder du squelette"
        )
        XCTAssertTrue(
            realRowCode.contains("context: LentilleMetrics.Avatar.context"),
            "LentilleConversationRow.swift doit passer LentilleMetrics.Avatar.context à MeeshyAvatar — §0 : réutiliser .conversationHeaderCollapsed (44pt), jamais .custom(44)"
        )
    }

    func test_bothRowAndSkeleton_useSameNameAndLine2Fonts() throws {
        for (name, code) in try rowAndSkeletonSources() {
            let normalized = normalizedCode(code)
            XCTAssertTrue(
                normalized.contains("LentilleMetrics.Name.font"),
                "\(name) doit référencer LentilleMetrics.Name.font pour la police du nom."
            )
            XCTAssertTrue(
                normalized.contains("LentilleMetrics.Line2.font"),
                "\(name) doit référencer LentilleMetrics.Line2.font pour la police de la ligne 2."
            )
        }
    }

    /// Chaque branche de la ligne 2 réelle (typing, brouillon, préview —
    /// standard/expired/hidden/view-once) doit utiliser la police de ligne 2
    /// du token : un décompte figé détecte toute branche qui dériverait vers
    /// une police concurrente sans que les tests ci-dessus (qui ne
    /// vérifient que la PRÉSENCE d'au moins une occurrence) ne le voient.
    /// Valeur de repère : 11 occurrences (typing, brouillon × 2, expired,
    /// hidden × 1 + sender, view-once × 1 + sender, standard texte + sender,
    /// pièce jointe + sender, statut d'appel en direct). La 11ᵉ est le badge
    /// live-call ajouté par V3ter L13 (47f9556b) — investiguée : elle
    /// référence bien le token, pas une police littérale. Une VARIATION (à la
    /// hausse comme à la baisse) doit être investiguée avant d'ajuster ce
    /// nombre — jamais relâchée en `>= 1`.
    func test_realRow_line2_everyBranch_usesLine2FontToken_fixedCount() throws {
        let code = try realRowSource()
        XCTAssertEqual(
            occurrences(of: "LentilleMetrics.Line2.font", in: code), 11,
            "Le compte d'occurrences de LentilleMetrics.Line2.font dans LentilleConversationRow.swift " +
            "a changé par rapport au repère connu (11) — vérifier qu'aucune branche de la ligne 2 " +
            "n'a dérivé vers une police littérale avant d'ajuster ce nombre."
        )
    }

    // MARK: - 2. Le mux de la Partie B (I-067bis) — garde de structure
    //
    // `ConversationListView.swift`, branche cache vide UNIQUEMENT
    // (`ConversationListEmptyBranch.skeleton`) : drapeau ON ⇒
    // `LentilleSkeletonRow()`, OFF ⇒ `SkeletonConversationRow()` inchangé.

    func test_emptyBranchSkeletonMux_isGatedByLentilleFeatureFlag() throws {
        let code = normalizedCode(try listViewSource())
        XCTAssertTrue(
            code.contains("if LentilleFeatureFlag.isLentilleListEnabled { LentilleSkeletonRow()"),
            "La branche cache vide de ConversationListView.swift (case .skeleton) doit brancher " +
            "sur LentilleFeatureFlag.isLentilleListEnabled pour monter LentilleSkeletonRow() — mux I-067bis."
        )
    }

    /// Drapeau OFF ⇒ chemin historique INCHANGÉ, bit à bit identique — le
    /// critère explicite de la tâche, vérifié en structure comme
    /// `LentilleRowMuxSourceGuardTests` le fait pour le mux de rang.
    func test_emptyBranchSkeletonMux_offBranch_buildsSkeletonConversationRow_unchanged() throws {
        let code = normalizedCode(try listViewSource())
        XCTAssertTrue(
            code.contains("} else { SkeletonConversationRow() .staggeredAppear(index: index, baseDelay: 0.04) } } }"),
            "La branche OFF du mux de squelette doit construire SkeletonConversationRow() avec " +
            "EXACTEMENT le même staggeredAppear qu'avant I-067bis (rendu historique inchangé)."
        )
    }

    /// La branche ON doit rester dans la MÊME boucle `ForEach(0..<6, …)`, au
    /// même `staggeredAppear` — le mux ne doit rien changer d'autre que le
    /// type de rang monté (contrat : « ne touche à rien d'autre dans ce
    /// fichier »).
    func test_emptyBranchSkeletonMux_onBranch_sameForEachAndStaggerAsOffBranch() throws {
        let code = normalizedCode(try listViewSource())
        XCTAssertTrue(
            code.contains("LazyVStack(spacing: 8) { ForEach(0..<6, id: \\.self) { index in if LentilleFeatureFlag.isLentilleListEnabled { LentilleSkeletonRow() .staggeredAppear(index: index, baseDelay: 0.04) } else {"),
            "Les deux branches du mux de squelette doivent rester dans le MÊME LazyVStack/ForEach(0..<6, …) avec le MÊME staggeredAppear(baseDelay: 0.04) — seul le type de rang doit changer."
        )
    }

    /// Un seul site de mux attendu dans ce fichier : deux occurrences de
    /// `LentilleSkeletonRow()`/`SkeletonConversationRow()` (une par branche
    /// du `case .skeleton`), ni plus (fuite du mux ailleurs dans le fichier,
    /// hors périmètre Partie B), ni moins.
    func test_emptyBranchSkeletonMux_hasExactlyOneOccurrenceOfEachRowType() throws {
        let code = normalizedCode(try listViewSource())
        XCTAssertEqual(
            occurrences(of: "LentilleSkeletonRow()", in: code), 1,
            "Une seule occurrence de LentilleSkeletonRow() attendue dans ConversationListView.swift (branche ON du mux)."
        )
        XCTAssertEqual(
            occurrences(of: "SkeletonConversationRow()", in: code), 1,
            "Une seule occurrence de SkeletonConversationRow() attendue dans ConversationListView.swift (branche OFF du mux) — le fichier ne doit pas avoir régressé vers un second site de squelette historique."
        )
    }

    /// Garde de PÉRIMÈTRE (Partie B) : le reste du fichier — sticky/pilule/rail
    /// de I-062/I-063bis, le mux de RANG (propriété de I-067, vivant dans
    /// `ConversationListView+Rows.swift`, pas ici) — ne doit PAS avoir été
    /// touché par erreur. `LentilleConversationRow(` (le rang plat lui-même,
    /// par opposition au squelette) n'a AUCUNE raison d'apparaître dans ce
    /// fichier : sa seule construction vit dans `ConversationListView+Rows.swift`.
    func test_conversationListView_doesNotConstructLentilleConversationRow_muxStaysInRowsFile() throws {
        let code = normalizedCode(try listViewSource())
        XCTAssertEqual(
            occurrences(of: "LentilleConversationRow(", in: code), 0,
            "ConversationListView.swift ne doit JAMAIS construire LentilleConversationRow directement " +
            "— cette construction vit exclusivement dans ConversationListView+Rows.swift (rowCore, I-067) ; " +
            "la Partie B (I-067bis) n'ouvre QUE la branche cache vide pour LentilleSkeletonRow."
        )
    }

    /// **D1 — le saut de 8 pt à l'hydratation.** Le contrat de cette suite est
    /// « aucun saut à l'hydratation » ; les témoins ci-dessus le vérifient
    /// SOUS la rangée (hauteur, paddings internes, polices), mais aucun ne
    /// regardait la marge que la LISTE pose AUTOUR d'elle.
    ///
    /// Or elles divergent. Les rangées réelles ont été ramenées à la cote de
    /// design (`LentilleMetrics.Row.marginHorizontal`, 8) par le retour
    /// produit « la liste de conversation semble décalée » ; le `LazyVStack`
    /// du squelette, lui, est resté sur le `16` littéral — et ce padding est
    /// posé sur le CONTENEUR, donc il s'applique aux DEUX branches du mux,
    /// alors que le mux ne porte que sur le type de rang.
    ///
    /// Conséquence mesurée au simulateur : au démarrage à froid, les six
    /// placeholders s'affichent à 16 pt du bord, puis les vraies rangées les
    /// remplacent à 8 pt — toute la liste saute latéralement de 8 pt sous
    /// l'oeil de l'utilisateur. C'est exactement le saut que cette suite
    /// existe pour interdire.
    ///
    /// La branche OFF garde son `16` : le contrat de la Partie B est que le
    /// chemin historique reste inchangé, et c'est la peau Lentille qui porte
    /// la cote de design.
    func test_emptyBranchSkeleton_usesTheSameHorizontalMarginAsTheRealRows() throws {
        let code = normalizedCode(try listViewSource())
        XCTAssertTrue(
            code.contains("LentilleFeatureFlag.isLentilleListEnabled ? LentilleMetrics.Row.marginHorizontal :"),
            "Le LazyVStack du squelette doit muxer sa marge horizontale : peau Lentille ⇒ "
            + "LentilleMetrics.Row.marginHorizontal (la cote que lisent les rangées réelles, "
            + "ConversationListView.swift, sectionConversations), peau historique ⇒ 16 inchangé. "
            + "Un padding littéral posé sur le conteneur s'applique aux DEUX branches et fait "
            + "sauter la liste de 8 pt quand les vraies rangées remplacent les placeholders."
        )
    }
}
