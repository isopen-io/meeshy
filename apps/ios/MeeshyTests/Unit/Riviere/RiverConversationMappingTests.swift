import XCTest
import MeeshySDK
@testable import Meeshy

/// Chantier Rivière iOS — le pont PUR fil → loi (`RiverConversationMapping`),
/// lot 1 (branchement) puis lot 2 (les avis système entrent MARQUÉS).
@MainActor
final class RiverConversationMappingTests: XCTestCase {

    private static let t0 = Date(timeIntervalSince1970: 1_700_000_000)

    private func message(
        _ id: String, sender: String, name: String? = nil, minutes: Double,
        source: MeeshyMessage.MessageSource = .user, replyTo: String? = nil, deleted: Bool = false
    ) -> MeeshyMessage {
        var m = MeeshyMessage(
            id: id, conversationId: "c", senderId: sender, content: "texte \(id)",
            createdAt: Self.t0.addingTimeInterval(minutes * 60), updatedAt: Self.t0
        )
        m.senderName = name
        m.messageSource = source
        m.replyToId = replyTo
        if deleted { m.deletedAt = Self.t0 }
        return m
    }

    // MARK: - Les messages système ne sont la voix de personne

    /// **Lot 2 — recalibrage EN CONSCIENCE du témoin du lot 1.** Celui-ci
    /// affirmait « l'avis d'arrivée n'entre pas dans la loi » : c'était la
    /// façon la plus courte d'éviter la lane fantôme, mais elle faisait
    /// DISPARAÎTRE l'avis de la Rivière — un lecteur n'y voyait jamais « X a
    /// rejoint la conversation ». La loi partagée sait faire mieux : l'avis y
    /// entre MARQUÉ (`isSystem`), garde son rang dans le temps, et reste
    /// exclu des voix, des couloirs, des connecteurs et des groupes. Le fait
    /// que le lot 1 protégeait (« pas de lane fantôme ») est TOUJOURS
    /// vérifié ici — il est simplement obtenu par la marque, pas par
    /// l'amputation.
    func test_systemMessages_enterTheLawMarked_keepTheirRank_butAreNeverAVoice() {
        let messages = [
            message("m1", sender: "alice", name: "Alice", minutes: 0),
            message("sys", sender: "newcomer", name: "Nouveau", minutes: 1, source: .system),
            message("m2", sender: "bob", name: "Bob", minutes: 2)
        ]
        let input = RiverConversationMapping.lanesInput(messages: messages, viewerId: "me")

        XCTAssertEqual(input.messages.map(\.id), ["m1", "sys", "m2"], "l'avis garde son rang dans le temps")
        XCTAssertEqual(
            input.messages.first(where: { $0.id == "sys" })?.isSystem, true,
            "sans cette marque, `senderId` ferait de l'arrivant une voix : l'avis est écrit avec l'ARRIVANT pour auteur"
        )
        XCTAssertEqual(input.participants.map(\.id), ["alice", "bob"], "l'arrivant n'est pas une voix : pas de lane fantôme")
        XCTAssertEqual(input.viewerId, "me")

        // La preuve va jusqu'au bout : la LOI, pas seulement son entrée.
        let geometry = RiverLaneResolver.resolveRiverLanes(input)
        XCTAssertTrue(geometry.bubbles.contains { $0.messageId == "sys" && $0.isSystem })
        XCTAssertFalse(geometry.lanes.contains { $0.laneId == "newcomer" })
    }

    /// Un message supprimé, lui, reste dehors — dans les deux lots : une
    /// bulle vide ferait un rang vide.
    func test_deletedMessages_stayOutOfTheLaw_entirely() {
        let messages = [message("m1", sender: "alice", minutes: 0), message("gone", sender: "alice", minutes: 1, deleted: true)]
        XCTAssertEqual(RiverConversationMapping.lanesInput(messages: messages, viewerId: "me").messages.map(\.id), ["m1"])
    }

    func test_participants_areTheSenders_withTheirLatestKnownName_inOrderOfFirstAppearance() {
        let messages = [
            message("m1", sender: "bob", name: "Bob", minutes: 0),
            message("m2", sender: "alice", name: "Alice", minutes: 1),
            message("m3", sender: "bob", name: "Bob R.", minutes: 2)
        ]
        let input = RiverConversationMapping.lanesInput(messages: messages, viewerId: "me")
        XCTAssertEqual(input.participants.map(\.id), ["bob", "alice"])
        XCTAssertEqual(input.participants.first?.displayName, "Bob R.", "dernier nom connu")
    }

    func test_replyTarget_isCarriedToTheLaw_forConnectors() {
        let messages = [message("m1", sender: "alice", minutes: 0), message("m2", sender: "bob", minutes: 1, replyTo: "m1")]
        let input = RiverConversationMapping.lanesInput(messages: messages, viewerId: "me")
        XCTAssertEqual(input.messages.last?.replyToMessageId, "m1")
    }

    // MARK: - Contenus : Prisme injecté, heure, réponse

    func test_contents_carryThePrismeText_theTime_andTheReplyPreview() {
        var m2 = message("m2", sender: "bob", name: "Bob", minutes: 1, replyTo: "m1")
        m2.replyTo = ReplyReference(messageId: "m1", authorName: "Alice", previewText: "Salut")
        let messages = [message("m1", sender: "alice", name: "Alice", minutes: 0), m2]
        let geometry = RiverLaneResolver.resolveRiverLanes(RiverConversationMapping.lanesInput(messages: messages, viewerId: "me"))
        let contents = RiverConversationMapping.contents(
            geometry: geometry, messages: messages, viewerId: "me",
            text: { "PRISME:\($0.id)" },
            time: { _ in "12:45" }
        )
        XCTAssertEqual(contents.count, geometry.bubbles.count, "une bulle, un contenu")
        let bob = try? XCTUnwrap(contents.first { $0.bubble.messageId == "m2" })
        XCTAssertEqual(bob?.text, "PRISME:m2", "le texte vient du Prisme injecté, jamais de `content` nu")
        XCTAssertEqual(bob?.timeString, "12:45")
        XCTAssertEqual(bob?.senderDisplayName, "Bob")
        XCTAssertEqual(bob?.replyPreview, RiverReplyPreview(authorDisplayName: "Alice", text: "Salut"))
        XCTAssertEqual(bob?.layout, geometry.layout)
    }

    func test_initialCursor_isTheMostRecentBubble_orTheReadersShoreWhenEmpty() {
        let messages = [message("m1", sender: "alice", minutes: 0), message("m2", sender: "bob", minutes: 1), message("m3", sender: "alice", minutes: 2)]
        let geometry = RiverLaneResolver.resolveRiverLanes(RiverConversationMapping.lanesInput(messages: messages, viewerId: "me"))
        let cursor = RiverConversationMapping.initialCursor(geometry: geometry)
        XCTAssertEqual(cursor.rank, geometry.bubbles.map(\.rank).max())
        let empty = RiverLaneResolver.resolveRiverLanes(RiverConversationMapping.lanesInput(messages: [], viewerId: "me"))
        XCTAssertEqual(RiverConversationMapping.initialCursor(geometry: empty), RiverLaneResolver.RiverCursor(laneIndex: 0, rank: 0))
    }

    /// **Lot 2 — recalibrage EN CONSCIENCE.** Tant que les avis étaient
    /// écartés de la loi, les ignorer dans l'empreinte était juste. Maintenant
    /// qu'ils occupent un rang, une arrivée qui ne changerait pas l'empreinte
    /// ne serait JAMAIS redessinée : le lecteur verrait la conversation
    /// continuer sans jamais voir qui vient d'entrer.
    func test_fingerprint_changesWhenASystemNoticeArrives_andWhenAVoiceSpeaks() {
        let base = [message("m1", sender: "alice", minutes: 0)]

        XCTAssertNotEqual(
            RiverConversationMapping.fingerprint(messages: base),
            RiverConversationMapping.fingerprint(messages: base + [message("sys", sender: "x", minutes: 1, source: .system)]),
            "une arrivée change la Rivière : elle prend un rang"
        )
        XCTAssertNotEqual(
            RiverConversationMapping.fingerprint(messages: base),
            RiverConversationMapping.fingerprint(messages: base + [message("m2", sender: "bob", minutes: 2)])
        )
    }

    // MARK: - Lot 2 : l'avis arrive à la peau prêt à être GRAVÉ

    /// La peau ne doit pas avoir à ré-inspecter le message : le contenu porte
    /// déjà de quoi peindre l'avis, et `nil` pour toute prise de parole.
    func test_contents_systemBubbleCarriesItsNotice_speechCarriesNone() {
        let messages = [
            message("m1", sender: "alice", name: "Alice", minutes: 0),
            message("sys", sender: "newcomer", name: "Nouveau", minutes: 1, source: .system)
        ]
        let geometry = RiverLaneResolver.resolveRiverLanes(RiverConversationMapping.lanesInput(messages: messages, viewerId: "me"))
        let contents = RiverConversationMapping.contents(
            geometry: geometry, messages: messages, viewerId: "me",
            text: { "PRISME:\($0.id)" },
            time: { _ in "12:45" }
        )

        XCTAssertNil(contents.first { $0.bubble.messageId == "m1" }?.systemNotice)
        XCTAssertEqual(
            contents.first { $0.bubble.messageId == "sys" }?.systemNotice,
            .plain("PRISME:sys"),
            "un avis sans métadonnée dédiée garde son libellé, déjà résolu par l'appelant"
        )
    }

    /// Un avis d'ARRIVÉE ne se réécrit pas : il est rendu par la vue du Fil
    /// (`BubbleJoinNoticeView`), avec ses clés i18n et son glyphe fantôme —
    /// le libellé français figé du gateway (`content`) ne sert que de repli.
    func test_contents_joinNotice_isHandedToTheThreadsOwnView_notRewritten() {
        var arrival = message("sys", sender: "newcomer", name: "Nouveau", minutes: 1, source: .system)
        arrival.joinNotice = JoinNoticeMetadata(
            participantId: "newcomer",
            displayName: "Zoé",
            isAnonymous: true,
            viaShareLink: true,
            username: "ano_zoe",
            givenName: "Zoé"
        )
        let messages = [message("m1", sender: "alice", name: "Alice", minutes: 0), arrival]
        let geometry = RiverLaneResolver.resolveRiverLanes(RiverConversationMapping.lanesInput(messages: messages, viewerId: "me"))
        let contents = RiverConversationMapping.contents(
            geometry: geometry, messages: messages, viewerId: "me",
            text: { "PRISME:\($0.id)" },
            time: { _ in "12:45" }
        )

        guard case .join(let notice)? = contents.first(where: { $0.bubble.messageId == "sys" })?.systemNotice else {
            return XCTFail("l'arrivée doit être servie comme telle, jamais comme un texte nu")
        }
        XCTAssertEqual(notice.displayName, "Zoé")
        XCTAssertTrue(notice.isAnonymous, "le glyphe fantôme dit que l'arrivant n'a pas de compte")
    }

    /// La graine de couleur de la bulle est EXACTEMENT celle que la loi a
    /// donnée à la branche de son auteur. Le lot 1 lisait `senderName ??
    /// senderId` ici et `senderName ?? senderUsername ?? senderId` pour les
    /// participants : un auteur sans `senderName` peignait donc sa bulle
    /// d'une couleur et son trait d'une autre.
    func test_contents_colourSeed_isTheSameOneTheLawGaveToTheLane() {
        var anonymous = message("m1", sender: "u1", minutes: 0)
        anonymous.senderName = nil
        anonymous.senderUsername = "ano_zoe"
        let messages = [anonymous, message("m2", sender: "bob", name: "Bob", minutes: 1)]
        let input = RiverConversationMapping.lanesInput(messages: messages, viewerId: "me")
        let geometry = RiverLaneResolver.resolveRiverLanes(input)
        let contents = RiverConversationMapping.contents(
            geometry: geometry, messages: messages, viewerId: "me",
            text: { $0.content }, time: { _ in "12:45" }
        )

        let laneSeed = geometry.lanes.first { $0.laneId == "u1" }?.colorSeed
        XCTAssertEqual(laneSeed, "ano_zoe")
        XCTAssertEqual(contents.first { $0.bubble.messageId == "m1" }?.colorSeed, laneSeed)
    }
}
