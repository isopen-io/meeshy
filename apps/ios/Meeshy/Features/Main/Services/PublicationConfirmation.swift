import Foundation
import Combine
import MeeshySDK

/// La réponse de `POST /posts`, lue sans jamais faire échouer la publication.
///
/// Le serveur a déjà ÉCRIT le post quand cette réponse arrive : une forme
/// inattendue ne doit pas relancer la ligne de la file. `post` est donc `nil`
/// quand la charge ne se lit pas comme un `APIPost`, et l'écho du socket reste
/// alors le seul réconciliateur, comme avant #13443.
struct PublishedPostReply: Decodable {
    let post: APIPost?

    init(from decoder: Decoder) throws {
        post = try? APIPost(from: decoder)
    }
}

/// **Une publication confirmée rend son id serveur aux cartes optimistes**
/// (#13443).
///
/// La carte optimiste porte l'identifiant client (`cmid_<uuid>`) jusqu'à sa
/// réconciliation, et seul l'écho `post:created` la faisait : un socket coupé
/// ou un écho perdu laissait la carte sous son cmid, et le client finissait
/// par demander `GET /posts/cmid_<uuid>`. La réponse REST porte le même post ;
/// elle passe par le MÊME canal que l'écho, que le fil, le profil et le statut
/// consomment déjà par cmid. Le second écho, celui du socket, ne trouve plus de
/// carte cmid et se déduplique par id.
enum PublicationConfirmation {

    static func echo(of reply: PublishedPostReply, clientMutationId: String) -> SocketPostCreatedData? {
        reply.post.map { SocketPostCreatedData(post: $0, clientMutationId: clientMutationId) }
    }

    static func announce(
        _ reply: PublishedPostReply,
        clientMutationId: String,
        on channel: PassthroughSubject<SocketPostCreatedData, Never>
    ) {
        guard let echo = echo(of: reply, clientMutationId: clientMutationId) else { return }
        channel.send(echo)
    }
}
