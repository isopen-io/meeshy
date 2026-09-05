import Combine
import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class ComposerMentionControllerBoxTests: XCTestCase {

    /// **La preuve qui aurait attrapé une capture figée à la construction.**
    /// `controller` est accédé (donc initialisé paresseusement) AVANT que
    /// `candidates` ne soit réglé — si la closure de `localCandidates` avait
    /// capturé une copie de `candidates` plutôt que `self` par référence
    /// faible, cette suggestion resterait vide pour toujours.
    func test_controller_seesCandidatesSetAfterItWasFirstAccessed() {
        let box = ComposerMentionControllerBox()
        _ = box.controller // force l'initialisation paresseuse en premier

        box.candidates = [
            MentionCandidate(id: "1", username: "alice", displayName: "Alice", avatarURL: nil)
        ]
        box.controller.handleQuery(in: "@al")

        XCTAssertEqual(
            box.controller.suggestions.map(\.username), ["alice"],
            "`controller` doit lire `candidates` PAR RÉFÉRENCE (`[weak self]`), pas une copie figée à l'init."
        )
    }

    /// **Le relais `objectWillChange` (revue Opus 2026-08-27).** `@StateObject
    /// private var mentionBox` n'abonne la vue hôte qu'au publisher de LA
    /// BOÎTE — `MentionComposerController` est un `ObservableObject` imbriqué,
    /// Combine ne le traverse jamais tout seul. Sans ce relais, lire
    /// `mentionBox.controller.activeQuery` dans un `body` ne déclenche AUCUNE
    /// ré-évaluation quand `handleQuery` publie une nouvelle requête : la
    /// bande de mentions n'apparaîtrait qu'à la frappe SUIVANTE.
    func test_box_forwardsControllerObjectWillChange_toItsOwnPublisher() {
        let box = ComposerMentionControllerBox()
        _ = box.controller // force l'initialisation paresseuse en premier

        // `assertForOverFulfill = false` : `handleQuery` mute PLUSIEURS
        // `@Published` du contrôleur (`activeQuery` puis `suggestions`), donc
        // PLUSIEURS relais légitimes — seul le PREMIER compte pour prouver
        // que la boîte n'est pas sourde à son contrôleur, le nombre exact
        // relève d'un détail d'implémentation de `MentionComposerController`.
        let expectation = expectation(description: "la boîte publie quand le contrôleur publie")
        expectation.assertForOverFulfill = false
        let cancellable = box.objectWillChange.sink { expectation.fulfill() }

        box.controller.handleQuery(in: "@al")

        wait(for: [expectation], timeout: 1)
        cancellable.cancel()
    }

    // MARK: - Cache-first (directive porteur 2026-09-05)

    private func candidat(_ pseudo: String) -> MentionCandidate {
        MentionCandidate(id: pseudo, username: pseudo, displayName: pseudo, avatarURL: nil)
    }

    /// **Le cache est servi AVANT que le réseau soit interrogé**, et le témoin
    /// le prouve à l'endroit où ça se décide : au moment où la source réseau
    /// est appelée, `candidates` porte déjà ce que le cache a rendu.
    ///
    /// Assertion posée DANS la fermeture plutôt qu'après l'`await` : après,
    /// les deux ordres possibles rendent le même état final, donc le témoin ne
    /// mesurerait plus l'ORDRE — seulement le résultat.
    func test_leCache_estServiAvantQueLeRéseauSoitInterrogé() async {
        let box = ComposerMentionControllerBox()
        var vuAuMomentDuRéseau: [String] = []

        await box.loadCandidates(
            cached: { [self] in [candidat("ami")] },
            fresh: {
                vuAuMomentDuRéseau = box.candidates.map(\.username)
                return []
            })

        XCTAssertEqual(vuAuMomentDuRéseau, ["ami"],
                       "la bande doit pouvoir répondre à un `@` AVANT l'aller-retour — "
                       + "c'est la fenêtre exacte où l'auteur tape")
    }

    /// **Un rafraîchissement qui ÉCHOUE n'efface pas le cache.**
    ///
    /// C'est le défaut qu'ajouter le cache aurait introduit tout seul : deux
    /// écritures sur une même propriété, dont la seconde peut être vide, sont
    /// un REMPLACEMENT. Le 2026-09-05, la route des amis rendait 404 en
    /// production et `acceptedFriends()` rendait `[]` par son `catch` — sans
    /// cette garde, le cache aurait été servi puis effacé sous les yeux de
    /// l'auteur.
    func test_unRafraîchissementVide_nEffacePasCeQueLeCacheAServi() async {
        let box = ComposerMentionControllerBox()

        await box.loadCandidates(cached: { [self] in [candidat("ami")] },
                                 fresh: { [] })

        XCTAssertEqual(box.candidates.map(\.username), ["ami"])
    }

    /// Le cas nominal : le réseau a raison quand il répond.
    func test_unRafraîchissementServi_remplaceLeCache() async {
        let box = ComposerMentionControllerBox()

        await box.loadCandidates(cached: { [self] in [candidat("vieux")] },
                                 fresh: { [self] in [candidat("frais")] })

        XCTAssertEqual(box.candidates.map(\.username), ["frais"])
    }

    /// Cache vide (premier démarrage) : le réseau reste la seule source, et il
    /// sert.
    func test_cacheVide_leRéseauSertQuandMême() async {
        let box = ComposerMentionControllerBox()

        await box.loadCandidates(cached: { [] }, fresh: { [self] in [candidat("ami")] })

        XCTAssertEqual(box.candidates.map(\.username), ["ami"])
    }
}
