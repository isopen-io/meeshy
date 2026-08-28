import XCTest
@testable import Meeshy

/// **#4036 — l'amorce « dernière capture » ne paraissait jamais.**
///
/// Elle est construite, câblée et documentée depuis S5 : l'ancre A4 de la
/// planche promet « la dernière photo accessible en 1 geste ». Elle ne s'est
/// pourtant jamais affichée — même autorisation COMPLÈTE accordée, l'auteur
/// voyait la capsule « Galerie » à sa place.
///
/// La cause était un mode de livraison. `.fastFormat` ne rend que ce qui est
/// DÉJÀ local et **ne télécharge jamais** : `isNetworkAccessAllowed` ne le
/// gouverne pas. Un asset iCloud dont la vignette locale a été purgée — ce qui
/// est le cas nominal sous « optimiser le stockage », le réglage par défaut —
/// rendait donc `nil`, et l'amorce disparaissait **sans un mot**.
///
/// Mesuré au simulateur le 2026-08-28, dans le log de PhotoKit :
///
///     [ImageManager] no resource found matching image request spec
///       … choose: fast-single, load: img, ver: curr, resize: fast
///
/// > Un repli qui rend `nil` en silence ne se voit pas dans les tests : il se
/// > voit à l'écran, sous la forme d'une affordance qui n'arrive jamais.
final class RecentCameraRollThumbnailModeTests: XCTestCase {

    func test_laVignette_nUtilisePlusUnModeQuiNeTelechargeJamais() throws {
        let code = try providerSource()

        XCTAssertTrue(
            code.contains("deliveryMode: .opportunistic"),
            "La vignette doit être demandée en `.opportunistic` : c'est le seul mode qui honore le "
                + "rapatriement réseau, et la couture sait déjà tenir son protocole « dégradé puis final »."
        )
        XCTAssertFalse(
            code.contains(".fastFormat"),
            "`.fastFormat` ne rend que ce qui est déjà local et ne télécharge JAMAIS. Sous « optimiser le "
                + "stockage » — le réglage par défaut — la dernière photo n'a souvent aucune vignette locale, "
                + "et l'amorce disparaît en silence."
        )
    }

    /// La permission de réseau était déjà là, et c'est ce qui rend le défaut
    /// sournois : le code AUTORISAIT le rapatriement, et le mode choisi ne s'en
    /// servait pas. Une intention posée qu'aucun réglage n'honore.
    func test_leRapatriementReseau_resteAutorise() throws {
        XCTAssertTrue(
            try providerSource().contains("options.isNetworkAccessAllowed = true"),
            "Sans lui, `.opportunistic` ne ferait pas mieux que `.fastFormat` sur un asset iCloud."
        )
    }

    /// Le plein format, lui, n'a jamais été en cause : il demandait déjà la
    /// meilleure qualité. Ce témoin l'ancre pour que la correction ci-dessus ne
    /// l'emporte pas au passage.
    func test_lePleinFormat_resteEnHauteQualite() throws {
        XCTAssertTrue(
            try providerSource().contains("deliveryMode: .highQualityFormat"),
            "L'insertion pleine résolution doit rester en haute qualité — c'est l'image PUBLIÉE."
        )
    }

    private func providerSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Services/RecentCameraRollAssetProvider.swift")
        let brut = try String(contentsOf: url, encoding: .utf8)
        XCTAssertGreaterThan(brut.count, 1000, "Source vide — la garde serait verte par omission.")
        return AppSourceGuard.stripComments(brut)
    }
}
