import XCTest
import GRDB
@testable import MeeshySDK

/// **« Une ligne visant cette cible est-elle encore en ROUTE ? »** — la question
/// que `OfflineQueueing.hasUnsentRow(kind:anchor:)` répond, et sur laquelle
/// repose l'idempotence par cible du repost hors ligne.
///
/// Le défaut qu'elle referme vit chez l'appelant (`RepostPublisher`, côté app) :
/// son verrou « en vol » a une BORNE HORS LIGNE. `publish` revendique la cible,
/// appelle `envoyer`, et relâche au RETOUR — or hors ligne `envoyer` se termine
/// dès que la ligne est gravée, pas quand la republication aboutit. Le verrou
/// tombe donc en une milliseconde et deux taps gravaient DEUX lignes
/// `.repostPost`, sous deux `cmid` distincts que le `MutationLog` du gateway ne
/// peut par construction pas rapprocher : deux reposts au flush.
///
/// **Cette suite mesure l'autre moitié — celle qui touche SQLite.** Un témoin
/// côté app, avec un double de file, resterait vert sur une réponse fabriquée :
/// il prouve que l'écrivain POSE la question, jamais que la file y répond
/// juste. Les six affirmations ci-dessous portent sur la table réelle.
final class OfflineQueueUnsentRowTests: XCTestCase {

    private var pool: DatabaseQueue!

    override func setUp() async throws {
        pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        await OfflineQueue.shared.configure(pool: pool)
        await OfflineQueue.shared.clearAll()
    }

    override func tearDown() async throws {
        await OfflineQueue.shared.clearAll()
        pool = nil
    }

    // MARK: - Helpers

    private func enfilerRepost(sur postId: String) async throws {
        try await OfflineQueue.shared.enqueue(
            .repostPost,
            payload: RepostPostPayload(
                clientMutationId: ClientMutationId.generate(),
                postId: postId,
                targetType: "POST",
                content: nil,
                isQuote: false,
                visibility: nil
            ),
            conversationId: postId
        )
    }

    private func basculer(_ statut: OutboxStatus, ancre: String) throws {
        try pool.write { db in
            try db.execute(
                sql: "UPDATE outbox SET status = ? WHERE conversationId = ?",
                arguments: [statut.rawValue, ancre]
            )
        }
    }

    // MARK: - Tests

    /// 1. Une ligne fraîchement gravée est EN ROUTE — sans quoi le second tap
    ///    ne serait retenu par rien.
    func test_uneLigneEnAttente_pourCetteAncre_estEnRoute() async throws {
        let cible = "post-en-attente"
        try await enfilerRepost(sur: cible)

        let enRoute = await OfflineQueue.shared.hasUnsentRow(kind: .repostPost, anchor: cible)

        XCTAssertTrue(
            enRoute,
            "La ligne vient d'être gravée `.pending` : la nier ferait graver une seconde ligne au tap "
                + "suivant, donc deux republications au flush."
        )
    }

    /// 2. **Par CIBLE, jamais globale.** Repartager une autre carte pendant
    ///    qu'une première attend est un geste parfaitement normal — la
    ///    contre-épreuve sans laquelle « tout est déjà en route » passerait au
    ///    vert et avalerait tous les repartages suivants.
    func test_uneAUTREancre_nEstPasEnRoute() async throws {
        try await enfilerRepost(sur: "post-A")

        let enRoute = await OfflineQueue.shared.hasUnsentRow(kind: .repostPost, anchor: "post-B")

        XCTAssertFalse(
            enRoute,
            "Une ligne visant `post-A` ne dit rien de `post-B` : un verdict global bloquerait toute "
                + "republication tant qu'une seule attend."
        )
    }

    /// 3. **Une ligne EN VOL compte encore**, et c'est le piège du flash orange
    ///    (`OfflineQueueInflightDedupTests`) rejoué ici : le flusher bascule la
    ///    row `pending → inflight` le temps de son envoi. Ne filtrer que
    ///    `.pending` la rendrait INVISIBLE pendant tout son vol, et un tap
    ///    tombant dans cette fenêtre graverait une jumelle.
    func test_uneLigneEnVOL_compteEncore() async throws {
        let cible = "post-en-vol"
        try await enfilerRepost(sur: cible)
        try basculer(.inflight, ancre: cible)

        let enRoute = await OfflineQueue.shared.hasUnsentRow(kind: .repostPost, anchor: cible)

        XCTAssertTrue(
            enRoute,
            "La ligne est réclamée par le flusher, donc en train de PARTIR : la nier pendant cette "
                + "fenêtre grave une jumelle, et les deux republications aboutissent."
        )
    }

    /// 4. **Une ligne ÉPUISÉE ne retient plus rien**, et c'est la BORNE que le
    ///    doc-comment de `hasUnsentRow` déclare. Le flusher a renoncé : elle
    ///    n'ira nulle part sans une reprise manuelle depuis la pastille de
    ///    synchro. La compter figerait le bouton de l'auteur sur une ligne
    ///    morte.
    func test_uneLigneEPUISEE_neRetientPlusRien() async throws {
        let cible = "post-epuise"
        try await enfilerRepost(sur: cible)
        try basculer(.exhausted, ancre: cible)

        let enRoute = await OfflineQueue.shared.hasUnsentRow(kind: .repostPost, anchor: cible)

        XCTAssertFalse(
            enRoute,
            "Le flusher a renoncé sur cette ligne. La compter rendrait le bouton INERTE jusqu'à ce que "
                + "l'auteur vide sa pastille de synchro — un contrôle sans effet."
        )
    }

    /// 5. **Une ligne ABOUTIE a quitté la table**, donc ne retient rien : c'est
    ///    ce qui garde faisable « republier, supprimer, republier ». La
    ///    déduplication porte sur les lignes EN ATTENTE, jamais sur
    ///    l'HISTORIQUE — un `clientMutationId` dérivé du contenu ferait
    ///    l'inverse, et le gateway rend déjà 410 sur le rejeu d'un repost
    ///    supprimé.
    func test_uneLigneABOUTIE_aQuitteLaTable_etNeRetientRien() async throws {
        let cible = "post-abouti"
        try await enfilerRepost(sur: cible)
        try await pool.write { db in
            _ = try OutboxRecord.filter(Column("conversationId") == cible).deleteAll(db)
        }

        let enRoute = await OfflineQueue.shared.hasUnsentRow(kind: .repostPost, anchor: cible)

        XCTAssertFalse(
            enRoute,
            "Le flush a supprimé la ligne : republier cette carte est un geste NEUF, pas un doublon."
        )
    }

    /// 6. **Le KIND fait partie de la question.** Une ligne `.repostStory`
    ///    (repost PRIVÉ en conversation, un autre geste) ou `.toggleLikePost`
    ///    rangée sous la même ancre ne dit rien d'une republication publique.
    ///    Sans ce témoin, un filtre aveugle au kind passerait au vert en
    ///    retenant des gestes qui n'ont rien à voir.
    func test_unAUTREkind_surLaMemeAncre_neRetientRien() async throws {
        let cible = "post-mixte"
        try await OfflineQueue.shared.enqueue(
            .toggleLikePost,
            payload: ToggleLikePostPayload(
                clientMutationId: ClientMutationId.generate(),
                postId: cible,
                liked: true
            ),
            conversationId: cible
        )

        let enRoute = await OfflineQueue.shared.hasUnsentRow(kind: .repostPost, anchor: cible)

        XCTAssertFalse(
            enRoute,
            "Un like en attente sur cette carte n'est pas une republication en attente : un filtre "
                + "aveugle au kind avalerait le repartage suivant."
        )
    }
}
