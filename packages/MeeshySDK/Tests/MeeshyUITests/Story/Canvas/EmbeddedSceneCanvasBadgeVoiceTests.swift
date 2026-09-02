import XCTest
import SwiftUI
@testable import MeeshyUI
@testable import MeeshySDK

/// **Le badge de sélection se DIT, pas seulement se voit** (2026-09-02).
///
/// Mesuré à l'écran : sur une scène où un texte est sélectionné, le badge
/// « TEXT · FG PLANE · z 1 » est parfaitement lisible au-dessus de l'objet —
/// et TOTALEMENT absent de l'arbre d'accessibilité, parce qu'il est peint dans
/// `StoryComposerCanvasView`, en UIKit.
///
/// > Un texte peint par UIKit sous un hôte SwiftUI ne rejoint aucun arbre : il
/// > n'est ni un `Text`, ni un élément d'accessibilité, et rien ne rougit. La
/// > seule façon de s'en apercevoir est de comparer ce que l'ŒIL reçoit à ce
/// > que `describe-all` rend — deux relevés du même écran qui ne disent pas la
/// > même chose.
///
/// Ce que l'absence coûtait : le badge est la SEULE chose qui dise quel objet
/// est sélectionné. Sans lui, un lecteur d'écran entend « STYLE · CLASSIC »,
/// « SIZE 96 » — des réglages sans sujet. Il règle la taille de quelque chose
/// qu'on ne lui a pas nommé.
@MainActor
final class EmbeddedSceneCanvasBadgeVoiceTests: XCTestCase {

    /// La garde porte sur la SOURCE : un modificateur d'accessibilité ne
    /// s'observe pas sans hôte SwiftUI monté, et ce qui compte ici est qu'il
    /// existe et qu'il lise le badge — pas la chaîne qu'il rend.
    private func source() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshyUI/Story/EmbeddedSceneCanvas.swift")
        return try String(contentsOf: url, encoding: .utf8)
            .components(separatedBy: .whitespacesAndNewlines).joined()
    }

    /// Le fusible : sans lui, la garde serait VERTE par omission le jour où le
    /// fichier déménage.
    func test_laGardeLitUneSourceNonVide() throws {
        XCTAssertGreaterThan(try source().count, 3_000)
    }

    /// **LE témoin.** Le badge alimente une valeur d'accessibilité.
    func test_leBadge_alimenteUneValeurDAccessibilite() throws {
        XCTAssertTrue(try source().contains(".accessibilityValue(selectionBadge"),
                      "le badge est peint en UIKit : sans ce relais, il n'atteint aucun arbre")
    }

    /// **Une VALEUR, pas un libellé ni un `Text` caché.** Le badge n'est pas un
    /// contrôle, c'est l'ÉTAT du canvas : VoiceOver doit l'annoncer AVEC
    /// l'élément qu'il qualifie, au lieu d'en faire une halte de plus dans le
    /// balayage.
    func test_leBadge_estUneVALEUR_pasUnElementDeBalayage() throws {
        let src = try source()
        XCTAssertTrue(src.contains(".accessibilityElement(children:.contain)"),
                      "le canvas doit CONTENIR ses enfants — les remplacer masquerait "
                      + "les objets que le lecteur peut encore atteindre")
        XCTAssertFalse(src.contains(".accessibilityLabel(selectionBadge"),
                       "un libellé remplacerait le NOM du canvas par l'état de sa sélection")
    }

    /// **Sans sélection, la valeur est vide plutôt qu'absente.** Une valeur
    /// optionnelle qui disparaît fait varier ce que VoiceOver annonce d'un
    /// rendu à l'autre ; une chaîne vide n'est simplement pas lue.
    func test_sansSelection_laValeurEstVide() throws {
        XCTAssertTrue(try source().contains("??Text(verbatim:\"\")"),
                      "pas de sélection ⇒ rien à dire, et rien de dit")
    }
}
