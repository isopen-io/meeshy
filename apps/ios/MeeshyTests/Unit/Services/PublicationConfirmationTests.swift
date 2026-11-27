import XCTest
import Combine
@testable import Meeshy
@testable import MeeshySDK

/// #13443 — **une publication confirmée par `POST /posts` rend son id serveur
/// aux cartes optimistes, sans attendre l'écho du socket.**
///
/// Le dispatcher jetait la réponse (`APIResponse<[String: AnyCodable]>`) : la
/// carte gardait son identifiant client `cmid_<uuid>` tant que `post:created`
/// n'arrivait pas, et un socket coupé ou un écho perdu suffisait pour que le
/// client interroge `GET /posts/cmid_<uuid>` (400 de schéma, mesuré en prod).
final class PublicationConfirmationTests: XCTestCase {

    private static let cmid = "cmid_0f0e0d0c-0b0a-4908-8706-050403020100"
    private static let serverId = "6720aa11bb22cc33dd44ee55"

    private func reply(_ data: String) throws -> APIResponse<PublishedPostReply> {
        try MeeshyCoders.decoder(.api).decode(
            APIResponse<PublishedPostReply>.self,
            from: Data("{\"success\":true,\"data\":\(data)}".utf8)
        )
    }

    private func servedPost(type: String = "POST") -> String {
        """
        {"id":"\(Self.serverId)","type":"\(type)","content":"Bonjour","createdAt":"2026-10-27T10:00:00.000Z",
         "author":{"id":"u-9","username":"zoe"}}
        """
    }

    func test_echo_reponseServie_rendLePostServeurSousLeCmid() throws {
        let echo = PublicationConfirmation.echo(of: try reply(servedPost()).data, clientMutationId: Self.cmid)

        XCTAssertEqual(echo?.post.id, Self.serverId)
        XCTAssertEqual(echo?.clientMutationId, Self.cmid)
    }

    func test_echo_reponseIllisible_neFaitPasEchouerLaPublication() throws {
        let decoded = try reply("{\"unexpected\":true}")

        XCTAssertNil(PublicationConfirmation.echo(of: decoded.data, clientMutationId: Self.cmid))
    }

    /// Le serveur annonce une story sur `story:created` et un statut sur
    /// `status:created`, jamais sur `post:created` : la confirmation REST n'a
    /// pas à les y pousser, sinon le fil les insère comme des posts.
    func test_echo_storyServie_nePassePasParLeCanalDesPosts() throws {
        let echo = PublicationConfirmation.echo(of: try reply(servedPost(type: "STORY")).data, clientMutationId: Self.cmid)

        XCTAssertNil(echo)
    }

    func test_echo_statutServi_nePassePasParLeCanalDesPosts() throws {
        let echo = PublicationConfirmation.echo(of: try reply(servedPost(type: "STATUS")).data, clientMutationId: Self.cmid)

        XCTAssertNil(echo)
    }

    func test_echo_reelServi_rendLePostServeurSousLeCmid() throws {
        let echo = PublicationConfirmation.echo(of: try reply(servedPost(type: "REEL")).data, clientMutationId: Self.cmid)

        XCTAssertEqual(echo?.post.id, Self.serverId)
    }

    func test_announce_reponseServie_publieLEchoSurLeCanalDesCreations() throws {
        let channel = PassthroughSubject<SocketPostCreatedData, Never>()
        var received: [SocketPostCreatedData] = []
        let token = channel.sink { received.append($0) }
        defer { token.cancel() }

        PublicationConfirmation.announce(try reply(servedPost()).data, clientMutationId: Self.cmid, on: channel)

        XCTAssertEqual(received.map(\.post.id), [Self.serverId])
        XCTAssertEqual(received.first?.clientMutationId, Self.cmid)
    }

    func test_announce_reponseIllisible_nePublieRien() throws {
        let channel = PassthroughSubject<SocketPostCreatedData, Never>()
        var received: [SocketPostCreatedData] = []
        let token = channel.sink { received.append($0) }
        defer { token.cancel() }

        PublicationConfirmation.announce(try reply("[]").data, clientMutationId: Self.cmid, on: channel)

        XCTAssertTrue(received.isEmpty)
    }
}
