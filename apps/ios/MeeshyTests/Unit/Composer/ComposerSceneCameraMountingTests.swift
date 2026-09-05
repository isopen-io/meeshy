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

    /// **La surface PUBLIE sa géométrie ; le MEUBLE monte l'aperçu.**
    ///
    /// Le viseur avait DEUX montages — la carte et un overlay de plein écran —
    /// qui se remplaçaient l'un l'autre. Une `AVCaptureVideoPreviewLayer`
    /// neuve doit attendre sa première image : la bascule jouait donc son
    /// fondu sur du noir, et c'est le « trop de temps » que le porteur a
    /// mesuré le 2026-09-04. Aucune courbe d'animation ne rattrape un aperçu
    /// qu'on détruit.
    ///
    /// Ce témoin tient les DEUX moitiés du correctif, parce qu'aucune ne vaut
    /// sans l'autre : la surface ne peint plus, et le meuble peint une fois.
    func test_laSurfacePublieSaGéométrie_etNeMonteAucunAperçu() throws {
        let surface = compact(try source("ComposerSceneSurface.swift"))
        XCTAssertTrue(surface.contains("anchorPreference(key:ComposerSceneCameraFrameKey.self"),
                      "la surface doit publier OÙ elle dessine — c'est ce que le meuble ignore")
        XCTAssertTrue(surface.contains("aspectRatio(aspectRatio,contentMode:.fit)"),
                      "l'ancre porte le DESSIN, pas la frame : sinon le viseur couvre les couloirs")
        XCTAssertFalse(surface.contains("CameraPreviewLayer("),
                       "deux montages = un aperçu détruit puis reconstruit à chaque bascule")
        XCTAssertFalse(surface.contains("ComposerSceneCameraBar("),
                       "le chrome suit l'aperçu : le laisser ici en ferait deux")
    }

    /// **Un seul `CameraPreviewLayer` dans tout le composer.** Le témoin
    /// ci-dessus prouve que la surface n'en monte plus ; celui-ci prouve qu'il
    /// n'a pas simplement DÉMÉNAGÉ en double.
    func test_leComposer_neMonteQuUnSeulAperçu() throws {
        let dossier = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer")
        let fichiers = try FileManager.default
            .contentsOfDirectory(at: dossier, includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "swift" }
        var montages: [String] = []
        for fichier in fichiers {
            let code = compact(AppSourceGuard.stripComments(
                try String(contentsOf: fichier, encoding: .utf8)))
            let occurrences = code.components(separatedBy: "CameraPreviewLayer(session:").count - 1
            montages.append(contentsOf: Array(repeating: fichier.lastPathComponent,
                                              count: occurrences))
        }
        XCTAssertEqual(montages, ["MeeshyComposerHost+Viewfinder.swift"],
                       "un aperçu qui se remplace ne peut pas grandir fluidement")
    }

    /// **Il ne prend AUCUN doigt.** L'appui long qui a armé ce viseur est
    /// toujours en cours SOUS lui — c'est sa levée qui décidera photo ou
    /// vidéo. Un aperçu qui capte le toucher couperait le geste en deux.
    func test_lAperçu_neCapteAucunGeste() throws {
        let code = compact(try source("MeeshyComposerHost+Viewfinder.swift"))
        guard let début = code.range(of: "funcsceneCameraPreview(rect:CGRect)"),
              let fin = code.range(of: "funcsceneCameraChrome(", range: début.upperBound..<code.endIndex)
        else { return XCTFail("l'aperçu ou le chrome a changé de nom") }
        XCTAssertTrue(String(code[début.upperBound..<fin.lowerBound])
            .contains("allowsHitTesting(false)"))
    }

    /// **Le plein écran couvre le SOCLE.** C'est le deuxième reproche du
    /// porteur — « sans la rangée en bas d'audience et publier » — et sa cause
    /// n'était pas un ordre de couches : le socle est le FRÈRE de la surface
    /// dans la `VStack` du meuble, et un overlay ne couvre jamais son frère.
    /// Le viseur doit donc ENVELOPPER la pile, pas se poser dessus.
    func test_leViseur_enveloppeLaPile_socleCompris() throws {
        let code = compact(try source("MeeshyComposerHost.swift"))
        // L'enveloppe se garde sur son NOM et sur ce qu'elle contient, pas
        // sur un appel littéral : d'autres enveloppes s'intercalent — le menu
        // du fond l'a fait le jour même (#5041) — et une garde qui épingle
        // `withSceneCameraViewfinder(composerStack)` rougirait pour un ajout
        // qui ne change rien à ce qu'elle protège.
        guard let enveloppe = code.range(of: "withSceneCameraViewfinder(")
        else { return XCTFail("l'enveloppe du viseur a changé de nom") }
        XCTAssertTrue(code[enveloppe.upperBound...].hasPrefix("backgroundMenuPresented(composerStack)")
                      || code[enveloppe.upperBound...].hasPrefix("composerStack)"),
                      "posé APRÈS le socle, le viseur ne l'aurait jamais couvert")
        guard let début = code.range(of: "varcomposerStack:someView{"),
              let fin = code.range(of: "varbody:someView{", range: début.upperBound..<code.endIndex)
        else { return XCTFail("la pile ou le body a changé de nom") }
        XCTAssertTrue(String(code[début.upperBound..<fin.lowerBound]).contains("socle"),
                      "le socle doit être DANS ce que le viseur enveloppe")
    }

    /// **Le chrome respecte les marges système, l'image non.** Troisième
    /// reproche du porteur : « les icônes de réduction, fermeture accessibles
    /// et non au niveau de la barre système ». Les deux couches lisent la même
    /// ancre — l'une en ignorant les marges, l'autre pas —, et c'est cet écart
    /// qui les distingue. Une seule couche ne peut pas tenir les deux.
    func test_lImageIgnoreLesMarges_quandLeChromeLesRespecte() throws {
        let code = compact(try source("MeeshyComposerHost+Viewfinder.swift"))
        guard let début = code.range(of: "funcwithSceneCameraViewfinder"),
              let fin = code.range(of: "varsceneCameraGrowth", range: début.upperBound..<code.endIndex)
        else { return XCTFail("le montage a changé de nom") }
        let corps = String(code[début.upperBound..<fin.lowerBound])
        XCTAssertEqual(corps.components(separatedBy: "overlayPreferenceValue(ComposerSceneCameraFrameKey.self)").count - 1, 2,
                       "deux couches, une par repère")
        XCTAssertEqual(corps.components(separatedBy: "ignoresSafeArea()").count - 1, 1,
                       "l'image seule ignore les marges — le chrome y serait sous l'encoche")
        XCTAssertTrue(corps.range(of: "sceneCameraPreview(")!.lowerBound
                      < corps.range(of: "ignoresSafeArea()")!.lowerBound,
                      "c'est la couche de l'IMAGE qui ignore, pas celle du chrome")
    }

    /// **Rien ne se peint quand rien n'est armé.** Sans ce gate, le meuble
    /// monterait un aperçu noir permanent par-dessus la scène — la panne
    /// exactement inverse de celle qu'on corrige, et indiscernable d'un fond
    /// noir légitime.
    func test_leMeuble_nePeintLeViseur_queSiLeStageEstArmé() throws {
        let code = compact(try source("MeeshyComposerHost+Viewfinder.swift"))
        XCTAssertEqual(code.components(separatedBy: "sceneCameraStage != .off"
            .replacingOccurrences(of: " ", with: "")).count - 1, 2,
                       "les DEUX couches doivent porter le gate — une seule laisserait un chrome orphelin")
    }

    /// **Le geste n'ouvre plus de PORTAIL.** C'est la moitié qui se voit à
    /// l'écran, et la seule que le simulateur sait juger : avant ce lot,
    /// l'appui long posait `presentedPortal = .camera` et la scène disparaissait
    /// sous une feuille modale au moment précis où l'auteur cadrait.
    func test_lAppuiLong_armeLaScène_etNOuvreAucunPortail() throws {
        let code = compact(try source("MeeshyComposerHost+Viewfinder.swift"))
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
            .appendingPathComponent("Meeshy/Features/Main/Composer/MeeshyComposerHost+Viewfinder.swift")
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
        let code = compact(try source("MeeshyComposerHost+Viewfinder.swift"))
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
        XCTAssertTrue(code.contains("poseSceneCapture(.photo(image,data:sceneCamera.capturedPhotoData))"),
                      "une photo se pose tout de suite — AVEC ses octets d'origine, qui portent l'EXIF")
    }

    /// **La durée est saisie AU RELÂCHEMENT, pas à l'arrivée du fichier.**
    ///
    /// `CameraModel.recordingDuration` est remise à zéro au démarrage suivant,
    /// et le fichier n'arrive qu'après. La lire quand l'URL se présente rendrait
    /// zéro pour tous les segments sauf le dernier — un écart qui ne casse rien
    /// et fait mentir toute la bande, donc que rien ne signalerait.
    func test_laDuréeDuSegment_estSaisieAuRelâchement() throws {
        let code = compact(try source("MeeshyComposerHost+Viewfinder.swift"))
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
        let code = compact(try source("MeeshyComposerHost+Viewfinder.swift"))
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
        let code = compact(try source("MeeshyComposerHost+Viewfinder.swift"))
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
        let code = compact(try source("MeeshyComposerHost+Viewfinder.swift"))
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
        let code = compact(try source("MeeshyComposerHost+Viewfinder.swift"))
        guard let début = code.range(of: "funcdisarmSceneCamera(){"),
              let fin = code.range(of: "funcdiscardSceneSegments()", range: début.upperBound..<code.endIndex)
        else { return XCTFail("le désarmement ou la purge a changé de nom") }
        XCTAssertTrue(String(code[début.upperBound..<fin.lowerBound])
            .contains("railPosesNextMedia=false"))
    }
}
