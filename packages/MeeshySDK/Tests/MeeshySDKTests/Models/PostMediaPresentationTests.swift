import Testing
@testable import MeeshySDK

/// **Directive 2026-08-27 — comment un post affiche ses médias.**
/// La présentation se DÉRIVE du type, aucune interface, aucun autre choix : un
/// POST défile en carrousel, un RÉEL en diapositives horizontales.
struct PostMediaPresentationTests {

    @Test func post_defauteEnCarousel() {
        #expect(PostMediaPresentation.default(for: .post) == .carousel)
    }

    @Test func reel_defauteEnDiapositivesHorizontales() {
        #expect(PostMediaPresentation.default(for: .reel) == .horizontalSlides)
    }

    @Test func story_etStatus_retombentEnCarousel() {
        #expect(PostMediaPresentation.default(for: .story) == .carousel)
        #expect(PostMediaPresentation.default(for: .status) == .carousel)
    }

    @Test func deuxCasSeulement_aucunAutreChoix() {
        #expect(PostMediaPresentation.allCases.count == 2)
    }

    // Le POSTE définit son affichage — dérivé de son type, insensible à la casse.
    @Test func lePoste_definitSonAffichage_depuisSonType() {
        #expect(FeedPost(author: "a", type: "REEL", content: "x").mediaPresentation == .horizontalSlides)
        #expect(FeedPost(author: "a", type: "POST", content: "x").mediaPresentation == .carousel)
        #expect(FeedPost(author: "a", type: "reel", content: "x").mediaPresentation == .horizontalSlides)
        #expect(FeedPost(author: "a", type: nil, content: "x").mediaPresentation == .carousel)
    }
}
