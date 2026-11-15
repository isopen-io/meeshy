import XCTest

/// **L'onboarding se pose AU-DESSUS du chrome global** (#7729, relecture du
/// 2026-09-24).
///
/// Le calque d'onboarding est un `.overlay` : il ne recouvre que ce qui a été
/// chaîné AVANT lui. Monté dans `RootStoryDoorsLayer`, il passait SOUS
/// `RootChromeLayer` — la pastille de synchronisation (« Synchronisation »,
/// l'état le plus probable au démarrage à froid qui suit l'inscription) flottait
/// sur l'illustration et le titre de la carte, et la toucher naviguait sous le
/// calque. Le mini-lecteur et la bannière d'appel faisaient de même.
///
/// Une garde de SOURCE, parce que la règle est un ORDRE de câblage : l'aperçu
/// DEBUG monte le calque au niveau de l'app, au-dessus de tout, et ne peut donc
/// pas voir la régression ; aucun test unitaire ne monte la racine connectée.
final class OnboardingAboveGlobalChromeGuardTests: XCTestCase {

    private static let iPhoneLayers = "Meeshy/Features/Main/Views/RootLayers/RootViewLayers.swift"
    private static let iPadLayers = "Meeshy/Features/Main/Views/RootLayers/iPadRootViewLayers.swift"
    private static let host = ".onboardingHost("

    private func source(_ chemin: String) throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(chemin))
    }

    private func offset(of needle: String, in haystack: String, file: StaticString = #filePath, line: UInt = #line) -> String.Index? {
        let range = haystack.range(of: needle)
        XCTAssertNotNil(range, "« \(needle) » introuvable", file: file, line: line)
        return range?.lowerBound
    }

    private func occurrences(of needle: String, in haystack: String) -> Int {
        haystack.components(separatedBy: needle).count - 1
    }

    func test_iPhone_lOnboardingEstMonteUneFois_apresLaPastilleEtLaPresentationDAppel() throws {
        let layers = try source(Self.iPhoneLayers)
        XCTAssertEqual(occurrences(of: Self.host, in: layers), 1,
                       "L'hôte d'onboarding se monte UNE fois sur la racine iPhone.")
        let chrome = try XCTUnwrap(offset(of: "struct RootChromeLayer", in: layers))
        let banner = try XCTUnwrap(layers.range(of: "ConnectionBanner(", range: chrome..<layers.endIndex)?.lowerBound)
        let call = try XCTUnwrap(layers.range(of: "CallPresentationLayer(", range: chrome..<layers.endIndex)?.lowerBound)
        let mount = try XCTUnwrap(offset(of: Self.host, in: layers))
        let nextLayer = try XCTUnwrap(offset(of: "struct RootSheetsLayer", in: layers))
        XCTAssertGreaterThan(mount, banner,
                             "L'onboarding doit être chaîné APRÈS la pastille de synchronisation : sinon elle flotte sur la carte.")
        XCTAssertGreaterThan(mount, call,
                             "L'onboarding doit être chaîné APRÈS la présentation d'appel (mini-lecteur, bannière).")
        XCTAssertLessThan(mount, nextLayer,
                          "L'onboarding vit dans `RootChromeLayer`, jamais posé nu sur la racine (#5837).")
    }

    func test_iPad_lOnboardingEstMonteUneFois_apresLaPastilleEtLaPresentationDAppel() throws {
        let layers = try source(Self.iPadLayers)
        XCTAssertEqual(occurrences(of: Self.host, in: layers), 1,
                       "L'hôte d'onboarding se monte UNE fois sur la racine iPad.")
        let chrome = try XCTUnwrap(offset(of: "struct iPadCoversAndChromeLayer", in: layers))
        let banner = try XCTUnwrap(layers.range(of: "ConnectionBanner(", range: chrome..<layers.endIndex)?.lowerBound)
        let call = try XCTUnwrap(layers.range(of: "CallPresentationLayer(", range: chrome..<layers.endIndex)?.lowerBound)
        let mount = try XCTUnwrap(offset(of: Self.host, in: layers))
        XCTAssertGreaterThan(mount, banner,
                             "L'onboarding iPad doit être chaîné APRÈS la pastille de synchronisation.")
        XCTAssertGreaterThan(mount, call,
                             "L'onboarding iPad doit être chaîné APRÈS la présentation d'appel.")
    }
}
