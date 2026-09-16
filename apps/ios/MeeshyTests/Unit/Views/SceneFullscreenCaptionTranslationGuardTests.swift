import XCTest

/// LA LÉGENDE D'UNE SCÈNE POSE LA TRADUCTION ENTRE SA LÉGENDE ET « VOIR MOINS » (#6504).
///
/// Directive porteur 2026-09-14, sur une capture de ce plein écran : « mettre
/// entre les deux l'icône de traduction, la sélection de la langue d'affichage
/// s'il existe des traductions déjà, ou l'icône pour traduire immédiatement ».
///
/// La légende d'une scène a DEUX sources (`SceneCaption.resolve`) :
/// - le TEXTE du post, en repli : il porte des traductions et se traduit à la
///   demande — la rangée s'y offre ;
/// - la légende PROPRE d'un média : elle porte ses propres traductions (#6280)
///   et se demande par sa propre route.
///
/// **Le site a déménagé, la garde le suit** (#6709). La scène de post a quitté
/// `SocialSceneFullscreenView` pour une PAGE de `ConversationMediaGalleryView` :
/// la légende et sa rangée vivent dans `+SceneCaption.swift`, la résolution de la
/// langue et du texte dans `GallerySceneCaption` (`PostGalleryLot.swift`), le
/// post tenu à jour pendant l'ouverture dans `SocialMediaGalleryPresentation.swift`.
/// La garde lit donc l'UNITÉ de la galerie avec ces compagnons : lire un seul
/// fichier d'un type découpé l'éteindrait en silence (`AppSourceGuard.unit`).
///
/// **Garde de SOURCE, et pourquoi.** La page ne se monte pas sans un document de
/// scène, un lecteur et un post complets ; ce qui est visé est ÉCRIT — le
/// branchement de l'emplacement, la distinction des deux sources, la demande de
/// traduction. La règle de l'offre est prouvée à part, pure
/// (`CaptionTranslationOfferTests`), et le texte servi par
/// `PostGalleryLotTests.test_laLegendeDUneScene_estServieDansLaLangueDuLecteur`.
final class SceneFullscreenCaptionTranslationGuardTests: XCTestCase {

    private func source(_ chemin: String) throws -> String {
        try String(
            contentsOf: URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent()   // Views
                .deletingLastPathComponent()   // Unit
                .deletingLastPathComponent()   // MeeshyTests
                .deletingLastPathComponent()   // ios
                .appendingPathComponent(chemin),
            encoding: .utf8
        )
    }

    /// La légende d'une page scène et sa rangée.
    private var bloc: String {
        get throws { try source("Meeshy/Features/Main/Views/ConversationMediaGalleryView+SceneCaption.swift") }
    }

    /// Le fichier racine de la galerie — là où le bloc est MONTÉ.
    private var galerie: String {
        get throws { try source("Meeshy/Features/Main/Views/ConversationMediaGalleryView.swift") }
    }

    /// L'hôte qui tient le post à jour pendant l'ouverture.
    private var hote: String {
        get throws { try source("Meeshy/Features/Main/Views/SocialMediaGalleryPresentation.swift") }
    }

    /// La galerie entière, le lot qui résout la langue et l'hôte.
    private var unite: String {
        get throws {
            try AppSourceGuard.unit(
                "Meeshy/Features/Main/Views/ConversationMediaGalleryView.swift",
                alsoIncluding: ["Meeshy/Features/Main/Views/PostGalleryLot.swift",
                                "Meeshy/Features/Main/Views/SocialMediaGalleryPresentation.swift"]
            )
        }
    }

    /// La fenêtre de l'appel à la légende partagée — l'emplacement doit y être
    /// passé, pas monté ailleurs dans l'écran.
    private func appelDeLaLegende(_ code: String) throws -> String {
        let debut = try XCTUnwrap(code.range(of: "MediaCaptionOverlay("), "La légende partagée n'est plus montée.")
        return String(code[debut.lowerBound...].prefix(1600))
    }

    func test_laLegende_recoitLaRangeeDeTraduction_dansSonEmplacement() throws {
        let appel = try appelDeLaLegende(bloc)
        XCTAssertTrue(appel.contains("accessory:"), "La rangée de traduction n'est pas passée à l'emplacement de la légende.")
        XCTAssertTrue(try bloc.contains("MediaCaptionTranslationRow("),
                      "La page scène ne monte pas la rangée de traduction.")
    }

    /// La rangée traduit le contenu AFFICHÉ, identifié par sa source : le texte
    /// du post par la route du post, la légende d'un média par la route de la
    /// légende (#6280) — jamais l'un par l'autre, même à chaînes égales.
    func test_laRangee_traduitLeContenuAffiche_texteDuPostOuLegendeDuMedia() throws {
        XCTAssertTrue(try source("Meeshy/Features/Main/Views/SceneCaption.swift").contains("enum Origin"),
                      "`SceneCaption` ne dit pas d'où vient la légende : impossible de savoir quel contenu traduire.")
        XCTAssertTrue(try unite.contains("CaptionTranslationSource.of("),
                      "La page scène ne dérive pas ce qu'elle traduit de la source affichée.")
        let code = try bloc
        XCTAssertTrue(code.contains("requestMediaCaptionTranslation(mediaId:"),
                      "La légende d'un média ne se demande pas par sa propre route.")
        XCTAssertTrue(code.contains("requestTranslation(postId:"),
                      "Le texte du post ne se demande plus par la route du post.")
    }

    /// Une langue choisie pour la légende d'une scène ne suit pas le lecteur sur
    /// la page suivante : c'est un autre contenu. Le bloc est monté avec
    /// l'identité de la PIÈCE, donc son état renaît à chaque page.
    func test_changerDeScene_oublieLaLangueChoisie() throws {
        let code = try galerie
        let debut = try XCTUnwrap(code.range(of: "GallerySceneCaptionBlock("),
                                  "La galerie ne monte plus la légende d'une scène.")
        XCTAssertTrue(String(code[debut.lowerBound...].prefix(700)).contains(".id(att.id)"),
                      "La langue choisie pour une légende survit au changement de page.")
    }

    /// L'icône de traduction ouvre LA feuille des messages et des audios
    /// (directive porteur 2026-09-14) — pas une demande directe vers une langue
    /// choisie à la place du lecteur.
    func test_lIconeDeTraduction_ouvreLaFeuilleDeTraductionDesMessages() throws {
        let code = try bloc
        XCTAssertTrue(code.contains(".sheet("), "La page scène ne présente aucune feuille.")
        XCTAssertTrue(code.contains("MessageLanguageDetailView("),
                      "La feuille présentée n'est pas celle des messages et des audios.")
        XCTAssertTrue(code.contains("textTranslations:"),
                      "La feuille ne reçoit pas les traductions du post : elle proposerait de traduire ce qui l'est déjà.")
    }

    /// Une langue choisie dans la feuille demande la traduction DU POST, pas
    /// celle d'un message qui n'existe pas.
    func test_uneLangueChoisieDansLaFeuille_demandeLaTraductionDuPost() throws {
        let code = try bloc
        XCTAssertTrue(code.contains("onRequestTextTranslation:"),
                      "La feuille retomberait sur la traduction locale d'un message.")
        XCTAssertTrue(code.contains("requestTranslation(postId:"),
                      "Aucune demande de traduction du post : le choix d'une langue serait sans effet.")
    }

    /// La feuille lit les traductions d'un MESSAGE par son identifiant ; un post
    /// n'en est pas un — la lecture partirait vers une route qui rend 404.
    func test_laFeuille_neLitPasLesTraductionsDUnMessagePourUnPost() throws {
        XCTAssertTrue(try bloc.contains("fetchesMessageTranslations: false"),
                      "La page scène laisse la feuille lire `/messages/<id du post>/translations`.")
        let feuille = try source("Meeshy/Features/Main/Components/MessageDetail/MessageLanguageDetailView.swift")
        XCTAssertTrue(feuille.contains("guard fetchesMessageTranslations"),
                      "La feuille n'a aucun moyen de sauter la lecture des traductions d'un message.")
    }

    /// Le texte affiché et le drapeau marqué actif viennent de la MÊME langue
    /// (recette 2026-09-14 : « Français » actif sur un texte portugais).
    func test_leTexteAffiche_etLeDrapeauActif_viennentDeLaMemeLangue() throws {
        let code = try unite
        XCTAssertTrue(code.contains("CaptionTranslationOffer.carrierText("),
                      "Le texte affiché ne se lit pas depuis la langue active.")
        XCTAssertTrue(try bloc.contains("activeLanguage: displayedLanguage"),
                      "Le drapeau actif ne vient pas de la langue dont le texte est affiché.")
        XCTAssertEqual(code.components(separatedBy: "displayedLanguage(preferredLanguages:").count - 1, 1,
                       "Plusieurs résolutions de langue subsistent : le drapeau et le texte peuvent diverger.")
        XCTAssertFalse(code.contains("post.resolvedLanguageCode("),
                       "La langue affichée se résout encore sur le post, quel que soit le contenu affiché.")
    }

    /// **Une traduction arrivée PENDANT que le plein écran est ouvert s'y affiche**
    /// (#6560). Recette staging 2026-09-14 : l'espagnol demandé depuis la feuille
    /// est gravé en 0,6 s, le store du fil le reçoit — et la roue tourne encore
    /// 30 s plus tard ; fermer puis rouvrir montre « Español ». Tant qu'il couvre
    /// le fil, la carte hôte ne relaie pas le post neuf : l'hôte de la galerie
    /// écoute lui-même les traductions de SON post, et c'est le post à jour qu'il
    /// remet aux pages scène.
    func test_uneTraductionArriveePendantLOuverture_sAfficheSansFermer() throws {
        let code = try hote
        XCTAssertTrue(code.contains(".onReceive(SocialSocketManager.shared.mediaCaptionTranslationUpdated"),
                      "L'hôte n'écoute pas les traductions de légende : il attend un post que la carte ne relaie pas.")
        XCTAssertTrue(code.contains(".onReceive(SocialSocketManager.shared.postTranslationUpdated"),
                      "L'hôte n'écoute pas les traductions du texte du post, que la même feuille demande.")
        XCTAssertTrue(code.contains("CaptionTranslationArrival.applying("),
                      "Les traductions reçues ne sont pas pliées sur le post affiché.")
        let contexte = try XCTUnwrap(code.range(of: "GallerySceneContext("), "Les pages scène ne reçoivent plus leur post.")
        XCTAssertTrue(String(code[contexte.lowerBound...].prefix(200)).contains("post: affiche"),
                      "La rangée et la feuille lisent le post de la carte, sans les traductions arrivées.")
    }

    /// La rangée n'appelle plus de traduction directe : l'icône, et la pastille
    /// qui porte le même glyphe, ouvrent la feuille (même icône ⇒ même effet).
    func test_laRangee_ouvreLaFeuille_parLIconeEtParLaPastille() throws {
        let rangee = try source("Meeshy/Features/Main/Views/MediaCaptionTranslationRow.swift")
        XCTAssertTrue(rangee.contains("onOpenTranslations"), "La rangée n'ouvre pas la feuille.")
        XCTAssertFalse(rangee.contains("onTranslateNow"), "La rangée traduit encore directement.")
        XCTAssertTrue(rangee.contains("TranslationsBadge(metrics: .overlay, action:"),
                      "La pastille de traduction reste décorative à côté d'une icône identique qui agit.")
    }
}
