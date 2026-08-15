import XCTest
import MeeshySDK
@testable import Meeshy

/// Pilule de section et rail vivants (contrat LWS-6, travaux 4-5) : le
/// MONTAGE, pas les vues — celles-ci sont couvertes par I-061
/// (`SectionScrollPillTests`, `StoriesVivantsRailTests`).
///
/// Ce que ce fichier garde tient en une phrase : *la pilule est branchée sur
/// le signal qui existe déjà, sa visibilité est décidée par la loi partagée, et
/// les deux vues sont réellement montées — chacune derrière SA condition*.
/// Leçon 257 : une vue déclarée, compilée, testée unitairement et jamais
/// montée ne fait rougir aucune suite. Une garde de montage doit donc vérifier
/// (a) qu'elle est montée et (b) qu'elle l'est derrière sa propre condition —
/// monter en dur satisferait (a) tout en allumant la Lentille pour tout le
/// monde, le défaut inverse et pire.
///
/// Suite ouverte : LWS-6/I-064 la complète.
final class ScrollPillStateTests: XCTestCase {

    // MARK: - Source

    private func source(at relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Lentille
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
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

    // MARK: - Un seul détecteur, trois consommateurs

    func test_noNewScrollObserver_isIntroducedByTheLentilleChrome() throws {
        let code = normalizedCode(try listViewSource())

        for forbidden in ["ScrollViewReader", "onScrollGeometryChange", "PreferenceKey"] {
            XCTAssertEqual(
                occurrences(of: forbidden, in: code), 0,
                "`\(forbidden)` est apparu dans ConversationListView.swift : la pilule doit " +
                "réutiliser le signal EXISTANT (contrat LWS-6 travail 4, « un seul détecteur, " +
                "trois consommateurs — aucun observateur de scroll nouveau »). Un second " +
                "observateur ne casse rien de visible : il double simplement le coût du " +
                "défilement et fait diverger deux vérités."
            )
        }

        XCTAssertEqual(
            occurrences(of: "onScrollOffsetChange:", in: code), 1,
            "Le détecteur de défilement doit rester UNIQUE — l'`onScrollOffsetChange` de " +
            "`MeeshyRefreshableScroll`, qui alimente `isScrollingDown`."
        )
        XCTAssertEqual(
            occurrences(of: "adaptiveOnChange(of: isScrollingDown)", in: code), 1,
            "La pilule doit se greffer sur l'observateur EXISTANT d'`isScrollingDown`, pas " +
            "s'en ajouter un second : deux `adaptiveOnChange` de la même valeur, ce sont " +
            "déjà deux consommateurs à tenir d'accord."
        )
        XCTAssertTrue(
            code.contains("if !wasHidden && isHidden { showSearchOverlay = false } handleScrollActivitySignal() }"),
            "Le troisième consommateur (la pilule) vit DANS le handler existant, après les " +
            "deux autres — barre du bas et boutons flottants (RootView) lisent le même " +
            "`isScrollingDown`."
        )
    }

    // MARK: - La loi décide, la peau recopie

    func test_pillVisibility_isDelegatedToTheSharedLaw_neverReimplemented() throws {
        let code = normalizedCode(try listViewSource())

        XCTAssertTrue(
            code.contains("scrollActivity = ScrollTimePillLaw.reduce(state: scrollActivity, event: .scrolled(at: instant))"),
            "Chaque bascule du signal doit entrer dans la loi comme un `.scrolled` — c'est " +
            "elle qui réarme, jamais la vue."
        )
        XCTAssertTrue(
            code.contains("let visible = ScrollTimePillLaw.isVisible(state: scrollActivity, at: instant)"),
            "La visibilité doit être DEMANDÉE à la loi (`isVisible`), jamais calculée ici : " +
            "critère LWS-6 « loi LWS-0, pas une réimplémentation »."
        )
        XCTAssertTrue(
            code.contains("event: .tick(at: instant)"),
            "Le re-sondage doit passer un `.tick` : il redemande la visibilité SANS réarmer " +
            "(un `.scrolled` de sonde ferait vivre la pilule pour toujours)."
        )
        XCTAssertEqual(
            occurrences(of: "900", in: code), 0,
            "La fenêtre de persistance ne s'écrit NULLE PART dans la peau (garde R15) : sa " +
            "seule maison est `SCROLL_ACTIVITY_LINGER_MS` (packages/shared), mirroré par " +
            "`ScrollTimePillLaw.lingerMs`."
        )
    }

    /// Le délai de re-sondage est DÉRIVÉ de la loi : si la fenêtre partagée
    /// change, la sonde suit sans qu'on touche à la vue. Le test compare à la
    /// loi, jamais à un nombre — il resterait vert (et juste) après un
    /// changement de fenêtre.
    func test_probeDelay_isDerivedFromTheLawWindow() {
        XCTAssertEqual(
            ConversationListView.pillProbeDelayNanoseconds,
            UInt64(ScrollTimePillLaw.lingerMs * 1_000_000),
            "Le délai de re-sondage doit valoir EXACTEMENT la fenêtre de la loi, convertie " +
            "en nanosecondes pour `Task.sleep`."
        )
        XCTAssertGreaterThan(
            ConversationListView.pillProbeDelayNanoseconds, 0,
            "Une sonde à zéro sonderait avant que la fenêtre ne s'ouvre : la pilule " +
            "clignoterait au lieu de persister."
        )
    }

    /// Sémantique attendue de bout en bout, telle que la peau la consomme :
    /// invisible à l'ouverture, visible au premier événement, invisible à la
    /// borne (fenêtre semi-ouverte). Ce test ne réimplémente pas la loi — il
    /// vérifie que la SÉQUENCE que la vue lui fait jouer produit bien le
    /// comportement du critère.
    func test_pillLifecycle_invisibleThenVisibleThenGoneAtTheWindowBound() {
        let start = ScrollTimePillLaw.initialState()
        XCTAssertFalse(
            ScrollTimePillLaw.isVisible(state: start, at: 1_000),
            "À l'ouverture, aucun défilement n'a eu lieu : la pilule est invisible."
        )

        let scrolledAt = 1_000.0
        let scrolled = ScrollTimePillLaw.reduce(state: start, event: .scrolled(at: scrolledAt))
        XCTAssertTrue(
            ScrollTimePillLaw.isVisible(state: scrolled, at: scrolledAt),
            "Premier événement de défilement ⇒ visible."
        )

        let probed = ScrollTimePillLaw.reduce(state: scrolled, event: .tick(at: scrolledAt + ScrollTimePillLaw.lingerMs))
        XCTAssertEqual(
            probed, scrolled,
            "Le `.tick` de la sonde ne doit RIEN faire avancer — sinon la pilule ne " +
            "s'effacerait jamais."
        )
        XCTAssertFalse(
            ScrollTimePillLaw.isVisible(state: probed, at: scrolledAt + ScrollTimePillLaw.lingerMs),
            "À la borne pile (une fenêtre après le dernier défilement), la pilule est déjà " +
            "invisible — c'est ce que la sonde `Task.sleep(lingerMs)` vient constater."
        )
    }

    func test_timestamp_isInMilliseconds_theUnitTheLawExpects() {
        let date = Date(timeIntervalSince1970: 1_700_000_000)
        XCTAssertEqual(
            ConversationListView.scrollActivityTimestamp(date),
            1_700_000_000_000,
            "La loi raisonne en MILLISECONDES (miroir du TS). Injecter des secondes " +
            "rendrait la fenêtre 1000 fois trop longue — la pilule ne s'effacerait " +
            "jamais, et aucun test de la loi ne le verrait."
        )
    }

    // MARK: - Libellé de la pilule

    func test_sectionPillTitle_isNilWhenThereIsNoSectionToName() {
        XCTAssertNil(
            ConversationListView.sectionPillTitle(visibleSectionId: "work", sections: []),
            "Liste vide : aucune pilule à afficher."
        )
    }

    func test_sectionPillTitle_namesTheVisibleSection() {
        let sections = [
            MeeshyConversationSection.pinned,
            LentilleSectionIdentity.section(for: .today),
            LentilleSectionIdentity.section(for: .older)
        ]

        XCTAssertEqual(
            ConversationListView.sectionPillTitle(
                visibleSectionId: LentilleSectionIdentity.olderId,
                sections: sections
            ),
            "PLUS ANCIEN",
            "La pilule nomme la section dont les rangs viennent d'entrer à l'écran, criée " +
            "par la MÊME fonction que le sticker (`LentilleSticker.displayTitle`) — deux " +
            "transformations parallèles dériveraient."
        )
    }

    func test_sectionPillTitle_fallsBackToTheFirstSection_whenNothingSeenYet() {
        let sections = [MeeshyConversationSection.pinned, LentilleSectionIdentity.section(for: .today)]

        XCTAssertEqual(
            ConversationListView.sectionPillTitle(visibleSectionId: nil, sections: sections),
            LentilleSticker.displayTitle(MeeshyConversationSection.pinned.name),
            "Avant tout `onAppear` de rang (ouverture), la pilule nomme la première section " +
            "rendue — jamais une chaîne vide."
        )
        XCTAssertEqual(
            ConversationListView.sectionPillTitle(visibleSectionId: "section-disparue", sections: sections),
            LentilleSticker.displayTitle(MeeshyConversationSection.pinned.name),
            "Une section qui a disparu du groupement (filtre, suppression de catégorie) ne " +
            "doit pas laisser la pilule sans texte."
        )
    }

    // MARK: - Montage : déclaré == monté, chacun derrière SA condition (leçon 257)

    func test_sectionScrollPill_isMountedExactlyOnce_behindTheFlag() throws {
        let code = normalizedCode(try listViewSource())

        XCTAssertEqual(
            occurrences(of: "SectionScrollPill(", in: code), 1,
            "La pilule doit être montée — une fois. I-061 l'a écrite et testée sans la " +
            "monter : une vue juste, compilée, invisible."
        )
        XCTAssertTrue(
            code.contains("if LentilleFeatureFlag.isLentilleListEnabled, let title = Self.sectionPillTitle("),
            "…et derrière SA condition : drapeau OFF ⇒ aucune pilule, rendu identique à " +
            "aujourd'hui."
        )
    }

    func test_storiesVivantsRail_isMountedExactlyOnce_behindTheFlag_andKeepsTheStoryRoute() throws {
        let code = normalizedCode(try listViewSource())

        XCTAssertEqual(
            occurrences(of: "StoriesVivantsRail(", in: code), 1,
            "Le rail doit être monté — une fois (contrat LWS-6 travail 5)."
        )
        XCTAssertEqual(
            occurrences(of: "StoryTrayView(", in: code), 1,
            "…et `StoryTrayView` reste monté pour le drapeau OFF : « rendu identique à " +
            "aujourd'hui » n'admet pas la disparition du carrousel."
        )
        XCTAssertTrue(
            code.contains("if LentilleFeatureFlag.isLentilleListEnabled { StoriesVivantsRail("),
            "Le mux de tête de liste vit derrière le drapeau, comme celui du header."
        )
        XCTAssertEqual(
            occurrences(of: "onStoryViewRequest?(userId, true)", in: code), 3,
            "Le routage du tap story doit rester le MÊME sur les trois chemins — rail " +
            "(drapeau ON), tray (drapeau OFF) et `PinnedStoryTrailBand` (inchangé, contrat " +
            "LWS-6 travail 5). Un rail qui présenterait la story par un autre chemin " +
            "rouvrirait l'écran noir « story introuvable » déjà corrigé côté tray."
        )
        XCTAssertTrue(
            code.contains("PinnedStoryTrailBand( viewModel: storyViewModel, scrollOffset: offset, onViewStory: { userId in onStoryViewRequest?(userId, true) } )"),
            "`PinnedStoryTrailBand` : inchangé (contrat LWS-6 travail 5)."
        )
    }

    /// Le rail borne et masque LUI-MÊME (`LentilleRailPolicy`, I-061) : le
    /// montage ne doit pas re-décider ces règles de son côté — deux endroits
    /// qui tronquent, c'est un jour où ils tronquent différemment.
    func test_railPolicy_ownsTheSixEntryCapAndTheEmptyCase() {
        let entries = (0..<9).map { index in
            LentilleRailEntry(id: "u\(index)", displayName: "User \(index)")
        }

        XCTAssertEqual(
            LentilleRailPolicy.visibleEntries(entries).count,
            LentilleMetrics.Rail.maxEntries,
            "≤ 6 entrées (§4.3) — borne portée par la politique du rail."
        )
        XCTAssertFalse(
            LentilleRailPolicy.shouldRender([]),
            "Masqué si vide — le rail rend `EmptyView`, il ne laisse pas une bande vide en " +
            "tête de liste."
        )
    }
}
