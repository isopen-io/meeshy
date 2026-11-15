import XCTest
@testable import MeeshySDK

/// #4741 — **armer la flèche et publier une slide obéissent au MÊME prédicat.**
///
/// Ils divergeaient dans les deux sens : une pastille de lieu seule n'armait
/// pas la flèche, un fond choisi seul l'armait puis se faisait jeter par le
/// filtre. Les témoins ci-dessous portent chacun sur UNE divergence mesurée.
final class StorySlidePublishMatterTests: XCTestCase {

    private func vierge() -> StorySlide { StorySlide(order: 0) }

    private func mérite(_ slide: StorySlide, image: Bool = false) -> Bool {
        StorySlidePublishMatter.deservesAPost(slide, hasBackgroundImage: image)
    }

    // MARK: - Rien n'est rien

    func test_uneSlideSemée_neMeritePasDePost() {
        XCTAssertFalse(mérite(vierge()))
    }

    func test_aucuneSlide_neMeritePasDePost() {
        XCTAssertFalse(StorySlidePublishMatter.anySlideDeservesAPost([], slideImageIds: []))
    }

    // MARK: - Les divergences, une par témoin

    /// **La divergence qui coûtait le plus.** Une slide dont la seule matière
    /// est une pastille de lieu ne pouvait pas armer la flèche : l'auteur
    /// posait un endroit et le bouton restait gris, sans que rien ne le dise.
    func test_unePastilleDeLieu_SEULE_meriteUnPost() {
        var slide = vierge()
        slide.effects.locationObjects = [
            StoryLocationObject(place: SharedPlace(latitude: 48.86, longitude: 2.35, name: "Le Marais"))
        ]
        XCTAssertTrue(mérite(slide))
    }

    /// L'autre sens : un fond CHOISI armait la flèche puis se faisait jeter par
    /// le filtre. C'est la décision testée depuis `a7136904dc` — « le geste le
    /// plus court qui produise une story qu'on peut regarder » — et le filtre
    /// doit la respecter, pas la contredire.
    func test_unFondChoisi_SEUL_meriteUnPost() {
        var slide = vierge()
        slide.effects.background = "101010"
        XCTAssertTrue(mérite(slide))
    }

    /// Une image de fond ne vit pas dans `effects` mais dans `slideImages` :
    /// le gate d'armement ne la voyait pas du tout.
    func test_uneImageDeFond_SEULE_meriteUnPost() {
        XCTAssertTrue(mérite(vierge(), image: true))
    }

    /// Une coquille de texte VIDE armait la flèche. C'est ce que le tap sur la
    /// page blanche pose AVANT la première frappe : une intention qui n'existe
    /// pas encore.
    func test_uneCoquilleDeTexteVIDE_neMeritePasDePost() {
        var slide = vierge()
        slide.effects.textObjects = [StoryTextObject(text: "")]
        XCTAssertFalse(mérite(slide))

        slide.effects.textObjects = [StoryTextObject(text: "   \n  ")]
        XCTAssertFalse(mérite(slide), "des espaces ne sont pas une intention")
    }

    func test_unTexteRÉEL_meriteUnPost() {
        var slide = vierge()
        slide.effects.textObjects = [StoryTextObject(text: "bonjour")]
        XCTAssertTrue(mérite(slide))
    }

    /// Le legacy : un brouillon repris peut porter un média au niveau de la
    /// slide. Le filtre ne le voyait pas et l'aurait jeté.
    func test_unMediaLegacyDeSlide_meriteUnPost() {
        var slide = vierge()
        slide.mediaURL = "file:///tmp/a.jpg"
        XCTAssertTrue(mérite(slide))
    }

    /// La story « fond + musique » n'a aucun contenu visuel et se publie.
    func test_unSonSEUL_meriteUnPost() {
        var avecPiste = vierge()
        avecPiste.effects.backgroundAudioId = "sound-1"
        XCTAssertTrue(mérite(avecPiste))

        var avecPastille = vierge()
        avecPastille.effects.audioPlayerObjects = [StoryAudioPlayerObject(postMediaId: "m1")]
        XCTAssertTrue(mérite(avecPastille))
    }

    func test_unSticker_meriteUnPost() {
        var slide = vierge()
        slide.effects.stickerObjects = [StorySticker(emoji: "\u{2764}\u{FE0F}")]
        XCTAssertTrue(mérite(slide))
    }

    // MARK: - Sur l'ensemble

    /// La matière se cherche sur TOUTES les unités : une story dont seule la
    /// deuxième page est remplie se publie.
    func test_laMatiereSeCherche_surTOUTESLesSlides() {
        var seconde = vierge()
        seconde.effects.textObjects = [StoryTextObject(text: "ici")]
        XCTAssertTrue(StorySlidePublishMatter.anySlideDeservesAPost(
            [vierge(), seconde], slideImageIds: []))
    }

    /// Et l'image de fond est cherchée par l'ID DE LA SLIDE, pas par sa position.
    func test_lImageDeFond_estAppariéeParIdDeSlide() {
        let a = StorySlide(id: "a", order: 0)
        let b = StorySlide(id: "b", order: 1)
        XCTAssertTrue(StorySlidePublishMatter.anySlideDeservesAPost([a, b], slideImageIds: ["b"]))
        XCTAssertFalse(StorySlidePublishMatter.anySlideDeservesAPost([a, b], slideImageIds: ["c"]),
                       "une image appariée à une slide ABSENTE n'est de la matière pour personne")
    }
}
