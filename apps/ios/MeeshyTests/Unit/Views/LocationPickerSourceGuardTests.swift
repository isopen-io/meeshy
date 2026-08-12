import XCTest

/// Deux régressions visuelles que rien d'autre n'attrape.
///
/// Une troisième garde — « `onSelect` ne reçoit jamais `selectedPlace` brut » —
/// a été écartée : c'est une assertion sur le TEXTE du source, que le moindre
/// `extract` casse sans qu'aucun comportement ne change.
/// `LocationPickerModelTests` couvre la même propriété par le comportement.
final class LocationPickerSourceGuardTests: XCTestCase {

    private func pickerSource() throws -> String {
        // 4 remontées : le fichier lui-même, puis Views/, Unit/, MeeshyTests/ —
        // ce qui laisse `apps/ios/`.
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Views
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Components/LocationPickerView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// Commentaires retirés : une mention de `MapUserLocationButton` dans une
    /// explication du POURQUOI ne doit pas faire échouer la garde.
    private func strippingComments(_ source: String) -> String {
        source
            .split(separator: "\n", omittingEmptySubsequences: false)
            .map { line -> String in
                guard let range = line.range(of: "//") else { return String(line) }
                return String(line[line.startIndex..<range.lowerBound])
            }
            .joined(separator: "\n")
    }

    /// Le `MapUserLocationButton` système se rend en haut-trailing, SOUS la
    /// barre de recherche flottante, où il est inatteignable — c'est le défaut
    /// signalé sur la capture du 2026-08-09. Le picker pose son propre bouton.
    func test_picker_nUtilisePlusLeBoutonDeLocalisationSysteme() throws {
        let source = strippingComments(try pickerSource())

        XCTAssertFalse(
            source.contains("MapUserLocationButton"),
            "le picker doit poser son propre contrôle de recentrage, pas celui de mapControls"
        )
    }

    /// « Ma position » de la carte du bas faisait doublon avec le contrôle de
    /// recentrage. Un seul survit.
    func test_picker_nAPlusDeBoutonMaPositionDansLaCarteDuBas() throws {
        let source = strippingComments(try pickerSource())

        XCTAssertFalse(
            source.contains("location.my-position"),
            "le bouton « Ma position » a été remplacé par le contrôle de recentrage flottant"
        )
    }
}
