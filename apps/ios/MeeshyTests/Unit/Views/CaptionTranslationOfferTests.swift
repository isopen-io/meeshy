import XCTest
import MeeshySDK
@testable import Meeshy

/// CE QU'ON OFFRE ENTRE LA LÉGENDE ET « VOIR MOINS » (#6504).
///
/// Directive porteur 2026-09-14 : « mettre entre les deux l'icône de traduction,
/// la sélection de la langue d'affichage s'il existe des traductions déjà, ou
/// l'icône pour traduire immédiatement » — puis, le même jour : cette icône
/// « ouvre la feuille habituelle de traduction, celle des messages, des audios,
/// pour demander une traduction de ce contenu dans la langue souhaitée ».
///
/// La règle est PURE : la vue n'a qu'à rendre ce qu'elle décide. La feuille
/// propose TOUTES les langues : l'icône n'est donc jamais un contrôle inerte
/// dès que la langue d'origine est connue.
final class CaptionTranslationOfferTests: XCTestCase {

    func test_desTraductionsExistent_onOffreLeSelecteur_origineEnTete() {
        let offre = CaptionTranslationOffer.resolve(
            originalLanguage: "fr",
            translationLanguages: ["es", "en"],
            activeLanguage: "en"
        )

        XCTAssertEqual(offre, .languages(codes: ["fr", "en", "es"], active: "en"))
    }

    func test_aucuneTraduction_onOffreLIconeQuiOuvreLaFeuille() {
        let offre = CaptionTranslationOffer.resolve(
            originalLanguage: "en",
            translationLanguages: [],
            activeLanguage: nil
        )

        XCTAssertEqual(offre, .translate)
    }

    /// Une traduction vers la langue d'origine elle-même ne fait pas un choix :
    /// le sélecteur ne s'offre qu'à partir de DEUX langues distinctes — la
    /// feuille, elle, reste offerte.
    func test_uneSeuleLangueDistincte_onOffreLaFeuille_pasLeSelecteur() {
        let offre = CaptionTranslationOffer.resolve(
            originalLanguage: "fr",
            translationLanguages: ["FR"],
            activeLanguage: nil
        )

        XCTAssertEqual(offre, .translate)
    }

    /// Sans langue d'origine, la feuille n'a ni « Original » à nommer ni langue
    /// source à transmettre : rien n'est offert.
    func test_sansLangueDOrigine_niTraduction_onNOffreRien() {
        let offre = CaptionTranslationOffer.resolve(
            originalLanguage: nil,
            translationLanguages: [],
            activeLanguage: nil
        )

        XCTAssertEqual(offre, .none)
    }

    // MARK: - Le texte affiché suit la langue active

    /// Recette 2026-09-14 : le plein écran marquait « Français » actif et
    /// affichait le portugais — le texte venait de `translatedContent`, le
    /// drapeau d'une autre résolution. Le texte se lit désormais DEPUIS la
    /// langue active : une seule résolution pour les deux.
    func test_laLangueActiveEstLOriginal_leTexteEstLeContenu() {
        let texte = CaptionTranslationOffer.carrierText(
            content: "Le vent se lève",
            originalLanguage: "fr",
            translations: ["pt": "O vento sobe"],
            language: "FR"
        )

        XCTAssertEqual(texte, "Le vent se lève")
    }

    func test_laLangueActiveEstTraduite_leTexteEstSaTraduction() {
        let texte = CaptionTranslationOffer.carrierText(
            content: "Le vent se lève",
            originalLanguage: "fr",
            translations: ["PT": "O vento sobe"],
            language: "pt"
        )

        XCTAssertEqual(texte, "O vento sobe")
    }

    /// Une langue sans texte connu ne rend jamais une légende vide : le contenu.
    func test_uneLangueSansTraduction_rendLeContenu() {
        let texte = CaptionTranslationOffer.carrierText(
            content: "Le vent se lève",
            originalLanguage: "fr",
            translations: ["pt": "O vento sobe"],
            language: "de"
        )

        XCTAssertEqual(texte, "Le vent se lève")
    }

    // MARK: - Ce qu'on traduit : le contenu AFFICHÉ, jamais un voisin (#6280)

    /// Directive porteur 2026-09-14 : le contenu du post, la légende d'un média
    /// et le texte alternatif sont TROIS contenus. Quand le plein écran affiche
    /// la légende d'un média, c'est elle — et ses seules traductions — que la
    /// rangée et la feuille servent.
    private func postAvecLegende() -> FeedPost {
        FeedPost(
            id: "p1", author: "alice", authorId: "a1",
            content: "Contenu du post : la réunion du quartier",
            media: [FeedMedia(id: "m1", type: .image,
                              caption: "Media caption: the park tulips",
                              captionLanguage: "en",
                              captionTranslations: ["fr": "Légende : les tulipes du parc"])],
            originalLanguage: "fr",
            translations: ["en": PostTranslation(text: "Post content: the neighbourhood meeting")]
        )
    }

    func test_laSource_dUneLegendeDeMedia_estLaLegende_jamaisLeTexteDuPost() {
        let source = CaptionTranslationSource.of(origin: .mediaCaption, post: postAvecLegende(), mediaId: "m1")

        XCTAssertEqual(source?.text, "Media caption: the park tulips")
        XCTAssertEqual(source?.originalLanguage, "en")
        XCTAssertEqual(source?.translations, ["fr": "Légende : les tulipes du parc"])
        XCTAssertEqual(source?.target, .mediaCaption(mediaId: "m1"))
    }

    func test_laSource_duTexteDuPost_estLeContenu_etSesTraductions() {
        let source = CaptionTranslationSource.of(origin: .carrierText, post: postAvecLegende(), mediaId: "m1")

        XCTAssertEqual(source?.text, "Contenu du post : la réunion du quartier")
        XCTAssertEqual(source?.originalLanguage, "fr")
        XCTAssertEqual(source?.translations, ["en": "Post content: the neighbourhood meeting"])
        XCTAssertEqual(source?.target, .post(id: "p1"))
    }

    func test_uneLegendeDeMediaIntrouvable_naPasDeSource() {
        XCTAssertNil(CaptionTranslationSource.of(origin: .mediaCaption, post: postAvecLegende(), mediaId: "inconnu"))
    }

    /// Règle 3 du Prisme, témoin sur un rang AUTRE que le premier : lecteur
    /// `[fr, pt]`, original `fr`, traduction `pt` ⇒ l'original, au rang 1.
    func test_laLangueAffichee_laLangueDOrigineConcourtASonRang() {
        let source = CaptionTranslationSource(text: "Le vent se lève", originalLanguage: "fr",
                                              translations: ["pt": "O vento sobe"], target: .post(id: "p1"))

        XCTAssertEqual(source.displayedLanguage(preferredLanguages: ["fr", "pt"]), "fr")
    }

    func test_laLangueAffichee_uneTraductionAuPremierRang_lEmporteSurLOriginal() {
        let source = CaptionTranslationSource(text: "Media caption", originalLanguage: "en",
                                              translations: ["fr": "Légende"], target: .mediaCaption(mediaId: "m1"))

        XCTAssertEqual(source.displayedLanguage(preferredLanguages: ["fr", "en"]), "fr")
    }

    func test_laLangueAffichee_sansLangueServie_estLOriginal() {
        let source = CaptionTranslationSource(text: "Media caption", originalLanguage: "en",
                                              translations: ["fr": "Légende"], target: .mediaCaption(mediaId: "m1"))

        XCTAssertEqual(source.displayedLanguage(preferredLanguages: ["de"]), "en")
    }

    func test_lesCodesSontDedoublonnesSansTenirCompteDeLaCasse() {
        let offre = CaptionTranslationOffer.resolve(
            originalLanguage: "fr",
            translationLanguages: ["EN", "en", "es"],
            activeLanguage: nil
        )

        XCTAssertEqual(offre, .languages(codes: ["fr", "EN", "es"], active: nil))
    }
}

/// **Les traductions ARRIVÉES pendant que le plein écran est ouvert** (#6560).
///
/// Le plein écran couvre la carte qui le présente ; tant qu'il est ouvert, le
/// post que l'hôte lui relaie ne change pas. Il plie donc lui-même, sur le post
/// qu'il affiche, les traductions que la socket livre pour CE post — par les
/// règles de pose du store, jamais une troisième.
final class CaptionTranslationArrivalTests: XCTestCase {

    private func post() -> FeedPost {
        FeedPost(
            id: "p1", author: "alice", authorId: "a1",
            content: "Contenu du post",
            media: [FeedMedia(id: "m1", type: .image, caption: "Caption test",
                              captionLanguage: "en", captionTranslations: ["de": "Überschrift"])],
            originalLanguage: "fr"
        )
    }

    private func legende(postId: String = "p1", mediaId: String = "m1", langue: String, texte: String) throws -> CaptionTranslationArrival {
        let json = #"{"mediaId":"\#(mediaId)","postId":"\#(postId)","language":"\#(langue)","translation":{"text":"\#(texte)"}}"#
        return .mediaCaption(try JSONDecoder().decode(SocketMediaCaptionTranslationUpdatedData.self, from: Data(json.utf8)))
    }

    private func texteDuPost(postId: String = "p1", langue: String, texte: String) throws -> CaptionTranslationArrival {
        let json = #"{"postId":"\#(postId)","language":"\#(langue)","translation":{"text":"\#(texte)"}}"#
        return .post(try JSONDecoder().decode(SocketPostTranslationUpdatedData.self, from: Data(json.utf8)))
    }

    func test_uneLegendeArrivee_rejointLesTraductionsDuMedia() throws {
        let affiche = CaptionTranslationArrival.applying([try legende(langue: "es", texte: "Prueba")], to: post())

        XCTAssertEqual(affiche.media.first?.captionTranslations, ["de": "Überschrift", "es": "Prueba"])
        XCTAssertNil(affiche.translations, "Une légende traduite n'est pas une traduction du post.")
    }

    func test_uneTraductionDuPostArrivee_rejointLesTraductionsDuPost() throws {
        let affiche = CaptionTranslationArrival.applying([try texteDuPost(langue: "es", texte: "Contenido")], to: post())

        XCTAssertEqual(affiche.translations?["es"]?.text, "Contenido")
        XCTAssertEqual(affiche.media.first?.captionTranslations, ["de": "Überschrift"],
                       "Une traduction du post n'est pas une légende traduite.")
    }

    func test_uneArriveePourUnAutrePost_estIgnoree() throws {
        let affiche = CaptionTranslationArrival.applying(
            [try legende(postId: "p2", langue: "es", texte: "Prueba"), try texteDuPost(postId: "p2", langue: "es", texte: "Otro")],
            to: post()
        )

        XCTAssertEqual(affiche.media.first?.captionTranslations, ["de": "Überschrift"])
        XCTAssertNil(affiche.translations)
    }

    func test_aucuneArrivee_rendLePostTelQuel() {
        let affiche = CaptionTranslationArrival.applying([], to: post())

        XCTAssertEqual(affiche.media.first?.captionTranslations, ["de": "Überschrift"])
        XCTAssertNil(affiche.translations)
    }
}
