import XCTest
@testable import Meeshy

/// **La rangée haute de la capture, comme le porteur l'a dessinée** (#9753,
/// directive 2026-10-09).
@MainActor
final class ComposerCaptureTopRowTests: XCTestCase {

    private static func segment(_ duree: TimeInterval = 1) -> ComposerCaptureSegment {
        ComposerCaptureSegment(url: URL(fileURLWithPath: "/tmp/segment_\(UUID().uuidString).mov"), duration: duree)
    }

    private static func input(stage: ComposerSceneCameraStage = .armed, editing: Bool = false, segments: Int = 0,
                              size: Bool = true, save: Bool = false) -> ComposerCaptureTopRow.Input {
        ComposerCaptureTopRow.Input(stage: stage, editing: editing, pendingSegments: segments,
                                    offersSizeToggle: size, offersSave: save)
    }

    // MARK: - (A8, #17109) « Quitter · ✓ Valider », et la capsule centrée

    func test_armed_theHeaderIsQuitThenValidate() {
        XCTAssertEqual(ComposerCaptureTopRow.leading(Self.input()), [.close])
        XCTAssertEqual(ComposerCaptureTopRow.trailing(Self.input()), [.validate],
                       "✓ Valider est là dans tous les états, prise ou non")
        XCTAssertTrue(ComposerCaptureTopRow.showsHeader(Self.input()))
    }

    func test_armed_oneCentredCapsule_flashTimerLensMore() {
        XCTAssertEqual(ComposerCaptureTopRow.capsule(Self.input()), [.flash, .selfTimer, .flip, .more])
        XCTAssertEqual(ComposerCaptureTopRow.capsule(Self.input(size: false)), [.flash, .selfTimer, .flip, .more],
                       "le viseur servi seul garde la même capsule")
    }

    func test_theHeader_neverCarriesTheCapsuleControls() {
        let entete = ComposerCaptureTopRow.leading(Self.input()) + ComposerCaptureTopRow.trailing(Self.input())
        for controle in [ComposerCaptureTopItem.flash, .selfTimer, .flip, .more] {
            XCTAssertFalse(entete.contains(controle), "\(controle) vit dans la capsule, pas dans l'en-tête")
        }
    }

    // MARK: - (5) La taille ne vit que dans ⋯, et seulement si elle s'offre

    func test_theViewfinder_neverShowsTheSizeToggleInTheRow_itLivesInTheMenu() {
        XCTAssertFalse(ComposerCaptureTopRow.trailing(Self.input()).contains(.size))
        XCTAssertFalse(ComposerCaptureTopRow.capsule(Self.input()).contains(.size))
        XCTAssertEqual(ComposerCaptureMoreMenu.items(offersSizeToggle: true), [.grid, .size])
    }

    func test_theMenu_withoutASizeToggle_offersTheGridOnly_theTimerIsInTheCapsule() {
        XCTAssertEqual(ComposerCaptureMoreMenu.items(offersSizeToggle: false), [.grid])
    }

    func test_theTimerButton_cyclesOffThreeTenOff() {
        XCTAssertEqual(ComposerCaptureSelfTimerDelay.off.next, .three)
        XCTAssertEqual(ComposerCaptureSelfTimerDelay.three.next, .ten)
        XCTAssertEqual(ComposerCaptureSelfTimerDelay.ten.next, .off)
    }

    // MARK: - (7) Le retardateur (CAM-4)

    private static func timerDefaults(_ delai: ComposerCaptureSelfTimerDelay) -> UserDefaults {
        let defaults = UserDefaults(suiteName: "ComposerCaptureSelfTimer.\(UUID().uuidString)") ?? .standard
        defaults.set(delai.rawValue, forKey: ComposerCaptureSelfTimerDelay.storageKey)
        return defaults
    }

    func test_theSelfTimer_offersThreeAndTenSeconds_andIsOffForAnUnknownValue() {
        XCTAssertEqual(ComposerCaptureSelfTimerDelay.allCases, [.off, .three, .ten])
        XCTAssertEqual(ComposerCaptureSelfTimerDelay(stored: 0), .off)
        XCTAssertEqual(ComposerCaptureSelfTimerDelay(stored: 7), .off)
        XCTAssertEqual(ComposerCaptureSelfTimerDelay(stored: 10), .ten)
    }

    func test_theSelfTimer_countsDownEverySecond_toOne() {
        XCTAssertEqual(ComposerCaptureSelfTimerDelay.three.ticks, [3, 2, 1])
        XCTAssertEqual(ComposerCaptureSelfTimerDelay.ten.ticks.count, 10)
        XCTAssertEqual(ComposerCaptureSelfTimerDelay.off.ticks, [])
    }

    func test_withTheTimerOff_thePhotoLeavesAtOnce() {
        let minuterie = ComposerCaptureSelfTimer(defaults: Self.timerDefaults(.off))
        var prises = 0
        minuterie.run { prises += 1 }
        XCTAssertEqual(prises, 1)
        XCTAssertNil(minuterie.remaining)
    }

    func test_withTheTimerOn_thePhotoWaitsForTheCount_thenLeavesOnce() async {
        let minuterie = ComposerCaptureSelfTimer(defaults: Self.timerDefaults(.three), tick: .milliseconds(5))
        let partie = expectation(description: "la photo part après le compte")
        var prises = 0
        minuterie.run {
            prises += 1
            partie.fulfill()
        }
        XCTAssertEqual(minuterie.remaining, 3, "le premier chiffre paraît tout de suite")
        XCTAssertEqual(prises, 0)
        await fulfillment(of: [partie], timeout: 2)
        XCTAssertEqual(prises, 1)
        XCTAssertNil(minuterie.remaining)
        XCTAssertFalse(minuterie.isCounting)
    }

    func test_aSecondPressDuringTheCount_cancelsIt_andNothingIsTaken() async throws {
        let minuterie = ComposerCaptureSelfTimer(defaults: Self.timerDefaults(.three), tick: .milliseconds(5))
        var prises = 0
        minuterie.run { prises += 1 }
        minuterie.run { prises += 1 }
        XCTAssertFalse(minuterie.isCounting)
        XCTAssertNil(minuterie.remaining)
        try await Task.sleep(for: .milliseconds(60))
        XCTAssertEqual(prises, 0, "le compte annulé ne prend rien")
    }

    func test_theTimerOptions_readAsSecondsInTheLocale() {
        XCTAssertEqual(ComposerSceneCameraCopy.selfTimerOption(.three, locale: Locale(identifier: "fr_FR")), "3 s")
        XCTAssertFalse(ComposerSceneCameraCopy.selfTimerOption(.off).isEmpty)
    }

    func test_inRetouch_theSizeToggleStaysInTheRow_andThereIsNoMenu() {
        let retouche = ComposerCaptureTopRow.trailing(Self.input(editing: true))
        XCTAssertTrue(retouche.contains(.size))
        XCTAssertFalse(retouche.contains(.more))
    }

    // MARK: - (6) La grille des tiers (CAM-2)

    func test_theGrid_fallsOnTheThirdsOfTheFullImage() {
        let lignes = ComposerCaptureGrid.lines(in: CGRect(x: 0, y: 0, width: 300, height: 600))
        XCTAssertEqual(lignes.vertical, [100, 200])
        XCTAssertEqual(lignes.horizontal, [200, 400])
    }

    func test_theGrid_fallsOnTheThirdsOfAFrameHole_notOfTheScreen() {
        let lignes = ComposerCaptureGrid.lines(in: CGRect(x: 30, y: 60, width: 240, height: 360))
        XCTAssertEqual(lignes.vertical, [110, 190])
        XCTAssertEqual(lignes.horizontal, [180, 300])
    }

    func test_theGrid_drawsNothingInAnEmptyZone() {
        XCTAssertEqual(ComposerCaptureGrid.lines(in: .zero), ComposerCaptureGrid.Lines(vertical: [], horizontal: []))
    }

    func test_theGrid_isOffByDefault_andNeverShowsInRetouch() {
        XCTAssertEqual(ComposerCaptureGrid.storageKey, "composer.camera.grid")
        XCTAssertFalse(ComposerCaptureGrid.shows(enabled: false, editing: false), "désactivée par défaut")
        XCTAssertTrue(ComposerCaptureGrid.shows(enabled: true, editing: false))
        XCTAssertFalse(ComposerCaptureGrid.shows(enabled: true, editing: true), "on ne cadre plus en retouche")
    }

    // MARK: - (3) Les contrôleurs de segment à GAUCHE des deux boutons

    func test_withPendingSegments_theDropControlSitsLeftOfValidate() {
        XCTAssertEqual(ComposerCaptureTopRow.trailing(Self.input(segments: 2)), [.dropSegment, .validate])
        XCTAssertEqual(ComposerCaptureTopRow.capsule(Self.input(segments: 2)), [.flash, .selfTimer, .flip, .more])
    }

    /// A9 (#17109, révoque #8653) : en filmant, plus d'en-tête — seul le chrono,
    /// centré ; la prise se clôt au déclencheur rouge.
    func test_whileRecording_noHeader_noCapsule_onlyTheChrono() {
        let enregistre = Self.input(stage: .recording, segments: 1)
        XCTAssertFalse(ComposerCaptureTopRow.showsHeader(enregistre))
        XCTAssertEqual(ComposerCaptureTopRow.leading(enregistre), [])
        XCTAssertEqual(ComposerCaptureTopRow.trailing(enregistre), [], "rien d'autre ne se règle en filmant")
        XCTAssertEqual(ComposerCaptureTopRow.capsule(enregistre), [])
        XCTAssertTrue(ComposerCaptureTopRow.showsChrono(enregistre))
    }

    // MARK: - (4) La puce du chrono, à GAUCHE de la barre des segments (#17469)

    func test_theChrono_shows_assoonAsAVideoIsBeingTaken() {
        XCTAssertFalse(ComposerCaptureTopRow.showsChrono(Self.input()), "sans vidéo, pas de chrono")
        XCTAssertTrue(ComposerCaptureTopRow.showsChrono(Self.input(segments: 1)))
        XCTAssertTrue(ComposerCaptureTopRow.showsChrono(Self.input(stage: .recording)))
        XCTAssertFalse(ComposerCaptureTopRow.showsChrono(Self.input(editing: true, segments: 1)), "pas en retouche")
        XCTAssertFalse(ComposerCaptureTopRow.leading(Self.input(segments: 1)).contains(.chrono),
                       "le chrono ne colle plus à la croix : il vit sur la ligne de la barre")
    }

    /// Porteur (#17469) : le chrono et le nombre de segments se posent juste à
    /// gauche de la barre des segments, sur SA ligne — l'en-tête ne le porte plus.
    func test_theChrono_sitsJustLeftOfTheSegmentBar_neverInTheHeader() throws {
        let source = try String(contentsOfFile: Self.barPath, encoding: .utf8)
        guard let entete = source.range(of: "private var topControls: some View {"),
              let finEntete = source.range(of: "private var controlCapsule", range: entete.upperBound..<source.endIndex),
              let ligne = source.range(of: "private var progressRow: some View {"),
              let finLigne = source.range(of: "// MARK:", range: ligne.upperBound..<source.endIndex)
        else { return XCTFail("l'en-tête et la ligne de progression existent") }
        XCTAssertFalse(source[entete.upperBound..<finEntete.lowerBound].contains("chronoChip"),
                       "l'en-tête ne porte plus le chrono")
        let corps = String(source[ligne.upperBound..<finLigne.lowerBound])
        guard let puce = corps.range(of: "chronoChip"), let barre = corps.range(of: "Bar") else {
            return XCTFail("la ligne porte la puce puis la barre")
        }
        XCTAssertLessThan(puce.lowerBound, barre.lowerBound, "la puce est à GAUCHE de la barre")
    }

    func test_theSegmentIndicator_countsTheSegmentBeingRecorded() {
        XCTAssertEqual(ComposerCaptureTopRow.segmentCount(pending: 0, recording: true), 1)
        XCTAssertEqual(ComposerCaptureTopRow.segmentCount(pending: 2, recording: true), 3)
        XCTAssertEqual(ComposerCaptureTopRow.segmentCount(pending: 2, recording: false), 2)
    }

    // MARK: - (#10310, #17469) « 3 » à l'écran, « 3 segments » à la voix

    func test_segmentBadge_threeSegments_showsOnlyTheNumber() {
        let badge = ComposerCaptureTopRow.segmentBadge(3, locale: Locale(identifier: "fr_FR"))
        XCTAssertEqual(badge, "3", "porteur : le trait part, le nombre reste")
        XCTAssertFalse(badge.localizedCaseInsensitiveContains("segment"), "le mot ne s'affiche plus")
    }

    func test_segmentBadge_arabicLocale_usesTheLocaleDigits() {
        let arabe = Locale(identifier: "ar")
        XCTAssertEqual(ComposerCaptureTopRow.segmentBadge(3, locale: arabe), LocalizedNumber.exact(3, locale: arabe),
                       "le chiffre suit la locale")
    }

    func test_segmentCount_spokenLabel_stillSaysTheWordWithItsNumber() {
        let dit = ComposerSceneCameraCopy.segmentCount(3)
        XCTAssertTrue(dit.contains("3"))
        XCTAssertTrue(dit.localizedCaseInsensitiveContains("segment"), "VoiceOver dit « 3 segments »")
    }

    func test_chronoChip_showsTheBadge_andSpeaksTheSegmentsAsItsLabel() throws {
        let source = try String(contentsOfFile: Self.barPath, encoding: .utf8)
        XCTAssertTrue(source.contains("Text(ComposerCaptureTopRow.segmentBadge(compte))"))
        XCTAssertTrue(source.contains(".accessibilityLabel(ComposerSceneCameraCopy.segmentCount(compte))"))
        XCTAssertFalse(source.contains("Text(ComposerSceneCameraCopy.segmentCount("), "le mot ne s'affiche plus")
    }

    private static var barPath: String {
        URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Composer/ComposerSceneCameraBar.swift").path
    }

    func test_whileEditing_theRowIsCrossThenSaveAndDone_withoutChronoFlashOrFlip() {
        let retouche = Self.input(editing: true, segments: 0, size: false, save: true)
        XCTAssertEqual(ComposerCaptureTopRow.leading(retouche), [.close])
        XCTAssertEqual(ComposerCaptureTopRow.trailing(retouche), [.save, .done])
    }

    // MARK: - (5) (x) pendant un enregistrement demande confirmation

    func test_closingWhileRecording_asksFirst_evenWithoutSegments() {
        XCTAssertTrue(ComposerCaptureDiscardRule.asksBeforeClosing(stage: .recording, editing: false, segments: [],
                                                                  takeSave: .idle))
    }

    func test_closingWithPendingSegments_stillAsks() {
        XCTAssertTrue(ComposerCaptureDiscardRule.asksBeforeClosing(stage: .armed, editing: false,
                                                                  segments: [Self.segment()], takeSave: .idle))
    }

    func test_closingOutsideARecording_keepsItsBehaviour() {
        XCTAssertFalse(ComposerCaptureDiscardRule.asksBeforeClosing(stage: .armed, editing: false, segments: [],
                                                                   takeSave: .idle),
                       "rien à perdre : la croix ferme tout de suite")
    }

    // MARK: - (x) en RETOUCHE ne jette pas une prise en silence (#9781)

    /// Recette #9755 : une vidéo de 32 s, deux segments validés, jetée par la
    /// croix de la retouche sans un mot. Une prise en retouche n'est encore ni
    /// envoyée ni — sauf par la flèche — enregistrée : la perdre se confirme.
    func test_closingTheRetouch_ofATakeNotSaved_asksFirst() {
        XCTAssertTrue(ComposerCaptureDiscardRule.asksBeforeClosing(stage: .armed, editing: true, segments: [],
                                                                  takeSave: .idle))
        XCTAssertTrue(ComposerCaptureDiscardRule.asksBeforeClosing(stage: .armed, editing: true, segments: [],
                                                                  takeSave: .saving),
                      "un enregistrement en vol peut encore échouer")
    }

    /// Porteur 2026-10-12 (#10342) : la retouche PHOTO demande la même
    /// confirmation que la vidéo — même déjà dans Photos, la retouche se perdrait.
    func test_closingTheRetouch_ofATakeAlreadyInPhotos_stillAsks() {
        XCTAssertTrue(ComposerCaptureDiscardRule.asksBeforeClosing(stage: .armed, editing: true, segments: [],
                                                                  takeSave: .saved))
    }

    func test_theQuestion_namesWhatIsLost() {
        XCTAssertNotEqual(ComposerSceneCameraCopy.discardTitle(photo: true), ComposerSceneCameraCopy.discardTitle(photo: false))
        XCTAssertFalse(ComposerSceneCameraCopy.discardTitle(photo: true).isEmpty)
    }

    func test_theRetouchCross_goesThroughTheRule_andAConfirmedDiscardLeavesTheRetouchOnly() throws {
        let chrome = try ComposerCaptureTakesTests.code("Meeshy/Features/Composer/ComposerCaptureViews.swift")
        XCTAssertFalse(chrome.contains("guard !session.phase.isEditing else { return session.cancelEditing() }"),
                       "la croix de la retouche ne jette plus rien sans demander")
        XCTAssertTrue(chrome.contains("takeSave: session.takeSaveState"))
        XCTAssertTrue(chrome.contains("session.discardPrompt.ask(take: retouche"),
                      "ce que la confirmation abandonne se fixe à la question : une remise entre-temps ne ferme pas le viseur")
    }

    func test_theCross_goesThroughTheDiscardRule_andTheBarStaysWhileRecording() throws {
        let chrome = try ComposerCaptureTakesTests.code("Meeshy/Features/Composer/ComposerCaptureViews.swift")
        XCTAssertTrue(chrome.contains("ComposerCaptureDiscardRule.asksBeforeClosing("),
                      "la croix et le glissé consultent la règle qui connaît l'enregistrement")
        let barre = try ComposerCaptureTakesTests.code("Meeshy/Features/Composer/ComposerSceneCameraBar.swift")
        XCTAssertTrue(barre.contains("ComposerCaptureTopRow.showsHeader(row)"),
                      "l'en-tête se retire en filmant par sa loi (A9, #17109), jamais par un test d'étape en dur")
    }

    // MARK: - (2) Le curseur du flash s'efface après 2 s sans interaction

    func test_sliderTimer_hidesAfterItsLifetime_onlyForTheLastInteraction() {
        var minuterie = ComposerFlashSliderTimer()
        XCTAssertFalse(minuterie.visible)
        minuterie.touch()
        let premiere = minuterie.generation
        XCTAssertTrue(minuterie.visible)
        minuterie.touch()
        minuterie.expire(premiere, voiceOver: false)
        XCTAssertTrue(minuterie.visible, "une interaction réarme : l'échéance précédente est périmée")
        minuterie.expire(minuterie.generation, voiceOver: false)
        XCTAssertFalse(minuterie.visible)
        XCTAssertEqual(ComposerFlashSliderTimer.lifetime, 2)
    }

    func test_sliderTimer_aFingerOnTheSlider_holdsIt_andItsReleaseRearms() {
        var minuterie = ComposerFlashSliderTimer()
        minuterie.hold(true)
        minuterie.expire(minuterie.generation, voiceOver: false)
        XCTAssertTrue(minuterie.visible, "le curseur ne s'efface pas sous le doigt")
        minuterie.hold(false)
        XCTAssertTrue(minuterie.visible)
        minuterie.expire(minuterie.generation, voiceOver: false)
        XCTAssertFalse(minuterie.visible, "deux secondes après la levée")
    }

    func test_sliderTimer_staysWhileVoiceOverRuns_andHidesWithTheFlash() {
        var minuterie = ComposerFlashSliderTimer()
        minuterie.touch()
        minuterie.expire(minuterie.generation, voiceOver: true)
        XCTAssertTrue(minuterie.visible, "un élément qui s'efface sous VoiceOver n'est plus atteignable")
        minuterie.hide()
        XCTAssertFalse(minuterie.visible)
    }

    func test_theBar_wiresTheTimer_toTheSliderAndTheFlash() throws {
        let barre = try ComposerCaptureTakesTests.code("Meeshy/Features/Composer/ComposerSceneCameraBar.swift")
        XCTAssertTrue(barre.contains("ComposerFlashSliderTimer"), "la barre tient la minuterie")
        XCTAssertTrue(barre.contains(".task(id: sliderTimer.generation)"), "une seule échéance vit à la fois")
        XCTAssertTrue(barre.contains("ComposerCaptureTopRow.trailing("), "la disposition vient de la loi")
        XCTAssertTrue(barre.contains("ComposerCaptureTopRow.capsule("), "la capsule aussi")
        let curseur = try ComposerCaptureTakesTests.code("Meeshy/Features/Composer/ComposerFlashIntensitySlider.swift")
        XCTAssertTrue(curseur.contains("onInteraction"), "glisser ou régler à la voix est une interaction")
    }

    // MARK: - Le rebond

    func test_aTouchedControl_bounces_andOnlyFadesUnderReduceMotion() {
        XCTAssertLessThan(ComposerControlBounce.scale(pressed: true, reduceMotion: false), 1)
        XCTAssertEqual(ComposerControlBounce.scale(pressed: true, reduceMotion: true), 1)
        XCTAssertLessThan(ComposerControlBounce.opacity(pressed: true, reduceMotion: true), 1)
        XCTAssertEqual(ComposerControlBounce.scale(pressed: false, reduceMotion: false), 1)
    }
}

/// LE NIVEAU D'HORIZON (CAM-10) : un trait paraît quand on est presque droit,
/// devient l'accent une fois droit, et le doigt sent l'instant où il le devient.
final class ComposerCaptureLevelTests: XCTestCase {
    private func gravite(degrees: Double, flat: Double = 0) -> (x: Double, y: Double, z: Double) {
        let r = degrees * .pi / 180
        let reste = (1 - flat * flat).squareRoot()
        return (sin(r) * reste, -cos(r) * reste, flat)
    }

    private func lecture(_ degrees: Double, flat: Double = 0, wasAligned: Bool = false) -> ComposerCaptureLevel.Reading? {
        let g = gravite(degrees: degrees, flat: flat)
        return ComposerCaptureLevel.reading(gravityX: g.x, gravityY: g.y, gravityZ: g.z, wasAligned: wasAligned)
    }

    func test_tilt_measuresFromTheNearestUprightHold_portraitOrLandscape() {
        XCTAssertEqual(ComposerCaptureLevel.tilt(gravityX: 0, gravityY: -1), 0, accuracy: 0.001)
        let paysage = gravite(degrees: 90 + 4)
        XCTAssertEqual(ComposerCaptureLevel.tilt(gravityX: paysage.x, gravityY: paysage.y), 4, accuracy: 0.001)
        let tete = gravite(degrees: 180 - 3)
        XCTAssertEqual(ComposerCaptureLevel.tilt(gravityX: tete.x, gravityY: tete.y), -3, accuracy: 0.001)
    }

    func test_reading_showsUnderTenDegrees_hidesBeyond() {
        XCTAssertNotNil(lecture(9))
        XCTAssertNotNil(lecture(-9))
        XCTAssertNil(lecture(12), "trop penché : le trait ne guide plus rien")
    }

    func test_reading_alignedWithinOneDegree() {
        XCTAssertEqual(lecture(0.8)?.aligned, true)
        XCTAssertEqual(lecture(-0.8)?.aligned, true)
        XCTAssertEqual(lecture(1.3)?.aligned, false)
    }

    func test_reading_onceAligned_holdsUntilOneAndAHalfDegrees() {
        XCTAssertEqual(lecture(1.3, wasAligned: true)?.aligned, true, "le tremblement au bord ne relâche pas")
        XCTAssertEqual(lecture(1.7, wasAligned: true)?.aligned, false)
    }

    func test_reading_phoneLyingFlat_staysSilent() {
        XCTAssertNil(lecture(0, flat: 0.95))
    }

    func test_ticks_onlyWhenEnteringAlignment() {
        let penche = lecture(4)
        let droit = lecture(0.5)
        XCTAssertTrue(ComposerCaptureLevel.ticks(from: penche, to: droit))
        XCTAssertTrue(ComposerCaptureLevel.ticks(from: nil, to: droit))
        XCTAssertFalse(ComposerCaptureLevel.ticks(from: droit, to: droit), "rester droit ne tique pas")
        XCTAssertFalse(ComposerCaptureLevel.ticks(from: droit, to: penche))
    }

    func test_levelled_feelsLikeASelectionTick() {
        XCTAssertEqual(ComposerCaptureHaptic.levelled.feedback, .selection)
    }
}
