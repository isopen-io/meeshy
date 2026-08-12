import XCTest
@testable import MeeshySDK

/// Attribution d'une URL de média à un DOMAINE métier.
///
/// Les quatre stores disque (`images`, `audio`, `video`, `thumbnails`) sont
/// indexés par `SHA256(url)` : rien, dans le cache lui-même, ne dit si un
/// fichier appartient à une publication, un réel, une conversation ou une
/// story. L'attribution est donc DÉRIVÉE au moment de la mesure/purge, en
/// parcourant les payloads déjà en cache (GRDB) et en collectant leurs URLs.
///
/// Ces tests pinnent la partie PURE — celle qui décide « cette URL appartient
/// à ce domaine et vit dans ce store ». C'est là que se logent les erreurs
/// silencieuses : un réel compté comme publication, un média de canvas story
/// jamais collecté, un `.mp4` rangé dans le store images.
final class CacheMediaAttributionTests: XCTestCase {

    // MARK: - Publications vs réels

    /// Le seul discriminant est `FeedPost.type`. Un réel ne doit JAMAIS tomber
    /// dans le seau des publications, sinon « vider les vidéos des réels »
    /// laisserait le fichier en place.
    func test_reelVideo_isAttributedToReels_notPosts() {
        let reel = FeedPost(
            author: "alice",
            type: "REEL",
            content: "un réel",
            media: [FeedMedia(type: .video, url: "https://cdn.test/reel.mp4")]
        )

        let index = CacheMediaAttribution.index(feedPosts: [reel])

        XCTAssertEqual(index[.reels]?.videos, ["https://cdn.test/reel.mp4"])
        XCTAssertTrue(index[.posts]?.videos.isEmpty ?? true,
                      "La vidéo d'un réel ne doit pas être attribuée aux publications")
    }

    func test_plainPost_withNilType_isAttributedToPosts() {
        // `type` est nullable côté serveur : une publication ordinaire arrive
        // souvent sans type du tout. L'absence de type ne doit pas la faire
        // basculer du côté des réels.
        let post = FeedPost(
            author: "bob",
            type: nil,
            content: "une publication",
            media: [FeedMedia(type: .image, url: "https://cdn.test/photo.jpg")]
        )

        let index = CacheMediaAttribution.index(feedPosts: [post])

        XCTAssertEqual(index[.posts]?.images, ["https://cdn.test/photo.jpg"])
        XCTAssertTrue(index[.reels]?.images.isEmpty ?? true)
    }

    /// Le serveur n'normalise pas la casse — `isReel` du SDK compare en
    /// majuscules. L'attribution doit suivre la même règle.
    func test_reelType_isCaseInsensitive() {
        let reel = FeedPost(
            author: "alice",
            type: "reel",
            content: "minuscules",
            media: [FeedMedia(type: .video, url: "https://cdn.test/lower.mp4")]
        )

        let index = CacheMediaAttribution.index(feedPosts: [reel])

        XCTAssertEqual(index[.reels]?.videos, ["https://cdn.test/lower.mp4"],
                       "`reel` en minuscules doit être reconnu comme un réel")
    }

    // MARK: - Le type déclaré peut MENTIR

    /// Piège documenté dans le SDK (`StoryMediaStoreRouter`) : un `.mp4` peut
    /// arriver déclaré `image`. Il est alors téléchargé dans le store VIDÉO.
    /// Si l'attribution faisait confiance au type déclaré, la case « vidéos »
    /// ne trouverait jamais le fichier et la purge ne libérerait rien.
    func test_mp4DeclaredAsImage_isRoutedToVideoStore() {
        let post = FeedPost(
            author: "alice",
            type: "POST",
            content: "type déclaré menteur",
            media: [FeedMedia(type: .image, url: "https://cdn.test/menteur.mp4")]
        )

        let index = CacheMediaAttribution.index(feedPosts: [post])

        XCTAssertEqual(index[.posts]?.videos, ["https://cdn.test/menteur.mp4"],
                       "L'extension doit primer sur le type déclaré")
        XCTAssertTrue(index[.posts]?.images.isEmpty ?? true)
    }

    // MARK: - Médias dérivés (vignettes, audio traduits)

    func test_thumbnailUrl_isCollectedAsImage() {
        let post = FeedPost(
            author: "alice",
            type: "POST",
            content: "avec vignette",
            media: [FeedMedia(type: .video,
                              url: "https://cdn.test/clip.mp4",
                              thumbnailUrl: "https://cdn.test/clip-thumb.jpg")]
        )

        let index = CacheMediaAttribution.index(feedPosts: [post])

        XCTAssertEqual(index[.posts]?.videos, ["https://cdn.test/clip.mp4"])
        XCTAssertEqual(index[.posts]?.images, ["https://cdn.test/clip-thumb.jpg"],
                       "La vignette occupe sa propre entrée de cache et doit être comptée")
    }

    /// Les audios TTS traduits sont des fichiers distincts, souvent nombreux
    /// (un par langue). Les oublier sous-estimerait la taille libérable.
    func test_translatedAudios_areCollectedAsAudio() throws {
        let media = FeedMedia(
            type: .audio,
            url: "https://cdn.test/voice.m4a",
            translatedAudios: [
                makeTranslatedAudio(id: "t1", language: "en", url: "https://cdn.test/voice-en.m4a"),
                makeTranslatedAudio(id: "t2", language: "es", url: "https://cdn.test/voice-es.m4a")
            ]
        )
        let post = FeedPost(author: "alice", type: "POST", content: "vocal", media: [media])

        let index = CacheMediaAttribution.index(feedPosts: [post])

        let posts = try XCTUnwrap(index[.posts])
        XCTAssertEqual(
            posts.audio,
            Set(["https://cdn.test/voice.m4a",
                 "https://cdn.test/voice-en.m4a",
                 "https://cdn.test/voice-es.m4a"])
        )
    }

    // MARK: - Hygiène

    func test_nilAndEmptyURLs_areIgnored() {
        let post = FeedPost(
            author: "alice",
            type: "POST",
            content: "sans média exploitable",
            media: [
                FeedMedia(type: .image, url: nil),
                FeedMedia(type: .image, url: "")
            ]
        )

        let index = CacheMediaAttribution.index(feedPosts: [post])

        XCTAssertTrue(index[.posts]?.isEmpty ?? true,
                      "Une URL nulle ou vide ne doit produire aucune entrée")
    }

    // MARK: - Stories

    /// Un média de story peut vivre à QUATRE endroits distincts. Le canvas
    /// (`storyEffects`) est le plus facile à oublier : les objets média y
    /// portent leur propre `mediaURL`, indépendante de `StoryItem.media`.
    func test_storyCanvasMediaObjects_areCollected() {
        var effects = StoryEffects()
        effects.mediaObjects = [
            StoryMediaObject(postMediaId: "pm-1",
                             mediaURL: "https://cdn.test/canvas.mp4",
                             mediaType: "video",
                             aspectRatio: 1.0)
        ]
        let group = makeStoryGroup(items: [makeStoryItem(effects: effects)])

        let index = CacheMediaAttribution.index(storyGroups: [group])

        XCTAssertEqual(index.videos, ["https://cdn.test/canvas.mp4"],
                       "Le média du canvas doit être collecté")
    }

    func test_storyBackgroundAudio_isCollected() {
        let entry = StoryBackgroundAudioEntry(
            id: "bg-1", title: "Fond", uploaderName: "alice",
            duration: 30, fileUrl: "https://cdn.test/fond.mp3"
        )
        let group = makeStoryGroup(items: [makeStoryItem(backgroundAudio: entry)])

        let index = CacheMediaAttribution.index(storyGroups: [group])

        XCTAssertEqual(index.audio, ["https://cdn.test/fond.mp3"])
    }

    func test_storyAudioPlayerObjects_areCollected() {
        var effects = StoryEffects()
        effects.audioPlayerObjects = [
            StoryAudioPlayerObject(postMediaId: "pm-2", mediaURL: "https://cdn.test/piste.m4a")
        ]
        let group = makeStoryGroup(items: [makeStoryItem(effects: effects)])

        let index = CacheMediaAttribution.index(storyGroups: [group])

        XCTAssertEqual(index.audio, ["https://cdn.test/piste.m4a"])
    }

    // MARK: - Messages

    func test_messageAttachments_areRoutedByKind() {
        let image = makeAttachment(id: "a1", mimeType: "image/jpeg",
                                   fileUrl: "https://cdn.test/photo.jpg")
        let voice = makeAttachment(id: "a2", mimeType: "audio/mp4",
                                   fileUrl: "https://cdn.test/vocal.m4a")
        var message = TestFactories.makeMessage()
        message.attachments = [image, voice]

        let index = CacheMediaAttribution.index(messages: [message])

        XCTAssertEqual(index.images, ["https://cdn.test/photo.jpg"])
        XCTAssertEqual(index.audio, ["https://cdn.test/vocal.m4a"])
    }

    // MARK: - Fixtures

    private func makeStoryGroup(items: [StoryItem]) -> StoryGroup {
        StoryGroup(id: "g1", username: "alice", avatarColor: "4ECDC4",
                   avatarURL: nil, stories: items)
    }

    private func makeStoryItem(
        effects: StoryEffects? = nil,
        media: [FeedMedia] = [],
        backgroundAudio: StoryBackgroundAudioEntry? = nil
    ) -> StoryItem {
        StoryItem(
            id: "s1", content: nil, media: media, storyEffects: effects,
            createdAt: Date(), expiresAt: Date().addingTimeInterval(3600),
            repostOfId: nil, repostAuthorName: nil, isViewed: false,
            translations: nil, backgroundAudio: backgroundAudio,
            reactionCount: 0, commentCount: 0
        )
    }

    private func makeTranslatedAudio(id: String, language: String, url: String) -> MessageTranslatedAudio {
        MessageTranslatedAudio(
            id: id, attachmentId: "a1", targetLanguage: language, url: url,
            transcription: "", durationMs: 0, format: "m4a",
            cloned: false, quality: 1.0, ttsModel: "test"
        )
    }

    private func makeAttachment(id: String, mimeType: String, fileUrl: String) -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(
            id: id, fileName: "f", originalName: "f", mimeType: mimeType,
            fileSize: 1, filePath: "/f", fileUrl: fileUrl,
            uploadedBy: "u1", createdAt: Date()
        )
    }
}
