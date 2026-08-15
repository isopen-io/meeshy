import XCTest
import MeeshySDK
@testable import Meeshy

/// Conteneur sticky de la Lentille (contrat LWS-6, travaux 1-3 — écart E4).
///
/// Deux familles de témoins, parce que la propriété à garder est de DEUX
/// natures :
///
/// 1. **Structurelle** — « `Section {} header: {}` + `pinnedViews:` » est une
///    forme de code, pas un comportement observable : aucun framework
///    d'inspection SwiftUI n'est disponible dans ce bundle, et un test de
///    rendu ne dirait pas si le header est dans le slot `header:` (donc
///    épinglable) ou simplement rendu avant le contenu (donc pas épinglable) —
///    or c'est EXACTEMENT la différence qui fait ou défait LWS-6. La garde de
///    source, commentaires retirés (`AppSourceGuard`), est ici le seul témoin
///    honnête.
/// 2. **Comportementale** — les règles de pliage et d'identité de section sont
///    des fonctions PURES (`ConversationListView.isSectionContentVisible`,
///    `LentilleSectionIdentity`) : elles se testent directement, sans vue.
///
/// Suite ouverte : LWS-6/I-064 la complète (drop 4 sections ciblées, état de
/// la pilule, gardes de source Chrome). Ce fichier porte les témoins des
/// critères propres à I-062.
final class StickySectionStructureTests: XCTestCase {

    // MARK: - Source

    private func listViewSource() throws -> String {
        try source(at: "Meeshy/Features/Main/Views/ConversationListView.swift")
    }

    private func viewModelSource() throws -> String {
        try source(at: "Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift")
    }

    private func source(at relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Lentille
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// Code seul, espaces normalisés — une garde de structure ne doit dépendre
    /// ni des commentaires (leçon `source_guard_tests_must_strip_comments`) ni
    /// de l'indentation d'un jour donné.
    private func normalizedCode(_ source: String) -> String {
        AppSourceGuard.stripComments(source)
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }

    private func occurrences(of needle: String, in haystack: String) -> Int {
        haystack.components(separatedBy: needle).count - 1
    }

    // MARK: - Travail 1 — le conteneur épingle

    func test_sectionsContainer_isALazyVStackWithPinnedSectionHeaders() throws {
        let code = normalizedCode(try listViewSource())

        XCTAssertEqual(
            occurrences(of: "LazyVStack(spacing: 8, pinnedViews: pinnedSectionHeaders)", in: code), 1,
            "Le conteneur des sections doit être EXACTEMENT " +
            "`LazyVStack(spacing: 8, pinnedViews: pinnedSectionHeaders)` " +
            "(ConversationListView.swift, `sectionsContent`) — contrat LWS-6 travail 1. " +
            "Sans `pinnedViews:`, les `Section` sont rendues mais rien n'est épinglé : " +
            "la Lentille perd son sticker sticky sans qu'aucun autre test ne rougisse."
        )
    }

    func test_pinnedSectionHeaders_isGatedByTheFlag_andEmptyWhenOff() throws {
        let code = normalizedCode(try listViewSource())

        XCTAssertTrue(
            code.contains("private var pinnedSectionHeaders: PinnedScrollableViews { LentilleFeatureFlag.isLentilleListEnabled ? [.sectionHeaders] : [] }"),
            "L'épinglage est une propriété du CONTENEUR, partagé entre les deux peaux : " +
            "`pinnedSectionHeaders` doit rendre `[.sectionHeaders]` sous drapeau ON et " +
            "l'ensemble VIDE sous OFF (rendu d'aujourd'hui, sections non épinglées — " +
            "critère « Drapeau OFF ⇒ rendu identique »). Un `[.sectionHeaders]` inconditionnel " +
            "rendrait la liste sticky pour tout le monde, drapeau OFF compris."
        )
    }

    // MARK: - Travail 1-2 — rangs en contenu, sticker en header

    func test_eachGroup_rendersASectionWithRowsAsContentAndHeaderInHeaderSlot() throws {
        let code = normalizedCode(try listViewSource())

        XCTAssertTrue(
            code.contains(
                "Section { sectionContent(for: group, orderedConversationIds: orderedConversationIds, " +
                "trackedSectionId: trackedSectionId) } header: { sectionHeader(for: group) }"
            ),
            "Chaque groupe doit être une `Section` dont les RANGS sont le contenu et le " +
            "header le slot `header:` — la seule forme que `pinnedViews: [.sectionHeaders]` " +
            "sait épingler (contrat LWS-6 travail 1). Header rendu avant le contenu comme " +
            "avant LWS-6 = compile, s'affiche… et n'épingle jamais."
        )
    }

    func test_header_isRenderedOutsideTheExpansionCondition_soCollapsingKeepsTheSticker() throws {
        let code = normalizedCode(try listViewSource())

        // Le pliage garde le CONTENU (`sectionContent`), jamais le header.
        XCTAssertTrue(
            code.contains("private func sectionContent( for group: (section: ConversationSection, conversations: [Conversation]), orderedConversationIds: [String], trackedSectionId: String? ) -> some View { if isSectionContentVisible(group.section.id) {"),
            "La condition de pliage doit garder le CONTENU de la section et lui seul : " +
            "`sectionContent` commence par `if isSectionContentVisible(...)`. Critère LWS-6 : " +
            "« replier une catégorie masque ses rangs et CONSERVE son sticker »."
        )
        XCTAssertFalse(
            code.contains("private func sectionHeader( for group: (section: ConversationSection, conversations: [Conversation]) ) -> some View { if isSectionContentVisible"),
            "Le header ne doit JAMAIS être conditionné par le pliage — sinon replier une " +
            "catégorie ferait disparaître son sticker et l'utilisateur perdrait le moyen " +
            "de la déplier."
        )
    }

    // MARK: - Travail 2 — mux de peau, consommateurs inchangés

    func test_headerLabel_muxesLentilleStickerAndSectionHeaderView_exactlyOnceEach() throws {
        let code = normalizedCode(try listViewSource())

        XCTAssertEqual(
            occurrences(of: "LentilleSticker(", in: code), 1,
            "Un seul site de montage du sticker (drapeau ON) — `sectionHeaderLabel`."
        )
        XCTAssertEqual(
            occurrences(of: "SectionHeaderView(", in: code), 1,
            "Un seul site de montage de `SectionHeaderView` (drapeau OFF) : le header " +
            "historique doit rester rendu, à l'identique, quand la Lentille est éteinte."
        )
        XCTAssertTrue(
            code.contains("if LentilleFeatureFlag.isLentilleListEnabled { LentilleSticker("),
            "Le mux de peau vit dans `sectionHeaderLabel` et NULLE PART ailleurs : " +
            "sticker sous drapeau, `SectionHeaderView` sinon."
        )
    }

    func test_persistCategoryExpansion_isCalledFromExactlyOneSite() throws {
        let code = normalizedCode(try listViewSource())

        XCTAssertEqual(
            occurrences(of: "persistCategoryExpansion(", in: code), 1,
            "`persistCategoryExpansion` doit rester appelée depuis UN seul site " +
            "(`toggleSection`) — critère LWS-6 « appelé une fois, pas deux ». Le mux de " +
            "peau du header a doublé le nombre de vues de header : si chaque branche " +
            "persistait de son côté, un pliage écrirait deux fois."
        )
        XCTAssertEqual(
            occurrences(of: "expandedSections.remove(", in: code) + occurrences(of: "expandedSections.insert(", in: code), 3,
            "`expandedSections` est consommé INCHANGÉ (contrat LWS-6 travail 2) : un " +
            "`remove` + un `insert` dans `toggleSection`, plus l'`insert` historique de " +
            "l'`adaptiveOnChange(of: userCategories)`. Tout écrivain supplémentaire est " +
            "une réimplémentation du pliage."
        )
    }

    // MARK: - Pliage (règle pure)

    /// Drapeau OFF, la règle de visibilité doit dégénérer EXACTEMENT en celle
    /// d'avant LWS-6 : `isSingleUngroupedSection || expandedSections.contains(id)`.
    /// Vérifié de façon exhaustive sur les quatre combinaisons.
    func test_isSectionContentVisible_offFlagIds_matchLegacyCondition() {
        let legacyIds = ["pinned", "other", "work", "6512f2a0e1b4c3d2a1908877"]

        for id in legacyIds {
            for isSingle in [true, false] {
                for expandedContainsId in [true, false] {
                    let expanded: Set<String> = expandedContainsId ? [id] : []
                    let expected = isSingle || expanded.contains(id)

                    XCTAssertEqual(
                        ConversationListView.isSectionContentVisible(
                            sectionId: id,
                            expandedSections: expanded,
                            isSingleUngroupedSection: isSingle
                        ),
                        expected,
                        "Section « \(id) », isSingleUngrouped=\(isSingle), déplié=\(expandedContainsId) : " +
                        "la règle de visibilité des rangs doit rester bit-à-bit celle d'aujourd'hui " +
                        "pour toute section qui n'est pas une section calculée de la Lentille."
                    )
                }
            }
        }
    }

    func test_isSectionContentVisible_collapsedCategory_hidesItsRows() {
        XCTAssertFalse(
            ConversationListView.isSectionContentVisible(
                sectionId: "work",
                expandedSections: ["pinned", "other"],
                isSingleUngroupedSection: false
            ),
            "Une catégorie repliée (absente d'`expandedSections`) masque ses rangs — " +
            "le pliage survit à la restructuration sticky (E4)."
        )
    }

    func test_lentilleComputedSections_areNeverCollapsible_andAlwaysVisible() {
        for section in LentilleSectionIdentity.allSections {
            XCTAssertFalse(
                ConversationListView.isSectionCollapsible(sectionId: section.id),
                "« \(section.name) » est CALCULÉE par la loi : son pliage ne serait persisté " +
                "nulle part (`persistCategoryExpansion` ne connaît que les catégories " +
                "utilisateur) et se rouvrirait au rechargement. Décision LWS-6/I-062 : " +
                "sticker non interactif, jamais de bouton qui ment."
            )
            XCTAssertTrue(
                ConversationListView.isSectionContentVisible(
                    sectionId: section.id,
                    expandedSections: [],
                    isSingleUngroupedSection: false
                ),
                "« \(section.name) » ne figure jamais dans `expandedSections` (dont le défaut " +
                "reste [\"pinned\", \"other\"]) : si sa visibilité en dépendait, la liste " +
                "s'afficherait VIDE sous drapeau ON."
            )
        }
    }

    // MARK: - Identité des sections live/temporelles (décision LWS-6/I-062)

    func test_lentilleSectionIdentity_coversEveryResolverBucket() {
        let temporalIds = LentilleSectionResolver.TemporalSectionKind.allCases
            .map(LentilleSectionIdentity.id(for:))
        let declared = Set(LentilleSectionIdentity.allSections.map(\.id))

        XCTAssertEqual(
            declared,
            Set([LentilleSectionIdentity.liveId] + temporalIds),
            "Égalité d'ENSEMBLES (leçon 257) : chaque bucket que le résolveur sait émettre " +
            "— `.live` et chaque `TemporalSectionKind` — doit avoir son identité de liste. " +
            "Une garde de présence individuelle laisserait passer le bucket ajouté demain."
        )
        XCTAssertEqual(
            LentilleSectionIdentity.allSections.count,
            LentilleSectionResolver.TemporalSectionKind.allCases.count + 1,
            "Aucun doublon d'id : chaque section a une identité DISTINCTE (les ids servent " +
            "d'identité de `ForEach`, de clé du registre de frames et de cible de drop)."
        )
    }

    func test_lentilleSectionIdentity_idsAreNamespaced_andDoNotCollideWithSdkSections() {
        let sdkIds = Set(MeeshyConversationSection.allSections.map(\.id))

        for section in LentilleSectionIdentity.allSections {
            XCTAssertTrue(
                section.id.hasPrefix(LentilleSectionIdentity.idPrefix),
                "« \(section.id) » doit porter le préfixe `\(LentilleSectionIdentity.idPrefix)` : " +
                "c'est LUI le prédicat « section calculée » (non repliable, non assignable), " +
                "pas une liste d'ids à tenir à jour ailleurs."
            )
            XCTAssertFalse(
                sdkIds.contains(section.id),
                "« \(section.id) » entre en collision avec une section du SDK — deux sections " +
                "de même id se confondraient dans `expandedSections`, le registre de frames " +
                "et `ForEach`."
            )
            XCTAssertTrue(
                LentilleSectionIdentity.isLentilleOnly(sectionId: section.id),
                "`isLentilleOnly` doit reconnaître « \(section.id) »."
            )
        }

        for sdkId in sdkIds {
            XCTAssertFalse(
                LentilleSectionIdentity.isLentilleOnly(sectionId: sdkId),
                "« \(sdkId) » est une section utilisateur/SDK : elle reste repliable ET " +
                "assignable, exactement comme aujourd'hui."
            )
        }
    }

    /// Les libellés décidés par LWS-6/I-062, tels qu'ils s'affichent : le
    /// sticker crie (`§4.3` « majuscules »), la donnée non.
    func test_lentilleSectionIdentity_stickerTitles() {
        XCTAssertEqual(LentilleSticker.displayTitle(LentilleSectionIdentity.live.name), "EN DIRECT")
        XCTAssertEqual(LentilleSticker.displayTitle(LentilleSectionIdentity.section(for: .today).name), "AUJOURD'HUI")
        XCTAssertEqual(LentilleSticker.displayTitle(LentilleSectionIdentity.section(for: .yesterday).name), "HIER")
        XCTAssertEqual(LentilleSticker.displayTitle(LentilleSectionIdentity.section(for: .thisWeek).name), "CETTE SEMAINE")
        XCTAssertEqual(LentilleSticker.displayTitle(LentilleSectionIdentity.section(for: .older).name), "PLUS ANCIEN")
    }

    // MARK: - Greffe I-060 : le repli sur « other » est levé

    func test_graft_mapsLiveAndTemporalToTheirOwnIdentity_noMoreOtherFallback() throws {
        let code = normalizedCode(try viewModelSource())

        XCTAssertTrue(
            code.contains("case .live(let conversations): result.append((LentilleSectionIdentity.live,"),
            "Le bucket `.live` du résolveur doit être rendu sous SON identité — écart I-060 " +
            "levé par LWS-6/I-062, propriétaire de l'identité visuelle des sections."
        )
        XCTAssertTrue(
            code.contains("case .temporal(let kind, let conversations): result.append((LentilleSectionIdentity.section(for: kind),"),
            "Chaque section temporelle doit être rendue sous SON identité (AUJOURD'HUI, HIER, " +
            "CETTE SEMAINE, PLUS ANCIEN) — pas repliée sur « Mes conversations »."
        )
        XCTAssertEqual(
            occurrences(of: "otherBucket", in: code), 0,
            "Le repli provisoire de I-060 (`otherBucket` → `ConversationSection.other`) doit " +
            "avoir disparu : il déguisait quatre sections temporelles en « Mes conversations »."
        )
    }
}
