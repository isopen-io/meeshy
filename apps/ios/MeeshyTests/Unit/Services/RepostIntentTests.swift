import XCTest
@testable import Meeshy
@testable import MeeshySDK

/// **Le repost a UN écrivain, et il survit au réseau** — lot 7, tâche 7.5.
///
/// Avant ce lot, republier était NEUF appels réseau directs à
/// `PostService.repost`, écrits neuf fois, tous volatils : hors ligne ils
/// jetaient le geste, en ligne ils partaient sans `X-Client-Mutation-Id`, donc
/// sans le garde-fou contre le REJEU que le gateway venait pourtant d'installer
/// (tâche 7.1b, `withMutationOutcome` + `replayCost: 'diverges'`). Le kind
/// `.repostPost` existait, son payload existait, son dispatcher existait —
/// **personne n'enfilait**.
///
/// **Le jeton couvre le REJEU ; il ne couvre PAS le double tap**, et ce n'est
/// pas une moitié oubliée mais un défaut d'une autre nature : chaque tap
/// construit une intention NEUVE au site d'appel, donc un jeton neuf, que
/// `withMutationOutcome` ne peut par construction pas rapprocher. Cette suite
/// dit les trois séparément — le point 3 pour le rejeu, le point 5 pour le
/// verrou « en vol » (qui retient le second tap EN LIGNE), le point 6 pour
/// l'idempotence dans la file (qui le retient HORS LIGNE, là où le verrou a
/// déjà relâché la cible).
///
/// Cette suite tient les six affirmations de la tâche :
/// 1. hors ligne, le geste ENFILE une ligne durable, sans toucher le réseau ;
/// 2. la ligne ne perd pas son `targetType` (loi 5 — « le repost miroite ») ;
/// 3. en ligne, l'appel porte le `clientMutationId`, et le MÊME geste rejoué
///    porte le MÊME jeton — c'est ce qui rend le rejeu inoffensif ;
/// 4. les deux échecs TERMINAUX se NOMMENT : 404 sur la source, 403
///    d'élargissement d'audience. Ni l'un ni l'autre ne se rejoue ;
/// 5. EN LIGNE, deux TAPS sur la MÊME cible ne font qu'une republication tant
///    que la première est EN VOL (section « 2 bis ») — ce que le jeton, lui, ne
///    pouvait pas tenir ;
/// 6. HORS LIGNE, deux TAPS sur la MÊME cible ne gravent qu'UNE ligne
///    (section « 2 ter »). Le verrou du point 5 s'y arrête, et le doc-comment
///    de cette suite l'a longtemps passé sous silence : `publish` relâche la
///    cible au RETOUR d'`envoyer`, or hors ligne `envoyer` se termine dès que
///    la ligne est gravée. Ce qui retient là est la FILE — plus fort qu'un
///    verrou de processus, puisque la garantie survit à la mort de l'app entre
///    les deux taps. Elle ne porte QUE sur les lignes en attente, jamais sur
///    l'historique : republier, supprimer, republier reste faisable.
///
/// Plus la garde NÉGATIVE que la tâche exige : plus aucun appel direct à
/// `PostService.repost` hors de l'écrivain unique.
@MainActor
final class RepostIntentTests: XCTestCase {

    // MARK: - Doubles

    private func makeSUT(
        horsLigne: Bool
    ) -> (RepostPublisher, MockPostService, MockOfflineQueue) {
        let service = MockPostService()
        let file = MockOfflineQueue()
        let publieur = RepostPublisher(
            postService: service,
            offlineQueue: file,
            isOffline: { horsLigne }
        )
        return (publieur, service, file)
    }

    /// Cast conditionnel — le patron du dépôt (`PostDetailViewModelTests`,
    /// `StatusViewModelTests`) : le double garde la charge TYPÉE, et une charge
    /// d'un autre type doit faire ÉCHOUER le test, pas passer par un
    /// ré-encodage complaisant.
    private func chargeEnfilee(_ file: MockOfflineQueue) throws -> RepostPostPayload {
        guard let charge = file.enqueueCalls.first?.payload as? RepostPostPayload else {
            throw ChargeIntrouvable()
        }
        return charge
    }

    private struct ChargeIntrouvable: LocalizedError {
        var errorDescription: String? {
            "Aucune `RepostPostPayload` enfilée — l'écrivain n'a rien écrit, ou a écrit un autre contrat"
        }
    }

    // MARK: - 1. Hors ligne, le geste ENFILE

    func test_horsLigne_leRepost_enfileUneLigneDurable_etNeTouchePasLeReseau() async throws {
        let (publieur, service, file) = makeSUT(horsLigne: true)

        let issue = try await publieur.publish(
            .simple(postId: "story-42", targetType: .story, visibility: nil)
        )

        XCTAssertEqual(issue, .queued)
        XCTAssertEqual(
            service.repostCallCount, 0,
            "Hors ligne, le repost ne doit pas partir sur le réseau pour y attendre son délai d'expiration : "
                + "il s'écrit dans la file durable, qui survit au kill de l'app."
        )
        XCTAssertEqual(file.enqueueCalls.count, 1)
        XCTAssertEqual(
            file.enqueueCalls.first?.kind, .repostPost,
            "Le kind est `.repostPost` — jamais `.repostStory`, dont le payload porte `targetConversationId` "
                + "et décrit un repost PRIVÉ en conversation, un autre geste."
        )
    }

    /// **Loi 5 — « le repost miroite ».** Le format doit voyager EXPLICITEMENT
    /// jusqu'au bout de la file. Le repli serveur `?? PostType.POST` transforme
    /// une source éphémère en post permanent sans que personne ne l'ait demandé.
    func test_horsLigne_laLigneDurable_nePerdPasSonTargetType() async throws {
        let (publieur, _, file) = makeSUT(horsLigne: true)

        try await publieur.publish(
            .simple(postId: "story-42", targetType: .story, visibility: nil)
        )

        let charge = try chargeEnfilee(file)
        XCTAssertEqual(
            charge.targetType, "STORY",
            "Le format de la carte doit survivre à l'attente : sans lui la ligne repartirait sur le repli "
                + "serveur `?? POST` au flush, et une story repartagée deviendrait un post permanent."
        )
        XCTAssertEqual(charge.postId, "story-42")
    }

    /// La charge persistée porte les SIX champs, pas quatre : `content`,
    /// `isQuote` et `visibility` sont ce qui distingue une citation d'un
    /// repartage sec, et une audience choisie d'une audience héritée.
    func test_horsLigne_laCitation_voyageEntiere_commentaireEtAudienceCompris() async throws {
        let (publieur, _, file) = makeSUT(horsLigne: true)

        try await publieur.publish(
            .quoted(postId: "post-7", targetType: .post, comment: "mon avis", visibility: "PRIVATE")
        )

        let charge = try chargeEnfilee(file)
        XCTAssertEqual(charge.content, "mon avis")
        XCTAssertTrue(charge.isQuote)
        XCTAssertEqual(charge.visibility, "PRIVATE")
        XCTAssertEqual(
            file.enqueueCalls.first?.conversationId, "post-7",
            "La ligne se range sous la SOURCE : c'est elle que la pastille de synchro sait ouvrir "
                + "(`OutboxUIItem.mapRepostPost` → `.post(id:)`), le repost n'existant pas encore."
        )
    }

    /// **Un format INCONNU ne s'enfile pas.** `RepostTargeting` rend
    /// `targetType: nil` quand la carte a disparu du modèle entre le tap et
    /// l'envoi. En ligne c'est le filet du gateway qui tranche ; dans la FILE,
    /// écrire `"POST"` à la place d'un format inconnu serait exactement la
    /// transformation silencieuse que la loi 5 interdit — et elle survivrait à
    /// un kill de l'app, gravée dans le payload.
    func test_horsLigne_unFormatInconnu_estRefuse_plutotQueRepliéSurPost() async throws {
        let (publieur, _, file) = makeSUT(horsLigne: true)

        do {
            try await publieur.publish(
                .simple(postId: "carte-volatile", targetType: nil, visibility: nil)
            )
            XCTFail("Un format inconnu ne doit pas s'enfiler en inventant `POST`.")
        } catch let refus as RepostRefusal {
            XCTAssertEqual(refus, .unknownTargetTypeOffline)
        }

        XCTAssertTrue(
            file.enqueueCalls.isEmpty,
            "Rien ne doit être écrit : une ligne durable au format inventé est pire qu'un geste refusé, "
                + "elle se rejoue toute seule au retour du réseau."
        )
    }

    // MARK: - 2. En ligne, l'appel porte son jeton

    func test_enLigne_lAppel_porteLeClientMutationId_etPartSurLeReseau() async throws {
        let (publieur, service, file) = makeSUT(horsLigne: false)

        let issue = try await publieur.publish(
            .simple(postId: "post-7", targetType: .post, visibility: nil)
        )

        XCTAssertEqual(issue, .sent)
        XCTAssertEqual(service.repostCallCount, 1)
        XCTAssertTrue(file.enqueueCalls.isEmpty, "En ligne, rien ne s'enfile.")
        XCTAssertEqual(
            service.lastRepostClientMutationId?.hasPrefix("cmid_"), true,
            "Sans `X-Client-Mutation-Id`, `withMutationOutcome` (tâche 7.1b) n'a aucune clé pour "
                + "reconnaître un rejeu : deux taps après un délai d'expiration font deux reposts. "
                + "Reçu : \(String(describing: service.lastRepostClientMutationId))"
        )
    }

    /// **Le jeton appartient à l'INTENTION, pas à l'envoi — et il ne couvre QUE
    /// le rejeu.** La première moitié de ce témoin constate ce qui est
    /// COUVERT : la file rejoue la MÊME ligne, donc le même jeton, et le
    /// gateway resert le résultat au lieu de republier.
    ///
    /// **La seconde moitié constate un MANQUE, elle ne grave pas un choix.**
    /// Deux jetons distincts pour deux taps ne sont pas la protection voulue :
    /// c'est la borne de ce que ce mécanisme peut tenir. Chaque tap construit
    /// une intention NEUVE au site d'appel, donc un jeton neuf, et
    /// `withMutationOutcome` ne voit que deux mutations étrangères l'une à
    /// l'autre. Lire cette assertion comme « deux taps DOIVENT publier deux
    /// fois » serait un contresens.
    ///
    /// Ce manque ne se comble pas en dérivant le jeton du CONTENU : l'auteur a
    /// le droit de republier, supprimer, republier — le gateway rend déjà 410
    /// sur le rejeu d'un repost supprimé, et un jeton déterministe rendrait ce
    /// geste légitime impossible. Il se comble EN AMONT, par le verrou « en
    /// vol » par CIBLE — section « 2 bis » ci-dessous.
    func test_leJetonNeCouvreQueLeREJEU_deuxGestesRestantDeuxJetonsIrreconciliables() async throws {
        let geste = RepostIntent.simple(postId: "post-7", targetType: .post, visibility: nil)

        let (publieur, service, _) = makeSUT(horsLigne: false)
        try await publieur.publish(geste)
        let premier = service.lastRepostClientMutationId
        try await publieur.publish(geste)
        let second = service.lastRepostClientMutationId

        XCTAssertEqual(premier, second, "Rejouer la MÊME intention doit rejouer le MÊME jeton.")

        let autreGeste = RepostIntent.simple(postId: "post-7", targetType: .post, visibility: nil)
        XCTAssertNotEqual(
            geste.clientMutationId, autreGeste.clientMutationId,
            "Deux gestes sont deux envois, et le jeton ne peut pas les rapprocher — c'est la BORNE de "
                + "ce mécanisme, pas son intention. Un jeton dérivé du contenu ferait prendre le second "
                + "pour un rejeu du premier, et une republication volontaire après suppression ne "
                + "partirait plus jamais. Ce qui retient le double tap est le verrou « en vol », section 2 bis."
        )
    }

    // MARK: - 2 bis. Le DOUBLE TAP — ce que le jeton ne pouvait PAS retenir

    /// **Deux taps ne sont pas un rejeu.** Chaque tap construit une intention
    /// NEUVE au site d'appel, donc un jeton neuf : le gateway voit deux
    /// mutations étrangères l'une à l'autre et republie. Le seul endroit qui
    /// SAIT qu'un vol est en cours est l'écrivain — c'est là que le second tap
    /// se retient, pas dans le header.
    ///
    /// La cible est UNIQUE à ce témoin : le verrou est PROCESSUS-large
    /// (`RepostInFlightRegistry.shared`, seule forme qui retienne quoi que ce
    /// soit puisque les sites construisent un publieur neuf à chaque tap), donc
    /// deux témoins qui partageraient un `postId` se parleraient.
    func test_deuxTapsSurLaMemeCible_lePremierEnVol_neFontQuUneSeuleRepublication() async throws {
        let (publieur, service, file) = makeSUT(horsLigne: false)
        let cible = "double-tap-\(UUID().uuidString)"
        service.holdRepost(for: 3)

        let premierTap = Task {
            try await publieur.publish(.simple(postId: cible, targetType: .post, visibility: nil))
        }
        await attendreQue({ service.repostCallCount >= 1 }, "le premier tap n'est jamais parti sur le réseau")

        let issueDuSecondTap = try await publieur.publish(
            .simple(postId: cible, targetType: .post, visibility: nil)
        )

        XCTAssertEqual(
            service.repostCallCount, 1,
            "Deux taps sur la MÊME carte, le premier encore EN VOL, ont fait \(service.repostCallCount) "
                + "requêtes : deux republications pour un seul geste voulu. Les jetons partis sont "
                + "\(service.repostClientMutationIds) — distincts, donc irréconciliables par "
                + "`withMutationOutcome`, qui ne rapproche que des rejeux du MÊME jeton."
        )
        XCTAssertEqual(
            issueDuSecondTap, .alreadyInFlight,
            "Le tap avalé doit se DIRE : sans une issue à lui, l'appelant ne distingue pas un envoi d'un "
                + "geste retenu. Et il ne doit pas LEVER — les huit sites annuleraient leur état "
                + "optimiste et diraient une erreur pour un repost qui est en train d'aboutir."
        )
        XCTAssertTrue(file.enqueueCalls.isEmpty, "Un tap avalé n'écrit rien non plus dans la file.")

        service.releaseRepost()
        _ = try await premierTap.value
    }

    /// **Le verrou est par CIBLE, jamais global.** Repartager une carte pendant
    /// qu'une autre est en vol est un geste parfaitement normal — la
    /// contre-épreuve sans laquelle « plus rien ne part jamais » passerait au
    /// vert.
    func test_leVerrouEstParCIBLE_uneAutreCarte_partPendantQueLaPremiereEstEnVol() async throws {
        let (publieur, service, _) = makeSUT(horsLigne: false)
        let premiereCible = "cible-A-\(UUID().uuidString)"
        let secondeCible = "cible-B-\(UUID().uuidString)"
        service.holdRepost(for: 3)

        let volA = Task {
            try await publieur.publish(.simple(postId: premiereCible, targetType: .post, visibility: nil))
        }
        await attendreQue({ service.repostCallCount >= 1 }, "le repost de la première carte n'est jamais parti")

        let volB = Task {
            try await publieur.publish(.simple(postId: secondeCible, targetType: .post, visibility: nil))
        }
        await attendreQue(
            { service.repostCallCount >= 2 },
            "reposter une AUTRE carte pendant qu'une première est en vol a été avalé : le verrou est "
                + "global au lieu d'être par cible"
        )

        service.releaseRepost()
        _ = try await volA.value
        _ = try await volB.value
        XCTAssertEqual(service.repostCallCount, 2)
    }

    /// **Le verrou se relâche à la RETOMBÉE du vol, jamais plus tard.**
    /// Republier, supprimer, republier est un geste que l'auteur a le droit de
    /// faire : c'est exactement celui qu'un jeton dérivé du CONTENU rendrait
    /// impossible (le gateway rend 410 sur le rejeu d'un repost supprimé). Un
    /// verrou qui survivrait à son vol le rendrait impossible autrement.
    func test_leVerrouSeRelacheALaRetombee_republierUneSecondeFois_resteFaisable() async throws {
        let (publieur, service, _) = makeSUT(horsLigne: false)
        let cible = "republier-\(UUID().uuidString)"

        let premier = try await publieur.publish(.simple(postId: cible, targetType: .post, visibility: nil))
        let second = try await publieur.publish(.simple(postId: cible, targetType: .post, visibility: nil))

        XCTAssertEqual(premier, .sent)
        XCTAssertEqual(
            second, .sent,
            "Le premier vol est RETOMBÉ : republier la même carte est un geste neuf, pas un doublon."
        )
        XCTAssertEqual(service.repostCallCount, 2)
        XCTAssertEqual(
            Set(service.repostClientMutationIds).count, 2,
            "Et les deux envois portent deux jetons DISTINCTS : un jeton déterministe ferait prendre le "
                + "second pour un rejeu du premier, et le gateway lui répondrait 410 sur un repost supprimé."
        )
    }

    /// **Le verrou ne vit PAS dans l'instance**, et ce témoin le prouve sur le
    /// câblage RÉEL — deux publieurs construits séparément, aucun registre
    /// injecté, donc `RepostInFlightRegistry.shared` des deux côtés.
    ///
    /// Sans cela, la protection serait FICTIVE : `ReelsViewModel`,
    /// `FeedViewModel`, `ProfileUserPostsList` et `StatusViewModel`
    /// construisent un `RepostPublisher` NEUF à chaque tap, et les vues passent
    /// par `.shared`. Un `Set` porté par la structure ne retiendrait rien du
    /// tout, tout en ayant l'air d'un verrou.
    func test_leVerrouNeVitPasDansLInstance_deuxPublieursNeufs_retiennentLaMemeCible() async throws {
        let service = MockPostService()
        let file = MockOfflineQueue()
        let cible = "instance-\(UUID().uuidString)"
        let premierPublieur = RepostPublisher(postService: service, offlineQueue: file, isOffline: { false })
        let secondPublieur = RepostPublisher(postService: service, offlineQueue: file, isOffline: { false })
        service.holdRepost(for: 3)

        let vol = Task {
            try await premierPublieur.publish(.simple(postId: cible, targetType: .post, visibility: nil))
        }
        await attendreQue({ service.repostCallCount >= 1 }, "le premier publieur n'a rien envoyé")

        let issue = try await secondPublieur.publish(
            .simple(postId: cible, targetType: .post, visibility: nil)
        )

        XCTAssertEqual(issue, .alreadyInFlight)
        XCTAssertEqual(
            service.repostCallCount, 1,
            "Un second publieur, neuf, a republié la cible que le premier tient en vol : le verrou est "
                + "porté par l'instance et ne retient donc rien en production."
        )

        service.releaseRepost()
        _ = try await vol.value
    }

    // MARK: - 2 ter. Le DOUBLE TAP HORS LIGNE — la BORNE du verrou « en vol »

    /// **Hors ligne, le vol est FINI dès que la ligne est gravée.**
    ///
    /// `publish` revendique la cible, appelle `envoyer`, et relâche au RETOUR.
    /// Sur le chemin en ligne, ce retour attend la réponse du serveur — le
    /// verrou couvre donc toute la durée du vol. Sur le chemin HORS LIGNE,
    /// `envoyer` se termine dès qu'`offlineQueue.enqueue` a rendu la main :
    /// le verrou tombe en une milliseconde, et le second tap le revendique
    /// librement. Deux lignes `.repostPost`, deux `cmid` distincts, DEUX
    /// republications au flush — que rien en aval ne peut rapprocher, le
    /// gateway ne dédupliquant que le REJEU d'un MÊME jeton.
    ///
    /// Ce que ce témoin exige est donc plus fort qu'un verrou de processus :
    /// l'idempotence PAR CIBLE dans la file durable, qui survit même à la mort
    /// de l'application entre les deux taps.
    func test_horsLigne_deuxTapsSurLaMemeCible_neGraventQuUneSeuleLigne() async throws {
        let (publieur, service, file) = makeSUT(horsLigne: true)
        let cible = "hors-ligne-\(UUID().uuidString)"

        let premier = try await publieur.publish(
            .simple(postId: cible, targetType: .post, visibility: nil)
        )
        let second = try await publieur.publish(
            .simple(postId: cible, targetType: .post, visibility: nil)
        )

        XCTAssertEqual(premier, .queued)
        XCTAssertEqual(
            file.enqueueCalls.count, 1,
            "Deux taps hors ligne ont gravé \(file.enqueueCalls.count) lignes `.repostPost` sur la MÊME "
                + "cible : au retour du réseau le flusher les enverra TOUTES, sous deux `cmid` distincts "
                + "que `withMutationOutcome` ne peut pas rapprocher — deux reposts pour un seul geste "
                + "voulu. Le verrou « en vol » ne retient rien ici : hors ligne le vol est TERMINÉ dès "
                + "l'enfilage, donc relâché avant même que le doigt ne se relève."
        )
        XCTAssertEqual(
            second, .alreadyQueued,
            "Le tap avalé doit se DIRE : sans une issue à lui, l'appelant ne distingue pas un geste gravé "
                + "d'un geste retenu. Et il ne doit pas LEVER — les neuf sites annuleraient leur état "
                + "optimiste pour une republication qui attend, gravée, dans la file."
        )
        XCTAssertEqual(service.repostCallCount, 0, "Hors ligne, rien ne part sur le réseau.")
    }

    /// **La déduplication est par CIBLE, jamais globale.** Repartager une AUTRE
    /// carte hors ligne est un geste parfaitement normal — la contre-épreuve
    /// sans laquelle « plus rien ne se grave jamais » passerait au vert.
    func test_horsLigne_laDeduplicationEstParCIBLE_uneAutreCarte_graveBienSaLigne() async throws {
        let (publieur, _, file) = makeSUT(horsLigne: true)

        try await publieur.publish(.simple(postId: "cible-A", targetType: .post, visibility: nil))
        try await publieur.publish(.simple(postId: "cible-B", targetType: .post, visibility: nil))

        XCTAssertEqual(
            file.enqueueCalls.count, 2,
            "Deux cartes DIFFÉRENTES repartagées hors ligne ne sont pas un double tap : une déduplication "
                + "globale les avalerait, et le second repartage serait perdu sans un mot."
        )
        XCTAssertEqual(file.enqueueCalls.compactMap(\.conversationId), ["cible-A", "cible-B"])
    }

    /// **La question est posée à la FILE DURABLE, pas à un état de processus** —
    /// et c'est ce qui fait survivre la garantie à la mort de l'application
    /// entre les deux taps.
    ///
    /// Le double ici ne connaît aucun enfilage antérieur : sa réponse est
    /// FORCÉE, exactement comme le serait celle d'une file relue au démarrage
    /// suivant. Un verrou porté par le processus — `RepostInFlightRegistry` ou
    /// n'importe quel `Set` en mémoire — rendrait `false` dans cette situation
    /// et graverait la seconde ligne.
    func test_horsLigne_lEcrivainINTERROGE_laFileDurable_etNonUnEtatEnMemoire() async throws {
        let (publieur, _, file) = makeSUT(horsLigne: true)
        file.hasUnsentRowStub = true

        let issue = try await publieur.publish(
            .simple(postId: "post-7", targetType: .post, visibility: nil)
        )

        XCTAssertEqual(issue, .alreadyQueued)
        XCTAssertTrue(
            file.enqueueCalls.isEmpty,
            "Une ligne `.repostPost` attend déjà pour cette cible — gravée avant un kill de l'app, par "
                + "exemple. En graver une seconde double la republication au flush."
        )
        XCTAssertEqual(
            file.hasUnsentRowCalls.map(\.kind), [.repostPost],
            "La question porte sur le kind `.repostPost` — jamais sur `.repostStory` (un repost PRIVÉ en "
                + "conversation, un autre geste) ni sur `.createPost` avec `repostOfId`."
        )
        XCTAssertEqual(
            file.hasUnsentRowCalls.map(\.anchor), ["post-7"],
            "L'ancre est la SOURCE, celle sous laquelle la ligne se range (`conversationId: intent.postId`). "
                + "Interroger l'ancre globale `_global` ferait qu'une seule republication en attente "
                + "bloquerait TOUTES les autres cartes."
        )
    }

    /// **Un second tap ne se fait pas REFUSER pour une raison qui ne le concerne
    /// plus.** `RepostTargeting` rend `targetType: nil` quand la carte a quitté
    /// le modèle entre le tap et l'envoi — un refus juste quand il n'y a rien
    /// en file, un mensonge quand la republication est DÉJÀ gravée : l'appelant
    /// annulerait son état optimiste et dirait une erreur pour un geste qui
    /// partira au retour du réseau.
    func test_horsLigne_unSecondTap_nEstPasREFUSE_quandLaLigneEstDejaGravee() async throws {
        let (publieur, _, file) = makeSUT(horsLigne: true)
        file.hasUnsentRowStub = true

        let issue = try await publieur.publish(
            .simple(postId: "carte-volatile", targetType: nil, visibility: nil)
        )

        XCTAssertEqual(
            issue, .alreadyQueued,
            "La question « y a-t-il déjà une ligne pour cette cible ? » précède « cette intention est-elle "
                + "gravable ? » : quand la réponse est oui, il n'y a plus rien à graver, donc plus rien à "
                + "refuser."
        )
        XCTAssertTrue(file.enqueueCalls.isEmpty)
    }

    // MARK: - 3. Les DEUX échecs terminaux, nommés

    /// 404 — la story a expiré pendant l'attente. La ligne quitte la file ;
    /// rejouer ne ramènera jamais une source disparue.
    func test_leQuatreCentQuatre_surLaSource_estUnEchecTerminal() {
        let verdict = RepostFailure.classify(
            MeeshyError.server(statusCode: 404, message: "Original post not found")
        )
        XCTAssertEqual(verdict, .sourceGone)
        XCTAssertTrue(verdict.isTerminal)
    }

    /// 403 `REPOST_AUDIENCE_WIDENING`. `APIClient` le surface en `.forbidden`
    /// (accès refusé à CETTE ressource), pas en `.server(403, _)` : les deux
    /// formes doivent rendre le même verdict, sans quoi la moitié des refus
    /// d'audience boucleraient en silence.
    func test_leQuatreCentTrois_dElargissementDAudience_estUnEchecTerminal() {
        XCTAssertEqual(
            RepostFailure.classify(MeeshyError.forbidden(reason: "REPOST_AUDIENCE_WIDENING", body: nil)),
            .audienceWidening
        )
        XCTAssertEqual(
            RepostFailure.classify(MeeshyError.server(statusCode: 403, message: "widening")),
            .audienceWidening
        )
        XCTAssertTrue(RepostFailure.classify(MeeshyError.forbidden(reason: nil, body: nil)).isTerminal)
    }

    /// … et la contre-épreuve, sans laquelle « tout est terminal » passerait au
    /// vert : une coupure réseau n'est PAS terminale. La ligne reste en file et
    /// repart au retour du réseau — c'est toute la valeur de la file durable.
    func test_uneCoupureReseau_nEstPasTerminale_etLaLigneReste() {
        let verdict = RepostFailure.classify(MeeshyError.network(.noConnection))
        XCTAssertEqual(verdict, .other)
        XCTAssertFalse(
            verdict.isTerminal,
            "Classer une coupure réseau en terminal jetterait le geste au premier tunnel."
        )
        XCTAssertFalse(RepostFailure.classify(MeeshyError.server(statusCode: 503, message: "…")).isTerminal)
    }

    /// **Le défaut MESURÉ que cette tâche referme.** `StoryViewerView` mappait
    /// ses deux refus nommés contre `APIError.serverError(code, _)` — un type
    /// qu'`APIClient` ne lance JAMAIS (ses vingt-cinq `throw` lancent tous
    /// `MeeshyError`). Les deux toasts « La story n'est plus disponible » et
    /// « Cette story ne peut pas être repartagée » étaient donc INATTEIGNABLES,
    /// et son doc-comment affirmait le contraire : « that's the shape
    /// `APIClient` throws ». La classification doit reconnaître la forme
    /// RÉELLEMENT lancée.
    func test_laClassification_reconnaitLaFormeQueLApiClientLanceVRAIMENT() {
        XCTAssertEqual(
            RepostFailure.classify(MeeshyError.server(statusCode: 404, message: "gone")), .sourceGone,
            "C'est `MeeshyError` qu'`APIClient` lance — pas `APIError`."
        )
    }

    func test_leViewerDeStory_neMappePlusSesRefus_surUnTypeQuePersonneNeLance() throws {
        let source = AppSourceGuard.stripComments(try sourceDeProduction("StoryViewerView.swift"))

        XCTAssertFalse(
            source.contains("catch APIError.serverError("),
            "`APIClient` ne lance que `MeeshyError` : un `catch APIError.serverError(…)` est une branche "
                + "MORTE, et les deux refus nommés du repost y tombaient dans le fourre-tout générique."
        )
        XCTAssertTrue(
            source.contains("RepostFailure.classify("),
            "Le viewer doit nommer ses deux refus par la classification partagée — sinon cette garde "
                + "négative resterait verte sur un fichier qui aurait simplement cessé de traiter l'erreur."
        )
    }

    // MARK: - 4. La garde NÉGATIVE : un seul écrivain

    /// **L'assertion négative que la tâche exige.** Plus aucun appel direct à
    /// `PostService.repost` hors de l'écrivain unique. Le dispatcher n'y figure
    /// pas parce qu'il n'en fait pas partie : il parle à `APIClient` en direct
    /// (`dispatchRepostPost`), jamais au service.
    ///
    /// Les trois jetons cherchés sont DISJOINTS (`postService.repost(` ne
    /// contient pas `service.repost(`, la capitale les sépare), et l'ancre
    /// POSITIVE empêche cette garde de mourir en silence le jour où l'écrivain
    /// changerait de nom : une garde négative qui ne trouve plus sa cible passe
    /// au vert en perdant sa protection.
    func test_plusAucunAppelDirect_aPostServiceRepost_horsDeLEcrivainUnique() throws {
        let ecrivain = "RepostIntent.swift"
        var fichiersAvecAppelDirect: [String] = []
        var ecrivainTrouve = false

        for url in try sourcesDeProductionDeLApp() {
            let source = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
            let appelle = source.contains("postService.repost(")
                || source.contains("service.repost(")
                || source.contains("PostService.shared.repost(")
            guard appelle else { continue }
            if url.lastPathComponent == ecrivain {
                ecrivainTrouve = true
            } else {
                fichiersAvecAppelDirect.append(url.lastPathComponent)
            }
        }

        XCTAssertTrue(
            ecrivainTrouve,
            "\(ecrivain) n'appelle plus `postService.repost(` : l'ancre positive est tombée, cette garde "
                + "ne mesurerait plus rien."
        )
        XCTAssertEqual(
            fichiersAvecAppelDirect, [String](),
            "Ces fichiers repostent en direct, hors de l'écrivain unique : leur envoi ne porte pas de "
                + "`clientMutationId` et ne bascule pas en file hors ligne. Trouvés : \(fichiersAvecAppelDirect)"
        )
    }

    /// … et sa jumelle POSITIVE : les neuf sites publient bien PAR l'écrivain.
    /// Sans elle, supprimer purement et simplement un site rendrait la garde
    /// négative verte — en supprimant la fonctionnalité.
    ///
    /// **Neuf SITES, huit FICHIERS** — `StoryViewerView` en porte deux (la
    /// republication sèche du kebab et celle du composeur de citation). Le plan
    /// du lot 7 en recensait huit ; le neuvième — l'ancrage d'un mood,
    /// `StatusViewModel.anchorStatusAsPost` — est arrivé avec le lot 4.7, après
    /// la rédaction du plan. Le compter en moins aurait laissé un appel direct
    /// derrière la garde négative.
    func test_lesNeufSitesDuRepost_publientParLEcrivainUnique() throws {
        let sites = [
            "FeedViewModel.swift", "ReelsViewModel.swift", "StatusViewModel.swift",
            "PostDetailView.swift", "ProfileUserPostsList.swift", "RootViewComponents.swift",
            "FeedView.swift", "StoryViewerView.swift"
        ]

        for site in sites {
            let source = AppSourceGuard.stripComments(try sourceDeProduction(site))
            XCTAssertTrue(
                source.contains("RepostPublisher"),
                "\(site) ne nomme plus l'écrivain unique : son repost est reparti en direct, sans "
                    + "jeton d'idempotence et sans file durable."
            )
        }
    }

    // MARK: - 5. Les trois gestes nommés

    func test_unRepartageSec_nEstPasUneCitation() {
        let geste = RepostIntent.simple(postId: "p", targetType: .post, visibility: nil)
        XCTAssertNil(geste.content)
        XCTAssertFalse(geste.isQuote)
    }

    /// Un commentaire vide ou blanc n'est pas une citation : c'est la règle que
    /// trois des quatre sites de citation appliquaient déjà, chacun de son côté.
    func test_uneCitationSansMot_retombeSurUnRepartageSec() {
        for blanc in ["", "   ", "\n \t"] {
            let geste = RepostIntent.quoted(postId: "p", targetType: .post, comment: blanc, visibility: nil)
            XCTAssertNil(geste.content, "« \(blanc) » n'est pas un commentaire.")
            XCTAssertFalse(geste.isQuote)
        }
        let sansRien = RepostIntent.quoted(postId: "p", targetType: .post, comment: nil, visibility: nil)
        XCTAssertFalse(sansRien.isQuote)
    }

    func test_uneCitation_gardeSonCommentaireEbarbe() {
        let geste = RepostIntent.quoted(postId: "p", targetType: .post, comment: "  mon avis  ", visibility: nil)
        XCTAssertEqual(geste.content, "mon avis")
        XCTAssertTrue(geste.isQuote)
    }

    /// **Le troisième geste existe parce qu'une surface DÉCLARE une citation
    /// sans recueillir de commentaire** — la feuille de détail, dont l'alerte
    /// « Citer » n'a aucun champ de saisie. Le normaliser en repartage sec
    /// serait un changement de PRODUIT et non de forme : côté serveur,
    /// `isQuote` décide où s'enracinent les réactions (`PostService.ts`,
    /// `reactionRootId`) — une citation les garde, un repartage sec les renvoie
    /// sur l'original. Ce geste est donc porté FIDÈLEMENT, et sa dette est
    /// nommée plutôt que corrigée à l'aveugle.
    func test_uneCitationDECLAREE_resteUneCitation_memeSansCommentaire() {
        let geste = RepostIntent.declaredQuote(postId: "p", targetType: .post, visibility: nil)
        XCTAssertTrue(geste.isQuote)
        XCTAssertNil(geste.content)
    }

    // MARK: - Helper d'attente

    /// Attend qu'une condition devienne vraie, ou ÉCHOUE en la nommant.
    ///
    /// Un `Task.sleep` fixe suffirait presque toujours et mentirait le reste du
    /// temps : sous charge, un envoi qui n'est pas encore parti se lirait comme
    /// un envoi retenu par le verrou — le témoin passerait au vert en mesurant
    /// l'ordonnanceur.
    private func attendreQue(_ predicat: @escaping @Sendable () -> Bool, _ ceQuOnAttendait: String) async {
        for _ in 0..<400 {
            if predicat() { return }
            try? await Task.sleep(nanoseconds: 5_000_000)
        }
        XCTFail("Jamais atteint en 2 s : \(ceQuOnAttendait)")
    }

    // MARK: - Helpers de source

    private struct SourceIntrouvable: LocalizedError {
        let nom: String
        var errorDescription: String? {
            "Source de production introuvable : \(nom) — la garde ne mesurerait rien pour ce site"
        }
    }

    private func racineDesSources() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Services
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy")
    }

    private func sourceDeProduction(_ nomDeFichier: String) throws -> String {
        guard let enumerateur = FileManager.default.enumerator(
            at: racineDesSources(), includingPropertiesForKeys: nil
        ) else {
            throw SourceIntrouvable(nom: nomDeFichier)
        }
        for case let url as URL in enumerateur where url.lastPathComponent == nomDeFichier {
            return try String(contentsOf: url, encoding: .utf8)
        }
        throw SourceIntrouvable(nom: nomDeFichier)
    }

    private func sourcesDeProductionDeLApp() throws -> [URL] {
        guard let enumerateur = FileManager.default.enumerator(
            at: racineDesSources(), includingPropertiesForKeys: nil
        ) else {
            throw SourceIntrouvable(nom: "Meeshy")
        }
        var trouvees: [URL] = []
        for case let url as URL in enumerateur where url.pathExtension == "swift" {
            trouvees.append(url)
        }
        XCTAssertGreaterThan(trouvees.count, 100, "Arborescence app trop maigre — la garde ne balaierait presque rien.")
        return trouvees
    }
}
