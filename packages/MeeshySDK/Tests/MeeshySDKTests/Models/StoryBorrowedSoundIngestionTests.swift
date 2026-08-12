import XCTest
@testable import MeeshySDK

/// Pinning de l'ingestion tray pour une story TEXTE + SON EMPRUNTÉ (cas prod
/// 2026-08-02, post 6a6ef0b44415c63ff8da7855) : `media` VIDE, pas d'attachment,
/// `storyEffects.audioPlayerObjects = [{soundId, mediaURL, postMediaId: ""}]`.
/// Hypothèse investiguée : « un filtre "story sans média" la jetterait du
/// tray » — ces tests verrouillent le contrat inverse : `toStoryGroups` ne
/// conditionne JAMAIS l'ingestion à la présence d'un média propre, et le son
/// emprunté traverse la conversion intact (le reader le résout par repli sur
/// `mediaURL`, cf. StoryCanvasUIView+Audio).
final class StoryBorrowedSoundIngestionTests: XCTestCase {

    private func makeBorrowedSoundStoryPost(
        id: String = "6a6ef0b44415c63ff8da7855",
        createdAt: Date = Date(timeIntervalSince1970: 1_785_000_000),
        expiresAt: Date? = nil
    ) -> APIPost {
        let author = APIAuthor(id: "68f2a81417a557e8ce4ddfbc", username: "meeshy",
                               displayName: "meeshy sama", avatar: nil)
        let borrowedSound = StoryAudioPlayerObject(
            postMediaId: "",
            placement: "overlay",
            isBackground: true,
            sourceLanguage: "fr",
            name: "Meeshy Go",
            mediaURL: "/api/v1/static/story_audio_d6f9e572-77d0-4dc2-b281-49bf47f1e222.m4a",
            soundId: "6a6eae0096472a70b2a3b663",
            soundAuthorUsername: "meeshy"
        )
        var effects = StoryEffects(background: "D2C9F4")
        effects.audioPlayerObjects = [borrowedSound]
        return APIPost(
            id: id, type: "STORY", visibility: "PUBLIC", visibilityUserIds: nil,
            content: "Meeshy Go", originalLanguage: "fr",
            createdAt: createdAt, updatedAt: createdAt, expiresAt: expiresAt,
            author: author, likeCount: 0, commentCount: 0, repostCount: 0,
            viewCount: 0, postOpenCount: nil, qualifiedViewCount: nil, playCount: nil,
            bookmarkCount: 0, shareCount: 0, reactionSummary: nil,
            isPinned: false, isEdited: false, media: nil, comments: nil,
            repostOf: nil, originalRepostOfId: nil, isQuote: false,
            moodEmoji: nil, audioUrl: nil, audioDuration: nil, storyEffects: effects,
            translations: nil, isLikedByMe: nil, isBookmarkedByMe: nil,
            isRepostedByMe: nil, isViewedByMe: nil, currentUserReactions: nil,
            mentionedUsers: nil, viaUsername: nil
        )
    }

    func test_toStoryGroups_textOnlyStoryWithBorrowedSound_isNotFiltered() {
        let groups = [makeBorrowedSoundStoryPost()].toStoryGroups()

        XCTAssertEqual(groups.count, 1)
        XCTAssertEqual(groups.first?.stories.count, 1)
        XCTAssertEqual(groups.first?.stories.first?.id, "6a6ef0b44415c63ff8da7855")
        XCTAssertEqual(groups.first?.stories.first?.content, "Meeshy Go")
        XCTAssertEqual(groups.first?.stories.first?.media.count, 0)
    }

    func test_toStoryGroups_preservesBorrowedSoundReference() {
        let groups = [makeBorrowedSoundStoryPost()].toStoryGroups()

        let audio = groups.first?.stories.first?.storyEffects?.audioPlayerObjects?.first
        XCTAssertNotNil(audio)
        XCTAssertEqual(audio?.soundId, "6a6eae0096472a70b2a3b663")
        XCTAssertEqual(audio?.postMediaId, "")
        XCTAssertEqual(audio?.mediaURL,
                       "/api/v1/static/story_audio_d6f9e572-77d0-4dc2-b281-49bf47f1e222.m4a")
        XCTAssertEqual(audio?.isBackground, true)
    }

    func test_toStoryGroups_missingExpiresAt_fallsBackToPublicWindow_notDeadOnArrival() {
        let createdAt = Date(timeIntervalSince1970: 1_785_000_000)
        let groups = [makeBorrowedSoundStoryPost(createdAt: createdAt, expiresAt: nil)].toStoryGroups()

        let item = groups.first?.stories.first
        XCTAssertNotNil(item?.expiresAt)
        // La MÊME constante que la prod (pas un Calendar local, dépendant du
        // fuseau du runner) : le fallback est un intervalle absolu depuis
        // createdAt, SSOT `StoryItem.defaultExpiryInterval` ↔ serveur
        // `EPHEMERAL_POST_TTL_HOURS.STORY`.
        let expected = createdAt.addingTimeInterval(StoryItem.defaultExpiryInterval)
        XCTAssertEqual(item?.expiresAt, expected)
        XCTAssertEqual(item?.isExpired(at: createdAt), false)
    }
}
