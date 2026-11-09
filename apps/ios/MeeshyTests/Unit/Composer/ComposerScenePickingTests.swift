import XCTest
@testable import Meeshy

/// **Importer plusieurs médias, une scène par média** (#8540, directive
/// porteur 2026-09-28).
final class ComposerScenePickingTests: XCTestCase {

    func test_plusieursMedias_fondentChacunLeurScene() {
        XCTAssertTrue(ComposerScenePicking.foundsScenes(count: 2, openingPick: false))
        XCTAssertTrue(ComposerScenePicking.foundsScenes(count: 10, openingPick: false))
    }

    /// Un média seul choisi par le rail se POSE sur la scène (une image sur une
    /// vidéo) : il ne crée pas de page.
    func test_unMediaSeulParLeRail_seposeSurLaScene() {
        XCTAssertFalse(ComposerScenePicking.foundsScenes(count: 1, openingPick: false))
    }

    /// Au choix d'OUVERTURE, il n'y a rien sur quoi poser : même un média seul
    /// fonde la première scène.
    func test_auChoixDOuverture_unMediaSeulFondeLaScene() {
        XCTAssertTrue(ComposerScenePicking.foundsScenes(count: 1, openingPick: true))
        XCTAssertFalse(ComposerScenePicking.foundsScenes(count: 0, openingPick: true))
    }

    func test_uneSerie_estToujoursUnFond() {
        XCTAssertEqual(ComposerMediaPlacement.role(door: .sceneSeries, currentSlideHasBackground: true), .background)
        XCTAssertEqual(ComposerMediaPlacement.role(door: .sceneSeries, currentSlideHasBackground: false), .background)
    }

    func test_laPhotothequeSOuvreALaCreation_dUnPost() {
        XCTAssertTrue(ComposerScenePicking.opensOnPicker(origin: .feedComposer, compositionIsEmpty: true))
    }

    /// **La story s'ouvre aussi sur la photothèque, à mi-hauteur** (#17269,
    /// porteur 2026-11-09, qui revient sur #13839) : la feuille ne couvre plus la
    /// scène, la caméra armée reste visible derrière.
    func test_opensOnPicker_storyVierge_ouvreLaPhototheque() {
        XCTAssertTrue(ComposerScenePicking.opensOnPicker(origin: .storyTray, compositionIsEmpty: true))
    }

    /// Jamais sur ce qui REPREND un contenu, ni sur l'humeur, ni sur une
    /// composition qui a déjà sa matière (brouillon restauré).
    func test_laPhotothequeNeSOuvrePas_surUneReprise() {
        for origine: ComposerOrigin in [.moodChip, .draft(id: "d"), .share,
                                         .edit(postId: "p", documentFormat: .story),
                                         .repost(ofPostId: "p", sourceFormat: .story)] {
            XCTAssertFalse(ComposerScenePicking.opensOnPicker(origin: origine, compositionIsEmpty: true), "\(origine)")
        }
        XCTAssertFalse(ComposerScenePicking.opensOnPicker(origin: .storyTray, compositionIsEmpty: false))
    }
}

/// **À l'ouverture d'un composer vierge, la caméra s'arme et la photothèque
/// s'ouvre à mi-hauteur ; les deux se règlent** (#17269, porteur 2026-11-09 :
/// « par défaut True et True »).
@MainActor
final class ComposerOpeningPlanTests: XCTestCase {

    private func plan(origin: ComposerOrigin = .feedComposer,
                      empty: Bool = true,
                      format: ComposerFormat = .post,
                      servesCapture: Bool = true,
                      preferences: ComposerOpeningPreferences = .standard,
                      system: Int = 18) -> ComposerOpeningPlan {
        ComposerOpeningPlan.resolve(origin: origin, compositionIsEmpty: empty, format: format,
                                    sceneServesCapture: servesCapture, preferences: preferences,
                                    systemMajorVersion: system)
    }

    private func defaults() -> UserDefaults {
        let nom = "ComposerOpeningPlanTests.\(UUID().uuidString)"
        let suite = UserDefaults(suiteName: nom) ?? .standard
        suite.removePersistentDomain(forName: nom)
        return suite
    }

    // MARK: - Les réglages

    func test_stored_withNothingSaved_armsAndOpensByDefault() {
        XCTAssertEqual(ComposerOpeningPreferences.stored(in: defaults()),
                       ComposerOpeningPreferences(armsCamera: true, opensLibrary: true))
    }

    func test_stored_readsEachSettingUnderItsKey() {
        let suite = defaults()
        suite.set(false, forKey: "composer.opening.armsCamera")
        XCTAssertEqual(ComposerOpeningPreferences.stored(in: suite),
                       ComposerOpeningPreferences(armsCamera: false, opensLibrary: true))
        suite.set(false, forKey: "composer.opening.opensLibrary")
        XCTAssertEqual(ComposerOpeningPreferences.stored(in: suite),
                       ComposerOpeningPreferences(armsCamera: false, opensLibrary: false))
    }

    // MARK: - L'ouverture

    func test_resolve_blankPost_armsTheCameraAndOpensTheLibrary() {
        XCTAssertEqual(plan(), ComposerOpeningPlan(armsCamera: true, library: .halfHeight))
    }

    func test_resolve_blankStoryAndReel_armAndOpenToo() {
        XCTAssertEqual(plan(origin: .storyTray, format: .story), ComposerOpeningPlan(armsCamera: true, library: .halfHeight))
        XCTAssertEqual(plan(format: .reel), ComposerOpeningPlan(armsCamera: true, library: .halfHeight))
    }

    func test_resolve_eachSettingTurnsItsOwnHalfOff() {
        XCTAssertEqual(plan(preferences: ComposerOpeningPreferences(armsCamera: false, opensLibrary: true)),
                       ComposerOpeningPlan(armsCamera: false, library: .halfHeight))
        XCTAssertEqual(plan(preferences: ComposerOpeningPreferences(armsCamera: true, opensLibrary: false)),
                       ComposerOpeningPlan(armsCamera: true, library: nil))
    }

    func test_resolve_aCompositionWithContent_opensNothing() {
        XCTAssertEqual(plan(empty: false), .nothing)
        XCTAssertEqual(plan(origin: .draft(id: "d")), .nothing)
        XCTAssertEqual(plan(origin: .edit(postId: "p", documentFormat: .story)), .nothing)
    }

    func test_resolve_withoutAViewfinder_neverArms() {
        XCTAssertFalse(plan(format: .status).armsCamera, "un statut n'a pas de viseur")
        XCTAssertFalse(plan(servesCapture: false).armsCamera, "une citation n'arme aucune caméra")
    }

    // MARK: - Choisir dans la photothèque rend la scène

    func test_disarmsCameraOnLibraryPick_armedAndUntouched_disarms() {
        XCTAssertTrue(ComposerOpeningPlan.disarmsCameraOnLibraryPick(openingPick: true, stage: .armed,
                                                                     pendingSegments: 0, editing: false))
    }

    func test_disarmsCameraOnLibraryPick_somethingFilmedOrNotTheOpeningPick_keepsTheCamera() {
        XCTAssertFalse(ComposerOpeningPlan.disarmsCameraOnLibraryPick(openingPick: true, stage: .armed,
                                                                      pendingSegments: 1, editing: false),
                       "des segments en attente ne partent jamais en silence")
        XCTAssertFalse(ComposerOpeningPlan.disarmsCameraOnLibraryPick(openingPick: true, stage: .recording,
                                                                      pendingSegments: 0, editing: false))
        XCTAssertFalse(ComposerOpeningPlan.disarmsCameraOnLibraryPick(openingPick: true, stage: .armed,
                                                                      pendingSegments: 0, editing: true))
        XCTAssertFalse(ComposerOpeningPlan.disarmsCameraOnLibraryPick(openingPick: false, stage: .armed,
                                                                      pendingSegments: 0, editing: false))
    }

    func test_resolve_library_halfHeightFromIOS17_fullScreenBefore() {
        XCTAssertEqual(plan(system: 17).library, .halfHeight)
        XCTAssertEqual(plan(system: 26).library, .halfHeight)
        XCTAssertEqual(plan(system: 16).library, .fullScreen, "iOS 16 n'a pas le sélecteur en ligne")
    }

    // MARK: - Le câblage

    func test_host_appliesThePlan_andMountsTheHalfHeightLibrary() throws {
        let hote = AppSourceGuard.stripComments(try AppSourceGuard.composerHostSource())
        XCTAssertTrue(hote.contains("sceneServesCapture: sceneServesCapture"), "une citation n'arme rien")
        XCTAssertTrue(hote.contains("ComposerOpeningLibrarySheet(isPresented: $showsOpeningLibrary"))
        XCTAssertTrue(hote.contains("closeOpeningLibraryForPick()"), "choisir ferme la feuille et rend la scène")
        let feuille = try AppSourceGuard.unit("Meeshy/Features/Composer/ComposerOpeningLibrarySheet.swift")
        XCTAssertTrue(feuille.contains(".photosPickerStyle(.inline)"))
        XCTAssertTrue(hote.contains("capturing: sceneCapture.holdStartedAt != nil"),
                      "la feuille se retire dès que le doigt tient pour filmer")
        XCTAssertTrue(feuille.contains("if tient { isPresented = false }"))
        XCTAssertTrue(feuille.contains(".presentationDetents([.medium, .large])"))
        XCTAssertTrue(feuille.contains(".presentationBackgroundInteraction(.enabled(upThrough: .medium))"),
                      "au cran moyen, la caméra derrière reste à portée du doigt")
    }

    func test_settings_surfaceBothOpeningToggles() throws {
        let reglages = try AppSourceGuard.unit("Meeshy/Features/Settings/Views/MediaDownloadSettingsView.swift")
        XCTAssertTrue(reglages.contains("@AppStorage(ComposerOpeningPreferences.armsCameraKey)"))
        XCTAssertTrue(reglages.contains("@AppStorage(ComposerOpeningPreferences.opensLibraryKey)"))
        XCTAssertTrue(reglages.contains("composerOpeningSection"))
    }
}
