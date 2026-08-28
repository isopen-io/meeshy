import XCTest
@testable import Meeshy
@testable import MeeshySDK

/// **Le filtrage composé** — directive porteur du 2026-08-28 : les chips
/// passent sous le rail de stories « pour faire du filtrage composé », et « on
/// touche une seconde fois, ça enlève le filtre simplement ».
///
/// La sélection cesse d'être UNE valeur pour devenir un ENSEMBLE. Tout le sujet
/// de cette suite est de fixer ce que « Non lus + Personnel » signifie — et,
/// surtout, ce que « Personnel + Privée » ne doit PAS signifier.
final class ConversationFilterCompositionTests: XCTestCase {

    private typealias Law = ConversationFilterComposition

    // MARK: - Le second appui retire

    func test_tapping_addsAFilterThatWasAbsent() {
        XCTAssertEqual(Law.toggling(.unread, in: [.all]), [.unread])
    }

    /// « On touche une seconde fois, ça enlève le filtre simplement » — le même
    /// geste pose et retire, sans bouton d'effacement à chercher ailleurs.
    func test_tappingTwice_removesIt() {
        let once = Law.toggling(.unread, in: [.all])

        XCTAssertEqual(Law.toggling(.unread, in: once), [.all])
    }

    func test_tapping_accumulates() {
        var s = Law.toggling(.unread, in: [.all])
        s = Law.toggling(.personnel, in: s)

        XCTAssertEqual(s, [.unread, .personnel])
    }

    /// Retirer le DERNIER filtre ne doit pas rendre une liste vide : il rend la
    /// liste entière. Un ensemble vide serait un état que rien à l'écran ne
    /// distingue de « aucun résultat ».
    func test_removingTheLastFilter_fallsBackToAll() {
        XCTAssertEqual(Law.toggling(.unread, in: [.unread]), [.all])
    }

    // MARK: - `.all` est le neutre, il ne se compose avec rien

    func test_choosingAll_clearsEverythingElse() {
        XCTAssertEqual(Law.toggling(.all, in: [.unread, .personnel]), [.all])
    }

    func test_choosingAnythingElse_clearsAll() {
        XCTAssertFalse(Law.toggling(.personnel, in: [.all]).contains(.all))
    }

    /// `.all` ne se retire pas d'un second appui : il n'est pas un filtre, il
    /// est leur absence. Le retirer laisserait un état sans nom.
    func test_tappingAllTwice_staysAll() {
        XCTAssertEqual(Law.toggling(.all, in: [.all]), [.all])
    }

    // MARK: - Deux familles, deux conjonctions

    /// **Le piège que cette loi existe pour éviter.** Deux types intersectés
    /// ne rendraient JAMAIS rien : une conversation est directe OU un groupe,
    /// jamais les deux. Ils s'additionnent.
    func test_twoTypeFilters_areUnioned_neverIntersected() {
        let types = Law.selectedTypes([.personnel, .privee])

        XCTAssertEqual(types, [.personnel, .privee],
                       "« montre-moi les directs ET les groupes » — un OU, sinon l'écran est vide")
    }

    func test_typeAndState_areKeptApart() {
        let selection: Set<MeeshyConversationFilter> = [.unread, .personnel]

        XCTAssertEqual(Law.selectedTypes(selection), [.personnel])
        XCTAssertEqual(Law.selectedStates(selection), [.unread])
    }

    func test_twoStateFilters_bothApply() {
        XCTAssertEqual(Law.selectedStates([.unread, .favoris]), [.unread, .favoris])
    }

    // MARK: - Le neutre ne restreint rien

    func test_neutralSelection_carriesNoCriterion() {
        XCTAssertTrue(Law.isNeutral([.all]))
        XCTAssertTrue(Law.isNeutral([]))
        XCTAssertTrue(Law.selectedTypes([.all]).isEmpty)
        XCTAssertTrue(Law.selectedStates([.all]).isEmpty)
    }

    // MARK: - Les archives changent de CORPUS, elles ne restreignent pas

    /// Une conversation archivée ne doit pas reparaître dans « Non lus » parce
    /// qu'elle porte encore des messages non lus : les archives sont masquées
    /// partout ailleurs.
    func test_archivedIsOptedInExplicitly_neverIncidental() {
        XCTAssertFalse(Law.includesArchived([.unread]))
        XCTAssertTrue(Law.includesArchived([.archived]))
        XCTAssertTrue(Law.includesArchived([.archived, .privee]),
                      "« archivées, parmi les groupes » reste une composition sensée")
    }

    /// `.archived` n'est ni un type ni un état : il ne doit fausser aucune des
    /// deux conjonctions.
    func test_archived_isNeitherATypeNorAState() {
        XCTAssertTrue(Law.selectedTypes([.archived]).isEmpty)
        XCTAssertTrue(Law.selectedStates([.archived]).isEmpty)
    }

    // MARK: - Les deux familles couvrent tout, sans recouvrement

    /// Sans cette garde, un cas ajouté à l'énumération tomberait dans AUCUNE
    /// famille et serait ignoré en silence par la composition — un filtre qui
    /// se peint, se sélectionne, et ne filtre rien.
    func test_everyFilterBelongsToExactlyOneFamily_orIsOneOfTheTwoSpecialOnes() {
        let special: Set<MeeshyConversationFilter> = [.all, .archived]

        for filter in MeeshyConversationFilter.allCases where !special.contains(filter) {
            let inType = Law.typeFilters.contains(filter)
            let inState = Law.stateFilters.contains(filter)
            XCTAssertTrue(
                inType != inState,
                "`\(filter.rawValue)` doit appartenir à UNE famille et une seule — sinon il se peint, se sélectionne, et ne filtre rien"
            )
        }
    }
}
