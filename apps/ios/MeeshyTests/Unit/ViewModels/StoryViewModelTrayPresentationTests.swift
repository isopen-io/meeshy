import XCTest
import Combine
@testable import Meeshy
import MeeshySDK
import MeeshyUI

/// `StoryViewModel` — ce que le tray MONTRE : anneaux, vu / non vu, ordre,
/// interstitiel de groupe, couvertures et préchargement.
@MainActor
final class StoryViewModelTrayPresentationTests: StoryViewModelTestCase {

    // MARK: - storyRingState(forUserId:) Tests

    func test_storyRingState_userWithUnviewedStories_returnsUnread() {
        let group = makeStoryGroup(userId: "u1", stories: [makeStoryItem(isViewed: false)])
        sut.storyGroups = [group]

        XCTAssertEqual(sut.storyRingState(forUserId: "u1"), .unread)
    }

    func test_storyRingState_userWithAllViewedStories_returnsRead() {
        let group = makeStoryGroup(userId: "u1", stories: [makeStoryItem(isViewed: true)])
        sut.storyGroups = [group]

        XCTAssertEqual(sut.storyRingState(forUserId: "u1"), .read)
    }

    func test_storyRingState_userWithoutStories_returnsNone() {
        sut.storyGroups = []

        XCTAssertEqual(sut.storyRingState(forUserId: "u1"), StoryRingState.none)
    }

    func test_storyRingState_userWithFullyExpiredGroup_returnsNone() {
        let expired = makeStoryItem(id: "old", createdAt: Date(timeIntervalSinceNow: -100_000))
        let group = makeStoryGroup(userId: "u1", stories: [expired])
        sut.storyGroups = [group]

        XCTAssertEqual(sut.storyRingState(forUserId: "u1"), StoryRingState.none)
    }

    // MARK: - markViewed() Tests

    func test_markViewed_updatesLocalStateToViewed() async {
        let item = makeStoryItem(id: "view-me", isViewed: false)
        let group = makeStoryGroup(userId: "u1", stories: [item])
        sut.storyGroups = [group]

        sut.markViewed(storyId: "view-me")

        XCTAssertTrue(sut.storyGroups[0].stories[0].isViewed)
    }

    func test_markViewed_enqueuesDurableOutboxRecord() async {
        // R6 — le « vu » passe par l'outbox durable (survit kill/offline),
        // plus par le POST fire-and-forget direct.
        //
        // L'identifiant est un ObjectId SERVEUR (24 hexadécimaux), et ce n'est
        // plus décoratif : `markViewed` refuse d'enfiler ce que le serveur ne
        // sait pas adresser (#4044 — un `pending_<uuid>` de story en cours de
        // publication faisait lever Prisma, donc 500, donc une ligne d'outbox
        // condamnée). La fixture « view-service-test » était une chaîne
        // qu'aucune story ne porte : elle faisait tomber ce témoin pour la
        // mauvaise raison. Le refus lui-même est couvert par
        // `StoryViewedMarkingTests`, qui en est le site.
        let storyId = "507f1f77bcf86cd799439021"
        let item = makeStoryItem(id: storyId, isViewed: false)
        let group = makeStoryGroup(userId: "u1", stories: [item])
        sut.storyGroups = [group]
        var enqueuedStoryIds: [String] = []
        sut.markViewedOutboxEnqueuer = { storyId, _ in enqueuedStoryIds.append(storyId) }

        sut.markViewed(storyId: storyId)

        // Give the fire-and-forget Task time to execute
        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(enqueuedStoryIds, [storyId])
    }

    func test_markViewed_nonExistentStoryId_doesNothing() {
        let item = makeStoryItem(id: "existing", isViewed: false)
        let group = makeStoryGroup(userId: "u1", stories: [item])
        sut.storyGroups = [group]

        sut.markViewed(storyId: "non-existent")

        XCTAssertFalse(sut.storyGroups[0].stories[0].isViewed, "Should not modify unrelated stories")
    }

    // MARK: - Group intro (interstitiel inter-groupes)

    func test_resolveGroupIntro_mapsProfileFromResolver() async {
        let group = makeIntroGroup()
        sut.introProfileResolver = { _ in
            MeeshyUser(id: group.id, username: "alice",
                       firstName: "Alice", lastName: "Martin",
                       banner: "https://cdn.test/banner.jpg", bannerThumbHash: "bh")
        }
        sut.introMoodFeedLoader = { [] }

        let intro = await sut.resolveGroupIntro(for: group)

        XCTAssertEqual(intro.displayName, "Alice Martin",
                       "Full name is built from first+last when displayName is absent")
        XCTAssertEqual(intro.bannerURL, "https://cdn.test/banner.jpg")
        XCTAssertEqual(intro.bannerThumbHash, "bh")
    }

    /// Directive user 2026-08-20 : après « @ », l'interlude affiche le PSEUDO.
    /// `StoryGroup.username` porte en réalité `APIAuthor.name` (displayName ??
    /// username) — le profil résolu doit donc écraser `intro.username` avec le
    /// vrai handle, sinon la carte rend « @Alice Martin ».
    func test_resolveGroupIntro_usernameComesFromProfileHandle_notGroupDisplayName() async {
        let group = makeIntroGroup(username: "Alice Martin")
        sut.introProfileResolver = { _ in
            MeeshyUser(id: group.id, username: "alice.m",
                       firstName: "Alice", lastName: "Martin")
        }
        sut.introMoodFeedLoader = { [] }

        let intro = await sut.resolveGroupIntro(for: group)

        XCTAssertEqual(intro.username, "alice.m",
                       "The @handle line must show the profile's username, never the group's display name")
    }

    func test_resolveGroupIntro_mapsMoodFromStatusFeed() async {
        let group = makeIntroGroup()
        sut.introProfileResolver = { _ in MeeshyUser(id: group.id, username: "alice") }
        sut.introMoodFeedLoader = {
            [Self.makeStatusPost(authorId: group.id, authorName: "alice",
                                 mood: "🔥", content: "En feu aujourd'hui")]
        }

        let intro = await sut.resolveGroupIntro(for: group)

        XCTAssertEqual(intro.moodEmoji, "🔥")
        XCTAssertEqual(intro.moodMessage, "En feu aujourd'hui")
    }

    func test_resolveGroupIntro_moodFeedFetchedOncePerSession() async {
        let group = makeIntroGroup()
        sut.introProfileResolver = { _ in MeeshyUser(id: group.id, username: "alice") }
        var fetchCount = 0
        sut.introMoodFeedLoader = { fetchCount += 1; return [] }

        _ = await sut.resolveGroupIntro(for: group)
        _ = await sut.resolveGroupIntro(for: makeIntroGroup(username: "bob"))

        XCTAssertEqual(fetchCount, 1,
                       "The statuses feed is fetched once per ViewModel session, then reused")
    }

    func test_resolveGroupIntro_survivesResolverFailure() async {
        let group = makeIntroGroup(username: "carol")
        sut.introProfileResolver = { _ in throw URLError(.notConnectedToInternet) }
        sut.introMoodFeedLoader = { throw URLError(.notConnectedToInternet) }

        let intro = await sut.resolveGroupIntro(for: group)

        XCTAssertEqual(intro.userId, group.id)
        XCTAssertEqual(intro.username, "carol",
                       "Offline: the intro still renders with the group's own data")
        XCTAssertNil(intro.displayName)
        XCTAssertNil(intro.moodEmoji)
    }

    func test_markViewed_expiredStory_doesNotPin() async {
        let unique = UUID().uuidString
        let videoURL = "https://cdn.test/\(unique).mp4"
        let story = makeMediaStoryItem(id: "pin-expired", videoURL: videoURL,
                                       audioURL: nil, imageURL: nil,
                                       expiresAt: Date().addingTimeInterval(-60))
        let group = makeStoryGroup(userId: "u1", stories: [story])
        sut.storyGroups = [group]

        sut.markViewed(storyId: "pin-expired")

        try? await Task.sleep(nanoseconds: 200_000_000)

        let pinned = await CacheCoordinator.shared.video.isPinned(videoURL)
        XCTAssertFalse(pinned, "An already-expired story must not leave a pin behind")
    }

    func test_markViewed_preservesAllStoryFields() {
        // markViewed ne doit poser QUE isViewed=true. Avant le fix il reconstruisait
        // le StoryItem via un init partiel → ~13 champs (translations, réactions,
        // chaîne de repost, audio, compteurs) retombaient à leur défaut nil/0.
        // Régressions : Prisme Linguistique cassé après visionnage, réaction perdue,
        // attribution de repost effacée — et persistStoryCache gravait l'état corrompu.
        let rich = StoryItem(
            id: "rich",
            content: "Bonjour",
            media: [],
            storyEffects: nil,
            createdAt: Date(timeIntervalSince1970: 1_000_000),
            expiresAt: Date(timeIntervalSince1970: 1_072_000),
            repostOfId: "parent-1",
            originalRepostOfId: "root-1",
            repostAuthorName: "alice",
            visibility: "PUBLIC",
            audioUrl: "https://cdn/audio.m4a",
            isViewed: false,
            translations: [StoryTranslation(language: "fr", content: "Bonjour")],
            backgroundAudio: nil,
            reactionCount: 7,
            commentCount: 3,
            shareCount: 2,
            viewCount: 42,
            repostCount: 5,
            currentUserReactions: ["❤️"]
        )
        let group = makeStoryGroup(userId: "u1", stories: [rich])
        sut.storyGroups = [group]

        sut.markViewed(storyId: "rich")

        let updated = sut.storyGroups[0].stories[0]
        XCTAssertTrue(updated.isViewed)
        XCTAssertEqual(updated.translations?.first?.content, "Bonjour", "translations préservées (Prisme)")
        XCTAssertEqual(updated.currentUserReactions, ["❤️"], "réaction utilisateur préservée")
        XCTAssertEqual(updated.reactionCount, 7)
        XCTAssertEqual(updated.commentCount, 3)
        XCTAssertEqual(updated.shareCount, 2)
        XCTAssertEqual(updated.viewCount, 42)
        XCTAssertEqual(updated.repostCount, 5)
        XCTAssertEqual(updated.repostOfId, "parent-1", "chaîne de repost préservée")
        XCTAssertEqual(updated.originalRepostOfId, "root-1")
        XCTAssertEqual(updated.repostAuthorName, "alice")
        XCTAssertEqual(updated.audioUrl, "https://cdn/audio.m4a")
        XCTAssertEqual(updated.visibility, "PUBLIC")
    }

    // MARK: - Tray re-sort tests (sortStoryGroupsInPlace)

    /// Regression for the bug where an existing author posting a new story did
    /// NOT bubble their group back to the top of the tray. The pre-fix sink
    /// only mutated `storyGroups[idx]` in place — the slot index was frozen.
    func test_socketStoryCreated_promotesExistingAuthorToFrontOfTray() async {
        // Two friends, both with unviewed stories so the only tie-break is
        // latestStory.createdAt desc. Bob's latest is more recent than alice's
        // initial story, so Bob sits at index 0 at startup.
        let aliceOldStory = makeStoryItem(
            id: "alice-old",
            isViewed: false,
            createdAt: Date(timeIntervalSince1970: 1_000_000)
        )
        let bobStory = makeStoryItem(
            id: "bob",
            isViewed: false,
            createdAt: Date(timeIntervalSince1970: 1_500_000)
        )
        sut.storyGroups = [
            makeStoryGroup(userId: "bob", username: "bob", stories: [bobStory]),
            makeStoryGroup(userId: "alice", username: "alice", stories: [aliceOldStory]),
        ]

        sut.subscribeToSocketEvents()

        // Alice posts a brand new story, more recent than Bob's.
        let aliceFreshPost = Self.makeStoryAPIPost(
            id: "alice-fresh",
            authorId: "alice",
            authorUsername: "alice",
            createdAt: "2026-01-15T13:00:00.000Z"
        )
        mockSocket.storyCreated.send(aliceFreshPost)
        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(sut.storyGroups.count, 2)
        XCTAssertEqual(
            sut.storyGroups[0].id, "alice",
            "Alice should bubble to index 0 because her latest story is now the most recent across all unviewed groups"
        )
        XCTAssertEqual(sut.storyGroups[0].stories.count, 2, "Alice keeps both stories")
        XCTAssertEqual(
            sut.storyGroups[0].stories.last?.id, "alice-fresh",
            "Per-group order stays ascending by createdAt so `latestStory` (stories.last) points to the freshest"
        )
    }

    /// Unviewed groups always sit above all-viewed groups, regardless of
    /// per-story timestamps. New groups must respect that ordering too — not
    /// just be plopped at index 0.
    func test_socketStoryCreated_newGroupRespectsUnviewedPriorityOverViewedRecent() async {
        // Carol's existing story was already seen, but it's the most recent
        // by createdAt. Without `sortStoryGroupsInPlace`, a newly arriving
        // group with an unviewed but older story would still be inserted at
        // index 0 — which is the bug. With it, Carol stays in front only if
        // she still has unviewed content. Test the inverse here: Carol is
        // all-viewed, Alice posts a new unviewed older story → Alice goes on
        // top because hasUnviewed beats createdAt.
        let carolViewedRecent = makeStoryItem(
            id: "carol",
            isViewed: true,
            createdAt: Date(timeIntervalSince1970: 2_000_000)
        )
        sut.storyGroups = [
            makeStoryGroup(userId: "carol", username: "carol", stories: [carolViewedRecent]),
        ]

        sut.subscribeToSocketEvents()

        let aliceNewerButOlderPost = Self.makeStoryAPIPost(
            id: "alice-new",
            authorId: "alice",
            authorUsername: "alice",
            createdAt: "2026-01-10T12:00:00.000Z" // older than carol's timestamp
        )
        mockSocket.storyCreated.send(aliceNewerButOlderPost)
        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(sut.storyGroups.count, 2)
        XCTAssertEqual(
            sut.storyGroups[0].id, "alice",
            "Alice (unviewed) must outrank carol (viewed) even though carol's story is more recent"
        )
        XCTAssertEqual(sut.storyGroups[1].id, "carol")
    }

    /// When a remote `story:deleted` removes the last unviewed story of a
    /// group, that group must drop below remaining unviewed peers on the
    /// next sort pass (same invariant as storyViewed, but the trigger is
    /// removal instead of transition).
    func test_socketStoryDeleted_rebalancesTrayAfterUnviewedStoryGone() async {
        // Alice has 2 stories: one viewed (old), one unviewed (recent) →
        // group is hasUnviewed=true and sits in front of Bob's all-viewed
        // group. When the unviewed story is deleted remotely, alice goes
        // all-viewed and Bob takes the front slot.
        let aliceViewed = makeStoryItem(
            id: "alice-viewed",
            isViewed: true,
            createdAt: Date(timeIntervalSince1970: 1_000_000)
        )
        let aliceUnviewed = makeStoryItem(
            id: "alice-unviewed-target",
            isViewed: false,
            createdAt: Date(timeIntervalSince1970: 2_000_000)
        )
        let bobViewed = makeStoryItem(
            id: "bob-viewed",
            isViewed: true,
            createdAt: Date(timeIntervalSince1970: 1_500_000)
        )
        sut.storyGroups = [
            makeStoryGroup(userId: "alice", username: "alice", stories: [aliceViewed, aliceUnviewed]),
            makeStoryGroup(userId: "bob", username: "bob", stories: [bobViewed]),
        ]

        sut.subscribeToSocketEvents()

        let deletedData: SocketStoryDeletedData = JSONStub.decode("""
        {"storyId":"alice-unviewed-target","authorId":"alice"}
        """)
        mockSocket.storyDeleted.send(deletedData)
        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertEqual(sut.storyGroups.count, 2, "Alice still has remaining story → group not removed")
        XCTAssertEqual(
            sut.storyGroups[0].id, "bob",
            "Both groups now all-viewed; bob's latest (1_500_000) outranks alice's surviving story (1_000_000)"
        )
        XCTAssertFalse(sut.storyGroups[0].hasUnviewed)
        XCTAssertFalse(sut.storyGroups[1].hasUnviewed)
    }

    /// When the last unviewed story of a group is marked as viewed, the group
    /// must drop below any remaining unviewed group on the next sort pass.
    func test_socketStoryViewed_dropsAllViewedGroupBelowUnviewedPeers() async {
        let aliceStory = makeStoryItem(id: "alice-1", isViewed: false,
                                       createdAt: Date(timeIntervalSince1970: 2_500_000))
        let bobStory = makeStoryItem(id: "bob-1", isViewed: false,
                                     createdAt: Date(timeIntervalSince1970: 1_000_000))
        // Alice on top initially (both unviewed, alice more recent).
        sut.storyGroups = [
            makeStoryGroup(userId: "alice", username: "alice", stories: [aliceStory]),
            makeStoryGroup(userId: "bob", username: "bob", stories: [bobStory]),
        ]

        sut.subscribeToSocketEvents()

        // Mark Alice's only story as viewed → alice.hasUnviewed flips to false,
        // bob is still unviewed → bob takes the front slot. `SocketStoryViewedData`
        // is a `Decodable`-only struct (no public memberwise init), so we
        // synthesize it via the JSON path the live socket would actually use.
        let viewedData: SocketStoryViewedData = JSONStub.decode("""
        {"storyId":"alice-1","viewerId":"me","viewerUsername":"me","viewCount":1}
        """)
        mockSocket.storyViewed.send(viewedData)
        try? await Task.sleep(nanoseconds: 100_000_000)

        XCTAssertTrue(sut.storyGroups[0].id == "bob",
                      "Bob keeps unviewed content so he must outrank the now-all-viewed Alice")
        XCTAssertFalse(sut.storyGroups[1].hasUnviewed,
                       "Alice's group is now fully viewed")
    }

    // MARK: - StoryCoverThumbnail (local-first tray cover, hybrid Phase 1)

    func test_storyCoverThumbnail_cacheKey_isSyntheticAndStoryScoped() {
        XCTAssertEqual(StoryCoverThumbnail.cacheKey(storyId: "abc123"), "story-cover:abc123")
        // Distinct per story so covers never collide; synthetic scheme so it never
        // collides with a media-URL cache entry.
        XCTAssertNotEqual(StoryCoverThumbnail.cacheKey(storyId: "a"),
                          StoryCoverThumbnail.cacheKey(storyId: "b"))
    }

    func test_preferredCoverURL_prefersLocalComposite_overServerThumbnail() {
        let local = URL(fileURLWithPath: "/tmp/story-cover.jpg")
        let resolved = StoryCoverThumbnail.preferredCoverURLString(
            localCover: local, serverThumbnailUrl: "https://cdn/x.jpg",
            mediaUrl: "https://cdn/raw.mp4", mediaIsImage: false, avatarURL: "https://cdn/avatar.png")
        XCTAssertEqual(resolved, local.absoluteString,
                       "local composite (captures text/drawing) must win over the server thumbnail")
    }

    func test_preferredCoverURL_fallbackChain_whenNoLocalCover() {
        // server thumb wins when no local cover
        XCTAssertEqual(
            StoryCoverThumbnail.preferredCoverURLString(
                localCover: nil, serverThumbnailUrl: "https://cdn/thumb.jpg",
                mediaUrl: "https://cdn/raw.mp4", mediaIsImage: false, avatarURL: "av"),
            "https://cdn/thumb.jpg")
        // empty server thumb is skipped → image media url
        XCTAssertEqual(
            StoryCoverThumbnail.preferredCoverURLString(
                localCover: nil, serverThumbnailUrl: "",
                mediaUrl: "https://cdn/raw.jpg", mediaIsImage: true, avatarURL: "av"),
            "https://cdn/raw.jpg")
        // nothing but avatar
        XCTAssertEqual(
            StoryCoverThumbnail.preferredCoverURLString(
                localCover: nil, serverThumbnailUrl: nil, mediaUrl: nil, mediaIsImage: false, avatarURL: "av"),
            "av")
    }

    func test_preferredCoverURL_videoWithoutThumbnail_skipsMediaURL_fallsBackToAvatar() {
        // A video mediaUrl is never decodable by CachedAvatarImage — must not be
        // used as the tray cover, even when there is no server thumbnail.
        XCTAssertEqual(
            StoryCoverThumbnail.preferredCoverURLString(
                localCover: nil, serverThumbnailUrl: nil,
                mediaUrl: "https://cdn/raw.mp4", mediaIsImage: false, avatarURL: "https://cdn/avatar.png"),
            "https://cdn/avatar.png",
            "video without a thumbnail must fall through to the avatar, never the raw mp4 URL")
    }

    func test_preferredCoverURL_imageWithoutThumbnail_usesMediaURL() {
        XCTAssertEqual(
            StoryCoverThumbnail.preferredCoverURLString(
                localCover: nil, serverThumbnailUrl: nil,
                mediaUrl: "https://cdn/raw.jpg", mediaIsImage: true, avatarURL: "https://cdn/avatar.png"),
            "https://cdn/raw.jpg",
            "image without a thumbnail can safely use the raw (decodable) media URL")
    }

    // MARK: - ReceiverCoverPlan (aperçu à la volée côté récepteur)

    func test_receiverCoverPlan_textOnColoredBackground_isRenderableWithoutAnyImage() {
        var fx = StoryEffects()
        fx.background = "FF5733"
        let plan = StoryCoverThumbnail.receiverCoverPlan(
            for: makeReceiverStory(media: [FeedMedia(id: "m-audio", type: .audio, url: "https://cdn/voice.m4a")], effects: fx))

        XCTAssertNotNil(plan, "texte/fond coloré + audio : la composition est dérivable sans aucune image")
        XCTAssertNil(plan?.legacyBackgroundURL)
        XCTAssertEqual(plan?.imageURLsByObjectId, [:])
        XCTAssertEqual(plan?.requiredObjectIds, [])
    }

    func test_receiverCoverPlan_modernImageBackground_requiresItsImage() {
        var fx = StoryEffects()
        var bg = StoryMediaObject(id: "obj-bg", mediaURL: "https://cdn/bg.jpg", kind: .image, aspectRatio: 1.0)
        bg.isBackground = true
        fx.mediaObjects = [bg]
        let plan = StoryCoverThumbnail.receiverCoverPlan(for: makeReceiverStory(effects: fx))

        XCTAssertEqual(plan?.imageURLsByObjectId["obj-bg"], "https://cdn/bg.jpg")
        XCTAssertEqual(plan?.requiredObjectIds, ["obj-bg"],
                       "le fond moderne est la couche dominante : sans son image, pas de cover")
    }

    func test_receiverCoverPlan_videoBackground_isNotRenderable() {
        var fx = StoryEffects()
        var bg = StoryMediaObject(id: "obj-bg", mediaURL: "https://cdn/bg.mp4", kind: .video, aspectRatio: 1.0)
        bg.isBackground = true
        fx.mediaObjects = [bg]
        XCTAssertNil(StoryCoverThumbnail.receiverCoverPlan(for: makeReceiverStory(effects: fx)),
                     "fond vidéo : pas de poster frame côté récepteur — laisser la chaîne existante décider")

        var colorFx = StoryEffects()
        colorFx.background = "112233"
        XCTAssertNil(
            StoryCoverThumbnail.receiverCoverPlan(
                for: makeReceiverStory(media: [FeedMedia(id: "m-v", type: .video, url: "https://cdn/raw.mp4")], effects: colorFx)),
            "fond legacy vidéo : idem, jamais de cover sans la couche dominante")
    }

    func test_receiverCoverPlan_legacyImageBackground_fillsBgImageSlot() {
        var fx = StoryEffects()
        fx.background = "000000"
        let plan = StoryCoverThumbnail.receiverCoverPlan(
            for: makeReceiverStory(media: [FeedMedia(id: "m-bg", type: .image, url: "https://cdn/legacy.jpg")], effects: fx))

        XCTAssertEqual(plan?.legacyBackgroundURL, "https://cdn/legacy.jpg")
        XCTAssertEqual(plan?.requiredObjectIds, [])
    }

    func test_receiverCoverPlan_imageSticker_loadsItsPostMediaUnderTheElementId() {
        var fx = StoryEffects()
        fx.background = "101010"
        fx.stickerObjects = [StorySticker(id: "st-1", emoji: "🖼️", postMediaId: "pm-sticker")]
        let plan = StoryCoverThumbnail.receiverCoverPlan(
            for: makeReceiverStory(
                media: [FeedMedia(id: "pm-sticker", type: .image, url: "https://cdn/sticker.png")],
                effects: fx))

        XCTAssertEqual(plan?.imageURLsByObjectId["st-1"], "https://cdn/sticker.png",
                       "l'image d'un sticker entre par le MÊME slot que les autres médias, keyée par id d'élément")
        XCTAssertEqual(plan?.requiredObjectIds, [],
                       "jamais indispensable : sans elle le renderer peint l'emoji de repli, ce qui vaut mieux que pas de cover")
    }

    func test_receiverCoverPlan_emojiSticker_loadsNothing() {
        var fx = StoryEffects()
        fx.background = "101010"
        fx.stickerObjects = [StorySticker(id: "st-1", emoji: "🔥")]
        let plan = StoryCoverThumbnail.receiverCoverPlan(
            for: makeReceiverStory(
                media: [FeedMedia(id: "pm-other", type: .image, url: "https://cdn/other.png")],
                effects: fx))

        XCTAssertEqual(plan?.imageURLsByObjectId, [:],
                       "un sticker emoji n'a aucune image à charger")
    }

    func test_receiverCoverPlan_stickerMedia_isNeverMistakenForTheLegacyBackground() {
        var fx = StoryEffects()
        fx.background = "101010"
        fx.stickerObjects = [StorySticker(id: "st-1", emoji: "🖼️", postMediaId: "pm-sticker")]
        let plan = StoryCoverThumbnail.receiverCoverPlan(
            for: makeReceiverStory(
                media: [FeedMedia(id: "pm-sticker", type: .image, url: "https://cdn/sticker.png")],
                effects: fx))

        XCTAssertNil(plan?.legacyBackgroundURL,
                     "l'image d'un sticker est attachée au post comme les autres : la prendre pour le fond la peindrait PLEIN CADRE derrière la composition")
        XCTAssertEqual(plan?.imageURLsByObjectId["st-1"], "https://cdn/sticker.png",
                       "elle reste chargée — à sa place, celle du sticker")
    }

    func test_receiverCoverPlan_stickerWhosePostMediaIsMissing_stillYieldsACover() {
        var fx = StoryEffects()
        fx.background = "101010"
        fx.stickerObjects = [StorySticker(id: "st-1", emoji: "🖼️", postMediaId: "pm-vanished")]
        let plan = StoryCoverThumbnail.receiverCoverPlan(for: makeReceiverStory(effects: fx))

        XCTAssertNotNil(plan, "un média de sticker introuvable ne doit pas priver la story de sa cover")
        XCTAssertEqual(plan?.imageURLsByObjectId, [:])
    }

    func test_receiverCoverPlan_withoutEffects_isNil() {
        XCTAssertNil(StoryCoverThumbnail.receiverCoverPlan(for: makeReceiverStory(effects: nil)))
    }

    func test_receiverCoverCandidates_skipLastStoriesAlreadyCovered() {
        let coveredLast = makeStoryItem(id: "covered-last")
        let uncoveredLast = makeStoryItem(id: "uncovered-last")
        let groups = [
            makeStoryGroup(userId: "u1", stories: [makeStoryItem(id: "u1-old"), coveredLast]),
            makeStoryGroup(userId: "u2", username: "bob", stories: [uncoveredLast])
        ]

        let candidates = StoryCoverThumbnail.receiverCoverCandidates(
            groups: groups, hasLocalCover: { $0 == "covered-last" })

        XCTAssertEqual(candidates.map(\.id), ["uncovered-last"],
                       "seule la DERNIÈRE story de chaque groupe compte, et jamais celles déjà couvertes")
    }

    // MARK: - mediaURLStrings (prefetch dedup — extraction pure)

    func test_mediaURLStrings_extractsAndDeduplicatesMediaURLs() {
        let media = [
            FeedMedia(id: "m-bg", type: .image, url: "https://cdn/bg.jpg"),
            FeedMedia(id: "m-fg", type: .video, url: "https://cdn/fg.mp4"),
            FeedMedia(id: "m-dup", type: .image, url: "https://cdn/bg.jpg") // doublon d'URL
        ]
        let item = StoryItem(id: "s1", media: media, storyEffects: nil, createdAt: Date())

        let urls = Set(StoryViewModel.mediaURLStrings(for: item))

        XCTAssertEqual(urls, ["https://cdn/bg.jpg", "https://cdn/fg.mp4"],
                       "URLs média extraites et dédupliquées")
    }

    func test_mediaURLStrings_emptyMedia_returnsEmpty() {
        let item = StoryItem(id: "s1", media: [], storyEffects: nil, createdAt: Date())
        XCTAssertTrue(StoryViewModel.mediaURLStrings(for: item).isEmpty)
    }

    // MARK: - Garde « viewed monotone » raffinée (édition de story, 2026-07-29)

    //
    // Une fois vue localement, une story reste vue même si le serveur (laggé)
    // dit le contraire — SAUF quand son contenu a été édité APRÈS la vue
    // locale : le serveur a alors volontairement effacé les vues (reset
    // d'engagement) et la story redevient légitimement non-vue.

    func test_shouldKeepLocalViewed_noContentEdit_keepsViewed() {
        XCTAssertTrue(StoryViewModel.shouldKeepLocalViewed(
            localViewedAt: Date(), contentEditedAt: nil))
        XCTAssertTrue(StoryViewModel.shouldKeepLocalViewed(
            localViewedAt: nil, contentEditedAt: nil))
    }

    func test_shouldKeepLocalViewed_editAfterLocalView_yieldsToServer() {
        let viewedAt = Date(timeIntervalSinceNow: -3600)
        let editedAt = Date()
        XCTAssertFalse(StoryViewModel.shouldKeepLocalViewed(
            localViewedAt: viewedAt, contentEditedAt: editedAt),
            "Édition postérieure à la vue → la story redevient non-vue")
    }

    func test_shouldKeepLocalViewed_viewAfterEdit_keepsViewed() {
        let editedAt = Date(timeIntervalSinceNow: -3600)
        let viewedAt = Date()
        XCTAssertTrue(StoryViewModel.shouldKeepLocalViewed(
            localViewedAt: viewedAt, contentEditedAt: editedAt),
            "Une vue POSTÉRIEURE à l'édition reste acquise (re-vue de la nouvelle version)")
    }

    func test_shouldKeepLocalViewed_editedButNoLocalTimestamp_yieldsToServer() {
        XCTAssertFalse(StoryViewModel.shouldKeepLocalViewed(
            localViewedAt: nil, contentEditedAt: Date(timeIntervalSinceNow: -60)),
            "Vue sans horodatage (cache legacy) : impossible de prouver qu'elle est postérieure à l'édition → la vérité serveur gagne")
    }

    func test_insertOrMergeStoryGroups_replacing_contentEditedAfterView_resetsViewed() {
        let viewedAt = Date(timeIntervalSinceNow: -3600)
        var local = makeStoryItem(id: "s-edit")
        local.isViewed = true
        local.viewedAt = viewedAt
        sut.storyGroups = [makeStoryGroup(userId: "author-1", username: "alice", stories: [local])]

        var incoming = makeStoryItem(id: "s-edit")
        incoming.isViewed = false
        incoming.contentEditedAt = Date()
        sut.insertOrMergeStoryGroups(
            [makeStoryGroup(userId: "author-1", username: "alice", stories: [incoming])],
            replacingExisting: true
        )

        XCTAssertEqual(sut.storyGroups.first?.stories.first?.isViewed, false,
                       "Le reset d'engagement fait céder la monotonie : la story redevient non-vue")
    }

    func test_insertOrMergeStoryGroups_replacing_noContentEdit_staysViewed() {
        var local = makeStoryItem(id: "s-lag")
        local.isViewed = true
        local.viewedAt = Date()
        sut.storyGroups = [makeStoryGroup(userId: "author-1", username: "alice", stories: [local])]

        var incoming = makeStoryItem(id: "s-lag")
        incoming.isViewed = false
        sut.insertOrMergeStoryGroups(
            [makeStoryGroup(userId: "author-1", username: "alice", stories: [incoming])],
            replacingExisting: true
        )

        XCTAssertEqual(sut.storyGroups.first?.stories.first?.isViewed, true,
                       "Sans édition de contenu, le lag serveur ne dévisse jamais l'état vu local")
    }

    func test_insertOrMergeStoryGroups_replacing_ownStory_neverResetsViewed() {
        let previous = AuthManager.shared.currentUser
        defer { AuthManager.shared.currentUser = previous }
        AuthManager.shared.currentUser = MeeshyUser(id: "me-id", username: "me", displayName: "Moi")

        var local = makeStoryItem(id: "s-mine")
        local.isViewed = true
        local.viewedAt = Date(timeIntervalSinceNow: -3600)
        sut.storyGroups = [makeStoryGroup(userId: "me-id", username: "Moi", stories: [local])]

        var incoming = makeStoryItem(id: "s-mine")
        incoming.isViewed = false
        incoming.contentEditedAt = Date()
        sut.insertOrMergeStoryGroups(
            [makeStoryGroup(userId: "me-id", username: "Moi", stories: [incoming])],
            replacingExisting: true
        )

        XCTAssertEqual(sut.storyGroups.first?.stories.first?.isViewed, true,
                       "L'état « vu » de ses PROPRES stories est client-only (recordView exclut l'auteur) — jamais dévissé")
    }

    // MARK: - BW-IOS-02 : politique d'auto-téléchargement du préchargement de stories

    /// Le préchargement du tray tirait le corps MP4 ENTIER sans consulter
    /// `MediaDownloadPolicyEngine` : « Vidéo : Wi-Fi uniquement » — le RÉGLAGE
    /// PAR DÉFAUT — n'avait aucun effet en cellulaire.
    func test_shouldPrefetchStoryMedia_videoOnCellularWithWifiOnlyPolicy_returnsFalse() {
        let allowVideo = MediaDownloadPolicyEngine.shouldAutoDownload(
            kind: .video, condition: .goodCellular, prefs: .defaults
        )

        XCTAssertFalse(StoryTrayMediaPreloader.shouldPrefetchStoryMedia(
            kind: .video, allowImage: true, allowVideo: allowVideo, allowAudio: true
        ), "prefs.video vaut .wifiOnly par défaut : aucun octet vidéo en cellulaire")
    }

    func test_shouldPrefetchStoryMedia_videoOnWifi_returnsTrue() {
        let allowVideo = MediaDownloadPolicyEngine.shouldAutoDownload(
            kind: .video, condition: .wifi, prefs: .defaults
        )

        XCTAssertTrue(StoryTrayMediaPreloader.shouldPrefetchStoryMedia(
            kind: .video, allowImage: false, allowVideo: allowVideo, allowAudio: false
        ), "en Wi-Fi, rien ne change : l'ouverture d'une story vidéo reste instantanée")
    }

    func test_shouldPrefetchStoryMedia_imageOnGoodCellularWithDefaults_returnsTrue() {
        let allowImage = MediaDownloadPolicyEngine.shouldAutoDownload(
            kind: .image, condition: .goodCellular, prefs: .defaults
        )

        XCTAssertTrue(StoryTrayMediaPreloader.shouldPrefetchStoryMedia(
            kind: .image, allowImage: allowImage, allowVideo: false, allowAudio: false
        ), "prefs.image vaut .wifiAndGoodCellular par défaut : la vignette passe")
    }

    /// Axe propre à la story (la jumelle du carousel de bulle n'a que
    /// image/vidéo) : un vocal de story suit `prefs.audio`, jamais `prefs.image`.
    func test_shouldPrefetchStoryMedia_audio_gatedOnAllowAudio() {
        XCTAssertTrue(StoryTrayMediaPreloader.shouldPrefetchStoryMedia(
            kind: .audio, allowImage: false, allowVideo: false, allowAudio: true
        ))
        XCTAssertFalse(StoryTrayMediaPreloader.shouldPrefetchStoryMedia(
            kind: .audio, allowImage: true, allowVideo: true, allowAudio: false
        ))
    }

    // MARK: - #11868 — le préchargement du tray s'arrête hors du premier plan

    /// Les URL sont RÉCLAMÉES avant d'être téléchargées : une passe que l'app
    /// interrompt en quittant le premier plan doit les rendre, sinon le retour
    /// les saute pour toute la session. Au retour, la passe repart et les
    /// redemande.
    func test_trayPreload_interruptedByLeavingTheForeground_returnsItsClaims_andReplaysOnReturn() async {
        let gate = PreloadActivityGate(isActive: true)
        let recorder = TrayFetchRecorder()
        let preloader = StoryTrayMediaPreloader(activity: gate, fetch: { urls, _, _ in
            await recorder.started(urls)
            _ = await cancellableSleep(for: .seconds(30))
            return []
        })
        let url = "https://cdn.example.invalid/tray-\(UUID().uuidString).jpg"
        preloader.preload([makeStoryGroup(stories: [trayStory("s1", urls: [url])])])

        await eventually { recorder.calls.count == 1 }
        XCTAssertEqual(preloader.claimedURLs, [url])

        gate.setActive(false)
        await eventually { preloader.claimedURLs.isEmpty }
        XCTAssertTrue(preloader.claimedURLs.isEmpty, "la passe interrompue rend ce qu'elle avait réclamé")

        gate.setActive(true)
        await eventually { recorder.calls.count == 2 }
        XCTAssertEqual(recorder.calls.last, [url], "au retour, la passe redemande l'URL rendue")
        preloader.cancel()
    }

    /// Une passe ACHEVÉE garde ce qu'elle a servi (dédup de session) et rend ce
    /// que la politique d'auto-téléchargement a sauté.
    func test_trayPreload_completedPass_keepsWhatItServed_andReturnsWhatThePolicySkipped() async {
        let gate = PreloadActivityGate(isActive: true)
        let served = "https://cdn.example.invalid/served-\(UUID().uuidString).jpg"
        let skipped = "https://cdn.example.invalid/skipped-\(UUID().uuidString).jpg"
        let preloader = StoryTrayMediaPreloader(activity: gate, fetch: { urls, _, _ in
            urls.filter { $0 == skipped }
        })
        preloader.preload([makeStoryGroup(stories: [trayStory("s1", urls: [served, skipped])])])

        await eventually { preloader.claimedURLs == [served] }
        XCTAssertEqual(preloader.claimedURLs, [served])
    }

    /// Hors du premier plan, aucune passe ne commence.
    func test_trayPreload_whileInactive_fetchesNothing() async {
        let gate = PreloadActivityGate(isActive: false)
        let recorder = TrayFetchRecorder()
        let preloader = StoryTrayMediaPreloader(activity: gate, fetch: { urls, _, _ in
            await recorder.started(urls)
            return []
        })
        preloader.preload([makeStoryGroup(stories: [trayStory("s1", urls: ["https://cdn.example.invalid/idle.jpg"])])])

        _ = await cancellableSleep(for: .milliseconds(200))
        XCTAssertTrue(recorder.calls.isEmpty)
        XCTAssertTrue(preloader.claimedURLs.isEmpty)
        preloader.cancel()
    }

    // MARK: - Source guard — le prefetch consulte bien la politique (câblage, pas seulement la table de vérité)

    /// Les tests `test_shouldPrefetchStoryMedia_*` ci-dessus couvrent la table
    /// de vérité du prédicat PUR, jamais son câblage : supprimer le
    /// `guard Self.shouldPrefetchStoryMedia(…) else { … }` dans
    /// `prefetchStoryMediaURLs` les laisserait tous verts alors que le défaut
    /// BW-IOS-02 serait entièrement rétabli. Garde de SOURCE visant le BLOC de
    /// la fonction (jamais le fichier entier), équilibrée par accolades via
    /// `DeclarationBodyScanner` — insensible aux commentaires ajoutés au-dessus.
    func test_prefetchStoryMediaURLs_blockConsultsTheDownloadPolicy() throws {
        // Lit l'UNITÉ (#4425), pas le seul fichier `StoryViewModel.swift` :
        // `prefetchStoryMediaURLs` peut vivre dans un fichier frère
        // (`StoryViewModel+MediaPreload.swift`) depuis le découpage — une
        // lecture bornée au fichier historique ne trouverait plus son corps,
        // et cette garde de câblage ne mesurerait plus rien.
        let source = AppSourceGuard.stripComments(try AppSourceGuard.storyViewModelSource())

        guard let body = DeclarationBodyScanner.body(containing: "private static func prefetchStoryMediaURLs(", in: source) else {
            XCTFail("prefetchStoryMediaURLs body not found — StoryViewModel's unit changed shape, update this guard's anchor.")
            return
        }

        XCTAssertTrue(
            body.contains("shouldPrefetchStoryMedia("),
            "prefetchStoryMediaURLs must consult StoryTrayMediaPreloader.shouldPrefetchStoryMedia(...) before touching a URL — " +
            "otherwise the truth-table tests above stay green while the download policy is silently bypassed."
        )
    }
}
