import XCTest
@testable import Meeshy

/// **UN CURSEUR DE PAGINATION EST UN IDENTIFIANT QUE LE SERVEUR A SERVI** (#6857).
///
/// `loadMore()` retombait, faute de `nextCursor`, sur l'identifiant de la
/// conversation locale la plus ancienne. Le repli est LÉGITIME — il reprend la
/// pagination quand le curseur n'a jamais été persisté — mais il ne demandait
/// pas si cet identifiant voulait dire quelque chose pour la passerelle.
///
/// Mesuré au simulateur, instrument à l'appui :
/// `MESURE6857 listPage limit=100 before=conv-hydrate`. `conv-hydrate` est une
/// fixture de témoin gravée dans le cache disque ; la passerelle la passe à
/// `prisma.conversation.findFirst({ where: { id } })`, Prisma la caste en
/// ObjectId, la conversion lève, et le `catch` générique rend un **500**. La
/// liste restait bloquée sur cette seule ligne, et « Réessayer » — qui rappelle
/// `loadMore()` — recomposait le même curseur, donc rejouait le même échec.
///
/// La règle ne SUPPRIME pas le repli : elle exige qu'il ressemble à ce que la
/// passerelle sert, c'est-à-dire un identifiant MongoDB.
final class ConversationListPaginationCursorTests: XCTestCase {

    private let servi = "68f3808baf186ffd9583b0fa"

    func test_leCurseurServiParLeServeur_gagneToujours() {
        XCTAssertEqual(
            ConversationListPaginationCursor.resolve(nextCursor: servi, oldestLocalId: "conv-hydrate"),
            servi)
    }

    func test_sansCurseurServi_leRepliLocalPasse_sIlEstUnIdentifiant() {
        XCTAssertEqual(
            ConversationListPaginationCursor.resolve(nextCursor: nil, oldestLocalId: servi),
            servi)
    }

    /// Le cas MESURÉ. Une fixture de témoin, un identifiant local, une sentinelle :
    /// rien de tout ça n'est un identifiant de conversation pour la passerelle.
    func test_unRepliQuiNEstPasUnIdentifiant_nePartJamais() {
        for local in ["conv-hydrate", "local-1", "", "alice-bob",
                      "68f3808baf186ffd9583b0f",    // 23 — trop court
                      "68f3808baf186ffd9583b0fa0",  // 25 — trop long
                      "68f3808baf186ffd9583b0fz"] { // hors classe hexadécimale
            XCTAssertNil(
                ConversationListPaginationCursor.resolve(nextCursor: nil, oldestLocalId: local),
                "« \(local) » ne doit pas devenir un curseur")
        }
    }

    func test_sansRien_iLNYAPasDeCurseur_etCEstLaPremièrePage() {
        XCTAssertNil(ConversationListPaginationCursor.resolve(nextCursor: nil, oldestLocalId: nil))
    }

    /// **Un curseur SERVI n'est jamais réexaminé.** La passerelle est seule juge
    /// de la forme de ce qu'elle émet ; la durcir ici ferait dépendre la
    /// pagination d'une supposition du client sur un format qui ne lui
    /// appartient pas.
    func test_unCurseurServi_nEstPasReJugé() {
        XCTAssertEqual(
            ConversationListPaginationCursor.resolve(nextCursor: "curseur-opaque-du-serveur",
                                                     oldestLocalId: nil),
            "curseur-opaque-du-serveur")
    }
}
