import XCTest
@testable import Meeshy
import MeeshySDK

// MARK: - MentionComposerControllerTests

@MainActor
final class MentionComposerControllerTests: XCTestCase {

    // MARK: - Factory

    private func makeSUT(
        context: MentionComposerController.Context = .conversation(id: "conv-1"),
        localCandidates: [MentionCandidate] = [],
        service: MockMentionService = MockMentionService(),
        directory: MockUserDirectorySearch = MockUserDirectorySearch(),
        currentUserId: String? = "moi"
    ) -> (sut: MentionComposerController, mock: MockMentionService) {
        let mock = service
        let sut = MentionComposerController(
            context: context,
            localCandidates: { localCandidates },
            service: mock,
            directory: directory,
            currentUserId: currentUserId
        )
        return (sut, mock)
    }

    /// **L'annuaire par DÉFAUT est un double, et ce n'est pas un détail de
    /// confort.** Sans lui, chaque test de ce fichier partirait sur
    /// `UserService.shared` — donc sur le réseau réel, avec la session de
    /// l'appareil : les verdicts dépendraient de ce que la production répond.
    private func makeSUTWithDirectory(
        context: MentionComposerController.Context = .composerDraft,
        localCandidates: [MentionCandidate] = [],
        currentUserId: String? = "moi"
    ) -> (sut: MentionComposerController, annuaire: MockUserDirectorySearch) {
        let annuaire = MockUserDirectorySearch()
        let sut = MentionComposerController(
            context: context,
            localCandidates: { localCandidates },
            service: MockMentionService(),
            directory: annuaire,
            currentUserId: currentUserId
        )
        return (sut, annuaire)
    }

    private func makeCandidate(
        id: String = "user-1",
        username: String = "alice",
        displayName: String = "Alice"
    ) -> MentionCandidate {
        MentionCandidate(id: id, username: username, displayName: displayName, avatarURL: nil)
    }

    private func makeSuggestion(
        id: String = "user-1",
        username: String = "alice",
        displayName: String = "Alice"
    ) -> MentionSuggestion {
        MentionSuggestion(
            id: id, username: username, displayName: displayName,
            avatar: nil, badge: nil, inConversation: nil, isFriend: nil
        )
    }

    /// Attend que `condition` devienne vraie, jusqu'à 10 s, en rendant la main à
    /// l'acteur principal entre deux vérifications.
    ///
    /// Remplace un `Task.sleep(400 ms)` nu qui pariait sur 100 ms de marge après
    /// le débounce de 300 ms du contrôleur. Le pari perdait régulièrement quand
    /// la classe tourne en entier — deux à quatre échecs par exécution, et
    /// jamais les mêmes : la tâche débattue et le test se disputent le MÊME
    /// acteur, et rien ne garantit l'ordre de reprise. Un délai plus long aurait
    /// déplacé le seuil sans supprimer le pari ; attendre la CONDITION le
    /// supprime, et rend la main dès qu'elle est vraie (les cas nominaux
    /// coûtent donc moins qu'avant, pas plus).
    ///
    /// Le plafond est GÉNÉREUX à dessein : une attente de condition ne le paie
    /// que lorsqu'elle échoue. Trois secondes ne suffisaient pas sur une machine
    /// chargée (mesuré : la suite entière du gateway en parallèle suffit à
    /// affamer le débounce), et un plafond trop court ramène exactement le pari
    /// qu'on vient de retirer.
    private func waitUntil(
        _ condition: () -> Bool,
        timeout: TimeInterval = 10.0,
        _ message: @autoclosure () -> String = "condition jamais atteinte",
        file: StaticString = #filePath,
        line: UInt = #line
    ) async {
        let deadline = Date().addingTimeInterval(timeout)
        while !condition(), Date() < deadline {
            try? await Task.sleep(nanoseconds: 20_000_000)
        }
        XCTAssertTrue(condition(), message(), file: file, line: line)
    }

    // MARK: - handleQuery: activeQuery

    func test_handleQuery_withAtSymbol_setsActiveQuery() {
        let (sut, _) = makeSUT()

        sut.handleQuery(in: "Hello @ali")

        XCTAssertEqual(sut.activeQuery, "ali")
    }

    func test_handleQuery_withNoAtSymbol_doesNotSetActiveQuery() {
        let (sut, _) = makeSUT()

        sut.handleQuery(in: "Hello world")

        XCTAssertNil(sut.activeQuery)
    }

    func test_handleQuery_withAtSymbolFollowedBySpace_doesNotSetActiveQuery() {
        let (sut, _) = makeSUT()

        sut.handleQuery(in: "Hello @alice done")

        XCTAssertNil(sut.activeQuery)
    }

    // MARK: - handleQuery: clearsSuggestions

    func test_handleQuery_withoutAtSymbol_clearsSuggestions() {
        let candidate = makeCandidate()
        let (sut, _) = makeSUT(localCandidates: [candidate])
        sut.handleQuery(in: "@ali")
        XCTAssertFalse(sut.suggestions.isEmpty, "Precondition: suggestions populated")

        sut.handleQuery(in: "no mention here")

        XCTAssertTrue(sut.suggestions.isEmpty)
        XCTAssertNil(sut.activeQuery)
    }

    // MARK: - handleQuery: local candidates filter

    func test_handleQuery_short_filtersLocalCandidatesImmediately() {
        let alice = makeCandidate(id: "1", username: "alice", displayName: "Alice")
        let bob = makeCandidate(id: "2", username: "bob", displayName: "Bob")
        let (sut, _) = makeSUT(localCandidates: [alice, bob])

        sut.handleQuery(in: "@al")

        XCTAssertEqual(sut.suggestions.count, 1)
        XCTAssertEqual(sut.suggestions.first?.username, "alice")
    }

    func test_handleQuery_emptyQuery_returnsAllLocalCandidates() {
        let alice = makeCandidate(id: "1", username: "alice", displayName: "Alice")
        let bob = makeCandidate(id: "2", username: "bob", displayName: "Bob")
        let (sut, _) = makeSUT(localCandidates: [alice, bob])

        // "@" with no trailing text = empty query
        sut.handleQuery(in: "@")

        XCTAssertEqual(sut.suggestions.count, 2)
    }

    // MARK: - handleQuery: API debounce

    func test_handleQuery_long_triggersAPIFetchAfterDebounce() async {
        let mockService = MockMentionService()
        mockService.suggestionsResult = .success([makeSuggestion(username: "alicia")])
        let (sut, mock) = makeSUT(service: mockService)

        sut.handleQuery(in: "@ali")

        await waitUntil({ mock.suggestionsCallCount >= 1 }, "le débounce n'a jamais atteint le service")

        XCTAssertGreaterThanOrEqual(mock.suggestionsCallCount, 1)
        XCTAssertEqual(mock.lastQuery, "ali")
    }

    /// **Ce témoin affirmait l'inverse jusqu'au 2026-09-05**, et il avait
    /// raison sur le code de l'époque : `minQueryLengthForAPI` valait `0`, donc
    /// un `@` nu partait chercher la liste par défaut du serveur (auteur du
    /// post + commentateurs + contacts).
    ///
    /// La directive porteur renverse la décision — sur `@` nu, ce sont les
    /// contacts LOCAUX qui répondent, sans réseau — et ce témoin devient donc
    /// le gardien de la nouvelle règle sur le chemin CONTEXTUEL, celui que
    /// `test_leRégime_vautAussiPourUneConversation` couvre de bout en bout.
    ///
    /// > Un témoin qui tombe parce qu'une DÉCISION a changé n'est pas un
    /// > témoin cassé : il fait exactement son travail, qui est de rendre le
    /// > renversement visible. Ce qu'il ne faut pas faire, c'est le supprimer —
    /// > il faut lui faire dire la décision NOUVELLE, sans quoi rien ne
    /// > défendra plus ce point-là.
    func test_handleQuery_emptyQuery_neDéclenchePasDAppel() async {
        let mockService = MockMentionService()
        mockService.suggestionsResult = .success([makeSuggestion(username: "alicia")])
        let (sut, mock) = makeSUT(service: mockService)

        sut.handleQuery(in: "Hey @")
        try? await Task.sleep(nanoseconds: 500_000_000)

        XCTAssertEqual(mock.suggestionsCallCount, 0,
                       "un `@` nu se sert sur les candidats LOCAUX — pas d'aller-retour")
        XCTAssertEqual(sut.activeQuery, "",
                       "…mais la requête est bien ACTIVE : c'est elle qui monte la bande")
    }

    // MARK: - insertMention

    func test_insertMention_replacesActiveQueryWithUsername() {
        let candidate = makeCandidate(username: "alice")
        let (sut, _) = makeSUT()
        sut.handleQuery(in: "Hey @ali")

        let result = sut.insertMention(candidate, into: "Hey @ali")

        XCTAssertEqual(result, "Hey @alice ")
    }

    func test_insertMention_recordsInDraftMentions() {
        let candidate = makeCandidate(username: "alice")
        let (sut, _) = makeSUT()

        sut.insertMention(candidate, into: "@ali")

        XCTAssertNotNil(sut.draftMentions["alice"])
        XCTAssertEqual(sut.draftMentions["alice"]?.id, candidate.id)
    }

    func test_insertMention_clearsSuggestions() {
        let candidate = makeCandidate(username: "alice")
        let localAlice = makeCandidate(id: "1", username: "alice", displayName: "Alice")
        let (sut, _) = makeSUT(localCandidates: [localAlice])
        sut.handleQuery(in: "@ali")
        XCTAssertFalse(sut.suggestions.isEmpty, "Precondition: suggestions populated")

        sut.insertMention(candidate, into: "@ali")

        XCTAssertTrue(sut.suggestions.isEmpty)
        XCTAssertNil(sut.activeQuery)
    }

    // MARK: - clearDraft

    func test_clearDraft_emptiesDraftMentions() {
        let candidate = makeCandidate(username: "alice")
        let (sut, _) = makeSUT()
        sut.insertMention(candidate, into: "@ali")
        XCTAssertFalse(sut.draftMentions.isEmpty, "Precondition: draft has one mention")

        sut.clearDraft()

        XCTAssertTrue(sut.draftMentions.isEmpty)
    }

    // MARK: - Context: post

    func test_context_post_callsServiceWithPostContextType() async {
        let mockService = MockMentionService()
        mockService.suggestionsResult = .success([])
        let (sut, mock) = makeSUT(context: .post(id: "post-42"), service: mockService)

        sut.handleQuery(in: "@ali")
        await waitUntil({ mock.lastContextType != nil }, "le débounce n'a jamais atteint le service")

        XCTAssertEqual(mock.lastContextType, .post)
        XCTAssertEqual(mock.lastContextId, "post-42")
    }

    // MARK: - Context: conversation

    func test_context_conversation_callsServiceWithConversationContextType() async {
        let mockService = MockMentionService()
        mockService.suggestionsResult = .success([])
        let (sut, mock) = makeSUT(context: .conversation(id: "conv-99"), service: mockService)

        sut.handleQuery(in: "@ali")
        await waitUntil({ mock.lastContextType != nil }, "le débounce n'a jamais atteint le service")

        XCTAssertEqual(mock.lastContextType, .conversation)
        XCTAssertEqual(mock.lastContextId, "conv-99")
    }

    // MARK: - Context: composerDraft (#3904)

    /// Un brouillon composer n'a pas encore d'id serveur : il ne doit JAMAIS
    /// interroger l'endpoint CONTEXTUEL (`/mentions/suggestions` exige un post
    /// ou une conversation, et rendrait 400 sans).
    ///
    /// **Ce témoin ne dit rien de l'annuaire, et c'est la distinction qui
    /// manquait** : l'impossibilité d'un appel CONTEXTUEL avait été lue comme
    /// l'impossibilité de TOUTE recherche, ce qui rendait `@meeshy`
    /// introuvable à la composition alors que le post publié en faisait un
    /// lien. Le double d'annuaire de `makeSUT` ne rend rien, donc les amis
    /// restent bien la seule source ICI.
    func test_context_composerDraft_neverCallsTheRemoteService() async {
        let alice = makeCandidate(id: "1", username: "alice", displayName: "Alice")
        let mockService = MockMentionService()
        mockService.suggestionsResult = .success([makeSuggestion(username: "alicia")])
        let (sut, mock) = makeSUT(context: .composerDraft, localCandidates: [alice], service: mockService)

        sut.handleQuery(in: "@ali")
        try? await Task.sleep(nanoseconds: 500_000_000)

        XCTAssertEqual(
            mock.suggestionsCallCount, 0,
            "Un brouillon composer n'a aucun id serveur : aucun appel réseau ne doit partir."
        )
        XCTAssertEqual(
            sut.suggestions.map(\.username), ["alice"],
            "Les candidats locaux (amis) doivent rester la SEULE source pour un brouillon."
        )
    }

    /// Le pendant positif : les candidats locaux filtrent bien, comme pour
    /// les deux autres contextes — `.composerDraft` ne dégrade pas ce chemin.
    func test_context_composerDraft_stillFiltersLocalCandidatesImmediately() {
        let alice = makeCandidate(id: "1", username: "alice", displayName: "Alice")
        let bob = makeCandidate(id: "2", username: "bob", displayName: "Bob")
        let (sut, _) = makeSUT(context: .composerDraft, localCandidates: [alice, bob])

        sut.handleQuery(in: "@al")

        XCTAssertEqual(sut.suggestions.map(\.username), ["alice"])
    }

    // MARK: - Context.remoteContext

    func test_remoteContext_conversation_returnsIdAndConversationType() {
        let remote = MentionComposerController.Context.conversation(id: "conv-7").remoteContext
        XCTAssertEqual(remote?.contextId, "conv-7")
        XCTAssertEqual(remote?.contextType, .conversation)
    }

    func test_remoteContext_post_returnsIdAndPostType() {
        let remote = MentionComposerController.Context.post(id: "post-7").remoteContext
        XCTAssertEqual(remote?.contextId, "post-7")
        XCTAssertEqual(remote?.contextType, .post)
    }

    func test_remoteContext_composerDraft_returnsNil() {
        XCTAssertNil(MentionComposerController.Context.composerDraft.remoteContext)
    }

    // MARK: - clearSuggestions

    func test_clearSuggestions_nilsActiveQueryAndEmptiesSuggestions() {
        let localAlice = makeCandidate(id: "1", username: "alice", displayName: "Alice")
        let (sut, _) = makeSUT(localCandidates: [localAlice])
        sut.handleQuery(in: "@ali")
        XCTAssertNotNil(sut.activeQuery, "Precondition")

        sut.clearSuggestions()

        XCTAssertNil(sut.activeQuery)
        XCTAssertTrue(sut.suggestions.isEmpty)
    }

    // MARK: - API merge: deduplication

    func test_handleQuery_long_mergesAPIResultsWithoutDuplicatingLocals() async {
        let localAlice = makeCandidate(id: "local-1", username: "alice", displayName: "Alice")
        let mockService = MockMentionService()
        // API returns alice (duplicate) + alicia (new)
        mockService.suggestionsResult = .success([
            makeSuggestion(id: "api-1", username: "alice"),
            makeSuggestion(id: "api-2", username: "alicia")
        ])
        let (sut, _) = makeSUT(localCandidates: [localAlice], service: mockService)

        sut.handleQuery(in: "@al")
        await waitUntil({ sut.suggestions.count >= 2 }, "la fusion des résultats API n'est jamais arrivée")

        // Should have alice (local) + alicia (from API), not two alices
        XCTAssertEqual(sut.suggestions.count, 2)
        let usernames = sut.suggestions.map(\.username)
        XCTAssertEqual(usernames.filter { $0 == "alice" }.count, 1)
        XCTAssertTrue(usernames.contains("alicia"))
    }

    // MARK: - L'annuaire d'un brouillon (2026-09-05)

    /// **Le défaut rapporté.** Taper `@meeshy` pendant la composition ne
    /// faisait apparaître AUCUNE rangée — mesuré au simulateur `Meeshy-iOS26`
    /// le 2026-09-05, sur la surface document d'un post.
    ///
    /// Deux causes s'additionnaient, et une seule aurait suffi : la route des
    /// amis rendait 404 en production (`GET /api/v1/directory/friend-requests`,
    /// vérifié au `curl`), et `ComposerMentionFriendsSource` avale l'échec en
    /// liste vide ; et même remplie, cette liste n'aurait jamais contenu une
    /// personne qui n'est pas un ami de l'auteur.
    ///
    /// L'annuaire répond aux deux : il ne dépend pas de la route en panne, et
    /// il connaît les gens qu'on ne connaît pas encore.
    func test_brouillon_chercheDansLAnnuaire_quandAucunAmiNeCorrespond() async {
        let (sut, annuaire) = makeSUTWithDirectory()
        annuaire.result = .success([
            UserSearchResult(id: "u9", username: "meeshy", displayName: "Meeshy", avatar: nil)
        ])

        sut.handleQuery(in: "Bonjour @meeshy")
        await waitUntil({ sut.suggestions.contains { $0.username == "meeshy" } },
                        "un brouillon doit atteindre l'annuaire : sans lui, seule "
                        + "une personne DÉJÀ amie peut être mentionnée")

        XCTAssertEqual(annuaire.lastQuery, "meeshy",
                       "c'est le FRAGMENT découpé qui part, jamais le texte entier")
    }

    /// **Les amis restent en tête, et ne reviennent pas en double.** L'annuaire
    /// contient aussi les amis : sans dédoublonnage, chaque ami correspondant
    /// paraîtrait deux fois dans la bande.
    func test_lAnnuaire_seFusionneDerriereLesAmis_sansDoublon() async {
        let alice = makeCandidate(id: "1", username: "alice", displayName: "Alice")
        let (sut, annuaire) = makeSUTWithDirectory(localCandidates: [alice])
        annuaire.result = .success([
            UserSearchResult(id: "1", username: "alice", displayName: "Alice"),
            UserSearchResult(id: "2", username: "alicia", displayName: "Alicia")
        ])

        sut.handleQuery(in: "@ali")
        await waitUntil({ sut.suggestions.count == 2 })

        XCTAssertEqual(sut.suggestions.map(\.username), ["alice", "alicia"])
    }

    /// **L'auteur ne se propose jamais lui-même.** L'annuaire le rend comme
    /// n'importe qui d'autre ; se mentionner soi-même n'a aucun destinataire.
    func test_lAnnuaire_neProposeJamaisLAuteur() async {
        let (sut, annuaire) = makeSUTWithDirectory(currentUserId: "moi")
        annuaire.result = .success([
            UserSearchResult(id: "moi", username: "andre", displayName: "André"),
            UserSearchResult(id: "u2", username: "andrea", displayName: "Andrea")
        ])

        sut.handleQuery(in: "@and")
        await waitUntil({ !sut.suggestions.isEmpty })

        XCTAssertEqual(sut.suggestions.map(\.username), ["andrea"])
    }

    // MARK: - Les TROIS régimes de la directive (2026-09-05)

    /// > « Il faut déclencher la remontée après `@` avec les amis/contacts
    /// > (normalement existant en local et en cache) ; ensuite lorsqu'on tape
    /// > la première lettre ça filtre parmi ses amis et contacts LOCALEMENT ;
    /// > c'est au bout de la DEUXIÈME lettre qu'on recherche via API. »
    ///
    /// **Régime 1 — `@` nu : les contacts, zéro réseau.**
    func test_régime1_arobaseNu_sertLesContacts_sansRéseau() async {
        let alice = makeCandidate(id: "1", username: "alice")
        let bob = makeCandidate(id: "2", username: "bob")
        let (sut, annuaire) = makeSUTWithDirectory(localCandidates: [alice, bob])

        sut.handleQuery(in: "Salut @")
        try? await Task.sleep(nanoseconds: 500_000_000)

        XCTAssertEqual(annuaire.callCount, 0, "un `@` nu ne coûte AUCUN aller-retour")
        XCTAssertEqual(sut.suggestions.map(\.username), ["alice", "bob"],
                       "…et sert la liste entière : c'est la remontée que la directive demande")
    }

    /// **Régime 2 — une lettre : filtre LOCAL, toujours zéro réseau.**
    ///
    /// C'est le régime que le correctif du matin avait raté : il partait dès
    /// le premier caractère. Une lettre ne discrimine pas — `@a` rend des
    /// dizaines de comptes sans rapport, et les pousse DEVANT les amis de
    /// l'auteur dans une bande qui n'en montre que trois.
    func test_régime2_uneSeuleLettre_filtreLocalement_sansRéseau() async {
        let alice = makeCandidate(id: "1", username: "alice", displayName: "Alice")
        // **Le nom d'affichage compte, et le défaut de `makeCandidate` est
        // « Alice »** : sans le poser ici, `bob` portait « Alice » et
        // `filterLocals` le retenait sur « a » — le témoin serait tombé en
        // accusant le filtre, qui faisait exactement son travail.
        let bob = makeCandidate(id: "2", username: "bob", displayName: "Bob")
        let (sut, annuaire) = makeSUTWithDirectory(localCandidates: [alice, bob])

        sut.handleQuery(in: "Salut @a")
        try? await Task.sleep(nanoseconds: 500_000_000)

        XCTAssertEqual(annuaire.callCount, 0,
                       "une seule lettre ne justifie pas un aller-retour")
        XCTAssertEqual(sut.suggestions.map(\.username), ["alice"],
                       "…mais elle filtre, tout de suite, ce que le cache a servi")
    }

    /// **Régime 3 — deux lettres : l'annuaire entre en jeu.**
    func test_régime3_deuxLettres_interrogentLAnnuaire() async {
        let (sut, annuaire) = makeSUTWithDirectory()
        annuaire.result = .success([
            UserSearchResult(id: "u9", username: "meeshy", displayName: "Meeshy")
        ])

        sut.handleQuery(in: "Salut @me")
        await waitUntil({ annuaire.callCount == 1 },
                        "au deuxième caractère, la recherche distante part")

        XCTAssertEqual(annuaire.lastQuery, "me")
    }

    /// **Le seuil est celui de la LOI, pas un nombre écrit ici.** Si la
    /// directive change, ce témoin suit sans qu'on ait à le réécrire — et il
    /// tombe si une des deux familles de résolveurs se remet à porter le sien.
    func test_leSeuil_estCeluiDeLaLoiPartagée() {
        XCTAssertEqual(MentionLookupRule.minimumRemoteQueryLength, 2)
        XCTAssertFalse(MentionLookupRule.queriesRemote(""))
        XCTAssertFalse(MentionLookupRule.queriesRemote("a"))
        XCTAssertFalse(MentionLookupRule.queriesRemote(" a "),
                       "les blancs ne comptent pas : `@ ` n'ouvre pas un handle")
        XCTAssertTrue(MentionLookupRule.queriesRemote("ab"))
    }

    /// **Le régime vaut AUSSI pour un contexte serveur.** Le contrôleur porte
    /// deux chemins distants — l'endpoint CONTEXTUEL (conversation, post) et
    /// l'annuaire (brouillon). Le premier partait dès le `@` nu
    /// (`minQueryLengthForAPI = 0`), et c'est exactement la divergence que la
    /// directive interdit : « ce système doit être général pour TOUS les
    /// emplacements où on doit mentionner un utilisateur ».
    func test_leRégime_vautAussiPourUneConversation() async {
        let alice = makeCandidate(id: "1", username: "alice")
        let mockService = MockMentionService()
        mockService.suggestionsResult = .success([makeSuggestion(username: "alicia")])
        let (sut, mock) = makeSUT(context: .conversation(id: "conv-1"),
                                  localCandidates: [alice], service: mockService)

        sut.handleQuery(in: "@")
        try? await Task.sleep(nanoseconds: 500_000_000)
        XCTAssertEqual(mock.suggestionsCallCount, 0, "`@` nu : les participants suffisent")

        sut.handleQuery(in: "@a")
        try? await Task.sleep(nanoseconds: 500_000_000)
        XCTAssertEqual(mock.suggestionsCallCount, 0, "une lettre : filtre local")

        sut.handleQuery(in: "@al")
        await waitUntil({ mock.suggestionsCallCount == 1 }, "deux lettres : l'API répond")
    }

    // MARK: - showsSuggestions : les DEUX vides ne se valent pas

    /// **« On cherche encore » ne se peint pas.** Sinon la bande annoncerait
    /// « aucune personne trouvée » 300 ms avant d'avoir cherché, puis se
    /// dédirait — un clignotement qui dit le contraire du vrai.
    func test_pendantLaRecherche_laBandeNeSeMontrePas() {
        let (sut, _) = makeSUTWithDirectory()

        sut.handleQuery(in: "@meeshy")

        XCTAssertTrue(sut.isResolving)
        XCTAssertFalse(sut.showsSuggestions,
                       "une bande vide pendant une recherche en vol dirait « personne » "
                       + "avant d'avoir regardé")
    }

    /// **« Personne ne correspond » se peint.** C'est la moitié du défaut
    /// rapporté : l'auteur ne pouvait pas distinguer une absence de résultat
    /// d'une fonctionnalité en panne, parce que la bande DISPARAISSAIT dans les
    /// deux cas.
    func test_rechercheTerminéeSansRésultat_laBandeSeMontreQuandMême() async {
        let (sut, annuaire) = makeSUTWithDirectory()
        annuaire.result = .success([])

        sut.handleQuery(in: "@personnequinexistepas")
        await waitUntil({ !sut.isResolving })

        XCTAssertTrue(sut.suggestions.isEmpty)
        XCTAssertTrue(sut.showsSuggestions,
                      "la bande doit DIRE « aucune personne trouvée » — disparaître "
                      + "laisse croire que la mention ne fonctionne pas")
    }

    /// **Un échec réseau rend le même verdict qu'une absence de résultat.** Il
    /// n'y a pas d'état d'erreur distinct à ce niveau — mais il ne doit surtout
    /// pas laisser le témoin allumé, sinon la bande ne reparaît plus jamais
    /// pour cette frappe.
    func test_unÉchecDAnnuaire_neLaissePasLeTémoinAllumé() async {
        let (sut, annuaire) = makeSUTWithDirectory()
        annuaire.result = .failure(NSError(domain: "test", code: -1))

        sut.handleQuery(in: "@meeshy")
        await waitUntil({ !sut.isResolving })

        XCTAssertTrue(sut.showsSuggestions)
    }

    /// **Effacer le `@` éteint tout**, témoin compris : sans cela, rouvrir le
    /// champ hériterait d'un « en cours » qu'aucune tâche ne terminera.
    func test_clearSuggestions_éteintLeTémoinDeRecherche() async {
        let (sut, _) = makeSUTWithDirectory()
        sut.handleQuery(in: "@meeshy")
        XCTAssertTrue(sut.isResolving)

        sut.clearSuggestions()

        XCTAssertFalse(sut.isResolving)
        XCTAssertFalse(sut.showsSuggestions, "sans requête active, aucune bande")
    }
}
