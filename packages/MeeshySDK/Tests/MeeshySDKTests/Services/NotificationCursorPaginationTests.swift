import XCTest
@testable import MeeshySDK

/// LA PAGINATION DES NOTIFICATIONS, PAR CURSEUR (#4901) — le témoin de PAIRE
/// que le serveur a déjà (#4175), porté côté client : sur la MÊME collection
/// vivante, le RANG duplique après une insertion en tête, le CURSEUR non.
///
/// La collection « vit » entre deux pages : le test la mute puis re-stubbe ce
/// que la passerelle SERVIRAIT (tranche par rang, tranche par ancre) — les deux
/// formes sont celles que `routes/notifications.ts` documente. Ce qui est
/// prouvé du CLIENT : il formule sans rang par défaut, il relaie l'ancre
/// VERBATIM (opaque), et le rang reste FORMULABLE en repli (dimension 9).
final class NotificationCursorPaginationTests: XCTestCase {

    private var mockAPI: MockAPIClient!
    private var service: NotificationService!

    override func setUp() {
        super.setUp()
        mockAPI = MockAPIClient()
        service = NotificationService(api: mockAPI)
    }

    // MARK: - La collection vivante, et ce que la passerelle en servirait

    private func notif(_ id: String, creeeA: String) -> APINotification {
        APINotification(
            id: id, userId: "u1", type: "message", priority: nil,
            content: "n", actor: nil, context: nil, metadata: nil,
            state: NotificationState(isRead: false, readAt: nil, createdAt: creeeA, expiresAt: nil),
            delivery: nil
        )
    }

    /// n5 (la plus récente) → n1 ; l'ancre keyset est `(createdAt, id)` comme au serveur.
    private var collection: [APINotification] = []

    private func semeCinq() {
        collection = (1...5).reversed().map { i in
            notif("n\(i)", creeeA: "2026-09-04T10:0\(i):00.000Z")
        }
    }

    private func ancre(_ ligne: APINotification) -> String { "\(ligne.state.createdAt)|\(ligne.id)" }

    private func pageParRang(offset: Int, limit: Int) -> [APINotification] {
        Array(collection.dropFirst(offset).prefix(limit))
    }

    private func pageParCurseur(_ curseur: String, limit: Int) -> [APINotification] {
        guard let rang = collection.firstIndex(where: { ancre($0) == curseur }) else { return [] }
        return Array(collection.dropFirst(rang + 1).prefix(limit))
    }

    private func reponse(_ lignes: [APINotification], nextCursor: String?) -> NotificationListResponse {
        NotificationListResponse(
            success: true,
            data: lignes,
            pagination: NotificationPagination(total: nil, offset: nil, limit: 2, hasMore: nextCursor != nil, nextCursor: nextCursor),
            unreadCount: nil
        )
    }

    // MARK: - Les témoins

    func test_parDefaut_aucunRang_neParVoyage_etLAncreEstRelayeeVerbatim() async throws {
        semeCinq()
        let page1 = pageParRang(offset: 0, limit: 2)
        mockAPI.stub("/notifications", result: reponse(page1, nextCursor: ancre(page1.last!)))

        _ = try await service.list(limit: 2)

        let envoi1 = mockAPI.lastRequest!
        XCTAssertNil(envoi1.queryItems?.first(where: { $0.name == "offset" }),
                     "sans rang ni curseur, AUCUN offset ne part — la première page est keyset")
        XCTAssertNil(envoi1.queryItems?.first(where: { $0.name == "cursor" }))

        // La collection VIT : une notification arrive en tête entre les deux pages.
        collection.insert(notif("n6", creeeA: "2026-09-04T10:06:00.000Z"), at: 0)

        let curseur = ancre(page1.last!)
        let page2 = pageParCurseur(curseur, limit: 2)
        mockAPI.stub("/notifications", result: reponse(page2, nextCursor: ancre(page2.last!)))

        _ = try await service.list(cursor: curseur, limit: 2)

        let envoi2 = mockAPI.lastRequest!
        XCTAssertEqual(envoi2.queryItems?.first(where: { $0.name == "cursor" })?.value, curseur,
                       "l'ancre servie est relayée VERBATIM — opaque pour le client")
        XCTAssertNil(envoi2.queryItems?.first(where: { $0.name == "offset" }))

        // NI SAUTÉE NI DUPLIQUÉE : l'union des deux pages est propre malgré l'insertion.
        let union = (page1 + page2).map(\.id)
        XCTAssertEqual(union, ["n5", "n4", "n3", "n2"])
        XCTAssertEqual(Set(union).count, union.count)
    }

    /// L'AUTRE MOITIÉ DE LA PAIRE — pourquoi le rang a cessé d'être le défaut :
    /// sur la même insertion, la tranche par rang REND n4 UNE SECONDE FOIS.
    /// C'est le doublon que le `filterNot` d'Android supprimait — en supprimant
    /// le SIGNAL avec (#4901).
    func test_laMemeInsertion_ferait_dupliquer_leRang() {
        semeCinq()
        let page1 = pageParRang(offset: 0, limit: 2)
        collection.insert(notif("n6", creeeA: "2026-09-04T10:06:00.000Z"), at: 0)
        let page2AuRang = pageParRang(offset: 2, limit: 2)

        let union = (page1 + page2AuRang).map(\.id)
        XCTAssertNotEqual(Set(union).count, union.count,
                          "la paire du témoin : le rang duplique là où le curseur ne duplique pas")
        XCTAssertTrue(union.filter { $0 == "n4" }.count == 2)
    }

    func test_leRang_resteFormulable_enRepli() async throws {
        semeCinq()
        mockAPI.stub("/notifications", result: reponse(pageParRang(offset: 2, limit: 2), nextCursor: nil))

        _ = try await service.list(offset: 2, limit: 2)

        XCTAssertEqual(mockAPI.lastRequest?.queryItems?.first(where: { $0.name == "offset" })?.value, "2",
                       "un gateway antérieur sans ancre reste joignable — dimension 9")
    }

    func test_leCurseur_gagne_quandLesDeuxSontDonnes() async throws {
        semeCinq()
        mockAPI.stub("/notifications", result: reponse([], nextCursor: nil))

        _ = try await service.list(offset: 4, cursor: "a|b", limit: 2)

        let envoi = mockAPI.lastRequest!
        XCTAssertEqual(envoi.queryItems?.first(where: { $0.name == "cursor" })?.value, "a|b")
        XCTAssertNil(envoi.queryItems?.first(where: { $0.name == "offset" }),
                     "qui tient un curseur tient mieux qu'un rang — les deux ne partent jamais ensemble")
    }
}
