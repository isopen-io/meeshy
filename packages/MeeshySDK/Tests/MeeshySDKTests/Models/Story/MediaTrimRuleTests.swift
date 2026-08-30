import XCTest
@testable import MeeshySDK

/// **La règle de rognage d'un média de scène (#4082).**
///
/// Elle vit hors de toute vue parce que c'est elle qui doit être éprouvée : une
/// poignée qui traverse l'autre, une fenêtre qui sort du fichier ou un clip
/// réduit à zéro sont trois défauts qu'une capture d'écran ne montre pas et
/// qu'une ligne de test attrape.
///
/// Le rognage est NON DESTRUCTIF : ces bornes ne cuisent aucun fichier — la
/// doctrine de publication d'une story veut que le serveur reçoive la source
/// d'origine et les objets qui la décrivent.
final class MediaTrimRuleTests: XCTestCase {

    private let source: Double = 12.0

    // MARK: - Ce que valent des bornes absentes ou vieillies

    func test_aucuneBorne_rendLaSourceEntiere() {
        let bornes = MediaTrimRule.resolved(start: nil, end: nil, sourceDuration: source)
        XCTAssertEqual(bornes.start, 0)
        XCTAssertEqual(bornes.end, source)
    }

    /// **Le repli est TOUJOURS « la source entière », jamais un silence.** Un
    /// média ré-encodé plus court après coup laisse des bornes qui débordent :
    /// les honorer telles quelles donnerait une fenêtre vide, donc une image
    /// noire ou un blanc audio — une donnée vieillie ne doit pas casser la
    /// lecture.
    func test_borneAuDelaDuFichier_estRamenee() {
        let bornes = MediaTrimRule.resolved(start: 2, end: 99, sourceDuration: source)
        XCTAssertEqual(bornes.start, 2)
        XCTAssertEqual(bornes.end, source)
    }

    func test_bornesInversees_rendentLaSourceEntiere() {
        let bornes = MediaTrimRule.resolved(start: 9, end: 3, sourceDuration: source)
        XCTAssertEqual(bornes.start, 0)
        XCTAssertEqual(bornes.end, source)
    }

    func test_fenetrePlusCourteQueLePlancher_rendLaSourceEntiere() {
        let bornes = MediaTrimRule.resolved(start: 4, end: 4.1, sourceDuration: source)
        XCTAssertEqual(bornes.duration, source, accuracy: 0.001)
    }

    func test_sourceDeDureeNulle_neRendJamaisUneFenetreNegative() {
        let bornes = MediaTrimRule.resolved(start: 1, end: 5, sourceDuration: 0)
        XCTAssertEqual(bornes.start, 0)
        XCTAssertEqual(bornes.end, 0)
        XCTAssertEqual(bornes.duration, 0)
    }

    // MARK: - Les poignées ne se traversent jamais

    func test_laPoigneeGauche_sArreteAvantLaDroite() {
        let depart = MediaTrimBounds(start: 2, end: 5)
        let apres = MediaTrimRule.movingStart(depart, by: 99, sourceDuration: source)

        XCTAssertEqual(apres.end, 5, "la borne opposée ne bouge pas : le doigt n'a rien demandé de tel")
        XCTAssertEqual(apres.start, 5 - MediaTrimRule.minimumDuration, accuracy: 0.001)
        XCTAssertGreaterThanOrEqual(apres.duration, MediaTrimRule.minimumDuration)
    }

    func test_laPoigneeDroite_sArreteApresLaGauche() {
        let depart = MediaTrimBounds(start: 2, end: 5)
        let apres = MediaTrimRule.movingEnd(depart, by: -99, sourceDuration: source)

        XCTAssertEqual(apres.start, 2)
        XCTAssertEqual(apres.end, 2 + MediaTrimRule.minimumDuration, accuracy: 0.001)
    }

    func test_laPoigneeGauche_neSortJamaisParLeDebut() {
        let apres = MediaTrimRule.movingStart(MediaTrimBounds(start: 2, end: 5),
                                              by: -99, sourceDuration: source)
        XCTAssertEqual(apres.start, 0)
    }

    func test_laPoigneeDroite_neSortJamaisParLaFin() {
        let apres = MediaTrimRule.movingEnd(MediaTrimBounds(start: 2, end: 5),
                                            by: 99, sourceDuration: source)
        XCTAssertEqual(apres.end, source)
    }

    func test_unDeplacementNominal_deplaceLaSeuleBorneVisee() {
        let apres = MediaTrimRule.movingStart(MediaTrimBounds(start: 2, end: 8),
                                              by: 1.5, sourceDuration: source)
        XCTAssertEqual(apres.start, 3.5, accuracy: 0.001)
        XCTAssertEqual(apres.end, 8)
    }

    // MARK: - Points → secondes

    func test_laConversion_suitLaLargeurRendue() {
        XCTAssertEqual(
            MediaTrimRule.seconds(forHandleDelta: 100, stripWidth: 200, sourceDuration: source),
            source / 2, accuracy: 0.001)
    }

    /// Une largeur nulle arrive vraiment : le premier rendu d'un `GeometryReader`
    /// la donne à zéro. Diviser par elle produirait un `inf`, puis un `NaN` qui
    /// contaminerait les bornes sans qu'aucune assertion ne le voie.
    func test_uneLargeurNulle_neProduitJamaisUnInfini() {
        let delta = MediaTrimRule.seconds(forHandleDelta: 50, stripWidth: 0, sourceDuration: source)
        XCTAssertEqual(delta, 0)
        XCTAssertTrue(delta.isFinite)
    }

    // MARK: - Ce que rogner ÉCRIT

    /// **L'absence de bornes est une VALEUR** : elle dit « le fichier tel quel ».
    /// Les persister sur un média jamais rogné rendrait indiscernable « l'auteur
    /// a choisi tout le clip » de « l'auteur n'a rien choisi ».
    func test_uneFenetreQuiCouvreTout_nEcritAucuneBorne() {
        let champs = MediaTrimRule.fields(for: MediaTrimRule.full(sourceDuration: source),
                                          sourceDuration: source)
        XCTAssertNil(champs.start)
        XCTAssertNil(champs.end)
        XCTAssertEqual(champs.duration, source)
    }

    /// **Rogner écrit TROIS champs, jamais deux.** Sans la durée,
    /// `contentDerivedDuration` continuerait de compter l'ancienne longueur et
    /// la story attendrait dans le vide après la fin du clip — sans que rien
    /// n'ait l'air faux.
    func test_uneFenetreReelle_ecritLesTroisChamps() {
        let champs = MediaTrimRule.fields(for: MediaTrimBounds(start: 2, end: 7),
                                          sourceDuration: source)
        XCTAssertEqual(champs.start, 2)
        XCTAssertEqual(champs.end, 7)
        XCTAssertEqual(champs.duration, 5, accuracy: 0.001)
    }

    // MARK: - Les deux modèles lisent la même règle

    func test_lesDeuxModeles_repondentIdentiquement() {
        var media = StoryMediaObject(kind: .video, aspectRatio: 9.0 / 16.0)
        media.sourceStart = 3
        media.sourceEnd = 8

        var audio = StoryAudioPlayerObject(postMediaId: "", placement: "overlay",
                                           x: 0, y: 0, volume: 1, waveformSamples: [])
        audio.sourceStart = 3
        audio.sourceEnd = 8

        XCTAssertEqual(media.trimBounds(sourceDuration: source),
                       audio.trimBounds(sourceDuration: source),
                       "deux surcharges, UNE règle — si elles divergeaient, un son et une vidéo "
                       + "rognés au même endroit ne joueraient pas la même portion")
    }
}
