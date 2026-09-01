import XCTest
@testable import Meeshy
@testable import MeeshySDK

/// **Une chip de son sélectionnée montre ses réglages** (#4579, retour porteur
/// 2026-09-02 : « l'affichage des détails des outils qui manquent »).
///
/// `chips(forSelected:)` rendait `[]` pour un son, sous un commentaire devenu
/// faux — « le son n'a pas encore de forme sur la scène ». Il en a une depuis
/// `fab725c1d5` (`AudioForegroundChip`, déplaçable et redimensionnable), et un
/// RANG manipulable depuis `7311d42c60`.
///
/// > Un commentaire qui justifie une absence par un état du monde se périme
/// > quand cet état change — et il continue d'expliquer, avec assurance, une
/// > décision que plus rien ne fonde. C'est le contraire d'une garde : il
/// > protège l'absence au lieu de la signaler.
final class ComposerAudioChipInspectorTests: XCTestCase {

    private func son(volume: Float = 1,
                     scale: Double? = nil,
                     rotation: Double? = nil,
                     start: Float? = nil,
                     duree: Float? = nil) -> StoryAudioPlayerObject {
        var o = StoryAudioPlayerObject(id: "aud", postMediaId: "pm-1", name: "Voix")
        o.volume = volume
        o.scale = scale
        o.rotation = rotation
        o.startTime = start
        o.duration = duree
        return o
    }

    private func slide(avec son: StoryAudioPlayerObject) -> StorySlide {
        var effets = StoryEffects()
        effets.audioPlayerObjects = [son]
        return StorySlide(id: "s1", effects: effets)
    }

    /// **LE témoin.** Une chip de son sélectionnée n'a plus une rangée vide.
    func test_unSonSelectionne_aDesJetons() {
        let jetons = ComposerObjectChips.chips(forSelected: "aud", in: slide(avec: son()))
        XCTAssertFalse(jetons.isEmpty,
                       "un objet qu'on peut poser, déplacer, redimensionner et ranger en "
                       + "profondeur ne peut pas être le seul de la scène sans aucun réglage")
    }

    /// **La taille ne manque jamais** — c'est ce qui garantit qu'une sélection
    /// a toujours au moins un jeton. Une rangée vide ne dirait pas « rien à
    /// régler », elle aurait l'air cassée.
    func test_laTaille_estToujoursLa() {
        let jetons = ComposerObjectChips.chips(forSelected: "aud", in: slide(avec: son()))
        XCTAssertTrue(jetons.contains { $0.id == "size" })
    }

    /// Et elle lit l'échelle RÉELLE de la chip, pas un défaut.
    func test_laTaille_litLEchelleDeLaChip() {
        let nominal = ComposerObjectChips.chips(forSelected: "aud", in: slide(avec: son()))
        let agrandi = ComposerObjectChips.chips(forSelected: "aud", in: slide(avec: son(scale: 1.8)))
        XCTAssertNotEqual(nominal.first { $0.id == "size" }?.label,
                          agrandi.first { $0.id == "size" }?.label,
                          "un jeton qui ne bouge pas avec sa valeur est une étiquette, pas une lecture")
    }

    /// **Le volume ne se dit QUE s'il a été touché** — même règle que la vidéo.
    /// « SON 100 % » sur une piste jamais réglée enseigne moins que rien.
    func test_leVolume_neSeDitQueSilAEteTouche() {
        let nominal = ComposerObjectChips.chips(forSelected: "aud", in: slide(avec: son(volume: 1)))
        XCTAssertFalse(nominal.contains { $0.id == "volume" })

        let baisse = ComposerObjectChips.chips(forSelected: "aud", in: slide(avec: son(volume: 0.4)))
        XCTAssertTrue(baisse.contains { $0.id == "volume" })
    }

    /// La rotation suit la même règle : elle ne se dit qu'une fois touchée.
    func test_laRotation_neSeDitQueSiElleExiste() {
        let droit = ComposerObjectChips.chips(forSelected: "aud", in: slide(avec: son()))
        XCTAssertFalse(droit.contains { $0.id == "rotation" })

        let penche = ComposerObjectChips.chips(forSelected: "aud", in: slide(avec: son(rotation: 12)))
        XCTAssertTrue(penche.contains { $0.id == "rotation" })
    }

    /// **La fenêtre de lecture mène à la timeline**, et son jeton n'annonce une
    /// destination que si la bande est réellement ouvrable — un jeton qui
    /// s'illumine sur une bande que `opened` refuse est un contrôle inerte qui
    /// a l'air vivant.
    func test_laFenetre_meneALaTimeline_quandElleEstOuvrable() {
        let avecBande = ComposerObjectChips.chips(
            forSelected: "aud", in: slide(avec: son(start: 2, duree: 6)),
            openableBands: [.timeline])
        XCTAssertEqual(avecBande.first { $0.id == "window" }?.destination, .timeline)

        let sansBande = ComposerObjectChips.chips(
            forSelected: "aud", in: slide(avec: son(start: 2, duree: 6)),
            openableBands: [])
        XCTAssertNil(sansBande.first { $0.id == "window" }?.destination,
                     "sans bande ouvrable, le jeton reste une LECTURE")
    }

    /// **Le LIEU garde son absence, et elle est écrite.** Son nom est déjà dit
    /// par l'en-tête de la scène (#4034) : un jeton le répéterait sans rien
    /// offrir à régler. Ce témoin existe pour que le prochain lecteur voie la
    /// différence entre une absence DÉCIDÉE et un défaut de cascade.
    func test_leLieu_nAPasDInspecteur_etCestEcrit() {
        var slide = StorySlide(id: "s1", effects: StoryEffects())
        slide.locationObjects = [
            StoryLocationObject(id: "loc",
                                place: SharedPlace(latitude: 48.8, longitude: 2.3, name: "Paris"))
        ]
        XCTAssertTrue(ComposerObjectChips.chips(forSelected: "loc", in: slide).isEmpty)
    }
}
