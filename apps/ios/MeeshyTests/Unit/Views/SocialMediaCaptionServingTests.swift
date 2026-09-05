import XCTest
@testable import Meeshy
import MeeshySDK

/// **Ce qu'une légende de plein écran SERT, et ce qu'elle POURRAIT servir**
/// (#4934).
///
/// La carte du fil offre une bascule de langue (`TranslationsBadge` →
/// `PostTranslationSheet`) ; le plein écran du même contenu la perdait.
/// `ConversationMediaGalleryView` ne connaissait aucune langue — quatre
/// compteurs à zéro dans ses 639 lignes.
///
/// > **Une capacité qui disparaît quand on AGRANDIT le contenu est pire qu'une
/// > capacité absente** : l'utilisateur l'a vue une ligne plus haut, il l'a
/// > utilisée, et le geste qui devrait donner plus lui en donne moins.
///
/// Le texte servi et ses alternatives sont **deux projections d'une seule
/// décision** — quel texte EST la légende de ce média. Les calculer séparément
/// ferait proposer des langues pour un texte qui n'est pas celui qu'on lit.
final class SocialMediaCaptionServingTests: XCTestCase {

    private func media(_ id: String, caption: String? = nil, type: FeedMediaType = .image) -> FeedMedia {
        FeedMedia(id: id, type: type, url: "https://cdn.test/\(id)", caption: caption)
    }

    private let porteur = SocialCarrierText(
        served: "Le quai au petit matin",
        byLanguage: ["fr": "Le quai au petit matin",
                     "en": "The quay at dawn",
                     "es": "El muelle al amanecer"]
    )

    // MARK: - Quand la bascule EXISTE

    /// Un porteur à UN seul visuel, sans légende propre : le texte servi est
    /// celui du porteur, donc ses traductions s'appliquent.
    func test_unSeulVisuelSansLegendePropre_offreLesLanguesDuPorteur() {
        let servi = SocialMediaCaption.serving(for: [media("m1")], carrier: porteur)
        XCTAssertEqual(servi["m1"]?.text, "Le quai au petit matin")
        XCTAssertEqual(servi["m1"]?.alternatives.count, 3)
        XCTAssertEqual(servi["m1"]?.alternatives["en"], "The quay at dawn")
    }

    // MARK: - Quand elle N'EXISTE PAS — et chaque cas a sa raison

    /// **La raison la plus importante.** Une légende PROPRE gagne sur le texte
    /// du porteur — et rien ne la traduit (#4904). Servir la traduction du POST
    /// dessus afficherait un texte qui ne décrit pas ce média.
    ///
    /// > Le Prisme sert un contenu traduit, jamais un contenu VOISIN traduit.
    func test_uneLegendePROPRE_nOffreAUCUNElangue() {
        let servi = SocialMediaCaption.serving(for: [media("m1", caption: "La grue rouge")],
                                               carrier: porteur)
        XCTAssertEqual(servi["m1"]?.text, "La grue rouge", "la légende propre gagne")
        XCTAssertTrue(servi["m1"]?.alternatives.isEmpty == true,
                      "rien ne traduit PostMedia.caption — un contrôle ici serait menteur")
    }

    /// **La borne que la directive du porteur rencontre en premier.** Au-delà
    /// d'un visuel, le texte du porteur décrit le LOT : il n'est plus la légende
    /// d'AUCUN média, donc il n'y a rien à basculer.
    func test_plusieursVisuels_nOffrentAucuneLangue() {
        let servi = SocialMediaCaption.serving(for: [media("m1"), media("m2")], carrier: porteur)
        XCTAssertTrue(servi.isEmpty,
                      "sans légende propre ni texte de porteur applicable, aucun média n'a de légende")
    }

    func test_plusieursVisuelsAvecLegendesPropres_serventSansBascule() {
        let servi = SocialMediaCaption.serving(
            for: [media("m1", caption: "quai"), media("m2", caption: "grue")],
            carrier: porteur
        )
        XCTAssertEqual(servi["m1"]?.text, "quai")
        XCTAssertEqual(servi["m2"]?.text, "grue")
        XCTAssertTrue(servi["m1"]?.alternatives.isEmpty == true)
        XCTAssertTrue(servi["m2"]?.alternatives.isEmpty == true)
    }

    /// Un porteur qui n'a QU'UNE langue n'offre pas de bascule : un contrôle à
    /// une entrée ne bascule rien. C'est la loi 4 appliquée au contenu, pas
    /// seulement à la présence des données.
    func test_uneSeuleLangue_nOffrePasDeBascule() {
        let monolingue = SocialCarrierText(served: "Le quai", byLanguage: ["fr": "Le quai"])
        let servi = SocialMediaCaption.serving(for: [media("m1")], carrier: monolingue)
        XCTAssertEqual(servi["m1"]?.text, "Le quai")
        XCTAssertTrue(servi["m1"]?.alternatives.isEmpty == true)
    }

    func test_aucunTexte_neProduitAucuneEntree() {
        let servi = SocialMediaCaption.serving(for: [media("m1")], carrier: .none)
        XCTAssertTrue(servi.isEmpty, "sans légende, le plein écran n'affiche aucun bandeau")
    }

    // MARK: - Les deux projections ne divergent pas

    /// **Le fusible.** `map(for:carrierText:)` est la projection PAUVRE de la
    /// même décision : le texte qu'elle rend doit être exactement celui que
    /// `serving` sert. Le jour où l'une évolue sans l'autre, le contrôle
    /// proposerait des langues pour un texte qui n'est pas celui qu'on lit —
    /// exactement le défaut du cycle 123 du Prisme.
    func test_lesDeuxProjections_serventLeMEMEtexte() {
        let cas: [[FeedMedia]] = [
            [media("m1")],
            [media("m1", caption: "La grue rouge")],
            [media("m1"), media("m2")],
            [media("m1", caption: "quai"), media("m2", caption: "grue")],
            []
        ]
        for lot in cas {
            let riche = SocialMediaCaption.serving(for: lot, carrier: porteur)
            let pauvre = SocialMediaCaption.map(for: lot, carrierText: porteur.served)
            XCTAssertEqual(riche.mapValues(\.text), pauvre,
                           "divergence sur \(lot.map(\.id))")
        }
    }

    /// Les alternatives contiennent TOUJOURS le texte servi — sinon la bascule
    /// n'aurait pas de retour vers ce qu'on lisait.
    func test_lesAlternatives_contiennentLeTexteSERVI() throws {
        let servi = try XCTUnwrap(SocialMediaCaption.serving(for: [media("m1")], carrier: porteur)["m1"])
        XCTAssertTrue(servi.alternatives.values.contains(servi.text),
                      "sans le texte servi parmi les alternatives, on ne peut pas y revenir")
    }
}

/// **D'où viennent les langues d'un porteur** (#4934).
///
/// La bascule n'existe que si le fil transporte de quoi NOMMER chaque langue.
/// Un post le fait ; un commentaire non — et le déclarer vaut mieux que de
/// deviner la langue du texte servi.
final class SocialCarrierTextOriginTests: XCTestCase {

    private func post(content: String,
                      original: String?,
                      translations: [String: String],
                      translated: String? = nil) -> FeedPost {
        FeedPost(id: "p1", author: "alice", authorId: "a1", content: content,
                 timestamp: Date(), originalLanguage: original,
                 translations: translations.mapValues { PostTranslation(text: $0) },
                 translatedContent: translated)
    }

    func test_unPost_offreSesTraductionsETsonORIGINAL() {
        let carrier = SocialCarrierText.from(post: post(
            content: "Le quai", original: "fr",
            translations: ["en": "The quay"], translated: "The quay"
        ))
        XCTAssertEqual(carrier.served, "The quay", "le texte servi est celui du Prisme")
        XCTAssertEqual(carrier.byLanguage["fr"], "Le quai", "l'original n'est JAMAIS dans translations")
        XCTAssertEqual(carrier.byLanguage["en"], "The quay")
        XCTAssertEqual(carrier.byLanguage.count, 2)
    }

    /// **Sans langue d'origine, l'original n'entre PAS dans la carte.** Une
    /// entrée sous une clé inventée serait un drapeau qui ment sur ce qu'il
    /// sert — mieux vaut une bascule qui ignore l'original qu'une bascule qui
    /// l'étiquette au hasard.
    func test_sansLangueDorigine_lOriginalNEstPasEtiquete() {
        let carrier = SocialCarrierText.from(post: post(
            content: "Le quai", original: nil, translations: ["en": "The quay"]
        ))
        XCTAssertEqual(carrier.byLanguage, ["en": "The quay"])
    }

    func test_unPostSansTraduction_nOffreQueSaPropreLangue() {
        let carrier = SocialCarrierText.from(post: post(
            content: "Le quai", original: "fr", translations: [:]
        ))
        XCTAssertEqual(carrier.byLanguage, ["fr": "Le quai"])
        let servi = SocialMediaCaption.serving(
            for: [FeedMedia(id: "m1", type: .image, url: "u")], carrier: carrier
        )
        XCTAssertTrue(servi["m1"]?.alternatives.isEmpty == true,
                      "une seule langue ⇒ aucune bascule")
    }

    /// Un COMMENTAIRE n'offre aucune langue : le fil ne dit pas dans quelle
    /// langue son `translatedContent` est écrit.
    func test_unCommentaire_nOffreAucuneLangue() {
        let commentaire = FeedComment(
            id: "c1", author: "bob", authorId: "b1", content: "Bonjour",
            timestamp: Date(), originalLanguage: "fr", translatedContent: "Hello"
        )
        let carrier = SocialCarrierText.from(comment: commentaire)
        XCTAssertEqual(carrier.served, "Hello")
        XCTAssertTrue(carrier.byLanguage.isEmpty,
                      "nommer la langue de « Hello » demanderait de la deviner")
    }
}
