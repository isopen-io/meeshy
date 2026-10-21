import XCTest
@testable import MeeshySDK

/// **Imager un commentaire de POST** (#9686) — ce que la carte met en tête, dans
/// quel ordre, et ce qu'elle refuse. Une fonction pure, éprouvée mode par mode.
final class PostCommentCardCompositionTests: XCTestCase {

    private static let viewer = MessageCardSubject.Viewer(id: "me", displayName: "Moi", username: "moi")
    private static let t0 = Date(timeIntervalSince1970: 1_800_000_000)

    private static func at(_ minutes: Double) -> Date { t0.addingTimeInterval(minutes * 60) }

    private static func makePost(content: String = "Le coucher de soleil à Dakar", type: String? = nil,
                                 media: [FeedMedia] = [], visibility: String? = "PUBLIC") -> FeedPost {
        var post = FeedPost(id: "post", author: "Awa", authorId: "awa", authorUsername: "awa", type: type,
                            content: content, timestamp: at(0), media: media)
        post.visibility = visibility
        return post
    }

    private static func makeComment(_ id: String, _ author: String, _ text: String, minute: Double,
                                    parent: String? = nil, flags: Int = 0, media: [FeedMedia] = []) -> FeedComment {
        FeedComment(id: id, author: author, authorId: author.lowercased(), authorUsername: author.lowercased(),
                    content: text, timestamp: at(minute), parentId: parent, effectFlags: flags, media: media)
    }

    private static let root = makeComment("root", "Bob", "Magnifique !", minute: 1)
    private static let r1 = makeComment("r1", "Cleo", "Tu étais où ?", minute: 2, parent: "root")
    private static let r2 = makeComment("r2", "Bob", "Sur la corniche", minute: 3, parent: "root")
    private static let r3 = makeComment("r3", "Dan", "J'y vais demain", minute: 4, parent: "root")
    private static let later = makeComment("r4", "Eve", "Écrit après", minute: 9, parent: "root")

    private static func source(post: FeedPost? = makePost(), target: FeedComment,
                               thread: [FeedComment] = [root, r1, r2, r3, later]) -> PostCommentCardSource {
        PostCommentCardSource(post: post, target: target, thread: thread, viewer: viewer)
    }

    private static func ids(_ blocks: [PostCommentCardBlock]) -> [String] {
        blocks.map { block in
            switch block {
            case .post: return "post"
            case .comment(let id, _): return id
            case .folded(let count): return "+\(count)"
            }
        }
    }

    private static func blocks(_ source: PostCommentCardSource, _ mode: PostCommentCardMode,
                               showsPost: Bool? = nil, chosen: Set<String> = []) -> [String] {
        ids(PostCommentCardComposition.blocks(of: source, mode: mode, showsPost: showsPost ?? mode.showsPostByDefault, chosen: chosen))
    }

    // MARK: - Commentaire de premier niveau

    func test_modes_firstLevelComment_offersPostAndCommentFirst_thenTheCommentAlone() {
        let source = Self.source(target: Self.root)
        XCTAssertEqual(PostCommentCardComposition.modes(of: source), [.postAndComment, .commentAlone])
        XCTAssertEqual(PostCommentCardComposition.defaultMode(of: source), .postAndComment)
    }

    func test_blocks_postAndComment_putsThePostOnTopOfTheComment() {
        XCTAssertEqual(Self.blocks(Self.source(target: Self.root), .postAndComment), ["post", "root"])
    }

    func test_blocks_commentAlone_isTheCommentOnly() {
        XCTAssertEqual(Self.blocks(Self.source(target: Self.root), .commentAlone), ["root"])
    }

    func test_blocks_thePostLeavesTheHeadInOneTouch_inEveryMode() {
        XCTAssertEqual(Self.blocks(Self.source(target: Self.root), .postAndComment, showsPost: false), ["root"])
        XCTAssertEqual(Self.blocks(Self.source(target: Self.r2), .postRootAndReply, showsPost: false), ["root", "r2"])
        XCTAssertEqual(Self.blocks(Self.source(target: Self.r2), .threadToHere, showsPost: true), ["post", "root", "r1", "r2"])
    }

    func test_modes_withoutAPost_onlyTheCommentAlone() {
        XCTAssertEqual(PostCommentCardComposition.modes(of: Self.source(post: nil, target: Self.root)), [.commentAlone])
    }

    // MARK: - Réponse

    func test_modes_reply_offersTheThreadFirst_thenPostRootAndReply_thenChoosing() {
        let source = Self.source(target: Self.r2)
        XCTAssertEqual(PostCommentCardComposition.modes(of: source), [.threadToHere, .postRootAndReply, .chosenReplies])
        XCTAssertEqual(PostCommentCardComposition.defaultMode(of: source), .threadToHere)
    }

    func test_blocks_threadToHere_isTheRootThenTheRepliesUpToThisOne_neverWhatCameAfter() {
        XCTAssertEqual(Self.blocks(Self.source(target: Self.r2), .threadToHere), ["root", "r1", "r2"])
    }

    func test_blocks_threadToHere_keepsChronologicalOrder_whateverTheLoadedOrder() {
        let source = Self.source(target: Self.r3, thread: [Self.r3, Self.later, Self.r1, Self.root, Self.r2])
        XCTAssertEqual(Self.blocks(source, .threadToHere), ["root", "r1", "r2", "r3"])
    }

    func test_blocks_threadToHere_followsANestedChainOfAncestors() {
        let nested = Self.makeComment("n1", "Fay", "Réponse à Cleo", minute: 5, parent: "r1")
        let source = Self.source(target: nested, thread: [Self.root, Self.r1, nested])
        XCTAssertEqual(Self.blocks(source, .threadToHere), ["root", "r1", "n1"])
    }

    func test_blocks_postRootAndReply_isThePostTheRootAndThisReply() {
        XCTAssertEqual(Self.blocks(Self.source(target: Self.r3), .postRootAndReply), ["post", "root", "r3"])
    }

    func test_blocks_chosenReplies_keepsChronologicalOrder_andAlwaysTheTargetLast() {
        let source = Self.source(target: Self.r3)
        XCTAssertEqual(Self.blocks(source, .chosenReplies, chosen: ["r2", "root"]), ["root", "r2", "r3"])
        XCTAssertEqual(Self.blocks(source, .chosenReplies, chosen: []), ["r3"])
        XCTAssertEqual(Self.blocks(source, .chosenReplies, chosen: ["r3"]), ["r3"])
    }

    func test_choosable_isTheTreeWithoutTheTarget_inOrder() {
        let choosable = PostCommentCardComposition.choosable(of: Self.source(target: Self.r2)).map(\.id)
        XCTAssertEqual(choosable, ["root", "r1", "r3", "r4"])
    }

    func test_initialChoice_isTheThreadUpToHere() {
        XCTAssertEqual(PostCommentCardComposition.initialChoice(of: Self.source(target: Self.r2)), ["root", "r1"])
    }

    func test_modes_aReplyWhoseRootIsNotLoaded_offersNothing() {
        XCTAssertEqual(PostCommentCardComposition.modes(of: Self.source(target: Self.r2, thread: [Self.r1, Self.r2])), [])
    }

    // MARK: - Protections

    func test_modes_aProtectedComment_neverImages() {
        let ephemeral = Self.makeComment("x", "Bob", "Secret", minute: 1, flags: Int(MessageEffectFlags.ephemeral.rawValue))
        XCTAssertEqual(PostCommentCardComposition.modes(of: Self.source(target: ephemeral)), [])
        XCTAssertNil(Self.subject(Self.source(target: ephemeral), .postAndComment))
    }

    func test_modes_aReplyUnderAProtectedAncestor_imagesInNoMode() {
        let viewOnce = Self.makeComment("root", "Bob", "Vue unique", minute: 1, flags: Int(MessageEffectFlags.viewOnce.rawValue))
        let source = Self.source(target: Self.r2, thread: [viewOnce, Self.r1, Self.r2])
        XCTAssertEqual(PostCommentCardComposition.modes(of: source), [])
        XCTAssertEqual(Self.blocks(source, .postRootAndReply), [])
    }

    func test_blocks_aProtectedSiblingReply_staysOutOfTheThread_andOutOfTheChoice() {
        let blurred = Self.makeComment("r1", "Cleo", "Flouté", minute: 2, parent: "root", flags: Int(MessageEffectFlags.blurred.rawValue))
        let source = Self.source(target: Self.r2, thread: [Self.root, blurred, Self.r2, Self.r3])
        XCTAssertEqual(Self.blocks(source, .threadToHere), ["root", "r2"])
        XCTAssertEqual(Self.blocks(source, .chosenReplies, chosen: ["r1", "root"]), ["root", "r2"])
    }

    func test_postHead_aStoryOrAStatusIsNeverPutOnTop() {
        for type in ["STORY", "STATUS"] {
            let source = Self.source(post: Self.makePost(type: type), target: Self.root)
            XCTAssertEqual(PostCommentCardComposition.modes(of: source), [.commentAlone], type)
            XCTAssertEqual(Self.blocks(source, .commentAlone, showsPost: true), ["root"], type)
        }
    }

    /// #11477 — « Mes stories » ouvre les commentaires d'une story par son `FeedPost` : elle
    /// compose alors comme dans le lecteur, par son visuel en HERO (jumelle de `composingPostOf`, web).
    func test_postHead_aPublicStoryOrStatusPost_composesThroughItsVisual_likeTheStoryViewer() throws {
        for type in ["STORY", "STATUS"] {
            let post = Self.makePost(content: "Ma story", type: type, media: [Self.photo])
            let source = PostCommentCardSource(post: post, target: Self.root, thread: [], viewer: Self.viewer, now: Self.at(60))
            XCTAssertEqual(PostCommentCardComposition.modes(of: source), [.postAndComment, .commentAlone], type)
            let subject = try XCTUnwrap(Self.subject(source, .postAndComment), type)
            XCTAssertEqual(subject.heroID, "pic", type)
            XCTAssertEqual(subject.quoted?.author, "Awa", type)
            XCTAssertNil(Self.subject(source, .commentAlone)?.heroID, type)
        }
    }

    func test_postHead_aStoryPost_keepsTheStoryGuards_audienceExpiryAndCanvas() {
        let restricted = Self.makePost(type: "STORY", media: [Self.photo], visibility: "FRIENDS")
        let lapsed = Self.makePost(type: "STORY", media: [Self.photo])
        var canvas = Self.makePost(type: "STORY", media: [Self.photo])
        canvas.storyEffects = StoryEffects()
        let cases: [(String, FeedPost, Date)] = [
            ("audience", restricted, Self.at(60)),
            ("échue", lapsed, Self.at(0).addingTimeInterval(StoryItem.defaultExpiryInterval + 1)),
            ("canvas sans vignette", canvas, Self.at(60)),
        ]
        for (label, post, now) in cases {
            let source = PostCommentCardSource(post: post, target: Self.root, thread: [], viewer: Self.viewer, now: now)
            XCTAssertEqual(PostCommentCardComposition.modes(of: source), [.commentAlone], label)
        }
    }

    func test_postHead_aPostWithOnlyAPhoto_isPutOnTopWithItsThumbnail() throws {
        let photo = FeedMedia(id: "pic", type: .image, url: "https://cdn.test/pic.jpg", width: 400, height: 300)
        let source = Self.source(post: Self.makePost(content: "  ", media: [photo]), target: Self.root)
        let subject = try XCTUnwrap(Self.subject(source, .postAndComment))
        XCTAssertEqual(subject.quoted?.author, "Awa")
        XCTAssertEqual(subject.media.map(\.media.id), ["pic"])
    }

    // MARK: - Bornes

    func test_excerpt_cutsTheTextAtLinesAndCharacters_readably() {
        let long = Array(repeating: "ligne", count: 6).joined(separator: "\n")
        XCTAssertEqual(PostCommentCardComposition.excerpt(long), "ligne\nligne\nligne\nligne…")
        let words = Array(repeating: "mot", count: 120).joined(separator: " ")
        let cut = PostCommentCardComposition.excerpt(words)
        XCTAssertTrue(cut.hasSuffix("mot…"))
        XCTAssertLessThanOrEqual(cut.count, PostCommentCardComposition.maxPostCharacters + 1)
        XCTAssertEqual(PostCommentCardComposition.excerpt("Court"), "Court")
    }

    func test_blocks_aLongThread_foldsItsMiddle_keepingTheRootAndTheLastReplies() {
        let replies = (1...9).map { Self.makeComment("m\($0)", "U\($0)", "Réponse \($0)", minute: Double($0) + 1, parent: "root") }
        let target = replies[8]
        let source = Self.source(target: target, thread: [Self.root] + replies)
        XCTAssertEqual(Self.blocks(source, .threadToHere), ["root", "+5", "m6", "m7", "m8", "m9"])
        let withPost = Self.blocks(source, .threadToHere, showsPost: true)
        XCTAssertEqual(withPost, ["post", "root", "+6", "m7", "m8", "m9"])
        XCTAssertEqual(withPost.count, PostCommentCardComposition.maxBlocks)
    }

    func test_subject_atMostMaxMedia_thePostThumbnailKept() throws {
        let photo = FeedMedia(id: "pic", type: .image, url: "https://cdn.test/pic.jpg")
        let replies = (1...5).map { index in
            Self.makeComment("m\(index)", "U\(index)", "R\(index)", minute: Double(index) + 1, parent: "root",
                             media: [FeedMedia(id: "c\(index)", type: .image, url: "https://cdn.test/c\(index).jpg")])
        }
        let source = Self.source(post: Self.makePost(media: [photo]), target: replies[4], thread: [Self.root] + replies)
        let subject = try XCTUnwrap(Self.subject(source, .threadToHere, showsPost: true))
        XCTAssertEqual(subject.media.count, PostCommentCardComposition.maxMedia)
        XCTAssertEqual(subject.media.first?.media.id, "pic")
        XCTAssertEqual(subject.media.last?.media.id, "c5")
    }

    // MARK: - La carte

    private static func subject(_ source: PostCommentCardSource, _ mode: PostCommentCardMode, showsPost: Bool? = nil,
                                chosen: Set<String> = []) -> MessageCardSubject? {
        PostCommentCardComposition.subject(of: source, mode: mode, showsPost: showsPost ?? mode.showsPostByDefault,
                                           chosen: chosen, title: "Fil", foldedLabel: { "+\($0) réponses" })
    }

    func test_subject_twoBlocks_quoteTheFirst_replyTheSecond() throws {
        let subject = try XCTUnwrap(Self.subject(Self.source(target: Self.root), .postAndComment))
        XCTAssertEqual(subject.quoted, MessageCardPart(author: "Awa", text: "Le coucher de soleil à Dakar", handle: "awa"))
        XCTAssertEqual(subject.reply, MessageCardPart(author: "Bob", text: "Magnifique !", handle: "bob"))
        XCTAssertEqual(subject.sentAt, Self.root.timestamp)
        XCTAssertEqual(subject.quotedAt, Self.at(0))
    }

    func test_subject_oneBlock_isTheCommentWithoutQuote() throws {
        let subject = try XCTUnwrap(Self.subject(Self.source(target: Self.root), .commentAlone))
        XCTAssertNil(subject.quoted)
        XCTAssertEqual(subject.reply.text, "Magnifique !")
    }

    func test_subject_aThread_quotesItsHead_andWritesTheRestAsADiscussion() throws {
        let subject = try XCTUnwrap(Self.subject(Self.source(target: Self.r2), .threadToHere))
        XCTAssertEqual(subject.quoted?.text, "Magnifique !")
        XCTAssertEqual(subject.reply.author, "Fil")
        XCTAssertEqual(subject.reply.text, "Cleo : Tu étais où ?\nBob : Sur la corniche")
    }

    func test_subject_aFoldedThread_saysHowManyRepliesAreFolded() throws {
        let replies = (1...9).map { Self.makeComment("m\($0)", "U\($0)", "R\($0)", minute: Double($0) + 1, parent: "root") }
        let source = Self.source(target: replies[8], thread: [Self.root] + replies)
        let subject = try XCTUnwrap(Self.subject(source, .threadToHere))
        XCTAssertEqual(subject.reply.text.components(separatedBy: "\n").first, "+5 réponses")
    }

    func test_subject_theViewerIsNamedAsTheyChose() throws {
        let mine = FeedComment(id: "mine", author: "moi-pseudo", authorId: "me", authorUsername: "moi", content: "Je confirme", timestamp: Self.at(1))
        let subject = try XCTUnwrap(Self.subject(Self.source(target: mine), .commentAlone))
        XCTAssertEqual(subject.reply.author, "Moi")
    }

    func test_subject_theTargetFollowsItsLanguageChip() throws {
        let translated = FeedComment(id: "t", author: "Bob", authorId: "bob", content: "Beautiful!", timestamp: Self.at(1),
                                     originalLanguage: "en", translatedContent: "Magnifique !")
        let shown = PostCommentCardSource(post: Self.makePost(), target: translated, thread: [], viewer: Self.viewer, showOriginal: true)
        let served = PostCommentCardSource(post: Self.makePost(), target: translated, thread: [], viewer: Self.viewer)
        XCTAssertEqual(Self.subject(shown, .commentAlone)?.reply.text, "Beautiful!")
        XCTAssertEqual(Self.subject(served, .commentAlone)?.reply.text, "Magnifique !")
    }
    // MARK: - Le hero du support (#10915)

    private static let photo = FeedMedia(id: "pic", type: .image, url: "https://cdn.test/pic.jpg", width: 1600, height: 900)

    func test_subject_thePostPhotoIsTheHero_withoutAnAuthor_andTheQuoteBecomesAShortSupportLine() throws {
        let long = Array(repeating: "mot", count: 120).joined(separator: " ")
        let source = Self.source(post: Self.makePost(content: long, media: [Self.photo]), target: Self.root)
        let subject = try XCTUnwrap(Self.subject(source, .postAndComment))
        XCTAssertEqual(subject.heroID, "pic")
        XCTAssertNil(subject.media.first { $0.media.id == "pic" }?.author, "le hero est le support : pas de signature de média")
        let line = try XCTUnwrap(subject.quoted)
        XCTAssertEqual(line.author, "Awa")
        XCTAssertLessThanOrEqual(line.text.count, MessageCardHero.excerptCharacters + 1)
        XCTAssertTrue(line.text.hasSuffix("…"))
    }

    func test_subject_aPhotoOnlyPost_hasASymbolAsItsSupportLine_soTheAuthorStillShows() throws {
        let source = Self.source(post: Self.makePost(content: " ", media: [Self.photo]), target: Self.root)
        let subject = try XCTUnwrap(Self.subject(source, .postAndComment))
        XCTAssertEqual(subject.quoted, MessageCardPart(author: "Awa", text: "📷", handle: "awa"))
    }

    func test_subject_withoutHeroSupport_theOldThumbnailBehaviourStays() throws {
        let source = Self.source(post: Self.makePost(media: [Self.photo]), target: Self.root)
        let subject = try XCTUnwrap(PostCommentCardComposition.subject(
            of: source, mode: .postAndComment, showsPost: true, title: "Fil", foldedLabel: { "+\($0)" }, heroSupport: false))
        XCTAssertNil(subject.heroID)
        XCTAssertEqual(subject.quoted?.text, "Le coucher de soleil à Dakar")
    }

    func test_subject_aPostWithoutAVisual_hasNoHero() throws {
        let subject = try XCTUnwrap(Self.subject(Self.source(target: Self.root), .postAndComment))
        XCTAssertNil(subject.heroID)
    }

    func test_subject_theCommentCardInputCarriesTheHeroToTheDisposition() throws {
        let source = Self.source(post: Self.makePost(media: [Self.photo]), target: Self.root)
        let subject = try XCTUnwrap(Self.subject(source, .postAndComment))
        let input = MessageCardInput.of(subject: subject, format: .initial, handle: "moi", conversationTitle: nil, anonymousLabel: "Anonyme",
                                        formatDate: { _ in "" })
        XCTAssertEqual(input.disposition.heroMediaID, "pic")
        XCTAssertEqual(input.disposition.heroVisual(of: input.media)?.id, "pic")
    }

    // MARK: - L'imbrication (#10915)

    func test_subject_aThreadKeepsItsLevels_theRootAtZeroItsRepliesAtOne() throws {
        let source = Self.source(target: Self.r2)
        let subject = try XCTUnwrap(Self.subject(source, .postRootAndReply, showsPost: true))
        XCTAssertEqual(subject.reply.thread.map(\.level), [0, 1])
        XCTAssertEqual(subject.reply.thread.map(\.text), ["Bob : Magnifique !", "Bob : Sur la corniche"])
        XCTAssertEqual(subject.reply.text, subject.reply.thread.map(\.text).joined(separator: "\n"))
    }

    func test_subject_whenTheRootIsQuoted_itsRepliesAreOneLevelUnderIt() throws {
        let subject = try XCTUnwrap(Self.subject(Self.source(target: Self.r2), .threadToHere))
        XCTAssertEqual(subject.quoted?.text, "Magnifique !")
        XCTAssertEqual(subject.reply.thread.map(\.level), [1, 1])
    }

    func test_subject_aFoldedThreadLineSitsAtLevelOne() throws {
        let replies = (1...9).map { Self.makeComment("m\($0)", "U\($0)", "R\($0)", minute: Double($0) + 1, parent: "root") }
        let source = Self.source(target: replies[8], thread: [Self.root] + replies)
        let subject = try XCTUnwrap(Self.subject(source, .threadToHere))
        XCTAssertEqual(subject.reply.thread.first?.text, "+5 réponses")
        XCTAssertEqual(subject.reply.thread.first?.level, 1)
    }

    func test_subject_aSingleReplyHasNoThread() throws {
        let subject = try XCTUnwrap(Self.subject(Self.source(target: Self.root), .postAndComment))
        XCTAssertTrue(subject.reply.thread.isEmpty)
    }

    func test_depth_countsKnownAncestors_andStopsOnACycle() {
        let source = Self.source(target: Self.r2)
        XCTAssertEqual(PostCommentCardComposition.depth(of: "root", source: source), 0)
        XCTAssertEqual(PostCommentCardComposition.depth(of: "r2", source: source), 1)
        let a = Self.makeComment("a", "A", "a", minute: 1, parent: "b")
        let b = Self.makeComment("b", "B", "b", minute: 2, parent: "a")
        XCTAssertEqual(PostCommentCardComposition.depth(of: "a", source: Self.source(target: a, thread: [a, b])), 1)
    }

    // MARK: - La story (#10915)

    private static let now = Date(timeIntervalSince1970: 1_800_100_000)

    private static func storySource(_ story: PostCommentCardStory, target: FeedComment? = nil) -> PostCommentCardSource {
        PostCommentCardSource(post: nil, target: target ?? root, thread: [], viewer: viewer, story: story, now: now)
    }

    private static func makeStory(text: String? = "Ma story", media: [FeedMedia] = [], expiresAt: Date? = now.addingTimeInterval(3600), canvas: Bool = false,
                                  visibility: String? = "PUBLIC") -> PostCommentCardStory {
        PostCommentCardStory(id: "st", author: "Awa", authorId: "awa", authorUsername: "awa", text: text, media: media,
                             timestamp: at(0), expiresAt: expiresAt, hasCanvas: canvas, visibility: visibility)
    }

    private static let restrictedAudiences: [String?] = ["FRIENDS", "COMMUNITY", "PRIVATE", "EXCEPT", "ONLY", "", nil]

    func test_audience_aStoryThatIsNotPublic_isNeverSupportNorHero() {
        XCTAssertEqual(PostCommentCardComposition.modes(of: Self.storySource(Self.makeStory(media: [Self.photo], visibility: "public"))),
                       [.postAndComment, .commentAlone])
        for visibility in Self.restrictedAudiences {
            let source = Self.storySource(Self.makeStory(media: [Self.photo], visibility: visibility))
            XCTAssertEqual(PostCommentCardComposition.modes(of: source), [.commentAlone], "\(visibility ?? "nil")")
            XCTAssertNil(Self.subject(source, .postAndComment))
            XCTAssertNil(Self.subject(source, .commentAlone, showsPost: true)?.heroID)
        }
    }

    func test_audience_aPostThatIsNotPublic_neverHeadsTheCard() {
        for visibility in Self.restrictedAudiences {
            let post = Self.makePost(media: [Self.photo], visibility: visibility)
            XCTAssertEqual(PostCommentCardComposition.modes(of: Self.source(post: post, target: Self.root)), [.commentAlone])
            XCTAssertEqual(PostCommentCardComposition.modes(of: Self.source(post: post, target: Self.r2)), [.threadToHere, .chosenReplies])
            XCTAssertNil(Self.subject(Self.source(post: post, target: Self.root), .commentAlone, showsPost: true)?.heroID)
        }
    }

    func test_audience_aStoryItemCarriesItsVisibilityToTheSupport() {
        let item = StoryItem(id: "st", content: "Ma story", media: [Self.photo], createdAt: Self.now, visibility: "FRIENDS")
        XCTAssertEqual(PostCommentCardStory(story: item, author: "Awa", authorId: "awa").visibility, "FRIENDS")
    }

    func test_story_aPlainStoryPutsItsPhotoAsTheHero() throws {
        let source = Self.storySource(Self.makeStory(media: [Self.photo]))
        XCTAssertEqual(PostCommentCardComposition.modes(of: source), [.postAndComment, .commentAlone])
        let subject = try XCTUnwrap(Self.subject(source, .postAndComment))
        XCTAssertEqual(subject.heroID, "pic")
        XCTAssertEqual(subject.media.first?.fileURL, "https://cdn.test/pic.jpg")
        XCTAssertEqual(subject.quoted?.author, "Awa")
    }

    func test_story_anExpiredStoryIsNeverImaged() {
        let source = Self.storySource(Self.makeStory(media: [Self.photo], expiresAt: Self.now.addingTimeInterval(-1)))
        XCTAssertEqual(PostCommentCardComposition.modes(of: source), [.commentAlone])
    }

    func test_story_withoutExpiresAt_expiresLikeAStoryItem_afterTheDefaultWindow() {
        let lapsed = Self.makeStory(media: [Self.photo], expiresAt: nil)
        XCTAssertTrue(StoryItem(id: "st", createdAt: Self.at(0)).isExpired(at: Self.now))
        XCTAssertEqual(PostCommentCardComposition.modes(of: Self.storySource(lapsed)), [.commentAlone])
        let fresh = PostCommentCardStory(id: "st", author: "Awa", authorId: "awa", media: [Self.photo],
                                         timestamp: Self.now.addingTimeInterval(-60), visibility: "PUBLIC")
        XCTAssertEqual(PostCommentCardComposition.modes(of: Self.storySource(fresh)), [.postAndComment, .commentAlone])
    }

    func test_story_aCanvasStoryWithoutAThumbnail_keepsTheOldGuard() {
        let source = Self.storySource(Self.makeStory(media: [Self.photo], canvas: true))
        XCTAssertEqual(PostCommentCardComposition.modes(of: source), [.commentAlone])
    }

    func test_story_aCanvasStoryIsRepresentedByItsThumbnail_asAnImage() throws {
        let video = FeedMedia(id: "vid", type: .video, url: "https://cdn.test/v.mp4", thumbnailUrl: "https://cdn.test/v.jpg", width: 1080, height: 1920, duration: 8)
        let source = Self.storySource(Self.makeStory(media: [video], canvas: true))
        let subject = try XCTUnwrap(Self.subject(source, .postAndComment))
        XCTAssertEqual(subject.heroID, "vid")
        XCTAssertEqual(subject.media.first?.media.kind, .image)
        XCTAssertEqual(subject.media.first?.fileURL, "https://cdn.test/v.jpg")
    }

    func test_story_aVideoStoryUsesItsThumbnailAsPoster_withoutInventingOne() throws {
        let noPoster = FeedMedia(id: "vid", type: .video, url: "https://cdn.test/v.mp4", width: 1080, height: 1920)
        let subject = try XCTUnwrap(Self.subject(Self.storySource(Self.makeStory(media: [noPoster])), .postAndComment))
        XCTAssertEqual(subject.media.first?.media.kind, .video)
        XCTAssertNil(subject.media.first?.posterURL)
    }

    // MARK: - Le repli « commentaire seul »

    func test_fallsBackToCommentAlone_aReplyWhoseRootIsNotLoaded_imagesAlone() {
        let source = Self.storySource(Self.makeStory(media: [Self.photo]), target: Self.r1)
        XCTAssertEqual(PostCommentCardComposition.modes(of: source), [])
        XCTAssertTrue(PostCommentCardComposition.fallsBackToCommentAlone(source))
    }

    func test_fallsBackToCommentAlone_neverWhenAKnownAncestorIsProtected() {
        let viewOnce = Self.makeComment("root", "Bob", "Vue unique", minute: 1, flags: Int(MessageEffectFlags.viewOnce.rawValue))
        let middle = Self.makeComment("mid", "Cleo", "Entre deux", minute: 2, parent: "missing")
        let target = Self.makeComment("t", "Dan", "Moi", minute: 3, parent: "mid")
        XCTAssertFalse(PostCommentCardComposition.fallsBackToCommentAlone(Self.source(target: Self.r1, thread: [viewOnce])))
        let protectedMiddle = Self.makeComment("mid", "Cleo", "Entre deux", minute: 2, parent: "missing", flags: Int(MessageEffectFlags.viewOnce.rawValue))
        XCTAssertTrue(PostCommentCardComposition.fallsBackToCommentAlone(Self.source(target: target, thread: [middle])))
        XCTAssertFalse(PostCommentCardComposition.fallsBackToCommentAlone(Self.source(target: target, thread: [protectedMiddle])))
    }

    func test_fallsBackToCommentAlone_neverWhenAModeComposes_norForAProtectedComment() {
        XCTAssertFalse(PostCommentCardComposition.fallsBackToCommentAlone(Self.source(target: Self.r1)))
        let viewOnce = Self.makeComment("x", "Bob", "Secret", minute: 1, parent: "missing", flags: Int(MessageEffectFlags.viewOnce.rawValue))
        XCTAssertFalse(PostCommentCardComposition.fallsBackToCommentAlone(Self.source(target: viewOnce, thread: [])))
    }

    func test_story_aProtectedCommentNeverImages_evenOnAStoryWithAHero() {
        let viewOnce = Self.makeComment("x", "Bob", "Secret", minute: 1, flags: Int(MessageEffectFlags.viewOnce.rawValue))
        XCTAssertEqual(PostCommentCardComposition.modes(of: Self.storySource(Self.makeStory(media: [Self.photo]), target: viewOnce)), [])
    }
}

