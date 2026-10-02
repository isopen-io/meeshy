import XCTest
@testable import Meeshy

/// **Un lien Meeshy touché DANS l'app s'ouvre dans l'app — sur iPhone ET sur iPad** (#7808).
///
/// iOS ne renvoie jamais à une app un lien universel qu'elle ouvre elle-même :
/// sans `OpenURLAction`, toucher `https://meeshy.me/story/<id>` dans un message
/// part dans Safari. L'iPhone posait l'action en ligne dans `RootView` ;
/// l'iPad n'en posait AUCUNE — mesuré au simulateur le 2026-09-24, le lien
/// d'une story dans une conversation ouvrait Safari sur la page de connexion
/// du web. La politique vit désormais à un seul endroit, et les deux racines
/// la posent.
@MainActor
final class InAppLinksTests: XCTestCase {

    func test_unLienMeeshy_sOuvreDansLApp() {
        for raw in ["https://meeshy.me/story/s1", "https://www.meeshy.me/reel/r1",
                    "https://meeshy.me/u/alice", "meeshy://c/conv1"] {
            XCTAssertTrue(InAppLinks.opensInApp(URL(string: raw)!), "\(raw) s'ouvre dans l'app")
        }
    }

    func test_unLienExterne_partDansLeNavigateur() {
        for raw in ["https://example.com/a", "https://meeshy.me/settings", "https://meeshy.me/communities/new"] {
            XCTAssertFalse(InAppLinks.opensInApp(URL(string: raw)!), "\(raw) part dans Safari")
        }
    }

    /// Les deux racines posent la MÊME politique : une racine qui l'oublie
    /// renvoie tous les liens de ses messages à Safari, sans qu'aucun autre
    /// témoin ne rougisse.
    func test_lesDeuxRacinesPosentLaPolitique() throws {
        let views = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views")
        for file in ["RootView.swift", "RootLayers/iPadRootViewLayers.swift"] {
            let source = try String(contentsOf: views.appendingPathComponent(file), encoding: .utf8)
            XCTAssertTrue(source.contains(".inAppLinks(router: router)"), "\(file) doit poser .inAppLinks(router:)")
        }
    }

    /// **La politique couvre ce que les racines PRÉSENTENT** (#9075).
    ///
    /// Une couverture plein écran hérite de l'environnement de SON point
    /// d'attache. Posée avant les couches qui présentent le lecteur de story,
    /// l'action laissait ce lecteur à l'action système : un lien `/l/` touché
    /// dans une légende partait dans Safari (mesuré au simulateur le
    /// 2026-10-02). Elle doit donc envelopper la DERNIÈRE couche.
    func test_laPolitiqueEnveloppeLesCouchesQuiPresententLeLecteur() throws {
        let views = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views")
        let iphone = try String(contentsOf: views.appendingPathComponent("RootView.swift"), encoding: .utf8)
        let politique = try XCTUnwrap(iphone.range(of: ".inAppLinks(router: router)"))
        let derniereCouche = try XCTUnwrap(iphone.range(of: ".modifier(RootSheetsLayer(", options: .backwards))
        let portes = try XCTUnwrap(iphone.range(of: ".modifier(RootStoryDoorsLayer("))
        XCTAssertGreaterThan(politique.lowerBound, derniereCouche.lowerBound,
                             "iPhone : `.inAppLinks` doit suivre la dernière couche de `RootView.body`")
        XCTAssertGreaterThan(politique.lowerBound, portes.lowerBound)

        let ipad = try String(contentsOf: views.appendingPathComponent("RootLayers/iPadRootViewLayers.swift"),
                              encoding: .utf8)
        let politiqueIPad = try XCTUnwrap(ipad.range(of: ".inAppLinks(router: router)"))
        let lecteurIPad = try XCTUnwrap(ipad.range(of: ".fullScreenCover(isPresented: $showStoryViewerFromConv)"))
        XCTAssertGreaterThan(politiqueIPad.lowerBound, lecteurIPad.lowerBound,
                             "iPad : `.inAppLinks` doit envelopper la couche qui présente le lecteur de story")
    }
}
