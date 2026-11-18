import Foundation
import Testing
import MeeshySDK
@testable import MeeshyUI

/// « Écrire » porte le nombre de messages non lus de notre conversation (#19646, planche `Sys-Boutons` § 02, état
/// « Compteur ») : lu dans le cache de la liste des conversations, jamais sur le réseau, rien à zéro, dit par VoiceOver.
@Suite("La pastille d'« Écrire » sur la fiche d'un autre")
struct ProfileWriteBadgeTests {

    private static let leo = "665f1c2ab3d4e5f6a7b8c9d0"

    private static func conversation(_ id: String, type: MeeshyConversation.ConversationType = .direct, unread: Int,
                                     with participant: String? = Self.leo) -> MeeshyConversation {
        MeeshyConversation(id: id, identifier: id, type: type, unreadCount: unread, participantUserId: participant)
    }

    // MARK: La loi

    @Test("seules nos conversations directes avec lui comptent : ni un groupe, ni la directe d'un autre")
    func count_keepsOnlyOurDirectConversations() {
        let list = [
            Self.conversation("direct", unread: 2),
            Self.conversation("group", type: .group, unread: 7),
            Self.conversation("other", unread: 5, with: "665f1c2ab3d4e5f6a7b8c9ff"),
            Self.conversation("unknown", unread: 4, with: nil)
        ]
        let badge = ProfileWriteBadge.resolve(in: list, with: Self.leo)
        #expect(badge.count == 2)
    }

    @Test("deux tête-à-tête avec lui (clair et chiffré) : leurs non-lus s'additionnent ; l'identifiant ignore la casse")
    func count_sumsBothDirectPairs() {
        let list = [Self.conversation("plain", unread: 2), Self.conversation("e2ee", unread: 3, with: Self.leo.uppercased())]
        let badge = ProfileWriteBadge.resolve(in: list, with: Self.leo)
        #expect(badge.count == 5)
    }

    @Test("zéro non lu, ou un compte négatif servi : aucune pastille, rien à dire")
    func zero_showsNothing() {
        let list = [Self.conversation("direct", unread: 0), Self.conversation("e2ee", unread: -3)]
        let badge = ProfileWriteBadge.resolve(in: list, with: Self.leo)
        #expect(badge.count == 0)
        #expect(badge.text == nil)
    }

    @Test("au-delà de 99, la pastille montre « 99+ » comme la liste")
    func text_capsLikeTheList() {
        #expect(ProfileWriteBadge(count: 2).text == "2")
        #expect(ProfileWriteBadge(count: 150).text == "99+")
    }

    @Test("ma propre fiche, ou une fiche bloquée : aucune pastille même si le cache en compte")
    func hidden_onMyCardAndWhenBlocked() {
        let list = [Self.conversation("direct", unread: 2)]
        #expect(ProfileWriteBadge.resolve(in: list, with: Self.leo, isShown: false).count == 0)
        #expect(ProfileWriteBadge.resolve(in: list, with: nil).count == 0)
        #expect(ProfileWriteBadge.resolve(in: list, with: "").count == 0)
    }

    // MARK: VoiceOver

    @MainActor
    @Test("VoiceOver dit le vrai nombre de non-lus, jamais le plafond ; rien à zéro")
    func spoken_saysTheRealCount() throws {
        let two = try #require(ProfileWriteBadge(count: 2).spoken)
        #expect(two.contains("2"))
        #expect(two != "2")
        let many = try #require(ProfileWriteBadge(count: 150).spoken)
        #expect(many.contains("150"))
        #expect(!many.contains("99+"))
        #expect(ProfileWriteBadge(count: 0).spoken == nil)
    }

    // MARK: Le cache, jamais le réseau

    @MainActor
    @Test("la pastille se lit chez l'hôte, qui ne rend que le cache de la liste ; sans hôte, aucune")
    func load_readsTheHostCache() async {
        let host = CachedListHost(list: [Self.conversation("direct", unread: 3)])
        let read = await ProfileWriteBadge.load(for: Self.leo, from: host)
        #expect(read.count == 3)
        #expect(host.reads == 1)
        let none = await ProfileWriteBadge.load(for: Self.leo, from: nil)
        #expect(none.count == 0)
    }

    @MainActor
    @Test("une réécriture du cache de la liste repeint la pastille, sans changer de personne")
    func updates_followTheListCache() async {
        let host = ChangingListHost(list: [Self.conversation("direct", unread: 2)])
        var iterator = ProfileDirectDigest.updates(for: Self.leo, from: host).makeAsyncIterator()
        let first = await iterator.next()
        host.change(to: [Self.conversation("direct", unread: 0)])
        let second = await iterator.next()
        #expect(first?.badge.count == 2)
        #expect(second?.badge.count == 0)
    }

    @Test("une directe connue dans le cache est dite ; sans elle, aucune")
    func digest_knowsWhetherADirectExists() {
        let known = ProfileDirectDigest.resolve(in: [Self.conversation("direct", unread: 0)], with: Self.leo)
        let unknown = ProfileDirectDigest.resolve(in: [Self.conversation("group", type: .group, unread: 1)], with: Self.leo)
        #expect(known.knowsDirect)
        #expect(!unknown.knowsDirect)
    }

    // MARK: Les sites

    @Test("« Écrire » porte la pastille dans « Parler » et dans « Avec Léo »")
    func sites_passTheBadgeToWrite() throws {
        let actions = try Self.source("UserProfileSheet+ActionsFace.swift")
        #expect(actions.contains("ProfileTalkAction(operation: .write, reach: talkReach(.write), badge: writeBadge"))
        let vitrine = try Self.source("UserProfileSheet+VitrineBlocks.swift")
        #expect(vitrine.contains("talk(.write, badge: writeBadge"))
        #expect(vitrine.contains("ProfileTalkAction(operation: operation"))
        let talk = try Self.source("ProfileTalkAction.swift")
        #expect(talk.contains("badge: badge.text"))
        #expect(talk.contains("badgeLabel: badge.spoken"))
    }

    private static func source(_ name: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshyUI/Profile/\(name)")
        return try String(contentsOf: url, encoding: .utf8)
    }
}

@MainActor
private final class CachedListHost: ProfileDirectUnreadProviding {
    nonisolated deinit {}

    let list: [MeeshyConversation]
    private(set) var reads = 0

    init(list: [MeeshyConversation]) {
        self.list = list
    }

    func cachedConversationList() async -> [MeeshyConversation] {
        reads += 1
        return list
    }
}

@MainActor
private final class ChangingListHost: ProfileDirectUnreadProviding {
    nonisolated deinit {}

    private var list: [MeeshyConversation]
    private var continuation: AsyncStream<Void>.Continuation?

    init(list: [MeeshyConversation]) {
        self.list = list
    }

    func cachedConversationList() async -> [MeeshyConversation] {
        list
    }

    func conversationListChanges() -> AsyncStream<Void> {
        AsyncStream { continuation in self.continuation = continuation }
    }

    func change(to list: [MeeshyConversation]) {
        self.list = list
        continuation?.yield()
    }
}
