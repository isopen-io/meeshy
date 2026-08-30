import XCTest
@testable import Meeshy
@testable import MeeshySDK

/// **Vue `3f` (#4096) — un lot de médias porte une légende par slide.**
///
/// > « Une légende par slide, un son pour la publication. La pagination ne
/// > change ni le texte du post ni l'annonce du son : seule la légende suit le
/// > média affiché. »
///
/// Trois familles de témoins, dans l'ordre où elles mordent : la règle PURE de
/// hauteur, l'invariant STRUCTUREL de pagination, et le résolveur UNIQUE de
/// légende.
final class FeedPostCardCarouselGuardTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        try MyStoriesSourceCorpus.text(of: relativePath)
    }

    private func media(id: String, width: Int?, height: Int?) -> FeedMedia {
        FeedMedia(id: id, type: .image, url: "https://example.test/\(id).jpg",
                  width: width, height: height)
    }

    // MARK: - 1. La hauteur est UNE, et c'est la règle du média UNIQUE

    /// **Une hauteur par slide ferait sauter la carte à chaque glissement** —
    /// le texte et les actions sous le média se déplaceraient PENDANT le geste,
    /// ce que la dimension 4 (fluidité) interdit. Le cadre est donc figé pour le
    /// lot, et c'est la tête de lot qui le fixe : l'auteur a choisi l'ordre.
    ///
    /// Le témoin porte sur le MÉCANISME, et il a une histoire. Une première
    /// écriture refaisait la mesure de largeur à la main —`GeometryReader` en
    /// `.background`, `onPreferenceChange`, `@State` — **sans le
    /// `.frame(maxWidth: .infinity)` qui la précède dans l'original**. La
    /// largeur redevenait la dimension libre : elle dépendait de la hauteur
    /// qu'elle venait de fixer, la boucle de mise en page ne convergeait plus,
    /// et l'app quittait EN SILENCE à l'ouverture du fil — sans rapport de
    /// crash, sans `fatal`, et sans qu'aucun gate ne rougisse.
    ///
    /// D'où la forme de cette garde : elle exige le modificateur ÉPROUVÉ, et
    /// interdit qu'on remesure ici. Une assertion sur la hauteur RENDUE
    /// n'aurait rien vu — la boucle produit des valeurs justes, elle ne
    /// s'arrête simplement jamais.
    func test_theCarouselShape_comesFromARatio_neverFromAMeasurement() throws {
        let carousel = try source("Meeshy/Features/Main/Views/FeedPostCardCarousel.swift")

        XCTAssertTrue(
            carousel.contains(".aspectRatio(FeedCarouselLayout.aspectRatio(for: media), contentMode: .fit)"),
            "La forme du carrousel doit se DONNER, pas se mesurer : `TabView` n'a aucune " +
            "taille intrinsèque, donc tout mécanisme qui dimensionne d'après ce qu'il " +
            "contient se pose une passe trop tard — ou pas du tout."
        )
        for measured in ["GeometryReader", "FeedMediaWidthKey", "measuredWidth", "fittedMediaHeight"] {
            XCTAssertFalse(
                carousel.contains(measured),
                "Le carrousel se dimensionne par la mesure (« \(measured) ») : les deux " +
                "écritures qui l'ont fait ont produit, l'une une boucle de mise en page qui " +
                "faisait quitter l'app en silence, l'autre une bande de quarante points — la " +
                "hauteur du COMPTEUR, seul enfant du ZStack à avoir une taille intrinsèque."
            )
        }
    }

    /// **Les bornes ne sont pas recopiées : la forme INTERROGE la règle.**
    ///
    /// Le plancher, le plafond et le repli « dimensions absentes » vivent dans
    /// `postCardMediaHeight`, qui sert déjà le média unique. Ce témoin le prouve
    /// sur les trois cas où une constante recopiée aurait pu dériver.
    func test_theCarouselShape_readsItsBoundsFromTheSingleRule() {
        let probe: CGFloat = 1_000
        for (w, h) in [(1000, 1400), (1600, 900), (100, 100_000), (100_000, 100)] {
            let expected = probe / postCardMediaHeight(mediaWidth: w, mediaHeight: h, cardWidth: probe)
            XCTAssertEqual(
                FeedCarouselLayout.aspectRatio(for: [media(id: "a", width: w, height: h)]),
                expected, accuracy: 0.0001,
                "Le ratio doit être celui que la règle du média unique produirait — bornes " +
                "comprises, y compris sur un panorama et sur une colonne."
            )
        }
    }

    /// Dimensions absentes — le cas NOMINAL d'un post qu'on vient de publier,
    /// dont le fil ne connaît pas encore la taille des images : la forme doit
    /// rester celle du repli, jamais une division par zéro ni un aplatissement.
    func test_theCarouselShape_survivesMediaWithoutDimensions() {
        let ratio = FeedCarouselLayout.aspectRatio(for: [media(id: "a", width: nil, height: nil)])
        XCTAssertGreaterThan(ratio, 0)
        XCTAssertEqual(
            ratio,
            1_000 / postCardMediaHeight(mediaWidth: nil, mediaHeight: nil, cardWidth: 1_000),
            accuracy: 0.0001
        )
        XCTAssertGreaterThan(FeedCarouselLayout.aspectRatio(for: []), 0,
                             "Lot vide : une forme neutre, jamais un NaN.")
    }

    /// La règle elle-même, éprouvée bout en bout : un post à un média et la
    /// première slide d'un post à trois donnent la MÊME hauteur pour le même
    /// cliché. Sans ce témoin, les deux pourraient diverger sans que rien ne le
    /// dise — le lecteur verrait deux cadrages selon que l'image voyage seule
    /// ou accompagnée.
    func test_theLeadMediaGetsTheSameHeight_aloneOrInALot() {
        let lead = media(id: "a", width: 1000, height: 1400)
        let alone = postCardMediaHeight(mediaWidth: lead.width, mediaHeight: lead.height, cardWidth: 393)
        let inLot = postCardMediaHeight(mediaWidth: [lead, media(id: "b", width: 900, height: 900)].first?.width,
                                        mediaHeight: [lead, media(id: "b", width: 900, height: 900)].first?.height,
                                        cardWidth: 393)
        XCTAssertEqual(alone, inLot)
    }

    // MARK: - 2. La carte NE PEUT PAS savoir quelle slide est affichée

    /// L'invariant de `3f` n'est pas tenu par une précaution : il est
    /// structurellement impossible à violer, parce que l'index vit dans le
    /// carrousel. Ce témoin interroge donc la STRUCTURE, jamais le symptôme —
    /// vérifier « le texte ne bouge pas » demanderait de rendre la carte et
    /// n'attraperait de toute façon que le cas observé.
    func test_theCardCannotKnowWhichSlideIsShown() throws {
        let card = try source("Meeshy/Features/Main/Views/FeedPostCard.swift")
            + source("Meeshy/Features/Main/Views/FeedPostCard+Media.swift")
            + source("Meeshy/Features/Main/Views/FeedPostCard+Header.swift")

        for leak in ["carouselIndex", "@State var index", "@State private var index",
                     "currentSlide", "mediaIndex"] {
            XCTAssertFalse(
                card.contains(leak),
                "La carte déclare un index de page (« \(leak) ») : chaque glissement " +
                "invaliderait l'en-tête, le crédit du son, le texte et les actions — et le " +
                "Prisme relancerait sa résolution de langue à chaque slide. L'index vit " +
                "dans FeedPostCardCarousel, et nulle part ailleurs."
            )
        }

        XCTAssertTrue(
            try source("Meeshy/Features/Main/Views/FeedPostCardCarousel.swift")
                .contains("@State private var index"),
            "Le carrousel doit posséder son index — sans lui, la garde ci-dessus " +
            "passerait au vert sur une pagination qui n'existe plus du tout."
        )
    }

    // MARK: - 3. Une légende par slide, résolue UNE fois

    func test_theCaptionFollowsTheSlide_throughTheSharedResolver() throws {
        let preview = try source("Meeshy/Features/Main/Views/FeedPostCard+Media.swift")
        let carousel = try source("Meeshy/Features/Main/Views/FeedPostCardCarousel.swift")

        XCTAssertTrue(
            preview.contains("SocialMediaCaption.map(for: mediaList, carrierText: post.displayContent)"),
            "La carte doit résoudre les légendes par le MÊME résolveur que la galerie " +
            "plein écran (vue `3e`) — jamais une seconde règle de priorité."
        )
        XCTAssertTrue(
            carousel.contains("captions[item.id]"),
            "La légende affichée doit être celle du média COURANT, adressée par son id."
        )
        for rewrite in ["post.displayContent", "post.content", "carrierText"] {
            XCTAssertFalse(
                carousel.contains(rewrite),
                "Le carrousel ne doit pas connaître le texte du porteur (« \(rewrite) ») : " +
                "il consulte la carte des légendes, il ne rejoue pas sa règle de priorité."
            )
        }
    }

    /// La règle du résolveur partagé, éprouvée bout en bout : au-delà d'un
    /// visuel, le texte du porteur NE descend sur aucun média. C'est ce qui
    /// rend « une légende par slide » vrai plutôt que décoratif — sans elle, un
    /// carrousel de trois afficherait trois fois la même phrase.
    @MainActor
    func test_theCarrierText_neverBecomesEverySlidesCaption() {
        let two = [FeedMedia(id: "a", type: .image, url: "https://example.test/a.jpg"),
                   FeedMedia(id: "b", type: .image, url: "https://example.test/b.jpg")]
        XCTAssertTrue(
            SocialMediaCaption.map(for: two, carrierText: "Trois jours sur le port.").isEmpty,
            "Au-delà d'un visuel, le texte du porteur décrit le LOT — le coller sous " +
            "chaque slide ferait mentir la légende."
        )

        let one = [FeedMedia(id: "a", type: .image, url: "https://example.test/a.jpg")]
        XCTAssertEqual(
            SocialMediaCaption.map(for: one, carrierText: "Trois jours sur le port.")["a"],
            "Trois jours sur le port."
        )
    }

    // MARK: - 4. Non-régression : la mosaïque est bien partie

    /// Sans ce témoin, un retour de la mosaïque laisserait les trois familles
    /// ci-dessus au vert : elles décrivent le carrousel, aucune ne dit qu'il
    /// est le SEUL rendu d'un lot.
    func test_theMosaicIsGone_aLotOfMediaIsAlwaysACarousel() throws {
        let preview = try source("Meeshy/Features/Main/Views/FeedPostCard+Media.swift")

        XCTAssertTrue(preview.contains("FeedPostCardCarousel("))
        for mosaic in ["count == 2", "count == 3", "count == 4", "count >= 5"] {
            XCTAssertFalse(
                preview.contains(mosaic),
                "Branche de mosaïque retrouvée (« \(mosaic) ») : un lot de médias se " +
                "parcourt. Une mosaïque ne peut porter aucune légende par média."
            )
        }
    }

    /// Fusible de lecture : quatre des témoins ci-dessus sont négatifs, et un
    /// négatif sur une lecture vide passe au vert sans qu'aucune assertion ne
    /// puisse le signaler.
    func test_theGuardActuallyReadsItsSources() throws {
        XCTAssertGreaterThan(try source("Meeshy/Features/Main/Views/FeedPostCardCarousel.swift").count, 3_000)
        XCTAssertGreaterThan(try source("Meeshy/Features/Main/Views/FeedPostCard+Media.swift").count, 3_000)
        XCTAssertGreaterThan(try source("Meeshy/Features/Main/Views/FeedPostCard.swift").count, 20_000)
    }
}
