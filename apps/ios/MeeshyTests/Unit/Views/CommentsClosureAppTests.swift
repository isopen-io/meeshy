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

    /// #16585 — le corps vient de la ligne : le choix doit y entrer, par les
    /// deux portes qui enfilent, sans quoi la publication naît ouverte.
    func test_durablePublisher_writesTheClosureOnTheRow() async throws {
        let file = MockOfflineQueue()

        let accepted = await ComposerDocumentDurablePublisher.publish(Self.draft(.post).closingComments(true), queue: file, isOffline: false)

        XCTAssertTrue(accepted)
        XCTAssertEqual(file.enqueuePostMediaCalls.first?.commentsDisabled, true)
    }

    func test_durablePublisher_leavesAnOpenPublicationSilent() async throws {
        let file = MockOfflineQueue()

        _ = await ComposerDocumentDurablePublisher.publish(Self.draft(.post), queue: file, isOffline: false)

        XCTAssertEqual(file.enqueuePostMediaCalls.count, 1)
        XCTAssertNil(file.enqueuePostMediaCalls.first?.commentsDisabled, "ouverte : la clé reste absente du corps")
    }

    /// Le corps de `DocumentComposerDoor` est privé : sa jumelle ci-dessus le
    /// prouve par comportement, celle-ci se lit à la source.
    func test_feedDoor_handsTheDraftsClosureToTheIntent() throws {
        let code = try Self.composerSource("DocumentComposerDoor.swift")

        XCTAssertTrue(code.contains("commentsDisabled: draft.commentsDisabled"))
    }

    func test_durableBody_encodesTheClosureOnlyWhenSet() throws {
        XCTAssertNil(try Self.json(Self.body(commentsDisabled: nil))["commentsDisabled"])
        XCTAssertEqual(try Self.json(Self.body(commentsDisabled: true))["commentsDisabled"] as? Bool, true)
    }

    /// #16585 — le meuble relit le choix avec le brouillon, et le basculer
    /// suffit à l'écrire : la bascule ne touche ni le texte, ni la scène.
    func test_composer_savesAndRestoresTheClosure() throws {
        let code = try Self.composerSource("MeeshyComposerHost+Autosave.swift")

        XCTAssertEqual(code.components(separatedBy: "commentsDisabled: commentsDisabledChoice").count - 1, 2,
                       "la signature ET l'état écrit portent le choix")
        XCTAssertTrue(code.contains("commentsDisabledChoice = state.commentsDisabled"))
    }

    // MARK: - Éditer sur un fil fermé (#16930)

    /// Les hôtes du menu « … » lui disent que le fil est fermé — sans quoi
    /// `CommentMenuPolicy` offrirait « Modifier » sur une publication fermée.
    func test_commentHosts_threadTheClosedStateIntoTheMenu() throws {
        let sheet = try Self.featureSource("Main/Views/FeedCommentsSheet.swift")
        let detail = try Self.featureSource("Main/Views/PostDetailCommentThread.swift")
        let story = try Self.featureSource("Stories/Views/StoryViewerView+CommentMenu.swift")
        let section = try Self.featureSource("Main/Views/ThreadedCommentSection.swift")

        XCTAssertTrue(sheet.contains("commentsClosed: closure.isClosed"))
        XCTAssertTrue(detail.contains("commentsClosed: viewModel.commentsClosed"))
        XCTAssertTrue(story.contains("commentsClosed: currentStory?.commentsClosed == true"))
        XCTAssertEqual(section.components(separatedBy: "commentsClosed: commentsClosed").count - 1, 2,
                       "la racine ET chaque réponse reçoivent l'état fermé")
    }

    /// La feuille ne s'instancie pas en test : son refus d'édition se lit à la
    /// source — il ferme la feuille comme un envoi refusé, sans erreur générique.
    func test_sheetEdit_aCommentsDisabledRefusal_closesTheSheet() throws {
        let code = try Self.featureSource("Main/Views/FeedCommentsSheet+CommentEdit.swift")

        XCTAssertTrue(code.contains("let closed = closure.noteRefusal(error)"))
        XCTAssertTrue(code.contains("showError(closed ? CommentsClosedNotice.text :"))
    }

    /// Le lecteur de story ferme la story quand l'édition est refusée.
    func test_storyWriter_closesTheStoryOnARefusedEdit() throws {
        let code = try Self.featureSource("Stories/Views/StoryViewerView+CommentMenu.swift")

        XCTAssertTrue(code.contains("onCommentsClosed: { StoryCommentSettings.noteClosed(storyId: story.id, in: viewModel) }"))
    }

    // MARK: - Fabriques

    private static func featureSource(_ chemin: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/\(chemin)")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    private static func draft(_ format: ComposerFormat) -> ComposerDocumentDraft {
        ComposerDocumentDraft.document(
            format: format, forcePlainPost: false, text: "bonjour", visibility: .public, visibilityUserIds: [],
            repostOfId: nil, localMedia: [], location: nil, discoverabilityPrecision: nil, originalLanguage: nil,
            mobileTranscription: nil, references: [], storyEffects: nil, mediaCaptions: [:], mediaAlts: [:],
            mediaObjectIds: [:], allowSoundExtraction: nil
        )
    }

    private static func composerSource(_ nom: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Composer/\(nom)")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    private static func body(commentsDisabled: Bool?) -> CreatePostBody {
        CreatePostBody(
            content: "x", mediaIds: nil, visibility: "PUBLIC",
            originalLanguage: nil, type: nil, moodEmoji: nil,
            audioUrl: nil, audioDuration: nil, visibilityUserIds: nil,
            location: nil, mentions: nil, discoverabilityPrecision: nil,
            repostOfId: nil, mobileTranscription: nil, storyEffects: nil,
            mediaCaption: nil, mediaAlt: nil, allowSoundExtraction: nil,
            commentsDisabled: commentsDisabled
        )
    }

    private static func json(_ body: CreatePostBody) throws -> [String: Any] {
        try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(body)) as? [String: Any])
    }
}
