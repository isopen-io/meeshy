import Testing
import Foundation
@testable import MeeshySDK

/// « Ce post doit-il proposer le réel ? » (#8603) — miroir EXACT de
/// `offersReelForPost` (`packages/shared/utils/reel-composition.ts`). Un seul
/// cas vrai ; chaque cas « aucun modal » du critère de fin a son témoin.
@Suite("ReelComposition.offersReelForPost")
struct ReelOfferTests {

    private typealias Media = (kind: FeedMediaType, durationMs: Int?)

    private func offers(type: PostType = .post,
                        media: [Media] = [(kind: .video, durationMs: 12_000)],
                        isRepost: Bool = false,
                        isEdit: Bool = false,
                        formatChosenByAuthor: Bool = false) -> Bool {
        ReelComposition.offersReelForPost(type: type, mediaKinds: media, isRepost: isRepost,
                                          isEdit: isEdit, formatChosenByAuthor: formatChosenByAuthor)
    }

    @Test("un POST dont le seul média est une vidéo propose le réel")
    func singleVideoPostOffersReel() {
        #expect(offers())
    }

    @Test("plusieurs médias : aucun modal")
    func severalMediaNeverOffer() {
        #expect(offers(media: [(kind: .video, durationMs: 12_000), (kind: .image, durationMs: nil)]) == false)
        #expect(offers(media: [(kind: .video, durationMs: 12_000), (kind: .video, durationMs: 9_000)]) == false)
    }

    @Test("photo seule, audio seul, texte seul : aucun modal")
    func otherCompositionsNeverOffer() {
        #expect(offers(media: [(kind: .image, durationMs: nil)]) == false)
        #expect(offers(media: [(kind: .audio, durationMs: 8_000)]) == false)
        #expect(offers(media: []) == false)
    }

    @Test("story, réel et mood : aucun modal")
    func otherFormatsNeverOffer() {
        #expect(offers(type: .story) == false)
        #expect(offers(type: .reel) == false)
        #expect(offers(type: .status) == false)
    }

    @Test("repost, édition, « Post » choisi au chevron : aucun modal")
    func authorContextNeverOffers() {
        #expect(offers(isRepost: true) == false)
        #expect(offers(isEdit: true) == false)
        #expect(offers(formatChosenByAuthor: true) == false)
    }

    @Test("une vidéo trop courte ou de durée inconnue ne qualifie pas : le proposer mentirait")
    func nonQualifyingVideoNeverOffers() {
        #expect(offers(media: [(kind: .video, durationMs: 2_000)]) == false)
        #expect(offers(media: [(kind: .video, durationMs: nil)]) == false)
    }
}
