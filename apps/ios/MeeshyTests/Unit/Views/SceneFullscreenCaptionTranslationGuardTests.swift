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

    /// « Traduire maintenant » demande réellement la traduction.
    func test_traduireMaintenant_demandeLaTraduction() throws {
        XCTAssertTrue(try pleinEcran.contains("requestTranslation(postId:"),
                      "« Traduire maintenant » n'appelle aucun service : ce serait un contrôle inerte.")
    }
}
