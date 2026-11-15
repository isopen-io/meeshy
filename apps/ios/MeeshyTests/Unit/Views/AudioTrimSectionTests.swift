import XCTest
@testable import Meeshy

/// **« Rogner » dit dans quel état il est** (#4667).
///
/// > Directive porteur 2026-09-01 : « Le son de bibliothèque ne peut pas être
/// > rogné correctement ! Il faut charger le son et appliquer le rognage ! »
///
/// La zone se montait sur deux conditions qui décrivent l'ARRIVÉE d'un fichier.
/// Un son emprunté n'en a pas tant qu'il n'est pas rapatrié : la zone était donc
/// absente pendant le téléchargement, absente si l'URL ne se résolvait pas,
/// absente si le réseau échouait — et absente, dans les trois cas, exactement
/// comme quand il n'y a rien à rogner.
final class AudioTrimSectionTests: XCTestCase {

    func test_sansPiste_laZoneNExistePas() {
        XCTAssertEqual(
            AudioTrimSection.resolve(acquisition: .direct, hasLocalTrack: false, duration: 0),
            .hidden)
    }

    func test_unePisteLocaleQuiDure_monteLesPoignees() {
        XCTAssertEqual(
            AudioTrimSection.resolve(acquisition: .direct, hasLocalTrack: true, duration: 12),
            .trimmer)
    }

    /// Une durée nulle ne monte rien : deux poignées superposées sur une bande
    /// de largeur nulle ne se manipulent pas.
    func test_unePisteDeDureeNulle_neMontePasDePoignees() {
        XCTAssertEqual(
            AudioTrimSection.resolve(acquisition: .direct, hasLocalTrack: true, duration: 0),
            .hidden)
    }

    // MARK: - Les deux états que le silence rendait identiques

    func test_pendantLeRapatriement_laZoneDitQuElleCharge() {
        XCTAssertEqual(
            AudioTrimSection.resolve(acquisition: .loading, hasLocalTrack: false, duration: 0),
            .loading)
    }

    /// **Un échec se DIT.** C'est ce qui sépare « ce son n'arrive pas » de « ce
    /// son n'est pas rognable » — deux phrases que le `return` muet servait de
    /// la même façon.
    func test_unEchecDeRapatriement_seDitEtNeSeTaitPas() {
        XCTAssertEqual(
            AudioTrimSection.resolve(acquisition: .failed, hasLocalTrack: false, duration: 0),
            .failed)
    }

    // MARK: - L'ordre des priorités, et pourquoi il est dans ce sens

    /// **Une piste PÉRIMÉE ne prime pas sur un rapatriement en cours.**
    ///
    /// L'auteur peut changer de son dans la bibliothèque sans fermer la
    /// feuille : l'ancienne piste est encore là pendant que la nouvelle
    /// arrive. Rendre ses poignées ferait viser un extrait d'un son qui ne
    /// partira pas — un défaut pire que l'attente, parce qu'il a l'air de
    /// marcher.
    func test_unePisteAncienne_neCoiffePasUnRapatriementEnCours() {
        XCTAssertEqual(
            AudioTrimSection.resolve(acquisition: .loading, hasLocalTrack: true, duration: 30),
            .loading)
    }

    func test_unePisteAncienne_neCoiffePasUnEchec() {
        XCTAssertEqual(
            AudioTrimSection.resolve(acquisition: .failed, hasLocalTrack: true, duration: 30),
            .failed)
    }
}
