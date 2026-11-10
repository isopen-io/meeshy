import XCTest
import MeeshySDK
@testable import Meeshy

/// #4080 (vue `2b`) — **le viseur vit dans la scène, et les trois pastilles ne
/// sont pas trois médias.**
final class ComposerSceneCameraTests: XCTestCase {

    /// Un statut n'a pas de scène : pas de viseur. La liste VIDE l'exprime, et
    /// elle doit s'accorder avec `offersCapture`, qui refuse déjà le geste —
    /// deux règles voisines qui rendraient deux verdicts laisseraient une
    /// rangée de pastilles au-dessus d'un geste impossible.
    func test_leStatut_neSertAucunMode_commeLeGesteLeRefuse() {
        XCTAssertTrue(ComposerSceneCamera.modes(for: .status).isEmpty)
        XCTAssertFalse(ComposerSceneCaptureGesture.offersCapture(
            backgroundIsEmpty: true, format: .status))
    }

    /// **Le réel n'offre pas PHOTO.** C'est le témoin qui discrimine : sur
    /// story et post, servir trois pastilles ou deux rend la même rangée
    /// plausible ; ici seule la règle juste retire la bonne.
    func test_leReel_neSertPasLaPhoto() {
        XCTAssertEqual(ComposerSceneCamera.modes(for: .reel), [.video, .handsFree])
        XCTAssertFalse(ComposerSceneCamera.modes(for: .reel).contains(.photo))
    }

    func test_storyEtPost_serventLesTroisPastilles() {
        for format in [ComposerFormat.story, .post] {
            XCTAssertEqual(ComposerSceneCamera.modes(for: format), [.photo, .video, .handsFree])
        }
    }

    /// **Le mode d'ouverture est le premier SERVI, jamais un littéral.** Sans
    /// cette dérivation, un réel s'ouvrirait sur une pastille PHOTO que sa
    /// propre rangée ne montre pas.
    func test_leModeDOuverture_estToujoursServiParSaPropreRangée() {
        // `ComposerFormat` n'est pas `CaseIterable` — les quatre cas sont
        // écrits ici, et le témoin de cardinalité ci-dessous garde la liste :
        // un cinquième format ferait tomber ce dernier, pas celui-ci en silence.
        for format in [ComposerFormat.story, .post, .reel, .status] {
            guard let ouverture = ComposerSceneCamera.initialMode(for: format) else {
                XCTAssertTrue(ComposerSceneCamera.modes(for: format).isEmpty,
                              "\(format) n'ouvre sur rien mais sert des modes")
                continue
            }
            XCTAssertTrue(ComposerSceneCamera.modes(for: format).contains(ouverture),
                          "\(format) ouvre sur \(ouverture), absent de sa rangée")
        }
    }

    /// **Le garde-fou de la liste écrite à la main.** `ComposerFormat` n'est
    /// pas `CaseIterable` ; le témoin ci-dessus énumère donc quatre cas en
    /// dur. Celui-ci tombe si un cinquième format naît — sans lui, la boucle
    /// passerait au vert en ignorant le nouveau venu, ce qui est exactement la
    /// forme d'un témoin qui se périme sans rougir.
    func test_lesQuatreFormats_sontToujoursQuatre() {
        let servis: [ComposerFormat] = [.story, .post, .reel, .status]
        for format in servis {
            switch format {
            case .story, .post, .reel, .status: continue
            }
        }
        XCTAssertEqual(servis.count, 4)
    }

    // MARK: - Le relâchement, où les trois modes divergent

    /// **MAINS LIBRES continue de tourner** — c'est toute sa raison d'être.
    /// Le traiter comme `video` le rendrait indiscernable de lui, et la
    /// troisième pastille deviendrait un doublon de la deuxième.
    func test_mainsLibres_continueDeTournerAuRelâchement() {
        XCTAssertEqual(
            ComposerSceneCamera.stageAfterRelease(mode: .handsFree, stage: .recording),
            .recording)
    }

    func test_laVidéoTenue_seClôtAuRelâchement() {
        XCTAssertEqual(
            ComposerSceneCamera.stageAfterRelease(mode: .video, stage: .recording),
            .armed)
    }

    /// Relâcher hors enregistrement ne change rien — un geste qui n'a rien
    /// commencé ne peut rien clore, et rendre `.armed` ici armerait un viseur
    /// éteint.
    func test_relâcherHorsEnregistrement_neChangeRien() {
        for mode in ComposerSceneCameraMode.allCases {
            for étape in [ComposerSceneCameraStage.off, .armed] {
                XCTAssertEqual(
                    ComposerSceneCamera.stageAfterRelease(mode: mode, stage: étape), étape)
            }
        }
    }

    /// **Une entrée, pas un mode** (§2b) : après la pose, le viseur se retire.
    func test_aprèsLaPose_leViseurSeRetire() {
        XCTAssertEqual(ComposerSceneCamera.stageAfterCapture, .off)
    }

    // MARK: - La pose réutilise la règle de la galerie

    /// La cible le prescrit mot pour mot — « la même règle que la galerie ».
    /// Ce témoin garde la RÉUTILISATION : si quelqu'un recopiait la règle chez
    /// la caméra, il faudrait qu'elle rende encore ces deux verdicts, et une
    /// copie diverge au premier format ajouté.
    func test_laPose_suitLaRègleDeLaGalerie() {
        XCTAssertEqual(
            ComposerMediaPlacement.role(door: .sceneRail, currentSlideHasBackground: false),
            .background)
        XCTAssertEqual(
            ComposerMediaPlacement.role(door: .sceneRail, currentSlideHasBackground: true),
            .foreground)
    }

    // MARK: - Le libellé DIT le geste

    /// **Le bas de la cible n'est pas décoratif.** Figé sur « maintenir pour
    /// filmer », il mentirait sur deux des trois pastilles — et c'est la
    /// phrase que l'auteur lit pour savoir quoi faire de son doigt.
    func test_chaqueCoupleModeÉtape_aSaProprePhrase() {
        var vues = Set<String>()
        for mode in ComposerSceneCameraMode.allCases {
            for étape in ComposerSceneCameraStage.allCases {
                vues.insert(ComposerSceneCamera.hintKey(mode: mode, stage: étape))
            }
        }
        // PHOTO en dit une seule (son geste ne dépend pas de l'étape) ; VIDÉO
        // et MAINS LIBRES en disent deux chacune — tenir/relâcher, démarrer/arrêter.
        XCTAssertEqual(vues.count, 5)
    }

    func test_laPhrase_changeQuandLaVidéoTourne() {
        XCTAssertNotEqual(
            ComposerSceneCamera.hintKey(mode: .video, stage: .armed),
            ComposerSceneCamera.hintKey(mode: .video, stage: .recording))
        XCTAssertNotEqual(
            ComposerSceneCamera.hintKey(mode: .handsFree, stage: .armed),
            ComposerSceneCamera.hintKey(mode: .handsFree, stage: .recording))
    }
}

/// #4080 — **ce que le viseur OCCUPE, une fois qu'il vit dans la carte.**
final class ComposerSceneCameraOverlayTests: XCTestCase {

    /// **Le volet de description cède, et il est le seul.** Il est ancré au bas
    /// du DESSIN — donc exactement là où le déclencheur se pose. Mesuré au
    /// simulateur avant ce lot : déclencheur y 569–665, volet y 610–648,
    /// quarante points de chevauchement.
    func test_leVoletDeDescription_cèdeAuViseur() {
        XCTAssertFalse(ComposerSceneCameraOverlay.isServed(.description, stage: .armed))
        XCTAssertFalse(ComposerSceneCameraOverlay.isServed(.description, stage: .recording))
        XCTAssertTrue(ComposerSceneCameraOverlay.isServed(.description, stage: .off))
    }

    /// **La trace du son NE cède PAS** — elle est ancrée AU-DESSUS du dessin
    /// (#5017), et le viseur ne monte pas jusque-là. La faire céder retirerait
    /// une information que rien ne recouvre.
    func test_laTraceDuSon_neCèdePas() {
        for étape in ComposerSceneCameraStage.allCases {
            XCTAssertTrue(ComposerSceneCameraOverlay.isServed(.soundTrace, stage: étape))
        }
    }

    /// **Les rails de la scène cèdent au viseur, qui porte SA colonne** (#17432,
    /// retourne « pas de rail au viseur » d'A8, #17109) : la caméra s'arme plein
    /// écran, et c'est la colonne du viseur — Galerie · Texte · Fond · Stickers,
    /// puis les familles de look — qui sert la scène. Scène rendue, les rails
    /// reviennent.
    func test_lesRails_cèdentAuViseurArmé_quiPorteSaColonneDeScène() {
        XCTAssertFalse(ComposerSceneCameraOverlay.isServed(.rails, stage: .armed))
        XCTAssertFalse(ComposerSceneCameraOverlay.isServed(.rails, stage: .recording))
        XCTAssertTrue(ComposerSceneCameraOverlay.isServed(.rails, stage: .off))
        XCTAssertEqual(ComposerViewfinderColumn.entries(composesScene: true, context: ComposerCaptureGestureContext()),
                       [.gallery, .text, .background, .sticker],
                       "le viseur armé n'est plus un viseur seul : la scène s'y compose")
    }

    /// **Trois meubles, et la règle décide encore** : une règle où tout
    /// céderait rendrait `stage != .off` en ignorant son premier paramètre.
    func test_laRègle_neCèdePasEnBloc() {
        let cèdent = ComposerSceneCameraOverlay.Furniture.allCases
            .filter { ComposerSceneCameraOverlay.yieldsToViewfinder($0) }
        XCTAssertEqual(cèdent, [.description, .rails])
    }
}

/// #4080 — **ce que la carte MONTRE, et pourquoi « noir » n'est pas un état.**
final class ComposerSceneCameraSurfaceTests: XCTestCase {

    func test_viseurÉteint_laSceneResteUneScene() {
        // **`.camera` n'est PAS un cas de l'énuméré** : c'est une propriété
        // calculée qui LIT le statut système vivant. L'employer dans un témoin
        // le rendrait dépendant des réglages de la machine — vert ou rouge
        // selon ce que le simulateur a accordé ce jour-là. Les cas nommés sont
        // les seuls qui décrivent une intention.
        for permission in [MediaPermissionState.granted, .denied, .notDetermined] {
            XCTAssertEqual(
                ComposerSceneCameraSurface.shown(stage: .off, permission: permission), .scene)
        }
    }

    func test_permissionAccordée_montreLAperçu() {
        XCTAssertEqual(
            ComposerSceneCameraSurface.shown(stage: .armed, permission: .granted), .viewfinder)
    }

    /// **Le cas qui manquait.** Une permission refusée laissait la carte NOIRE
    /// — indiscernable d'une scène vide ou d'une caméra en panne. L'auteur
    /// cherchait un défaut là où il n'y avait qu'une case à cocher.
    func test_permissionRefusée_ditPOURQUOI_plutôtQueDeResterNoire() {
        XCTAssertEqual(
            ComposerSceneCameraSurface.shown(stage: .armed, permission: .denied),
            .permissionRefused)
        XCTAssertEqual(
            ComposerSceneCameraSurface.shown(stage: .recording, permission: .denied),
            .permissionRefused)
        // `.restricted` — bloqué par une politique (contrôle parental, MDM).
        // Jamais promptable, et « ouvrir les Réglages » y est le seul recours,
        // exactement comme `.denied` : les deux doivent rendre le même écran,
        // sinon un appareil d'entreprise resterait devant une carte noire.
        XCTAssertEqual(
            ComposerSceneCameraSurface.shown(stage: .armed, permission: .restricted),
            .permissionRefused)
    }

    /// **`notDetermined` ne montre PAS le panneau** : le système est en train
    /// de poser sa question, et un écran de refus affiché pendant qu'on demande
    /// dirait le contraire de ce qui se passe.
    func test_permissionEnCoursDeDemande_neCrieVictoireNiDéfaite() {
        XCTAssertEqual(
            ComposerSceneCameraSurface.shown(stage: .armed, permission: .notDetermined),
            .viewfinder)
    }
}

/// #4080 — **le viseur a deux tailles, et elles ne servent pas les mêmes
/// contrôles** (directive porteur 2026-09-04).
final class ComposerSceneCameraSizeTests: XCTestCase {

    func test_leBouton_faitBasculerDansLesDeuxSens() {
        XCTAssertEqual(ComposerSceneCameraSize.card.toggled, .fullScreen)
        XCTAssertEqual(ComposerSceneCameraSize.fullScreen.toggled, .card)
    }

    /// **Le glyphe annonce OÙ l'on va, jamais où l'on est.** Un symbole qui
    /// décrirait l'état laisserait deviner ce qu'un appui ferait — et ils sont
    /// visuellement proches, donc l'erreur ne se verrait pas.
    func test_lesDeuxGlyphes_diffèrent() {
        XCTAssertNotEqual(ComposerSceneCameraSize.card.toggleSymbol,
                          ComposerSceneCameraSize.fullScreen.toggleSymbol)
    }

    /// **La caméra s'arme PLEIN ÉCRAN** (A8, #17109) : plus de carte où le
    /// viseur rentrerait, plus de bouton carte ↔ plein écran.
    func test_leViseur_sArmePleinEcran() {
        XCTAssertEqual(ComposerSceneCameraSize.armed, .fullScreen)
    }

    // La croix « seulement en plein écran » est RÉVOQUÉE (#8653, porteur
    // 2026-09-29) : elle est là dans les deux tailles, et son témoin vit dans
    // `ComposerSceneQuickCaptureTests`.
}

/// **Le viseur porte Galerie · Texte · Fond · Stickers avant Filtres et Effets** (#17432).
@MainActor
final class ComposerViewfinderColumnTests: XCTestCase {

    private func context(stage: ComposerSceneCameraStage = .armed, editing: Bool = false,
                         holding: Bool = false, pendingSegments: Int = 0) -> ComposerCaptureGestureContext {
        ComposerCaptureGestureContext(stage: stage, editing: editing, holding: holding, pendingSegments: pendingSegments)
    }

    /// Directive porteur du 2026-11-10 : « Galerie (en premier), Texte, Fond, Stickers ».
    func test_entries_composerViewfinder_servesGalleryFirstThenTextBackgroundStickers() {
        XCTAssertEqual(ComposerViewfinderColumn.entries(composesScene: true, context: context()),
                       [.gallery, .text, .background, .sticker])
    }

    func test_label_namesTheEntriesSimply() throws {
        let labels = ComposerViewfinderEntry.allCases.map(ComposerViewfinderColumn.label)
        XCTAssertFalse(labels.contains { $0.hasPrefix("composer.viewfinder.") }, "chaque libellé est traduit")
        let path = try XCTUnwrap(Bundle.main.path(forResource: "fr", ofType: "lproj"))
        let francais = try XCTUnwrap(Bundle(path: path))
        let mots = ["gallery", "text", "background", "stickers"].map {
            francais.localizedString(forKey: "composer.viewfinder.\($0)", value: nil, table: nil)
        }
        XCTAssertEqual(mots, ["Galerie", "Texte", "Fond", "Stickers"])
    }

    func test_entries_conversationCamera_servesNone() {
        XCTAssertTrue(ComposerViewfinderColumn.entries(composesScene: false, context: context()).isEmpty,
                      "la caméra de la barre de conversation n'a pas de scène à composer")
    }

    func test_entries_whileFilmingHoldingOrRetouching_servesNone() {
        XCTAssertTrue(ComposerViewfinderColumn.entries(composesScene: true, context: context(stage: .recording)).isEmpty)
        XCTAssertTrue(ComposerViewfinderColumn.entries(composesScene: true, context: context(holding: true)).isEmpty)
        XCTAssertTrue(ComposerViewfinderColumn.entries(composesScene: true, context: context(editing: true)).isEmpty)
        XCTAssertTrue(ComposerViewfinderColumn.entries(composesScene: true, context: context(stage: .off)).isEmpty)
    }

    /// Seule la Galerie peut couper la caméra (au choix) : avec des segments en attente, elle se retire.
    func test_entries_pendingSegments_keepOnlyWhatNeverCutsTheCamera() {
        XCTAssertEqual(ComposerViewfinderColumn.entries(composesScene: true, context: context(pendingSegments: 2)),
                       [.text, .background, .sticker], "choisir en Galerie couperait la caméra et ses segments en attente")
    }

    /// **La caméra, pour chaque entrée et chaque issue** (directive porteur du 2026-11-10) : le viseur
    /// reste vivant pendant tout le processus, sauf quand on CHOISIT un élément de la galerie.
    func test_camera_keptForEveryEntryAndOutcome_exceptAGalleryChoice() {
        for entree in ComposerViewfinderEntry.allCases {
            XCTAssertEqual(entree.camera(after: .opened), .kept, "\(entree) ouverte")
            XCTAssertEqual(entree.camera(after: .dismissed), .kept, "\(entree) fermée sans choix")
        }
        XCTAssertEqual(ComposerViewfinderEntry.text.camera(after: .chosen), .kept)
        XCTAssertEqual(ComposerViewfinderEntry.background.camera(after: .chosen), .kept,
                       "le fond choisi reste celui de la scène tant qu'aucune prise ne le remplace")
        XCTAssertEqual(ComposerViewfinderEntry.sticker.camera(after: .chosen), .kept)
        XCTAssertEqual(ComposerViewfinderEntry.gallery.camera(after: .chosen), .cut,
                       "un élément choisi arrête le viseur et rend le composer de base")
    }

    /// Une feuille se pose PAR-DESSUS le viseur vivant ; un outil qui s'édite SUR la scène
    /// (la saisie du texte, la bande du cadre) prend la scène sans couper la caméra.
    func test_yieldsToScene_onlyForAToolThatEditsOnTheScene() {
        XCTAssertFalse(ComposerViewfinderColumn.yieldsToScene(toolPresentsSheet: true))
        XCTAssertTrue(ComposerViewfinderColumn.yieldsToScene(toolPresentsSheet: false))
    }

    func test_handleViewfinderEntry_neverDisarmsAtOpening() throws {
        let code = try ComposerCaptureTakesTests.code("Meeshy/Features/Composer/MeeshyComposerHost+Viewfinder.swift")
        let debut = try XCTUnwrap(code.range(of: "func handleViewfinderEntry("))
        let fin = try XCTUnwrap(code.range(of: "var viewfinderEntryToolIsOpen", range: debut.upperBound..<code.endIndex))
        XCTAssertFalse(code[debut.upperBound..<fin.lowerBound].contains("disarmSceneCamera()"),
                       "ouvrir une entrée garde le viseur vivant ; seul un choix en Galerie l'arrête")
    }

    func test_entry_hasALabelASymbolAndAnIdentifier() {
        for entree in ComposerViewfinderEntry.allCases {
            XCTAssertFalse(ComposerViewfinderColumn.label(entree).isEmpty, "\(entree) : VoiceOver le nomme")
            XCTAssertFalse(entree.symbol.isEmpty)
            XCTAssertEqual(entree.accessibilityIdentifier, "composer.viewfinder.\(entree.rawValue)")
        }
    }

    func test_bottomRow_mountsTheSceneEntries_beforeTheLookFamilies() throws {
        let rangee = try ComposerCaptureTakesTests.code("Meeshy/Features/Composer/ComposerCaptureBottomRow.swift")
        let colonne = try XCTUnwrap(rangee.range(of: "ComposerViewfinderColumnView("))
        let familles = try XCTUnwrap(rangee.range(of: "ComposerLookRail(open:"))
        XCTAssertLessThan(colonne.lowerBound, familles.lowerBound, "Galerie · Texte · Fond · Stickers avant les familles")
    }
}

