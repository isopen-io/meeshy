import Foundation
import Testing
@testable import MeeshySDK

/// **Ce que la carte d'un contenu montre** (#19332) — projection pure d'un
/// `APIPost` servi par `GET /posts/:id`.
struct ContentCardProjectionTests {

    private static let author = #"{"id":"6ada27bf28983c39d9838be9","username":"amani","displayName":"Amani Diallo","avatar":"/u/a.jpg"}"#

    private func card(_ fields: String, author: String = Self.author,
                      preferredLanguages: [String] = [], announcedKind: PostType? = nil) throws -> ContentCard {
        let json = #"{"id":"66f0c0ffee0000000000c0de","createdAt":"2026-11-04T09:55:10.287Z","author":\#(author),\#(fields)}"#
        let post = try MeeshyCoders.decoder(.api).decode(APIPost.self, from: Data(json.utf8))
        return ContentCard(post: post, preferredLanguages: preferredLanguages, announcedKind: announcedKind)
    }

    // MARK: - Type et auteur

    @Test func init_readsTheServedType_elseTheAnnouncedOne_elsePublication() throws {
        let reel = try card(#""type":"REEL""#)
        let unknownType = try card(#""type":"QUOTE""#, announcedKind: .story)
        let untyped = try card(#""content":"x""#)
        #expect(reel.kind == .reel)
        #expect(unknownType.kind == .story)
        #expect(untyped.kind == .post)
    }

    @Test func init_authorName_isTheDisplayName_elseTheHandle() throws {
        let named = try card(#""type":"POST""#)
        let handleOnly = try card(#""type":"POST""#, author: #"{"id":"a1","username":"lume","displayName":"  "}"#)
        #expect(named.author.name == "Amani Diallo")
        #expect(named.author.avatarURL == "/u/a.jpg")
        #expect(handleOnly.author.name == "@lume")
        #expect(handleOnly.author.avatarURL == nil)
    }

    // MARK: - Texte servi par le Prisme

    private static let spanish = #""type":"POST","content":"Hola a todos","originalLanguage":"es","translations":{"en":{"text":"Hello everyone"}}"#

    @Test func init_text_isServedOnARankOtherThanTheFirst() throws {
        let served = try card(Self.spanish, preferredLanguages: ["de", "en"])
        #expect(served.text == "Hello everyone")
    }

    @Test func init_text_withoutAMatchingTranslation_isTheOriginal() throws {
        let original = try card(Self.spanish, preferredLanguages: ["de"])
        #expect(original.text == "Hola a todos")
    }

    @Test func init_blankText_isNoText() throws {
        let blank = try card(#""type":"POST","content":"   ""#)
        #expect(blank.text == nil)
    }

    @Test func init_moodEmoji_showsOnAMoodOnly() throws {
        let mood = try card(#""type":"STATUS","content":"En vacances","moodEmoji":"🏖️""#)
        let notAMood = try card(#""type":"POST","content":"x","moodEmoji":"🏖️""#)
        #expect(mood.kind == .status)
        #expect(mood.moodEmoji == "🏖️")
        #expect(notAMood.moodEmoji == nil)
    }

    // MARK: - Média

    @Test func init_image_showsItsThumbnail_boundedBetweenFourFifthsAndSixteenNinths() throws {
        let tall = try card(#""type":"POST","media":[{"id":"m1","mimeType":"image/jpeg","fileUrl":"/f/1.jpg","thumbnailUrl":"/t/1.jpg","thumbHash":"abc","width":1000,"height":4000}]"#)
        let media = try #require(tall.media)
        #expect(media.kind == .image)
        #expect(media.imageURL == "/t/1.jpg")
        #expect(media.thumbHash == "abc")
        #expect(media.aspectRatio == ContentCard.aspectRatioRange.lowerBound)
        #expect(media.durationSeconds == nil)
        #expect(tall.extraMediaCount == 0)
    }

    @Test func init_imageWithoutThumbnail_showsTheFileItself() throws {
        let wide = try card(#""type":"POST","media":[{"id":"m1","mimeType":"image/png","fileUrl":"/f/1.png","width":4000,"height":1000}]"#)
        #expect(wide.media?.imageURL == "/f/1.png")
        #expect(wide.media?.aspectRatio == ContentCard.aspectRatioRange.upperBound)
    }

    @Test func init_video_showsItsThumbnailAndDurationInSeconds_andNeverItsFileAsAnImage() throws {
        let video = try card(#""type":"POST","media":[{"id":"m1","mimeType":"video/mp4","fileUrl":"/f/1.mp4","duration":42500,"width":1920,"height":1080}]"#)
        let media = try #require(video.media)
        #expect(media.kind == .video)
        #expect(media.imageURL == nil)
        #expect(media.durationSeconds == 42)
    }

    @Test func init_reelAndStory_arePortrait() throws {
        for type in ["REEL", "STORY"] {
            let portrait = try card(#""type":"\#(type)","media":[{"id":"m1","mimeType":"video/mp4","thumbnailUrl":"/t/r.jpg","width":1920,"height":1080}]"#)
            #expect(portrait.media?.aspectRatio == ContentCard.portraitAspectRatio, "\(type)")
        }
    }

    @Test func init_severalMedia_countTheOnesAfterTheShownOne() throws {
        let several = try card(#""type":"POST","media":[{"id":"a","mimeType":"audio/mpeg"},{"id":"b","mimeType":"image/jpeg","fileUrl":"/f/b.jpg"},{"id":"c","mimeType":"image/jpeg"}]"#)
        #expect(several.media?.imageURL == "/f/b.jpg")
        #expect(several.extraMediaCount == 2)
    }

    @Test func init_noVisualMedia_hasNoMediaBlock() throws {
        let audioOnly = try card(#""type":"POST","content":"x","media":[{"id":"a","mimeType":"audio/mpeg"}]"#)
        #expect(audioOnly.media == nil)
        #expect(audioOnly.extraMediaCount == 0)
    }

    @Test func displayAspectRatio_unknownDimensions_isFourThirds() {
        #expect(ContentCard.displayAspectRatio(width: nil, height: 100, portrait: false) == ContentCard.unknownAspectRatio)
        #expect(ContentCard.displayAspectRatio(width: 0, height: 0, portrait: false) == ContentCard.unknownAspectRatio)
    }

    // MARK: - Compteurs et favori

    @Test func init_stats_areTheLinkedPostsOwn_andTheBookmarkIsTheReaders() throws {
        let counted = try card(#""type":"POST","content":"x","viewCount":1234,"likeCount":5,"commentCount":2,"bookmarkCount":7,"isBookmarkedByMe":true"#)
        #expect(counted.stats == ContentCard.Stats(views: 1234, likes: 5, comments: 2, bookmarks: 7))
        #expect(counted.isBookmarkedByMe)
    }

    @Test func init_missingCounters_areZero_andNotBookmarked() throws {
        let bare = try card(#""type":"POST","content":"x""#)
        #expect(bare.stats == ContentCard.Stats(views: 0, likes: 0, comments: 0, bookmarks: 0))
        #expect(!bare.isBookmarkedByMe)
    }

    // MARK: - Republication

    @Test func init_bareRepost_showsTheOriginal_withTheLinkedPostsCounters() throws {
        let repost = try card(#""type":"POST","content":null,"viewCount":3,"repostOf":{"id":"66f0c0ffee0000000000beef","type":"REEL","content":"Le reel","originalLanguage":"fr","createdAt":"2026-11-01T08:00:00.000Z","author":{"id":"o1","username":"lume","displayName":"Lumé"},"media":[{"id":"v","mimeType":"video/mp4","thumbnailUrl":"/t/v.jpg","duration":9000}]}"#)
        #expect(repost.postId == "66f0c0ffee0000000000c0de")
        #expect(repost.kind == .post)
        #expect(repost.author.name == "Lumé")
        #expect(repost.text == "Le reel")
        #expect(repost.media?.kind == .video)
        #expect(repost.media?.aspectRatio == ContentCard.portraitAspectRatio)
        #expect(repost.stats.views == 3)
    }

    @Test func init_quoteWithItsOwnText_showsItsOwnText() throws {
        let quote = try card(#""type":"POST","content":"Mon avis","repostOf":{"id":"o","content":"L'original","createdAt":"2026-11-01T08:00:00.000Z","author":{"id":"o1","username":"lume"}}"#)
        #expect(quote.text == "Mon avis")
        #expect(quote.author.name == "Amani Diallo")
    }
}
