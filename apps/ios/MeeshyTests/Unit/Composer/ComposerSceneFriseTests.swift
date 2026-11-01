import XCTest
@testable import Meeshy
import MeeshyUI

/// **La frise de la scène animée suit la maquette** (#8370, lot 6 —
/// `docs/product/composer-plein-ecran/Main.dc.html`, bloc « plan temps »).
final class ComposerSceneFriseTests: XCTestCase {

    private func piste(_ kind: SceneFriseTrack.Kind, label: String = "",
                       start: Float = 0, end: Float = 6) -> SceneFriseTrack {
        SceneFriseTrack(id: "p", kind: kind, label: label, start: start, end: end)
    }

    // MARK: - « 1.2 s / 6 s »

    func test_leTemps_sEcritAuDixiemeSurLaDureeEntiere() {
        XCTAssertEqual(ComposerSceneFriseMetrics.timeLabel(current: 1.23, total: 6), "1.2 s / 6 s")
        XCTAssertEqual(ComposerSceneFriseMetrics.timeLabel(current: 0, total: 6), "0.0 s / 6 s")
    }

    func test_uneDureeNonEntiere_garderSonDixieme() {
        XCTAssertEqual(ComposerSceneFriseMetrics.timeLabel(current: 3, total: 7.5), "3.0 s / 7.5 s")
    }

    // MARK: - La tête et les barres restent dans la frise

    func test_laFraction_estBorneeALaDuree() {
        XCTAssertEqual(ComposerSceneFriseMetrics.fraction(3, of: 6), 0.5, accuracy: 0.0001)
        XCTAssertEqual(ComposerSceneFriseMetrics.fraction(9, of: 6), 1)
        XCTAssertEqual(ComposerSceneFriseMetrics.fraction(-1, of: 6), 0)
        XCTAssertEqual(ComposerSceneFriseMetrics.fraction(.nan, of: 6), 0)
        XCTAssertEqual(ComposerSceneFriseMetrics.fraction(3, of: 0), 0)
    }

    // MARK: - Chaque piste a un NOM

    func test_unTexteSeNommeParSonContenu() {
        XCTAssertEqual(ComposerSceneFriseCopy.label(for: piste(.text, label: "Bonjour")), "Bonjour")
    }

    func test_unStickerSeNommeParSonEmoji() {
        XCTAssertEqual(ComposerSceneFriseCopy.label(for: piste(.sticker, label: "🔥")), "🔥")
    }

    /// Un média ou un son n'a pas de nom propre : la piste prend le mot de sa
    /// nature — jamais une ligne sans nom, qu'on ne saurait pas choisir.
    func test_sansNom_laPistePrendLeMotDeSaNature() {
        XCTAssertEqual(ComposerSceneFriseCopy.label(for: piste(.video)), ComposerSceneFriseCopy.video)
        XCTAssertEqual(ComposerSceneFriseCopy.label(for: piste(.image)), ComposerSceneFriseCopy.media)
        XCTAssertEqual(ComposerSceneFriseCopy.label(for: piste(.audio)), ComposerSceneFriseCopy.sound)
        XCTAssertEqual(ComposerSceneFriseCopy.label(for: piste(.place, label: "  ")), ComposerSceneFriseCopy.place)
    }

    func test_laFenetreSeLitEnSecondes() {
        XCTAssertEqual(ComposerSceneFriseMetrics.windowLabel(piste(.text, start: 0.8, end: 6)), "0.8 s – 6 s")
    }

    // MARK: - « Temps » n'existe qu'en scène animée

    /// La maquette ne dessine « Temps » qu'en mode dynamique ; le meuble le
    /// passe au rail sous la même condition — un bouton sans frise à ranger
    /// serait un contrôle inerte.
    func test_temps_nEstServiQuEnSceneAnimee() throws {
        let code = AppSourceGuard.stripComments(try AppSourceGuard.composerHostSource())
            .components(separatedBy: .whitespacesAndNewlines).joined()
        XCTAssertTrue(code.contains("onTimeButton:sceneIsAnimated?{toggleSceneFrise()}:nil"),
                      "« Temps » doit n'exister qu'en scène animée.")
    }

    // MARK: - Glisser une piste, tirer ses poignées (retour porteur 2026-09-28)

    private typealias W = ComposerSceneFriseMetrics.Window

    func test_glisserLaBarre_deplaceLObjet_sansChangerSaDuree() {
        let w = ComposerSceneFriseMetrics.dragged(W(start: 1, end: 3), grip: .move, by: 1.5, duration: 6)
        XCTAssertEqual(w, W(start: 2.5, end: 4.5))
    }

    func test_laBarreGlissee_resteDansLaSlide() {
        XCTAssertEqual(ComposerSceneFriseMetrics.dragged(W(start: 1, end: 3), grip: .move, by: 9, duration: 6),
                       W(start: 4, end: 6))
        XCTAssertEqual(ComposerSceneFriseMetrics.dragged(W(start: 1, end: 3), grip: .move, by: -9, duration: 6),
                       W(start: 0, end: 2))
    }

    func test_laPoigneeDeDebut_allongeOuRaccourcit_sansToucherLaFin() {
        XCTAssertEqual(ComposerSceneFriseMetrics.dragged(W(start: 2, end: 4), grip: .start, by: -1, duration: 6),
                       W(start: 1, end: 4))
        XCTAssertEqual(ComposerSceneFriseMetrics.dragged(W(start: 2, end: 4), grip: .start, by: 1, duration: 6),
                       W(start: 3, end: 4))
    }

    func test_laPoigneeDeFin_allongeOuRaccourcit_sansToucherLeDebut() {
        XCTAssertEqual(ComposerSceneFriseMetrics.dragged(W(start: 2, end: 4), grip: .end, by: 1.5, duration: 6),
                       W(start: 2, end: 5.5))
        XCTAssertEqual(ComposerSceneFriseMetrics.dragged(W(start: 2, end: 4), grip: .end, by: 9, duration: 6),
                       W(start: 2, end: 6))
    }

    /// Une poignée ne franchit jamais l'autre : la piste garde une durée
    /// saisissable.
    func test_unePoignee_neFranchitJamaisLAutre() {
        let debut = ComposerSceneFriseMetrics.dragged(W(start: 2, end: 4), grip: .start, by: 5, duration: 6)
        XCTAssertLessThan(debut.start, debut.end)
        let fin = ComposerSceneFriseMetrics.dragged(W(start: 2, end: 4), grip: .end, by: -5, duration: 6)
        XCTAssertLessThan(fin.start, fin.end)
        XCTAssertEqual(fin.start, 2)
    }

    func test_unGlissementInvalide_neBougeRien() {
        XCTAssertEqual(ComposerSceneFriseMetrics.dragged(W(start: 2, end: 4), grip: .move, by: .nan, duration: 6),
                       W(start: 2, end: 4))
    }

    // MARK: - L'aimant (#14210)

    private func candidats(_ temps: Float...) -> [SnapCandidate] {
        temps.map { SnapCandidate(kind: .clipEnd, time: $0) }
    }

    func test_laPoigneeDeFin_sAccrocheALaTete_quandElleEnApproche() {
        let geste = ComposerSceneFriseMetrics.dragged(W(start: 1, end: 3), grip: .end, by: 1.9, duration: 6,
                                                      snapping: [SnapCandidate(kind: .playhead, time: 5)],
                                                      tolerance: 0.25)
        XCTAssertEqual(geste.window, W(start: 1, end: 5))
        XCTAssertTrue(geste.isSnapped)
    }

    func test_horsDeLaTolerance_rienNAccroche() {
        let geste = ComposerSceneFriseMetrics.dragged(W(start: 1, end: 3), grip: .end, by: 1.5, duration: 6,
                                                      snapping: [SnapCandidate(kind: .playhead, time: 5)],
                                                      tolerance: 0.25)
        XCTAssertEqual(geste.window, W(start: 1, end: 4.5))
        XCTAssertFalse(geste.isSnapped)
    }

    func test_laPoigneeDeDebut_sAccrocheAuBordDUneAutrePiste() {
        let geste = ComposerSceneFriseMetrics.dragged(W(start: 2, end: 4), grip: .start, by: -0.9, duration: 6,
                                                      snapping: candidats(1), tolerance: 0.25)
        XCTAssertEqual(geste.window, W(start: 1, end: 4))
        XCTAssertTrue(geste.isSnapped)
    }

    /// La barre entière s'accroche par le bord le PLUS PROCHE de son
    /// candidat, et garde sa durée.
    func test_laBarreGlissee_sAccrocheParSonBordLePlusProche_sansChangerSaDuree() {
        let geste = ComposerSceneFriseMetrics.dragged(W(start: 1, end: 3), grip: .move, by: 0.9, duration: 6,
                                                      snapping: candidats(4), tolerance: 0.25)
        XCTAssertEqual(geste.window.start, 2, accuracy: 0.0001)
        XCTAssertEqual(geste.window.end, 4, accuracy: 0.0001)
        XCTAssertTrue(geste.isSnapped)
    }

    func test_lesPointsDAccroche_sontLaTeteLesBordsDeLaSlideEtLesAutresPistes_jamaisLaPisteElleMeme() {
        let pistes = [
            SceneFriseTrack(id: "a", kind: .text, label: "", start: 1, end: 2),
            SceneFriseTrack(id: "b", kind: .sticker, label: "", start: 3, end: 5),
        ]
        let temps = ComposerSceneFriseMetrics.snapCandidates(tracks: pistes, excluding: "a",
                                                             playhead: 2.5, duration: 6).map(\.time)
        XCTAssertEqual(Set(temps), [0, 6, 2.5, 3, 5])
    }

    /// La tolérance est celle de l'atelier et d'Android : huit points de
    /// doigt à l'échelle RENDUE, plafonnés à un quart de seconde.
    func test_laTolerance_suitLEchelleRendue() {
        XCTAssertEqual(ComposerSceneFriseMetrics.snapTolerance(duration: 6, width: 300), 0.16, accuracy: 0.0001)
        XCTAssertEqual(ComposerSceneFriseMetrics.snapTolerance(duration: 7200, width: 300), 0.25, accuracy: 0.0001)
        XCTAssertEqual(ComposerSceneFriseMetrics.snapTolerance(duration: 6, width: 0), 0)
    }

    // MARK: - La règle graduée (#14211)

    func test_uneSceneDeSixSecondes_seGradueALaSeconde() {
        let majeures = ComposerSceneFriseRuler.ticks(duration: 6, width: 300).filter(\.isMajor)
        XCTAssertEqual(majeures.map(\.time), [0, 1, 2, 3, 4, 5, 6])
        XCTAssertEqual(majeures.first?.label, "0 s")
        XCTAssertEqual(majeures.last?.label, "6 s")
    }

    func test_uneSceneDeDeuxHeures_garderAuPlusDouzeLibelles() {
        let ticks = ComposerSceneFriseRuler.ticks(duration: 7200, width: 300)
        let majeures = ticks.filter(\.isMajor)
        XCTAssertLessThanOrEqual(majeures.count, 13)
        XCTAssertGreaterThanOrEqual(majeures.count, 2)
        XCTAssertTrue(ticks.allSatisfy { $0.time >= 0 && $0.time <= 7200 })
    }

    /// Deux libellés ne se touchent jamais : au moins 44 pt entre deux
    /// graduations majeures.
    func test_deuxLibelles_restentLisibles() {
        for duree: Float in [1, 3, 6, 15, 42, 90, 600, 3599, 7200] {
            let pas = ComposerSceneFriseRuler.majorStep(duration: duree, width: 280)
            XCTAssertGreaterThanOrEqual(CGFloat(pas / duree) * 280, 44, "durée \(duree)")
        }
    }

    func test_lesMineures_neSeSerrentJamaisSousSixPoints() {
        let ticks = ComposerSceneFriseRuler.ticks(duration: 6, width: 300)
        let mineures = ticks.filter { !$0.isMajor }
        XCTAssertFalse(mineures.isEmpty)
        let temps = ticks.map(\.time).sorted()
        let ecart = zip(temps, temps.dropFirst()).map { CGFloat(($1 - $0) / 6) * 300 }.min() ?? 0
        XCTAssertGreaterThanOrEqual(ecart, 6)
    }

    func test_unLibelleDeTemps_passeAuxMinutesPuisAuxHeures() {
        XCTAssertEqual(ComposerSceneFriseRuler.label(45), "45 s")
        XCTAssertEqual(ComposerSceneFriseRuler.label(90), "1:30")
        XCTAssertEqual(ComposerSceneFriseRuler.label(3600), "1:00:00")
    }

    /// Le doigt sent la tête passer une graduation majeure, une fois par
    /// graduation, dans les deux sens.
    func test_laTeteQuiFranchitUneGraduationMajeure_seSent() {
        XCTAssertTrue(ComposerSceneFriseRuler.crossesMajor(from: 0.9, to: 1.1, step: 1))
        XCTAssertTrue(ComposerSceneFriseRuler.crossesMajor(from: 2.2, to: 1.9, step: 1))
        XCTAssertFalse(ComposerSceneFriseRuler.crossesMajor(from: 1.1, to: 1.6, step: 1))
        XCTAssertFalse(ComposerSceneFriseRuler.crossesMajor(from: 1.1, to: 1.6, step: 0))
    }

    // MARK: - Le temps reste de gauche à droite (#14212)

    /// Le temps d'une frise de montage se lit de gauche à droite dans toutes
    /// les langues, comme les lecteurs média d'iOS : l'axe (règle, pistes,
    /// tête) est posé en `.leftToRight`, les noms de piste gardent la
    /// direction de l'interface.
    func test_laxeDuTemps_resteDeGaucheADroite_lesNomsSuiventLInterface() throws {
        let code = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Composer/ComposerSceneFrise.swift"))
            .components(separatedBy: .whitespacesAndNewlines).joined()
        XCTAssertTrue(code.contains(".environment(\\.layoutDirection,.leftToRight)"),
                      "L'axe du temps de la frise doit être posé de gauche à droite.")
        XCTAssertTrue(code.contains(".environment(\\.layoutDirection,interfaceDirection)"),
                      "Les noms de piste doivent garder la direction de l'interface.")
    }

    // MARK: - Le glissé de la règle ne fige pas la vidéo (#14211)

    func test_leGlisseDeLaRegle_estEncadreParBeginEtEndScrub() throws {
        let code = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Composer/ComposerSceneFrise.swift"))
        XCTAssertTrue(code.contains("timeline.beginScrub()"))
        XCTAssertTrue(code.contains("timeline.endScrub()"))
    }

    // MARK: - VoiceOver règle l'entrée et la sortie (#14216)

    func test_voiceOver_regleLEntreeEtLaSortie_parQuatrePasNommes() throws {
        let code = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Composer/ComposerSceneFrise.swift"))
            .components(separatedBy: .whitespacesAndNewlines).joined()
        for (nom, prise) in [("entryEarlier", ".start"), ("entryLater", ".start"),
                             ("exitEarlier", ".end"), ("exitLater", ".end")] {
            XCTAssertTrue(code.contains("accessibilityAction(named:Text(ComposerSceneFriseCopy.\(nom))){deplacer(piste,prise:\(prise)"),
                          "L'action VoiceOver « \(nom) » doit régler la poignée \(prise).")
        }
    }

    func test_lesQuatrePas_ontUnLibelleTraduit() {
        for (cle, valeur) in [("composer.frise.entryEarlier", ComposerSceneFriseCopy.entryEarlier),
                              ("composer.frise.entryLater", ComposerSceneFriseCopy.entryLater),
                              ("composer.frise.exitEarlier", ComposerSceneFriseCopy.exitEarlier),
                              ("composer.frise.exitLater", ComposerSceneFriseCopy.exitLater)] {
            XCTAssertNotEqual(valeur, cle)
            XCTAssertFalse(valeur.isEmpty)
        }
    }

    /// Une entrée ou une sortie réglée au VoiceOver reste dans la slide et
    /// ne franchit jamais l'autre bord.
    func test_unPasDeSortie_neDepassePasLaSlide() {
        XCTAssertEqual(ComposerSceneFriseMetrics.dragged(W(start: 2, end: 5.8), grip: .end, by: 0.5, duration: 6),
                       W(start: 2, end: 6))
        XCTAssertEqual(ComposerSceneFriseMetrics.dragged(W(start: 0.2, end: 4), grip: .start, by: -0.5, duration: 6),
                       W(start: 0, end: 4))
    }

    // MARK: - Couper à la tête (#14215)

    func test_unTexte_seCoupeQuandLaTeteEstDedans() {
        XCTAssertTrue(ComposerSceneFriseMetrics.canSplit(piste(.text, start: 1, end: 4), at: 2))
        XCTAssertTrue(ComposerSceneFriseMetrics.canSplit(piste(.image, start: 1, end: 4), at: 3.5))
    }

    func test_laTeteAuBordOuDehors_neCoupeRien() {
        XCTAssertFalse(ComposerSceneFriseMetrics.canSplit(piste(.text, start: 1, end: 4), at: 1))
        XCTAssertFalse(ComposerSceneFriseMetrics.canSplit(piste(.text, start: 1, end: 4), at: 4))
        XCTAssertFalse(ComposerSceneFriseMetrics.canSplit(piste(.text, start: 1, end: 4), at: 5))
        XCTAssertFalse(ComposerSceneFriseMetrics.canSplit(piste(.text, start: 1, end: 4), at: .nan))
    }

    /// Une vidéo ou un son couperait sans décaler sa source (#14224) ; un
    /// sticker ou un lieu ne se coupe pas : le jeton n'est pas servi.
    func test_videoSonStickerEtLieu_neSontPasOffertsALaCoupe() {
        for nature: SceneFriseTrack.Kind in [.video, .audio, .sticker, .place] {
            XCTAssertFalse(ComposerSceneFriseMetrics.canSplit(piste(nature, start: 1, end: 4), at: 2), "\(nature)")
        }
    }

    func test_couper_aUnLibelleTraduit() {
        XCTAssertNotEqual(ComposerSceneFriseCopy.split, "composer.object.editor.split")
    }
}
