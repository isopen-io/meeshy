import XCTest

/// LE PLEIN ÉCRAN D'UNE SCÈNE POSE LA TRADUCTION ENTRE SA LÉGENDE ET « VOIR MOINS » (#6504).
///
/// Directive porteur 2026-09-14, sur une capture de ce plein écran : « mettre
/// entre les deux l'icône de traduction, la sélection de la langue d'affichage
/// s'il existe des traductions déjà, ou l'icône pour traduire immédiatement ».
///
/// La légende de ce plein écran a DEUX sources (`SceneCaption.resolve`) :
/// - le TEXTE du post, en repli : il porte des traductions et se traduit à la
///   demande — la rangée s'y offre ;
/// - la légende PROPRE d'un média : aucune carte de traductions ne la couvre
///   aujourd'hui (#6280). Y poser un sélecteur ou un « traduire » serait offrir
///   un contrôle sans effet (loi 4) — la rangée ne s'y offre pas.
///
/// **Garde de SOURCE, et pourquoi.** Le plein écran ne se monte pas sans un
/// document de scène, un lecteur et un post complets ; ce qui est visé est
/// ÉCRIT — le branchement de l'emplacement, la distinction des deux sources, la
/// demande de traduction. La règle de l'offre est prouvée à part, pure
/// (`CaptionTranslationOfferTests`).
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

    private var pleinEcran: String {
        get throws { try source("Meeshy/Features/Main/Views/SocialSceneFullscreenView.swift") }
    }

    /// La fenêtre de l'appel à la légende partagée — l'emplacement doit y être
    /// passé, pas monté ailleurs dans l'écran.
    private func appelDeLaLegende(_ code: String) throws -> String {
        let debut = try XCTUnwrap(code.range(of: "MediaCaptionOverlay("), "La légende partagée n'est plus montée.")
        return String(code[debut.lowerBound...].prefix(1600))
    }

    func test_laLegende_recoitLaRangeeDeTraduction_dansSonEmplacement() throws {
        let appel = try appelDeLaLegende(pleinEcran)
        XCTAssertTrue(appel.contains("accessory:"), "La rangée de traduction n'est pas passée à l'emplacement de la légende.")
        XCTAssertTrue(try pleinEcran.contains("MediaCaptionTranslationRow("),
                      "Le plein écran ne monte pas la rangée de traduction.")
    }

    /// La rangée ne s'offre que pour le TEXTE du post : la légende propre d'un
    /// média n'a pas de traductions (#6280).
    func test_laRangee_neSOffreQuePourLeTexteDuPost() throws {
        XCTAssertTrue(try source("Meeshy/Features/Main/Views/SceneCaption.swift").contains("enum Origin"),
                      "`SceneCaption` ne dit pas d'où vient la légende : impossible de ne traduire que le texte du post.")
        XCTAssertTrue(try pleinEcran.contains(".carrierText"),
                      "Le plein écran n'offre pas la rangée sur la seule origine « texte du post ».")
    }

    /// L'icône de traduction ouvre LA feuille des messages et des audios
    /// (directive porteur 2026-09-14) — pas une demande directe vers une langue
    /// choisie à la place du lecteur.
    func test_lIconeDeTraduction_ouvreLaFeuilleDeTraductionDesMessages() throws {
        let code = try pleinEcran
        XCTAssertTrue(code.contains(".sheet("), "Le plein écran ne présente aucune feuille.")
        XCTAssertTrue(code.contains("MessageLanguageDetailView("),
                      "La feuille présentée n'est pas celle des messages et des audios.")
        XCTAssertTrue(code.contains("textTranslations:"),
                      "La feuille ne reçoit pas les traductions du post : elle proposerait de traduire ce qui l'est déjà.")
    }

    /// Une langue choisie dans la feuille demande la traduction DU POST, pas
    /// celle d'un message qui n'existe pas.
    func test_uneLangueChoisieDansLaFeuille_demandeLaTraductionDuPost() throws {
        let code = try pleinEcran
        XCTAssertTrue(code.contains("onRequestTextTranslation:"),
                      "La feuille retomberait sur la traduction locale d'un message.")
        XCTAssertTrue(code.contains("requestTranslation(postId:"),
                      "Aucune demande de traduction du post : le choix d'une langue serait sans effet.")
    }

    /// La feuille lit les traductions d'un MESSAGE par son identifiant ; un post
    /// n'en est pas un — la lecture partirait vers une route qui rend 404.
    func test_laFeuille_neLitPasLesTraductionsDUnMessagePourUnPost() throws {
        XCTAssertTrue(try pleinEcran.contains("fetchesMessageTranslations: false"),
                      "Le plein écran laisse la feuille lire `/messages/<id du post>/translations`.")
        let feuille = try source("Meeshy/Features/Main/Components/MessageDetail/MessageLanguageDetailView.swift")
        XCTAssertTrue(feuille.contains("guard fetchesMessageTranslations"),
                      "La feuille n'a aucun moyen de sauter la lecture des traductions d'un message.")
    }

    /// Le texte du post affiché et le drapeau marqué actif viennent de la MÊME
    /// langue (recette 2026-09-14 : « Français » actif sur un texte portugais).
    func test_leTexteAffiche_etLeDrapeauActif_viennentDeLaMemeLangue() throws {
        let code = try pleinEcran
        XCTAssertTrue(code.contains("CaptionTranslationOffer.carrierText("),
                      "Le texte du post affiché ne se lit pas depuis la langue active.")
        XCTAssertTrue(code.contains("activeLanguage: langueAffichee"),
                      "Le drapeau actif ne vient pas de la langue dont le texte est affiché.")
        XCTAssertEqual(code.components(separatedBy: "post.resolvedLanguageCode(").count - 1, 1,
                       "Plusieurs résolutions de langue subsistent : le drapeau et le texte peuvent diverger.")
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
