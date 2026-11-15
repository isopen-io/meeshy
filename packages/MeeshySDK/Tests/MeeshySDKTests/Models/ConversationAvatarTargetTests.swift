import Foundation
import Testing
@testable import MeeshySDK

/// #15887 — toucher l'avatar d'une ligne ouvre TOUJOURS quelque chose.
///
/// Le profil du pair d'une directe, quand il existe et qu'on peut le montrer ;
/// sinon les détails de la conversation. Jamais rien : l'anonyme élu sans
/// identifiant, le pair bloqué et le compte fermé rendaient un geste mort.
@Suite("La cible du toucher d'avatar d'une ligne")
struct ConversationAvatarTargetTests {

    private static let peerId = "6ad65e870d750c3615db0597"

    private func resolve(
        _ type: MeeshyConversation.ConversationType,
        peer: String? = peerId,
        blocked: Bool = false,
        closed: Bool = false
    ) -> ConversationAvatarTarget {
        ConversationAvatarTarget.resolve(type: type, peerUserId: peer, peerBlocked: blocked, peerAccountClosed: closed)
    }

    @Test func aDirectWithARegisteredPeer_opensThePeerProfile() {
        #expect(resolve(.direct) == .profile(userId: Self.peerId))
        #expect(resolve(.direct).opensProfile)
    }

    /// L'anonyme élu sans identifiant, le pair non élu, la ligne gravée sous le
    /// lecteur puis nettoyée (`withoutInterlocutor`) : aucun profil à montrer.
    @Test func aDirectWithoutAPeerId_showsTheConversationDetails() {
        #expect(resolve(.direct, peer: nil) == .conversationInfo)
        #expect(resolve(.direct, peer: "") == .conversationInfo)
        #expect(!resolve(.direct, peer: nil).opensProfile)
    }

    @Test func aBlockedPeer_showsTheConversationDetails() {
        #expect(resolve(.direct, blocked: true) == .conversationInfo)
    }

    @Test func aClosedAccount_showsTheConversationDetails() {
        #expect(resolve(.direct, closed: true) == .conversationInfo)
        #expect(resolve(.direct, blocked: true, closed: true) == .conversationInfo)
    }

    /// Un identifiant de pair résiduel sur une conversation à plusieurs ne fait
    /// pas d'elle un tête-à-tête : son avatar n'est celui de personne.
    @Test(arguments: [
        MeeshyConversation.ConversationType.group, .public, .global, .community, .channel, .bot, .broadcast,
    ])
    func everyOtherType_showsTheConversationDetails(type: MeeshyConversation.ConversationType) {
        #expect(resolve(type) == .conversationInfo)
        #expect(resolve(type, peer: nil) == .conversationInfo)
    }

    @Test func theConversationProjection_readsItsPeerAndItsClosure() {
        var conversation = MeeshyConversation(
            id: "c1", identifier: "c1", type: .direct,
            lastMessageAt: Date(timeIntervalSince1970: 0),
            participantUserId: Self.peerId
        )
        #expect(conversation.avatarTarget(isPeerBlocked: false) == .profile(userId: Self.peerId))
        #expect(conversation.avatarTarget(isPeerBlocked: true) == .conversationInfo)

        conversation.participantAccountClosed = true
        #expect(conversation.avatarTarget(isPeerBlocked: false) == .conversationInfo)
    }
}
