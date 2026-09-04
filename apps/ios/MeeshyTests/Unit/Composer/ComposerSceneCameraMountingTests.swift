import XCTest
@testable import Meeshy

/// #4080 (vue `2b`) — **le viseur est MONTÉ dans la carte, et la session n'est
/// remise que s'il l'est.**
///
/// > « ça déclenche la caméra et ouvre la sheet caméra au lieu de déclencher la
/// > caméra et utiliser le fond de la scène comme caméra » — porteur, 2026-09-04
///
/// ## Pourquoi une garde de SOURCE ici, et pas un témoin de comportement
///
/// Le flux d'un objectif n'existe pas au simulateur : la carte y reste NOIRE,
/// qu'un viseur soit armé ou non. Une capture d'écran ne distingue donc pas
/// « armé sans flux » de « rien n'a changé » — l'absence confirmerait
/// l'hypothèse au lieu de l'éprouver, ce qui est le cas où l'on ne vérifie
/// jamais.
///
/// Ce que ces témoins tiennent est donc le CÂBLAGE, seul fait décidable hors
/// d'un appareil : que l'aperçu soit monté, qu'il le soit AU BON ENDROIT du
/// repère, et que la session ne parte pas quand rien n'est armé.
final class ComposerSceneCameraMountingTests: XCTestCase {

    private func source(_ nom: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/\(nom)")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    private func compact(_ t: String) -> String {
        t.components(separatedBy: .whitespacesAndNewlines).joined()
    }

    /// **L'aperçu est monté, et il occupe la CARTE.** `aspectRatio(…, .fit)`
    /// dans le repère du canvas reproduit exactement le rectangle du dessin —
    /// sans lui, l'aperçu remplirait la frame, letterbox compris, et déborderait
    /// sur les couloirs où vivent les rails.
    func test_laSurface_monteLAperçuAuxDimensionsDuDessin() throws {
        let code = compact(try source("ComposerSceneSurface.swift"))
        XCTAssertTrue(code.contains("CameraPreviewLayer(session:cameraSession)"),
                      "la scène doit monter l'aperçu — sans consommateur, la session ne se voit nulle part")
        XCTAssertTrue(code.contains("aspectRatio(aspectRatio,contentMode:.fit)"),
                      "l'aperçu occupe la CARTE, pas la frame : sinon il couvre les couloirs")
    }

    /// **Il ne prend AUCUN doigt.** Les gestes de la scène — déplacer, pincer,
    /// et l'appui long qui vient d'armer ce viseur — doivent continuer
    /// d'atteindre le canvas dessous. Un aperçu qui capte le toucher rendrait
    /// la scène morte au moment où elle devient une caméra.
    func test_lAperçu_neCapteAucunGeste() throws {
        XCTAssertTrue(compact(try source("ComposerSceneSurface.swift"))
            .contains("allowsHitTesting(false)"))
    }

    /// **La session ne part que si le viseur est armé.** Sans ce gate, la
    /// surface recevrait une session éteinte et monterait un aperçu noir
    /// permanent par-dessus la scène — la panne exactement inverse de celle
    /// qu'on corrige, et impossible à distinguer d'un fond noir légitime.
    func test_leMeuble_neRemetLaSession_queSiLeViseurEstArmé() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/MeeshyComposerHost+Surfaces.swift")
        let code = compact(AppSourceGuard.stripComments(
            try String(contentsOf: url, encoding: .utf8)))
        XCTAssertTrue(code.contains("cameraSession:sceneCameraStage==.off?nil:sceneCamera.session"))
    }

    /// **Le geste n'ouvre plus de PORTAIL.** C'est la moitié qui se voit à
    /// l'écran, et la seule que le simulateur sait juger : avant ce lot,
    /// l'appui long posait `presentedPortal = .camera` et la scène disparaissait
    /// sous une feuille modale au moment précis où l'auteur cadrait.
    func test_lAppuiLong_armeLaScène_etNOuvreAucunPortail() throws {
        let code = compact(try source("MeeshyComposerHost.swift"))
        XCTAssertTrue(code.contains("funchandleSceneCaptureLongPress(){"))
        XCTAssertTrue(code.contains("armSceneCamera()"),
                      "le geste doit ARMER la scène")

        // La borne est le corps du geste, pas le fichier : `presentCamera` vit
        // toujours, et doit vivre — la porte média de la rangée d'entrées
        // l'appelle encore. Ce qui est interdit, c'est que le GESTE y retourne.
        guard let début = code.range(of: "funchandleSceneCaptureLongPress(){"),
              let fin = code.range(of: "funcarmSceneCamera()", range: début.upperBound..<code.endIndex)
        else { return XCTFail("le geste ou l'armement a changé de nom") }
        let corps = String(code[début.upperBound..<fin.lowerBound])
        XCTAssertFalse(corps.contains("presentCamera("),
                       "le geste ne doit plus présenter de feuille — la caméra est une ENTRÉE, pas un mode")
    }

    /// **La prise se pose par le chemin de la FEUILLE, jamais par un second.**
    ///
    /// `ingestCameraCapture` route le MIME, applique `ComposerMediaPlacement.role`
    /// — « pas de fond ⇒ il devient le fond, sinon un objet de premier plan »,
    /// mot pour mot la planche `2b` — et pousse la montée. Un second chemin
    /// d'entrée diverge au premier format ajouté, et personne ne le verrait
    /// avant que l'un des deux ne pose au mauvais plan.
    func test_laPrise_passeParLeMêmeChemin_queLaFeuille() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/MeeshyComposerHost.swift")
        let code = compact(AppSourceGuard.stripComments(
            try String(contentsOf: url, encoding: .utf8)))
        XCTAssertTrue(code.contains("funcposeSceneCapture(_result:CameraResult)"))
        XCTAssertTrue(code.contains("awaitingestCameraCapture(result)"),
                      "la pose doit emprunter le chemin de la feuille, pas un second")
    }

    /// **Les deux signaux sont des IDENTIFIANTS, pas les valeurs.** Une seconde
    /// photo identique à la première ne changerait pas `capturedPhoto`, et
    /// l'observateur ne se réveillerait jamais — la scène resterait armée sur
    /// une prise déjà faite. C'est la même paire que la feuille écoute, pour la
    /// même raison, et c'est le genre de détail qu'un `onReceive` posé sur la
    /// valeur rend faux SANS jamais rougir.
    func test_lesObservateurs_écoutentLesIdentifiants_pasLesValeurs() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/MeeshyComposerHost+Surfaces.swift")
        let code = compact(AppSourceGuard.stripComments(
            try String(contentsOf: url, encoding: .utf8)))
        XCTAssertTrue(code.contains("onReceive(sceneCamera.$capturedPhotoId)"))
        XCTAssertTrue(code.contains("onReceive(sceneCamera.$capturedVideoId)"))
        XCTAssertFalse(code.contains("onReceive(sceneCamera.$capturedPhoto)"),
                       "écouter la VALEUR raterait deux prises identiques d'affilée")
    }

    /// **Une entrée, pas un mode** : après la pose, le viseur se retire et la
    /// session se ferme. La règle vient de la loi, jamais d'un `.off` écrit
    /// dans le meuble.
    func test_aprèsLaPose_leViseurSeRetire_etLaSessionSeFerme() throws {
        let code = compact(try source("MeeshyComposerHost.swift"))
        XCTAssertTrue(code.contains("sceneCameraStage=ComposerSceneCamera.stageAfterCapture"))
        XCTAssertEqual(ComposerSceneCamera.stageAfterCapture, .off)
    }

    /// **Une VIDÉO s'accumule, une PHOTO se pose** (#4099, vue `4b`).
    ///
    /// C'est la seule divergence avec la feuille, et elle EST la vue : « relâcher
    /// pour clore le segment · ✓ pour poser dans la scène ». Une photo, elle,
    /// n'a rien à concaténer — la faire attendre un `✓` ajouterait un geste à
    /// l'usage le plus courant.
    func test_uneVidéoSAccumule_quandUnePhotoSePose() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/MeeshyComposerHost+Surfaces.swift")
        let code = compact(AppSourceGuard.stripComments(
            try String(contentsOf: url, encoding: .utf8)))
        XCTAssertTrue(code.contains("collectSceneSegment(url)"),
                      "une vidéo doit rejoindre les segments, pas la scène")
        XCTAssertTrue(code.contains("poseSceneCapture(.photo(image))"),
                      "une photo se pose tout de suite")
    }

    /// **La durée est saisie AU RELÂCHEMENT, pas à l'arrivée du fichier.**
    ///
    /// `CameraModel.recordingDuration` est remise à zéro au démarrage suivant,
    /// et le fichier n'arrive qu'après. La lire quand l'URL se présente rendrait
    /// zéro pour tous les segments sauf le dernier — un écart qui ne casse rien
    /// et fait mentir toute la bande, donc que rien ne signalerait.
    func test_laDuréeDuSegment_estSaisieAuRelâchement() throws {
        let code = compact(try source("MeeshyComposerHost.swift"))
        // Le geste unique (#5074) a renommé `releaseSceneShutter` en
        // `closeSceneTake` : la CLÔTURE n'est plus toujours un relâchement —
        // sur une prise verrouillée, c'est un second appui. Ce que le témoin
        // garde n'a pas bougé d'un mot : la durée se lit AVANT l'arrêt.
        guard let début = code.range(of: "funccloseSceneTake(){"),
              let fin = code.range(of: "funccollectSceneSegment(", range: début.upperBound..<code.endIndex)
        else { return XCTFail("la clôture ou la collecte a changé de nom") }
        let corps = String(code[début.upperBound..<fin.lowerBound])
        XCTAssertTrue(corps.contains("pendingSegmentDuration=sceneCamera.recordingDuration"))
        XCTAssertTrue(corps.range(of: "pendingSegmentDuration=sceneCamera.recordingDuration")!.lowerBound
                      < corps.range(of: "sceneCamera.stopRecording()")!.lowerBound,
                      "la durée se lit AVANT l'arrêt, sinon l'horloge est déjà repartie")
    }

    /// **Les segments abandonnés emportent leurs FICHIERS.**
    ///
    /// Sans la purge, quitter le viseur après trois essais laisserait trois
    /// `.mov` dans le dossier temporaire — et, pire, la prise SUIVANTE
    /// repartirait avec eux : elle poserait dans la scène des segments que
    /// l'auteur croyait avoir jetés. C'est la fuite qui se voit, pas celle qui
    /// coûte de l'espace.
    func test_désarmer_effaceLesSegmentsEtLeursFichiers() throws {
        let code = compact(try source("MeeshyComposerHost.swift"))
        guard let début = code.range(of: "funcdisarmSceneCamera(){"),
              let fin = code.range(of: "funcdiscardSceneSegments()", range: début.upperBound..<code.endIndex)
        else { return XCTFail("le désarmement ou la purge a changé de nom") }
        XCTAssertTrue(String(code[début.upperBound..<fin.lowerBound])
            .contains("discardSceneSegments()"))
        XCTAssertTrue(code.contains("funcdiscardSceneSegments(){"))
        XCTAssertTrue(code.contains("removeItemLogging("),
                      "la purge doit toucher au DISQUE, pas seulement vider une liste")
    }

    /// **Désarmer FERME la session.** Une caméra laissée tournante derrière une
    /// scène rendue est un voyant allumé que rien à l'écran n'explique — et sur
    /// un appareil réel, une batterie qui se vide.
    func test_désarmer_fermeLaSession() throws {
        let code = compact(try source("MeeshyComposerHost.swift"))
        XCTAssertTrue(code.contains("funcdisarmSceneCamera(){"))
        XCTAssertTrue(code.contains("sceneCamera.stop()"))
    }
}

/// #4080 — **ce que le viseur prend appartient à la SCÈNE.**
///
/// > « Je vois une scène noire après la prise […] et le compteur de composants
/// > n'entre pas après la prise ! » — porteur, 2026-09-04
///
/// Les deux symptômes sont UN seul fait : la prise n'arrivait jamais sur la
/// slide courante. `railPosesNextMedia` — le drapeau que
/// `syncPostMediaIntoSlides` lit pour choisir la porte d'un média — n'était
/// armé que par la porte média du rail. Une capture partait donc sans marque et
/// se classait « rangée du document », une slide à elle : rien à peindre sur la
/// scène, rien à compter sur la pastille.
final class ComposerSceneCameraPosingTests: XCTestCase {

    private func source(_ nom: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/\(nom)")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    private func compact(_ t: String) -> String {
        t.components(separatedBy: .whitespacesAndNewlines).joined()
    }

    /// **L'armement marque le rail**, et il le fait AVANT la prise :
    /// `ingestIntoDocument` consomme le drapeau avant d'écrire (#4879), et
    /// l'observateur qui lit `railPosedMediaURLs` tourne sur cette écriture. Le
    /// poser plus tard le ferait arriver après lui — le défaut que #4879 a
    /// fermé pour les quatre autres portes, rejoué par la cinquième.
    func test_armer_marqueLeRail_pourQueLaPriseAtterrisseSurLaScène() throws {
        let code = compact(try source("MeeshyComposerHost.swift"))
        guard let début = code.range(of: "funcarmSceneCamera(){"),
              let fin = code.range(of: "funcdisarmSceneCamera()", range: début.upperBound..<code.endIndex)
        else { return XCTFail("l'armement ou le désarmement a changé de nom") }
        XCTAssertTrue(String(code[début.upperBound..<fin.lowerBound])
            .contains("railPosesNextMedia=true"),
            "sans la marque, la prise se classe « rangée du document » — une slide à elle")
    }

    /// **Quitter sans prendre la RETIRE.** Laissée posée, elle classerait sur
    /// la scène le prochain média venu d'une autre porte — un lot suivant qui
    /// n'a rien demandé, et un défaut qui se manifesterait loin d'ici.
    func test_désarmer_retireLaMarque() throws {
        let code = compact(try source("MeeshyComposerHost.swift"))
        guard let début = code.range(of: "funcdisarmSceneCamera(){"),
              let fin = code.range(of: "funcdiscardSceneSegments()", range: début.upperBound..<code.endIndex)
        else { return XCTFail("le désarmement ou la purge a changé de nom") }
        XCTAssertTrue(String(code[début.upperBound..<fin.lowerBound])
            .contains("railPosesNextMedia=false"))
    }
}
