import Foundation
import Testing
@testable import MeeshySDK

@Suite("Le sol d'une scène sans fond : le dégradé de son auteur (#14258)")
struct StoryAuthorFloorTests {

    private func story(author: APIAuthor) -> APIPost {
        APIPost(
            id: "s1", type: "STORY", visibility: "PUBLIC", visibilityUserIds: nil, content: nil,
            originalLanguage: "fr", createdAt: Date(), updatedAt: nil, expiresAt: nil,
            author: author, likeCount: 0, commentCount: 0, repostCount: 0,
            viewCount: 0, postOpenCount: nil, qualifiedViewCount: nil, playCount: nil, bookmarkCount: 0, shareCount: 0, reactionSummary: nil,
            isPinned: false, isEdited: false, media: nil, comments: nil,
            repostOf: nil, originalRepostOfId: nil, isQuote: false,
            moodEmoji: nil, audioUrl: nil,
            audioDuration: nil, storyEffects: nil, translations: nil, isLikedByMe: nil,
            isBookmarkedByMe: nil, isRepostedByMe: nil,
            isViewedByMe: nil, currentUserReactions: nil, viaUsername: nil
        )
    }

    @Test("le dégradé d'auteur s'écrit de sa couleur vers le noir, dans la forme gradient")
    func authorGradientGoesToBlack() {
        let floor = StoryBackgroundValue.authorGradient("34D399")
        #expect(floor == .gradient("34D399", "000000"))
        #expect(floor?.serialized == "gradient:34D399:000000")
    }

    @Test("une couleur écrite avec un dièse se porte nue, en capitales")
    func hashedColourIsCarriedBare() {
        #expect(StoryBackgroundValue.authorGradient("#34d399") == .gradient("34D399", "000000"))
    }

    @Test("une couleur illisible ne donne aucun sol")
    func unreadableColourGivesNoFloor() {
        #expect(StoryBackgroundValue.authorGradient("nope") == nil)
        #expect(StoryBackgroundValue.authorGradient("") == nil)
        #expect(StoryBackgroundValue.authorGradient("FFF") == nil)
    }

    @Test("une scène sans fond se peint sur le dégradé de l'auteur")
    func sceneWithoutBackgroundReadsOnTheAuthorGradient() {
        #expect(StoryEffects().flooredOnAuthorGradient("EA580C").background == "gradient:EA580C:000000")
        var vide = StoryEffects()
        vide.background = ""
        #expect(vide.flooredOnAuthorGradient("EA580C").background == "gradient:EA580C:000000")
    }

    @Test("un fond choisi garde la main, et sans couleur d'auteur rien ne change")
    func chosenBackgroundWins() {
        var choisi = StoryEffects()
        choisi.background = "gradient:FF2E63:08D9D6"
        #expect(choisi.flooredOnAuthorGradient("EA580C").background == "gradient:FF2E63:08D9D6")
        #expect(StoryEffects().flooredOnAuthorGradient(nil).background == nil)
    }

    @Test("la couleur d'auteur d'un post est celle que la barre des stories donne au même auteur")
    func postAuthorColourIsTheStoryTrayColour() {
        let author = APIAuthor(id: "64b0000000000000000000aa", username: "recmod_m",
                               displayName: "Recette Mod", avatar: nil)
        let tray = [story(author: author)].toStoryGroups().first?.avatarColor

        #expect(story(author: author).toFeedPost().storyAccentHex == tray)
        #expect(author.storyAccentHex == tray)
        #expect(tray == "EA580C")
    }

    @Test("sans nom affiché, la graine est le pseudo")
    func usernameSeedsWithoutDisplayName() {
        let author = APIAuthor(id: "a1", username: "recmod_m", displayName: nil, avatar: nil)
        #expect(author.storyAccentHex == DynamicColorGenerator.colorForName("recmod_m"))
    }
}
