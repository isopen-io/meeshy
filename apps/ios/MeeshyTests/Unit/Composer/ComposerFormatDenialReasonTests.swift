import XCTest
@testable import Meeshy

/// **#4858 — un refus de format nommait le mauvais remède.**
///
/// Mesuré au simulateur iPhone 16 Pro, build `dce487236f`, éventail de format
/// depuis « Share something » :
///
/// | état du composer | ce que l'éventail disait | ce qu'il fallait faire |
/// |---|---|---|
/// | rien du tout | « Ne porte que du texte » | **écrire** quelque chose |
/// | une photo, une scène | « Ne porte que du texte » | **retirer** le média |
///
/// La règle refuse pour deux causes OPPOSÉES — `guard !hasMedia, !hasScene`
/// d'un côté, `!text.isEmpty` de l'autre — et une seule phrase les couvrait.
/// Elle est juste pour la seconde et trompeuse pour la première.
///
/// ## Le principe était écrit, à un grain trop grossier
///
/// `ComposerFormatAvailability.reason` porte ce doc-comment :
///
/// > « **Chaque refus a sa propre phrase.** Deux formats qui refusent pour le
/// > même motif n'enseignent rien : l'auteur apprend "non", pas "quoi faire". »
///
/// Juste, et appliqué au FORMAT quand la cause vit un cran plus bas. La
/// signature `reason(for format:)` ne POUVAIT pas dire autre chose — la cause
/// n'y entrait pas. Ce lot la fait entrer.
final class ComposerFormatDenialReasonTests: XCTestCase {

    /// **La propriété du lot, et la seule qui ne puisse pas se contourner.**
    ///
    /// L'assertion porte sur la DIFFÉRENCE plutôt que sur le texte : une
    /// assertion littérale dépendrait de la locale que l'hôte de test présente,
    /// et rendrait le même verdict avec et sans localisation — donc ne
    /// prouverait rien (voir la note de `ComposerObjectChips` sur `.current`).
    func test_leMood_refusePourDeuxCauses_etLesNommeDIFFEREMMENT() {
        let trop = ComposerFormatAvailability.reason(for: .status, carriesMoreThanText: true)
        let pasAssez = ComposerFormatAvailability.reason(for: .status, carriesMoreThanText: false)
        XCTAssertNotEqual(trop, pasAssez,
                          "« trop de matière » et « pas assez » sont des causes opposées : "
                          + "les couvrir d'une phrase enseigne « non », pas « quoi faire ».")
        XCTAssertFalse(trop.isEmpty)
        XCTAssertFalse(pasAssez.isEmpty)
    }

    /// Les trois autres formats ne refusent que pour une cause : leur phrase ne
    /// dépend pas de la composition, et l'écrire ici interdit qu'un lot future
    /// leur en fabrique une par inadvertance.
    func test_lesAutresFormats_neVarientPasAvecLaComposition() {
        for format in [ComposerFormat.post, .story, .reel] {
            XCTAssertEqual(
                ComposerFormatAvailability.reason(for: format, carriesMoreThanText: true),
                ComposerFormatAvailability.reason(for: format, carriesMoreThanText: false),
                "\(format) n'a qu'une cause de refus — sa phrase ne doit pas varier."
            )
        }
    }

    /// **Les verdicts font PASSER la composition.** Sans ce relais, la règle
    /// serait juste et la vue montrerait toujours la même phrase : le défaut se
    /// serait déplacé d'un cran sans qu'un témoin de règle le voie.
    func test_lesVerdicts_transmettentLaComposition() {
        let trop = ComposerFormatAvailability.verdicts(candidates: [.status],
                                                      offered: [],
                                                      carriesMoreThanText: true)
        let pasAssez = ComposerFormatAvailability.verdicts(candidates: [.status],
                                                          offered: [],
                                                          carriesMoreThanText: false)
        XCTAssertNotEqual(trop.first?.reason, pasAssez.first?.reason)
    }

    /// Un format OFFERT n'a pas de raison — la composition ne change rien à ça.
    func test_unFormatOFFERT_nAAucuneRaison() {
        for plus in [true, false] {
            let verdicts = ComposerFormatAvailability.verdicts(candidates: [.status],
                                                              offered: [.status],
                                                              carriesMoreThanText: plus)
            XCTAssertTrue(verdicts.first?.isChoosable == true)
            XCTAssertNil(verdicts.first?.reason)
        }
    }

    // MARK: - Le RÉEL disait quelque chose de faux

    /// **`qualifiesAsReel` accepte TROIS formes** — une vidéo ≥ 3 s, un SON
    /// ≥ 3 s, ou au moins DEUX images. Le refus n'en nommait qu'une.
    ///
    /// Un auteur avec deux photos — à une photo près de qualifier — était
    /// envoyé chercher une vidéo. Ce n'est pas une ambiguïté comme celle du
    /// mood : c'est une information FAUSSE.
    ///
    /// Le témoin porte sur la SOURCE parce que la phrase servie dépend de la
    /// locale de l'hôte : ce qui doit être garanti est que le libellé de
    /// référence nomme les trois chemins, pas qu'une langue donnée les rende.
    func test_leRefusDuReel_nommeSesTROIS_chemins() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/ComposerFormatFan.swift")
        let code = try String(contentsOf: url, encoding: .utf8)
        guard let debut = code.range(of: "composer.format.denied.reel"),
              let fin = code.range(of: "case .status", range: debut.upperBound..<code.endIndex) else {
            return XCTFail("Le motif du réel a changé de forme.")
        }
        let libelle = String(code[debut.upperBound..<fin.lowerBound]).lowercased()
        XCTAssertTrue(libelle.contains("vidéo"), "La vidéo est le premier chemin.")
        XCTAssertTrue(libelle.contains("son"), "Un son de 3 s qualifie aussi.")
        XCTAssertTrue(libelle.contains("photo"), "Deux images qualifient aussi.")
    }
}
