import XCTest
@testable import Meeshy

/// F-087 (WS-8) — `DeterministicDigestBuilder.build` : comptes 100 %
/// déterministes depuis les messages réellement chargés, `isComplete`
/// honnête (pass-through de `windowCoversUnread`), « ils t'attendent »
/// adossé à des preuves non vides. Critères §WS-8 (vol. 2 cas 06·A/B).
final class DigestBuilderTests: XCTestCase {

    private let base = Date(timeIntervalSince1970: 1_700_000_000)
    private let viewerId = "viewer"

    private func msg(
        _ id: String,
        sender: String,
        offsetSeconds: TimeInterval,
        content: String = "hello",
        reply: String? = nil,
        system: Bool = false,
        language: String? = "fr",
        media: [DigestMediaKind] = [],
        links: Int = 0,
        mentionsViewer: Bool = false
    ) -> DigestInputMessage {
        DigestInputMessage(
            base: EpisodeInputMessage(
                id: id, senderId: sender, createdAt: base.addingTimeInterval(offsetSeconds),
                replyToId: reply, isSystem: system
            ),
            content: content,
            languageCode: language,
            attachmentKinds: media,
            linkCount: links,
            mentionsViewer: mentionsViewer
        )
    }

    private func participant(_ id: String, name: String = "Name") -> DigestParticipant {
        DigestParticipant(id: id, displayName: name, avatarURL: nil, colorHex: "#31B6BA", presence: .offline)
    }

    // MARK: - Fenêtre vide

    func test_emptyMessages_producesEmptyDigest_isCompletePassedThrough() {
        let digest = DeterministicDigestBuilder.build(
            messages: [], participants: [], viewerId: viewerId, episodes: [], windowCoversUnread: false
        )
        XCTAssertEqual(digest.messageCount, 0)
        XCTAssertEqual(digest.participantCount, 0)
        XCTAssertNil(digest.start)
        XCTAssertNil(digest.end)
        XCTAssertEqual(digest.awaitingYou, [])
        XCTAssertFalse(digest.isComplete)
    }

    /// Prémisse de 2b-2 (PAS une garde — F9, revue adversariale 2026-08-25) :
    /// sur une fenêtre VIDE, `messageCount` vaut 0. Ce test n'observe AUCUN
    /// site de montage et ne rougirait donc PAS si le rebasculement
    /// d'identité de `LivingSummaryHost` (`LivingSummaryMountIdentityTests`)
    /// était annulé — il passe aussi par coïncidence de deux constantes
    /// indépendantes (`isComplete: windowCoversUnread` rendu `true` ici, qui
    /// matche par hasard `.empty.isComplete == true`). Il consigne seulement
    /// le contrat de `DeterministicDigestBuilder.build` sur l'entrée vide.
    func test_buildOnEmptyMessages_producesSkeletonDigest() {
        let digest = DeterministicDigestBuilder.build(
            messages: [], participants: [], viewerId: viewerId, episodes: [], windowCoversUnread: true
        )
        XCTAssertEqual(digest.messageCount, 0)
    }

    // MARK: - isComplete honnête (critère central §WS-8)

    func test_windowCoversUnread_true_producesIsCompleteTrue() {
        let messages = [msg("m1", sender: "u1", offsetSeconds: 0)]
        let digest = DeterministicDigestBuilder.build(
            messages: messages, participants: [], viewerId: viewerId, episodes: [], windowCoversUnread: true
        )
        XCTAssertTrue(digest.isComplete)
    }

    func test_windowCoversUnread_false_producesIsCompleteFalse_evenWithData() {
        let messages = [msg("m1", sender: "u1", offsetSeconds: 0)]
        let digest = DeterministicDigestBuilder.build(
            messages: messages, participants: [], viewerId: viewerId, episodes: [], windowCoversUnread: false
        )
        XCTAssertFalse(digest.isComplete, "une fenêtre partielle reste partielle même si des données existent")
    }

    // MARK: - Comptes réels : « 312 messages · 9 personnes »

    func test_messageCount_excludesSystemMessages() {
        let messages = [
            msg("m1", sender: "u1", offsetSeconds: 0),
            msg("m2", sender: "u2", offsetSeconds: 10),
            msg("sys1", sender: "system", offsetSeconds: 20, system: true),
        ]
        let digest = DeterministicDigestBuilder.build(
            messages: messages, participants: [], viewerId: viewerId, episodes: [], windowCoversUnread: true
        )
        XCTAssertEqual(digest.messageCount, 2)
    }

    func test_participantCount_countsDistinctRealSenders_noRoster() {
        let messages = [
            msg("m1", sender: "u1", offsetSeconds: 0),
            msg("m2", sender: "u2", offsetSeconds: 10),
            msg("m3", sender: "u1", offsetSeconds: 20),
        ]
        let digest = DeterministicDigestBuilder.build(
            messages: messages, participants: [], viewerId: viewerId, episodes: [], windowCoversUnread: true
        )
        XCTAssertEqual(digest.participantCount, 2)
    }

    func test_participantCount_withRoster_excludesUnknownGhostSender() {
        let messages = [
            msg("m1", sender: "u1", offsetSeconds: 0),
            msg("m2", sender: "ghost", offsetSeconds: 10),
        ]
        let digest = DeterministicDigestBuilder.build(
            messages: messages, participants: [participant("u1")], viewerId: viewerId, episodes: [], windowCoversUnread: true
        )
        XCTAssertEqual(digest.participantCount, 1, "« ghost » n'est pas dans le roster connu")
        XCTAssertEqual(digest.messageCount, 2, "le MESSAGE compte quand même — seul le compte de PERSONNES est validé")
    }

    // MARK: - Auteurs les plus actifs

    func test_topSenders_sortedByCountDescending_thenUserIdAscending() {
        let messages = [
            msg("m1", sender: "uB", offsetSeconds: 0),
            msg("m2", sender: "uA", offsetSeconds: 10),
            msg("m3", sender: "uA", offsetSeconds: 20),
            msg("m4", sender: "uC", offsetSeconds: 30),
            msg("m5", sender: "uC", offsetSeconds: 40),
        ]
        let digest = DeterministicDigestBuilder.build(
            messages: messages, participants: [], viewerId: viewerId, episodes: [], windowCoversUnread: true
        )
        // uA:2, uC:2 (tie → uA before uC alphabetically), uB:1
        XCTAssertEqual(digest.topSenders.map(\.userId), ["uA", "uC", "uB"])
        XCTAssertEqual(digest.topSenders[0].messageCount, 2)
    }

    // MARK: - Langues

    func test_languages_tallyByCode_ignoresNilOrEmpty() {
        let messages = [
            msg("m1", sender: "u1", offsetSeconds: 0, language: "fr"),
            msg("m2", sender: "u2", offsetSeconds: 10, language: "en"),
            msg("m3", sender: "u1", offsetSeconds: 20, language: "fr"),
            msg("m4", sender: "u3", offsetSeconds: 30, language: nil),
        ]
        let digest = DeterministicDigestBuilder.build(
            messages: messages, participants: [], viewerId: viewerId, episodes: [], windowCoversUnread: true
        )
        XCTAssertEqual(digest.languages.first?.code, "fr")
        XCTAssertEqual(digest.languages.first?.messageCount, 2)
        XCTAssertEqual(digest.languages.reduce(0) { $0 + $1.messageCount }, 3, "le message sans langue n'entre dans AUCUN bucket")
    }

    // MARK: - Médias — 6 buckets réels

    func test_media_tallySixBucketsFromRealAttachmentsAndLinks() {
        let messages = [
            msg("m1", sender: "u1", offsetSeconds: 0, media: [.image, .image], links: 1),
            msg("m2", sender: "u2", offsetSeconds: 10, media: [.video, .audio, .file, .location]),
        ]
        let digest = DeterministicDigestBuilder.build(
            messages: messages, participants: [], viewerId: viewerId, episodes: [], windowCoversUnread: true
        )
        XCTAssertEqual(digest.media.images, 2)
        XCTAssertEqual(digest.media.videos, 1)
        XCTAssertEqual(digest.media.audios, 1)
        XCTAssertEqual(digest.media.files, 1)
        XCTAssertEqual(digest.media.locations, 1)
        XCTAssertEqual(digest.media.links, 1)
    }

    // MARK: - « Ils t'attendent » — chaque ligne porte sa preuve

    func test_mention_unanswered_producesAwaitingItem_withNonEmptyEvidence() {
        let messages = [
            msg("m1", sender: "other", offsetSeconds: 0, mentionsViewer: true),
        ]
        let digest = DeterministicDigestBuilder.build(
            messages: messages, participants: [], viewerId: viewerId, episodes: [], windowCoversUnread: true
        )
        XCTAssertEqual(digest.awaitingYou.count, 1)
        XCTAssertEqual(digest.awaitingYou[0].kind, .mention)
        XCTAssertEqual(digest.awaitingYou[0].fromUserId, "other")
        XCTAssertFalse(digest.awaitingYou[0].evidenceMessageIds.isEmpty)
        XCTAssertEqual(digest.awaitingYou[0].evidenceMessageIds, ["m1"])
    }

    func test_mention_answeredByLaterViewerMessage_producesNoAwaitingItem() {
        let messages = [
            msg("m1", sender: "other", offsetSeconds: 0, mentionsViewer: true),
            msg("m2", sender: viewerId, offsetSeconds: 10),
        ]
        let digest = DeterministicDigestBuilder.build(
            messages: messages, participants: [], viewerId: viewerId, episodes: [], windowCoversUnread: true
        )
        XCTAssertTrue(digest.awaitingYou.isEmpty, "le lecteur a répondu APRÈS la mention — plus rien n'attend")
    }

    func test_directReply_toViewerMessage_producesAwaitingItem() {
        let messages = [
            msg("m1", sender: viewerId, offsetSeconds: 0),
            msg("m2", sender: "other", offsetSeconds: 10, reply: "m1"),
        ]
        let digest = DeterministicDigestBuilder.build(
            messages: messages, participants: [], viewerId: viewerId, episodes: [], windowCoversUnread: true
        )
        XCTAssertEqual(digest.awaitingYou.count, 1)
        XCTAssertEqual(digest.awaitingYou[0].kind, .directReply)
        XCTAssertEqual(digest.awaitingYou[0].fromUserId, "other")
    }

    func test_replyToSomeoneElseMessage_isNotADirectReplyToViewer() {
        let messages = [
            msg("m1", sender: "other1", offsetSeconds: 0),
            msg("m2", sender: "other2", offsetSeconds: 10, reply: "m1"),
        ]
        let digest = DeterministicDigestBuilder.build(
            messages: messages, participants: [], viewerId: viewerId, episodes: [], windowCoversUnread: true
        )
        XCTAssertTrue(digest.awaitingYou.filter { $0.kind == .directReply }.isEmpty)
    }

    func test_unansweredQuestion_producesAwaitingItem() {
        let messages = [
            msg("m1", sender: "other", offsetSeconds: 0, content: "Tu viens quand ?"),
        ]
        let digest = DeterministicDigestBuilder.build(
            messages: messages, participants: [], viewerId: viewerId, episodes: [], windowCoversUnread: true
        )
        XCTAssertEqual(digest.awaitingYou.count, 1)
        XCTAssertEqual(digest.awaitingYou[0].kind, .unansweredQuestion)
    }

    func test_viewerOwnMessages_neverProduceAwaitingItems() {
        let messages = [
            msg("m1", sender: viewerId, offsetSeconds: 0, content: "Une question ?", mentionsViewer: true),
        ]
        let digest = DeterministicDigestBuilder.build(
            messages: messages, participants: [], viewerId: viewerId, episodes: [], windowCoversUnread: true
        )
        XCTAssertTrue(digest.awaitingYou.isEmpty, "mes propres messages ne m'attendent jamais")
    }

    // MARK: - Épisodes : transmis tels quels

    func test_episodes_arePassedThroughUnmodified() {
        let episode = ConversationEpisode(
            id: "e1", start: base, end: base, messageIds: ["m1"], participantIds: ["u1"],
            deterministicTitle: "Titre"
        )
        let digest = DeterministicDigestBuilder.build(
            messages: [msg("m1", sender: "u1", offsetSeconds: 0)],
            participants: [], viewerId: viewerId, episodes: [episode], windowCoversUnread: true
        )
        XCTAssertEqual(digest.episodes, [episode])
    }
}
