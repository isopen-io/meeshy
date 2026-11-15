import XCTest
import MeeshySDK
@testable import Meeshy

/// #13864 (I3, R5) — ajouter un élément montre son chargement À SA PLACE et
/// retient le reste de l'écran ; le hors-ligne ne retient rien ; l'échec se dit
/// avec « Réessayer » ; le pré-envoi d'un objet posé se lit sur sa sélection.
final class ComposerSceneIntakeTests: XCTestCase {

    private let fr = Locale(identifier: "fr_FR")

    private func entree(_ kind: ComposerSceneIntake.Kind = .media, total: Int = 1,
                        offline: Bool = false, foundsScene: Bool = false) -> ComposerSceneIntake {
        ComposerSceneIntake.starting(kind: kind, total: total, isOffline: offline, foundsScene: foundsScene)
    }

    // MARK: - Ce qui retient l'écran

    func test_unAjoutEnPreparation_retientLEcranEtLaPublication() {
        let ajout = entree()
        XCTAssertTrue(ajout.blocksComposer)
        XCTAssertTrue(ComposerSceneIntake.holdsPublication(ajout))
        XCTAssertFalse(ComposerSceneIntake.canStart(over: ajout), "un second ajout est impossible pendant le premier")
    }

    func test_rienQuiEntre_neRetientRien() {
        XCTAssertFalse(ComposerSceneIntake.holdsPublication(nil))
        XCTAssertTrue(ComposerSceneIntake.canStart(over: nil))
    }

    func test_horsLigne_lAjoutAttend_sansRetenirLEcran() {
        let ajout = entree(offline: true)
        XCTAssertFalse(ajout.blocksComposer, "un hors-ligne n'est pas un chargement bloquant")
        XCTAssertTrue(ajout.isWaiting)
        XCTAssertFalse(ComposerSceneIntake.holdsPublication(ajout))
        XCTAssertTrue(ComposerSceneIntake.canStart(over: ajout))
    }

    func test_unEchec_libereLEcran_etSePeutReessayer() {
        let echec = entree().failing()
        XCTAssertTrue(echec.isFailed)
        XCTAssertFalse(echec.blocksComposer)
        XCTAssertFalse(ComposerSceneIntake.holdsPublication(echec))
        XCTAssertTrue(ComposerSceneIntake.canStart(over: echec))
    }

    // MARK: - L'anneau

    func test_anneau_unSeulMedia_tourneSansFraction() {
        XCTAssertNil(entree().ringFraction)
        XCTAssertNil(entree(total: 3).ringFraction, "rien de prêt : la préparation tourne")
    }

    func test_anneau_uneSerie_avanceAuCompteDesMediasPrets() throws {
        let ajout = entree(total: 3).advanced(done: 1)
        XCTAssertEqual(try XCTUnwrap(ajout.ringFraction), 1.0 / 3.0, accuracy: 0.0001)
        XCTAssertEqual(entree(total: 2).advanced(done: 9).ringFraction, 1)
    }

    func test_avancer_gardeLIdentiteDeLAjout() {
        let ajout = entree(.sticker, total: 2)
        let suite = ajout.advanced(done: 1)
        XCTAssertEqual(suite.id, ajout.id)
        XCTAssertEqual(suite.kind, .sticker)
        XCTAssertEqual(suite.failing().id, ajout.id)
    }

    func test_unEchec_nAvancePlus() {
        XCTAssertTrue(entree(total: 3).failing().advanced(done: 2).isFailed)
    }

    // MARK: - Ce qui se dit

    func test_statut_preparation_etSonPourcentage() {
        let seul = ComposerSceneIntakeCopy.status(entree(), locale: fr)
        XCTAssertEqual(seul, ComposerSceneIntakeCopy.preparing)
        let serie = ComposerSceneIntakeCopy.status(entree(total: 4).advanced(done: 1), locale: fr)
        XCTAssertTrue(serie.hasPrefix(ComposerSceneIntakeCopy.preparing), serie)
        XCTAssertTrue(serie.contains(LocalizedNumber.percent(25, locale: fr)), serie)
    }

    func test_statut_horsLigne_ditEnAttente() {
        XCTAssertEqual(ComposerSceneIntakeCopy.status(entree(offline: true), locale: fr),
                       ComposerSceneIntakeCopy.waiting)
    }

    func test_statut_echec_nommeCeQuiNaPasPuEntrer() {
        XCTAssertEqual(ComposerSceneIntakeCopy.status(entree(.media).failing(), locale: fr),
                       ComposerSceneIntakeCopy.failed(.media))
        XCTAssertNotEqual(ComposerSceneIntakeCopy.failed(.media), ComposerSceneIntakeCopy.failed(.sticker))
    }

    func test_lesMots_sontAuCatalogue() {
        let mots = [ComposerSceneIntakeCopy.preparing, ComposerSceneIntakeCopy.waiting,
                    ComposerSceneIntakeCopy.cancel, ComposerSceneIntakeCopy.retry,
                    ComposerSceneIntakeCopy.title(.media), ComposerSceneIntakeCopy.title(.sticker),
                    ComposerSceneIntakeCopy.failed(.media), ComposerSceneIntakeCopy.failed(.sticker)]
        XCTAssertFalse(mots.contains { $0.isEmpty || $0.hasPrefix("composer.intake") })
        XCTAssertEqual(Set(mots).count, mots.count)
    }

    // MARK: - Le pré-envoi d'un objet posé

    func test_preEnvoi_seLitSurLaSelection_enEnvoiEtPourcentage() throws {
        let badge = try XCTUnwrap(ComposerSceneIntakeCopy.sendingBadge(
            for: .uploading(sent: 40, total: 100), locale: fr))
        XCTAssertTrue(badge.contains(LocalizedNumber.percent(40, locale: fr)), badge)
        XCTAssertFalse(badge.contains("%@"), badge)
    }

    func test_preEnvoi_auRepos_neDitRien() {
        XCTAssertNil(ComposerSceneIntakeCopy.sendingBadge(for: .idle, locale: fr))
        XCTAssertNil(ComposerSceneIntakeCopy.sendingBadge(
            for: .ready(postMediaId: "m", remoteURL: "https://cdn/m"), locale: fr))
    }

    // MARK: - Le branchement dans l'hôte

    func test_hote_chaquePorteDAjout_passeParLaGardeDEntree() throws {
        let source = AppSourceGuard.stripComments(try AppSourceGuard.composerHostSource())
        for porte in ["func ingestPhotoLibraryItems", "func ingestFileImporterResult",
                      "func ingestCameraCapture", "func handlePastedItems", "func poseStickerChoice"] {
            let corps = try XCTUnwrap(Self.body(of: porte, in: source), porte)
            XCTAssertTrue(corps.contains("sceneIntakeAllowsAnother") || corps.contains("beginSceneIntake("),
                          "\(porte) pose un élément sans passer par la garde d'ajout")
        }
    }

    func test_hote_laPublication_estRetenuePendantLAjout() throws {
        let source = AppSourceGuard.stripComments(try AppSourceGuard.composerHostSource())
        let gate = try XCTUnwrap(Self.body(of: "func canPublishDocument(as format: ComposerFormat)", in: source))
        XCTAssertTrue(gate.contains("ComposerSceneIntake.holdsPublication(sceneIntake)"), String(gate))
    }

    func test_hote_laSceneRecoitLAjout_etLaSelectionDitLEnvoi() throws {
        let source = AppSourceGuard.stripComments(try AppSourceGuard.composerHostSource())
        XCTAssertTrue(source.contains("intakeBlocks:"), "la scène ne voile pas ses outils pendant l'ajout")
        XCTAssertTrue(source.contains("intakeGhost:"), "l'espace réservé n'est pas posé sur la scène")
        XCTAssertTrue(source.contains("ComposerSceneIntakeCopy.sendingBadge(for: selectedSceneItemPreUpload"),
                      "le pré-envoi de l'objet sélectionné ne se lit nulle part")
        XCTAssertFalse(source.contains("selectionBadge: nil"))
    }

    func test_scene_voileSesOutils_etGardeLeFantomeTouchable() throws {
        let source = AppSourceGuard.stripComments(try AppSourceGuard.unit(
            "Meeshy/Features/Composer/ComposerSceneSurface.swift"))
        XCTAssertTrue(source.contains("var intakeBlocks"))
        XCTAssertTrue(source.contains("var intakeGhost"))
        XCTAssertGreaterThanOrEqual(AppSourceGuard.occurrences(ofIdentifier: "ComposerIntakeVeil", in: source), 4,
                                    "le chrome, les rails et le sol se voilent ensemble")
        XCTAssertTrue(source.contains("ComposerIntakeLayer(ghost: intakeGhost, blocks: intakeBlocks"),
                      "la carte ne porte pas l'espace réservé")
        let hote = AppSourceGuard.stripComments(try AppSourceGuard.composerHostSource())
        XCTAssertTrue(hote.contains(".modifier(ComposerIntakeVeil(veiled: sceneIntakeBlocks))"), "le socle ne se voile pas")
    }

    private static func body(of signature: String, in source: String) -> Substring? {
        guard let debut = source.range(of: signature),
              let ouverture = source[debut.upperBound...].firstIndex(of: "{") else { return nil }
        var profondeur = 0
        var index = ouverture
        while index < source.endIndex {
            switch source[index] {
            case "{": profondeur += 1
            case "}":
                profondeur -= 1
                if profondeur == 0 { return source[ouverture...index] }
            default: break
            }
            index = source.index(after: index)
        }
        return nil
    }
}
