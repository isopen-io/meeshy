import XCTest
@testable import Meeshy

/// #4099 (vue `4b`) — **la prise se fait en segments, et un segment est un
/// FICHIER.**
final class ComposerCaptureSegmentsTests: XCTestCase {

    private func seg(_ d: TimeInterval, _ nom: String = "s") -> ComposerCaptureSegment {
        ComposerCaptureSegment(id: nom,
                               url: URL(fileURLWithPath: "/tmp/\(nom).mov"),
                               duration: d)
    }

    /// La capsule compte le temps de la PRISE, pas du dernier geste.
    func test_laDurée_estLaSomme_pasLaDernière() {
        XCTAssertEqual(ComposerCaptureSegments.totalDuration(
            [seg(2.2, "a"), seg(1.4, "b"), seg(3.1, "c")]), 6.7, accuracy: 0.001)
    }

    /// Une durée négative — une horloge qui recule, un fichier mal lu — ne
    /// RETRANCHE pas du total. Sans cette borne, un segment aberrant
    /// raccourcirait la prise entière et la barre du haut mentirait sur tout.
    func test_uneDuréeAberrante_neRetranchePasDuTotal() {
        XCTAssertEqual(ComposerCaptureSegments.totalDuration(
            [seg(3, "a"), seg(-5, "b")]), 3, accuracy: 0.001)
    }

    /// **`✓` sur une prise vide serait pire qu'absent** : un geste explicite de
    /// validation qui laisse la scène inchangée ressemble à une panne.
    func test_valider_nEstOffertQueSurUneMatièreExistante() {
        XCTAssertFalse(ComposerCaptureSegments.canValidate([]))
        XCTAssertTrue(ComposerCaptureSegments.canValidate([seg(0.1)]))
    }

    /// **Retirer rend le FICHIER**, il ne recompose rien — c'est la phrase de
    /// la planche, et c'est ce qui rend le geste instantané.
    func test_retirerLeDernier_rendLeFichierÀSupprimer() {
        let (gardés, orphelin) = ComposerCaptureSegments.droppingLast(
            [seg(2, "a"), seg(1, "b")])
        XCTAssertEqual(gardés.map(\.id), ["a"])
        XCTAssertEqual(orphelin?.lastPathComponent, "b.mov")
    }

    /// Le bouton peut survivre d'une frame au dernier retrait : `nil` plutôt
    /// qu'un crash.
    func test_retirerSurUneListeVide_neRendRien_etNeCrashePas() {
        let (gardés, orphelin) = ComposerCaptureSegments.droppingLast([])
        XCTAssertTrue(gardés.isEmpty)
        XCTAssertNil(orphelin)
    }

    /// Les parts somment à 1 : c'est ce qui fait que le bandeau remplit la
    /// largeur exactement, quel que soit le nombre de segments.
    func test_lesParts_sommentÀUn() {
        let parts = ComposerCaptureSegments.shares([seg(2.2, "a"), seg(1.4, "b"), seg(3.1, "c")])
        XCTAssertEqual(parts.reduce(0, +), 1.0, accuracy: 0.0001)
        XCTAssertEqual(parts[0], 2.2 / 6.7, accuracy: 0.0001)
    }

    /// **Le cas qui divise par zéro.** Des segments encore en écriture, ou une
    /// prise si brève qu'elle arrondit à zéro, donnent un total nul. Des parts
    /// ÉGALES sont fausses d'un cheveu ; une barre vide ferait croire que rien
    /// n'a été pris — et c'est le seul des deux mensonges qui envoie l'auteur
    /// recommencer une prise qu'il a déjà faite.
    func test_uneDuréeTotaleNulle_répartitÉgalement_plutôtQueDeDiviserParZéro() {
        let parts = ComposerCaptureSegments.shares([seg(0, "a"), seg(0, "b")])
        XCTAssertEqual(parts, [0.5, 0.5])
        XCTAssertEqual(ComposerCaptureSegments.shares([]).count, 0)
    }

    /// **Un segment unique EST le fichier final.** Le passer au concaténateur
    /// le ré-écrirait pour rien, quand la planche promet « quasi instantané
    /// quelle que soit la durée ».
    func test_unSegmentUnique_neSeFusionnePas() {
        XCTAssertFalse(ComposerCaptureSegments.needsMerge([seg(9, "a")]))
        XCTAssertFalse(ComposerCaptureSegments.needsMerge([]))
        XCTAssertTrue(ComposerCaptureSegments.needsMerge([seg(1, "a"), seg(1, "b")]))
    }

    // MARK: - Le chrono, prise en cours comprise (porteur 2026-09-04)

    /// **Le défaut ne se voyait pas sur une scène vierge** : à zéro plus zéro,
    /// un chrono mort et un chrono juste affichent la même chose. Le témoin se
    /// pose donc là où les deux mondes divergent — une prise EN COURS.
    func test_pendantLaPrise_leChronoCompteLHorlogeVivante() {
        XCTAssertEqual(
            ComposerCaptureSegments.elapsed(segments: [], live: 3.5, recording: true),
            3.5, accuracy: 0.001)
    }

    func test_horsPrise_lHorlogeVivanteNEntrePas() {
        // `CameraModel.recordingDuration` GARDE sa dernière valeur après
        // l'arrêt : l'ajouter compterait deux fois le segment qui vient d'être
        // clos, et le chrono sauterait au relâchement.
        XCTAssertEqual(
            ComposerCaptureSegments.elapsed(segments: [], live: 3.5, recording: false),
            0, accuracy: 0.001)
    }

    func test_pendantLaPrise_lesSegmentsClosEtLHorlogeSAdditionnent() {
        let clos = [seg(2, "a"), seg(4, "b")]
        XCTAssertEqual(
            ComposerCaptureSegments.elapsed(segments: clos, live: 1.5, recording: true),
            7.5, accuracy: 0.001)
        XCTAssertEqual(
            ComposerCaptureSegments.elapsed(segments: clos, live: 1.5, recording: false),
            6, accuracy: 0.001)
    }

    /// Une horloge négative n'a aucun sens et viendrait d'un défaut ailleurs ;
    /// la faire SOUSTRAIRE des segments déjà clos en ferait un second.
    func test_uneHorlogeNégative_nEnlèveRienAuxSegmentsClos() {
        XCTAssertEqual(
            ComposerCaptureSegments.elapsed(
                segments: [seg(5, "a")], live: -9, recording: true),
            5, accuracy: 0.001)
    }
}
