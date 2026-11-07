import XCTest
import MeeshySDK
@testable import Meeshy

/// **Les commentaires d'une publication se ferment et se rouvrent** (#16541) —
/// ce que les surfaces en savent, qui peut basculer, le geste optimiste et son
/// retour arrière, et le choix du composer qui voyage jusqu'à la création.
@MainActor
final class CommentsClosureAppTests: XCTestCase {

    private static let closedRefusal = MeeshyError.forbidden(
        reason: "Les commentaires sont désactivés",
        body: Data(#"{"success":false,"error":"Les commentaires sont désactivés","code":"COMMENTS_DISABLED"}"#.utf8))

    // MARK: - Ce que la surface sait

    func test_closureState_servedClosed_isClosed() {
        XCTAssertTrue(CommentsClosureState(served: true).isClosed)
        XCTAssertFalse(CommentsClosureState(served: false).isClosed)
    }

    func test_closureState_commentsDisabledRefusal_closesWithoutWaitingForTheEcho() {
        var state = CommentsClosureState(served: false)

        XCTAssertTrue(state.noteRefusal(Self.closedRefusal))

        XCTAssertTrue(state.isClosed)
    }

    func test_closureState_anotherRefusal_leavesItOpen() {
        var state = CommentsClosureState(served: false)

        XCTAssertFalse(state.noteRefusal(MeeshyError.forbidden(reason: nil, body: nil)))

        XCTAssertFalse(state.isClosed)
    }

    func test_closureState_servedReopening_clearsALocalRefusal() {
        var state = CommentsClosureState(served: false)
        state.noteRefusal(Self.closedRefusal)

        state.serve(false)

        XCTAssertFalse(state.isClosed)
    }

    // MARK: - Qui peut basculer

    func test_isOffered_authorAndPlatformModeration_only() {
        XCTAssertTrue(CommentSettingsToggle.isOffered(authorId: "a", viewerId: "a", viewerRole: "USER"))
        for role in ["MODERATOR", "ADMIN", "BIGBOSS"] {
            XCTAssertTrue(CommentSettingsToggle.isOffered(authorId: "a", viewerId: "m", viewerRole: role), role)
        }
        XCTAssertFalse(CommentSettingsToggle.isOffered(authorId: "a", viewerId: "u", viewerRole: "USER"))
        XCTAssertFalse(CommentSettingsToggle.isOffered(authorId: "a", viewerId: nil, viewerRole: "ADMIN"))
        XCTAssertFalse(CommentSettingsToggle.isOffered(authorId: "a", viewerId: "", viewerRole: "ADMIN"))
    }

    // MARK: - Le geste optimiste

    func test_run_accepted_showsTheNewStateAtOnce_thenTheWrittenOne() async {
        let service = MockPostService()
        var applied: [Bool] = []

        let result = await CommentSettingsToggle.run(postId: "p1", current: false, service: service) { applied.append($0) }

        XCTAssertEqual(applied, [true, true])
        XCTAssertTrue(result)
        XCTAssertEqual(service.setCommentsDisabledCalls.map { $0.postId }, ["p1"])
        XCTAssertEqual(service.setCommentsDisabledCalls.map { $0.disabled }, [true])
    }

    func test_run_refused_rollsBackToThePreviousState() async {
        let service = MockPostService()
        service.setCommentsDisabledResult = .failure(MeeshyError.forbidden(reason: nil, body: nil))
        var applied: [Bool] = []

        let result = await CommentSettingsToggle.run(postId: "p1", current: true, service: service) { applied.append($0) }

        XCTAssertEqual(applied, [false, true])
        XCTAssertTrue(result)
    }

    // MARK: - Le menu ⋯ d'une story

    func test_storyMenu_offersCommentSettingsFirstInTheActingSection_onlyWhenAsked() {
        let offered = StoryOptionsMenuPlan.resolve(hasStory: true, isOwnStory: true, hasAudioTranscript: false,
                                                   canCompose: false, canToggleComments: true)
        let silent = StoryOptionsMenuPlan.resolve(hasStory: true, isOwnStory: true, hasAudioTranscript: false,
                                                  canCompose: false)

        XCTAssertTrue(offered.sections.contains([.commentSettings, .delete]))
        XCTAssertFalse(silent.entries.contains(.commentSettings))
    }

    // MARK: - Le composer

    func test_composer_offersTheChoice_onlyForAPostOrAReelBeingCreated() {
        XCTAssertTrue(ComposerCommentSettings.isOffered(format: .post, origin: .feedComposer))
        XCTAssertTrue(ComposerCommentSettings.isOffered(format: .reel, origin: .feedComposer))
        XCTAssertFalse(ComposerCommentSettings.isOffered(format: .story, origin: .feedComposer))
        XCTAssertFalse(ComposerCommentSettings.isOffered(format: .status, origin: .feedComposer))
        XCTAssertFalse(ComposerCommentSettings.isOffered(format: .post, origin: .edit(postId: "p", documentFormat: .post)))
        XCTAssertFalse(ComposerCommentSettings.isOffered(format: .post, origin: .repost(ofPostId: "p", sourceFormat: .post)))
    }

    func test_composerMenu_servesTheChoiceAfterThePublicationEntries() {
        let context = ComposerMoreMenuPolicy.Context(addsSlides: false, backgroundMedia: nil, offeredDoors: [.hashtag],
                                                     overflow: [], offersSoundReuse: true, offersCommentSettings: true)

        XCTAssertEqual(Array(ComposerMoreMenuPolicy.entries(context).suffix(3)), [.hashtags, .soundReuse, .commentsOff])
    }

    func test_draft_closesOnlyAPostOrAReel_andOnlyWhenChosen() {
        XCTAssertTrue(Self.draft(.post).closingComments(true).commentsDisabled)
        XCTAssertTrue(Self.draft(.reel).closingComments(true).commentsDisabled)
        XCTAssertFalse(Self.draft(.post).closingComments(false).commentsDisabled)
        XCTAssertFalse(Self.draft(.status).closingComments(true).commentsDisabled)
    }

    func test_registry_carriesTheChoiceToTheDurableBody_byMutationId() throws {
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "CommentsClosureAppTests.\(UUID().uuidString)"))

        PublicationCommentClosure.record("cmid-closed", disabled: true, defaults: defaults)
        PublicationCommentClosure.record("cmid-open", disabled: false, defaults: defaults)

        XCTAssertEqual(PublicationCommentClosure.commentsDisabled(for: "cmid-closed", defaults: defaults), true)
        XCTAssertNil(PublicationCommentClosure.commentsDisabled(for: "cmid-open", defaults: defaults))
        XCTAssertEqual(PublicationCommentClosure.commentsDisabled(for: "cmid-closed", defaults: defaults), true,
                       "un rejeu de la même ligne relit le même choix")
    }

    func test_durableBody_encodesTheClosureOnlyWhenSet() throws {
        var body = Self.body()
        XCTAssertNil(try Self.json(body)["commentsDisabled"])

        body.commentsDisabled = true

        XCTAssertEqual(try Self.json(body)["commentsDisabled"] as? Bool, true)
    }

    // MARK: - Fabriques

    private static func draft(_ format: ComposerFormat) -> ComposerDocumentDraft {
        ComposerDocumentDraft.document(
            format: format, forcePlainPost: false, text: "bonjour", visibility: .public, visibilityUserIds: [],
            repostOfId: nil, localMedia: [], location: nil, discoverabilityPrecision: nil, originalLanguage: nil,
            mobileTranscription: nil, references: [], storyEffects: nil, mediaCaptions: [:], mediaAlts: [:],
            mediaObjectIds: [:], allowSoundExtraction: nil
        )
    }

    private static func body() -> CreatePostBody {
        CreatePostBody(
            content: "x", mediaIds: nil, visibility: "PUBLIC",
            originalLanguage: nil, type: nil, moodEmoji: nil,
            audioUrl: nil, audioDuration: nil, visibilityUserIds: nil,
            location: nil, mentions: nil, discoverabilityPrecision: nil,
            repostOfId: nil, mobileTranscription: nil, storyEffects: nil,
            mediaCaption: nil, mediaAlt: nil, allowSoundExtraction: nil
        )
    }

    private static func json(_ body: CreatePostBody) throws -> [String: Any] {
        try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(body)) as? [String: Any])
    }
}
