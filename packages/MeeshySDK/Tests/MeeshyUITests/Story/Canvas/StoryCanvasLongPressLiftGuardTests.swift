import XCTest
@testable import MeeshyUI

/// **Un appui long ARMÉ rend sa durée et sa fin** (#5041).
///
/// > Directive porteur : « il faut que le simple longpress declenche la photo et
/// > non pas juste l'objectif, si on a un vrai longpress ca declenche la capture
/// > vidéo avec le chrono ».
///
/// `handleBackgroundLongPress` filtrait `state == .began` et n'émettait rien
/// d'autre : de quoi ouvrir un objectif, jamais de quoi TENIR une prise.
///
/// ## Ce que ce témoin peut, et ce qu'il ne peut pas
///
/// C'est une garde de SOURCE : elle prouve qu'une ligne existe, **pas qu'elle
/// s'exécute**. Le comportement réel demande un `UILongPressGestureRecognizer`
/// piloté par UIKit, que rien ne simule fidèlement hors d'un appareil. Ce qu'elle
/// tient est l'invariant structurel qui compte — **l'armement est posé dans la
/// seule branche `.openViewfinder`**, jamais avant les gardes — parce que c'est
/// exactement l'endroit qu'une retouche distraite déplacerait.
final class StoryCanvasLongPressLiftGuardTests: XCTestCase {

    private func sdkSource(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Canvas/
            .deletingLastPathComponent()   // Story/
            .deletingLastPathComponent()   // MeeshyUITests/
            .deletingLastPathComponent()   // Tests/
            .deletingLastPathComponent()   // MeeshySDK/
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func gestures() throws -> String {
        try sdkSource("Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+Gestures.swift")
    }

    /// **Non-vacuité, et elle n'est pas décorative ici.** Le chemin remonte CINQ
    /// niveaux ; en compter quatre rendrait une URL inexistante, `sdkSource`
    /// lèverait — mais un test qui lirait une source VIDE ferait passer chaque
    /// assertion négative pour la meilleure des raisons apparentes.
    func test_leTemoin_litBienLeHandler() throws {
        let src = try gestures()
        XCTAssertTrue(src.contains("func handleBackgroundLongPress("),
                      "le témoin doit lire le handler qu'il prétend garder")
        XCTAssertGreaterThan(src.count, 2000,
                             "une source tronquée rendrait les négatives vraies pour rien")
    }

    /// L'armement n'est posé QUE dans la branche du viseur : un appui long qui
    /// ouvre le menu d'un fond n'arme aucune prise, et un `.began` refusé par les
    /// trois gardes n'en arme pas davantage.
    func test_lArmement_estPoseDansLaSeuleBrancheDuViseur() throws {
        let nu = try gestures()
            .replacingOccurrences(of: " ", with: "")
            .replacingOccurrences(of: "\n", with: "")
        XCTAssertTrue(nu.contains("case.openViewfinder:backgroundLongPressOrigin=recognizer.location(in:self)"),
                      "l'armement suit immédiatement le verdict `.openViewfinder`")
        XCTAssertFalse(nu.contains("case.presentBackgroundMenu(letid):backgroundLongPressOrigin"),
                       "ouvrir un menu n'arme aucune prise")
    }

    /// Les deux levées sortent tôt quand rien n'est armé. Sans ces gardes,
    /// relâcher un appui long refusé — en lecture, sur un objet, pendant une
    /// saisie — terminerait une prise que rien n'avait commencée.
    func test_lesLevees_sortentTotSansArmement() throws {
        let nu = try gestures()
            .replacingOccurrences(of: " ", with: "")
            .replacingOccurrences(of: "\n", with: "")
        XCTAssertTrue(nu.contains("case.changed:guardletorigine=backgroundLongPressOriginelse{return}"),
                      "la translation exige un armement")
        XCTAssertTrue(nu.contains("case.ended,.cancelled,.failed:guardbackgroundLongPressOrigin!=nilelse{return}"),
                      "le relâchement exige un armement — et `.cancelled` rend le même verdict "
                      + "que `.ended`, sans quoi un geste interrompu par le système laisserait "
                      + "la prise ouverte")
        XCTAssertTrue(nu.contains("backgroundLongPressOrigin=nil"),
                      "et le relâchement DÉSARME, sinon la levée suivante partirait seule")
    }
}
