import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **Texte, image de premier plan, sticker, lieu, son et fond s'éditent DANS la
/// scène** (#9138, directive porteur 2026-10-02).
///
/// > « Il faut revoir le chemin de création et édition de texte pour éviter
/// > l'ouverture inutile de la vue ancienne d'édition de texte, gérer
/// > l'engendrement et positionnement des sous-outils et l'édition d'élément
/// > existant de manière simple et cohérente ! Même chose pour les images de
/// > front et d'arrière plan ! On a validé qu'on ne veut plus de nouvelle vue
/// > mais des mises à jour de la vue de base avec les options des outils qui
/// > s'ouvrent à droite partant du haut. »
///
/// Le fond l'était déjà (#8847) : ses témoins sont repris ici, la même
/// grammaire valant désormais pour toutes les familles.
final class ComposerInlineEditTests: XCTestCase {

    // MARK: - La famille d'un objet

    func test_family_litLeKindLeMediaEtLePlan() {
        XCTAssertEqual(ComposerInlineFamily.of(kind: .text, isVideo: false, isBackground: false), .text)
        XCTAssertEqual(ComposerInlineFamily.of(kind: .media, isVideo: false, isBackground: false), .image)
        XCTAssertEqual(ComposerInlineFamily.of(kind: .media, isVideo: true, isBackground: false), .video)
        XCTAssertEqual(ComposerInlineFamily.of(kind: .media, isVideo: true, isBackground: true),
                       .background(isVideo: true))
        XCTAssertEqual(ComposerInlineFamily.of(kind: .sticker, isVideo: false, isBackground: false), .sticker)
        XCTAssertEqual(ComposerInlineFamily.of(kind: .place, isVideo: false, isBackground: false), .place)
        XCTAssertEqual(ComposerInlineFamily.of(kind: .audio, isVideo: false, isBackground: false), .audio)
    }

    func test_family_seulUnMediaPeutEtreLeFond() {
        XCTAssertEqual(ComposerInlineFamily.of(kind: .text, isVideo: false, isBackground: true), .text,
                       "un texte n'est jamais le fond, quel que soit le drapeau")
    }

    // MARK: - Les sous-outils, dans un ordre canonique — la même grammaire

    func test_sections_texte_sesHuitOutilsPuisTempsEtPlan() {
        XCTAssertEqual(ComposerInlineEditing.sections(for: .text, hasTrimmableSource: false),
                       TextEditTool.all.map { ComposerObjectEditorSection.tool($0) } + [.timing, .plan],
                       "l'ordre APPRIS des outils du texte, puis la fenêtre de temps et le plan")
    }

    /// Une image POSÉE se recadre d'abord (#9499) — la borne est lue par son
    /// calque (`contentsRect`), son lecteur web et sa vignette : le contrôle a
    /// un effet partout où l'objet se peint.
    /// Les EFFETS (#9498) suivent les réglages : on règle l'image, puis on y
    /// pose un look.
    func test_sections_image_recadrageFiltreReglagesEffetsActionsDescription_puisTempsEtPlan() {
        XCTAssertEqual(ComposerInlineEditing.sections(for: .image, hasTrimmableSource: false),
                       [.media(.crop), .media(.filter), .media(.adjust), .media(.effects), .media(.actions),
                        .media(.altText), .timing, .plan])
    }

    func test_sections_video_reglagesRognageActionsDescription_sansFiltre_puisTempsEtPlan() {
        XCTAssertEqual(ComposerInlineEditing.sections(for: .video, hasTrimmableSource: true),
                       [.media(.adjust), .media(.trim), .media(.actions), .media(.altText), .timing, .plan],
                       "le filtre se cuit dans une image : une vidéo n'en rend aucun ; ses réglages, si (#9169)")
    }

    /// RÉGLAGES compris depuis #9496 (`StoryBackgroundLook` les peint) ; le
    /// RECADRAGE hors retouche (#9499) reste réservé au média posé — le fond ne
    /// se recadre qu'en retouche (#9136).
    func test_sections_fond_lesMemesQuUnMediaPose_saufLeTemps() {
        let horsDuTemps: (ComposerObjectEditorSection) -> Bool = { $0 != .timing && $0 != .plan }
        XCTAssertEqual(ComposerInlineEditing.sections(for: .background(isVideo: false), hasTrimmableSource: false),
                       ComposerInlineEditing.sections(for: .image, hasTrimmableSource: false)
                           .filter { $0 != .media(.crop) }.filter(horsDuTemps))
        XCTAssertEqual(ComposerInlineEditing.sections(for: .background(isVideo: true), hasTrimmableSource: true),
                       ComposerInlineEditing.sections(for: .video, hasTrimmableSource: true).filter(horsDuTemps))
    }

    /// **La fenêtre de temps et le plan vont à toute famille POSÉE** (#9144) :
    /// leur écrivain sert les cinq familles (`setSceneObjectTiming`). Le
    /// témoin s'écrit sur les familles où le défaut vivait — tout sauf le
    /// texte — et garde la seule exclusion juste : un fond dure la slide.
    func test_sections_tempsEtPlan_offertsAToutObjetPose_jamaisAuFond() {
        let posees: [ComposerInlineFamily] = [.text, .image, .video, .audio, .sticker, .place]
        for famille in posees {
            let sections = ComposerInlineEditing.sections(for: famille, hasTrimmableSource: true)
            XCTAssertEqual(Array(sections.suffix(2)), [.timing, .plan],
                           "\(famille) : la fenêtre de temps puis le plan, après ses propres sous-outils")
        }
        for fond in [ComposerInlineFamily.background(isVideo: false), .background(isVideo: true)] {
            let sections = ComposerInlineEditing.sections(for: fond, hasTrimmableSource: true)
            XCTAssertFalse(sections.contains(.timing), "\(fond) offrirait une fenêtre de temps sans effet")
            XCTAssertFalse(sections.contains(.plan), "\(fond) offrirait un plan sans effet")
        }
    }

    /// **L'écrivain de la fenêtre n'est plus le binding du texte** — sans quoi
    /// la fenêtre d'un sticker, d'une image, d'un lieu ou d'un son serait un
    /// contrôle inerte, et le plan ne désignerait qu'un texte.
    func test_laFenetre_secritParLeVerbeDesCinqFamilles() throws {
        let code = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Composer/ComposerObjectTimingControls.swift"))
            .components(separatedBy: .whitespacesAndNewlines).joined()
        XCTAssertTrue(code.contains("viewModel.setSceneObjectTiming(id:objectId,"))
        XCTAssertFalse(code.contains("textObjectBinding(for:objectId)"),
                       "le binding du texte réserverait la fenêtre au texte")
        XCTAssertTrue(code.contains("viewModel.currentSlide.sceneObject(id:id)!=nil"),
                      "toucher une piste du plan désigne l'objet de n'importe quelle famille")
    }

    /// Le recadrage va à une IMAGE posée (#9499). Jamais à un fond (le lecteur
    /// ne le recadre pas), jamais à une vidéo (#9153 : son player ne lit pas
    /// encore la borne).
    func test_sections_cropIsServedToAPlacedImageOnly() {
        XCTAssertTrue(ComposerInlineEditing.sections(for: .image, hasTrimmableSource: false)
            .contains(.media(.crop)))
        XCTAssertFalse(ComposerInlineEditing.sections(for: .background(isVideo: false), hasTrimmableSource: false)
            .contains(.media(.crop)), "Le lecteur ne recadre pas un fond : rien à offrir")
        XCTAssertFalse(ComposerInlineEditing.sections(for: .background(isVideo: true), hasTrimmableSource: true)
            .contains(.media(.crop)))
        XCTAssertFalse(ComposerInlineEditing.sections(for: .video, hasTrimmableSource: true)
            .contains(.media(.crop)))
    }

    /// **Une seule liste de proportions** (#9499) : celle du SDK, cas pour cas
    /// celle du web (`MEDIA_CROP_RATIOS`). Le cadre d'origine se traduit, une
    /// notation se lit telle quelle.
    func test_lesPastillesDeRecadrage_sontLaListePartagee() {
        XCTAssertEqual(ComposerMediaCropPads.ratios, MediaCropRatio.allCases)
        XCTAssertEqual(ComposerMediaCropPads.label(.portrait34), "3:4")
        XCTAssertEqual(ComposerMediaCropPads.label(.landscape169), "16:9")
    }

    func test_sections_backgroundVideo_trimsAndMutes() {
        let sections = ComposerInlineEditing.sections(for: .background(isVideo: true), hasTrimmableSource: true)
        XCTAssertTrue(sections.contains(.media(.trim)))
        XCTAssertTrue(sections.contains(.media(.actions)), "Le muet vit dans les actions du média")
    }

    func test_sections_stickerEtLieu_leTempsEtLePlanSeulement() {
        XCTAssertEqual(ComposerInlineEditing.sections(for: .sticker, hasTrimmableSource: false), [.timing, .plan])
        XCTAssertEqual(ComposerInlineEditing.sections(for: .place, hasTrimmableSource: false), [.timing, .plan])
    }

    func test_sections_son_leRognageSeulementQuandIlYADeQuoiRogner() {
        XCTAssertEqual(ComposerInlineEditing.sections(for: .audio, hasTrimmableSource: true),
                       [.media(.trim), .timing, .plan])
        XCTAssertEqual(ComposerInlineEditing.sections(for: .audio, hasTrimmableSource: false), [.timing, .plan])
    }

    /// La scission n'est servie par AUCUNE famille : aucun champ du modèle ne
    /// la rend (`MediaEditTool.served`). Le recadrage, hors de la liste servie
    /// lui aussi, ne va qu'à l'image (témoin ci-dessus).
    func test_sections_jamaisScission_niRecadrageHorsImage() {
        let familles: [ComposerInlineFamily] = [.text, .image, .video, .audio, .sticker, .place,
                                                .background(isVideo: false), .background(isVideo: true)]
        for famille in familles {
            let sections = ComposerInlineEditing.sections(for: famille, hasTrimmableSource: true)
            XCTAssertEqual(sections.contains(.media(.crop)), famille == .image, "\(famille)")
            XCTAssertFalse(sections.contains(.media(.split)))
        }
    }

    // MARK: - Toute porte d'édition, sur la scène, devient l'édition en place

    func test_begin_surLaScene_ouvreLaSectionDemandeeQuandElleEstServie() {
        XCTAssertEqual(
            ComposerInlineEditing.begin(objectId: "img", family: .image, onSceneSurface: true,
                                        requested: .media(.filter), hasTrimmableSource: false),
            ComposerInlineEdit(objectId: "img", family: .image, openSection: .media(.filter)))
    }

    func test_begin_sansSection_neMontreQueLesSousOutils() {
        XCTAssertEqual(
            ComposerInlineEditing.begin(objectId: "t1", family: .text, onSceneSurface: true,
                                        requested: nil, hasTrimmableSource: false),
            ComposerInlineEdit(objectId: "t1", family: .text, openSection: nil))
    }

    func test_begin_sectionNonServie_neMontreQueLesSousOutils_jamaisLAncienEcran() {
        XCTAssertEqual(
            ComposerInlineEditing.begin(objectId: "bg", family: .background(isVideo: false), onSceneSurface: true,
                                        requested: .timing, hasTrimmableSource: false),
            ComposerInlineEdit(objectId: "bg", family: .background(isVideo: false), openSection: nil))
        XCTAssertEqual(
            ComposerInlineEditing.begin(objectId: "bg", family: .background(isVideo: true), onSceneSurface: true,
                                        requested: .plan, hasTrimmableSource: true)?.openSection,
            nil)
        XCTAssertEqual(
            ComposerInlineEditing.begin(objectId: "st", family: .sticker, onSceneSurface: true,
                                        requested: .plan, hasTrimmableSource: false)?.openSection,
            .plan, "le plan d'un sticker est servi depuis #9144")
    }

    func test_begin_horsDeLaScene_laisseLEditeurDObjet() {
        XCTAssertNil(ComposerInlineEditing.begin(objectId: "img", family: .image, onSceneSurface: false,
                                                 requested: nil, hasTrimmableSource: false),
                     "l'atelier et le document gardent leur éditeur")
    }

    // MARK: - Toucher un sous-outil ouvre ses options, le retoucher les range

    func test_tapped_ouvre_bascule_puisReferme() {
        let edition = ComposerInlineEdit(objectId: "img", family: .image, openSection: nil)
        let filtre = ComposerInlineEditing.tapped(.media(.filter), in: edition)
        XCTAssertEqual(filtre.openSection, .media(.filter))
        XCTAssertEqual(ComposerInlineEditing.tapped(.media(.actions), in: filtre).openSection, .media(.actions))
        XCTAssertNil(ComposerInlineEditing.tapped(.media(.filter), in: filtre).openSection)
        XCTAssertEqual(ComposerInlineEditing.tapped(.media(.filter), in: filtre).objectId, "img")
        XCTAssertEqual(ComposerInlineEditing.tapped(.media(.filter), in: filtre).family, .image)
    }

    // MARK: - L'édition ne survit pas à son objet ni à sa sélection

    func test_resolved_suitLaSelectionEtLaFamille() {
        let edition = ComposerInlineEdit(objectId: "img", family: .image, openSection: .media(.filter))
        let servies: [ComposerObjectEditorSection] = [.media(.filter), .media(.actions)]
        XCTAssertEqual(ComposerInlineEditing.resolved(edition, selectedId: "img", family: .image,
                                                      served: servies, onSceneSurface: true), edition)
        XCTAssertNil(ComposerInlineEditing.resolved(edition, selectedId: nil, family: .image,
                                                    served: servies, onSceneSurface: true),
                     "désélectionner — le (x), un toucher du fond — rend la scène")
        XCTAssertNil(ComposerInlineEditing.resolved(edition, selectedId: "autre", family: .image,
                                                    served: servies, onSceneSurface: true))
        XCTAssertNil(ComposerInlineEditing.resolved(edition, selectedId: "img", family: nil,
                                                    served: servies, onSceneSurface: true),
                     "un objet supprimé ou défait par l'historique ne laisse pas l'écran en mode outil")
        XCTAssertNil(ComposerInlineEditing.resolved(edition, selectedId: "img", family: .background(isVideo: false),
                                                    served: servies, onSceneSurface: true),
                     "devenu le fond, l'objet change de famille : son édition se referme")
        XCTAssertNil(ComposerInlineEditing.resolved(edition, selectedId: "img", family: .image,
                                                    served: servies, onSceneSurface: false))
        XCTAssertNil(ComposerInlineEditing.resolved(nil, selectedId: "img", family: .image,
                                                    served: servies, onSceneSurface: true))
    }

    func test_resolved_uneSectionQuiNEstPlusServie_seRange_lEditionReste() {
        let edition = ComposerInlineEdit(objectId: "vid", family: .video, openSection: .media(.trim))
        XCTAssertEqual(ComposerInlineEditing.resolved(edition, selectedId: "vid", family: .video,
                                                      served: [.media(.actions)], onSceneSurface: true),
                       ComposerInlineEdit(objectId: "vid", family: .video, openSection: nil))
    }

    // MARK: - Les actions : « Modifier » n'est offert que s'il mène AILLEURS

    func test_actions_fond_aucune() {
        XCTAssertEqual(ComposerInlineEditing.actions(for: .background(isVideo: false),
                                                     offered: [.edit, .delete]), [])
    }

    func test_actions_texteEtSon_gardentModifier() {
        XCTAssertEqual(ComposerInlineEditing.actions(for: .text, offered: [.edit, .delete]), [.edit, .delete],
                       "« Modifier » un texte lève le clavier")
        XCTAssertEqual(ComposerInlineEditing.actions(for: .audio, offered: [.edit, .delete]), [.edit, .delete],
                       "« Modifier » un son ouvre la création audio")
    }

    func test_actions_mediaStickerLieu_sansModifier_onYEstDeja() {
        for famille: ComposerInlineFamily in [.image, .video, .sticker, .place] {
            XCTAssertEqual(ComposerInlineEditing.actions(for: famille, offered: [.edit, .duplicate, .delete]),
                           [.duplicate, .delete],
                           "\(famille) : « Modifier » rouvrirait l'état où l'on est déjà")
        }
    }

    // MARK: - Le panneau : à droite, depuis le haut, l'espace disponible

    /// **La colonne gauche est VIDE pendant l'édition** : le panneau reprend sa
    /// place et s'étend du bord gauche jusqu'à la colonne des sous-outils.
    func test_panelWidth_telephone_toutJusquALaColonneDeDroite() {
        let largeur = ComposerInlinePanelLayout.width(freeWidth: 402, roomy: false)
        let attendu = 402 - 2 * ComposerRailGeometry.outerMargin
            - ComposerRailGeometry.railWidth - ComposerRailGeometry.gutter
        XCTAssertEqual(largeur, attendu)
        XCTAssertGreaterThan(largeur, ComposerRailGeometry.lane * 4,
                             "aucun couloir de gauche réservé : le panneau n'est pas à l'étroit")
    }

    func test_panelWidth_grandEcran_uneCarteBornee() {
        XCTAssertEqual(ComposerInlinePanelLayout.width(freeWidth: 1024, roomy: true),
                       ComposerRailGeometry.roomyPanelWidth)
    }

    func test_panelWidth_jamaisNegative() {
        XCTAssertEqual(ComposerInlinePanelLayout.width(freeWidth: 20, roomy: false), 0)
    }

    func test_panelWidth_ecranLePlusEtroit_tientUneColonneDOptions() {
        let largeur = ComposerInlinePanelLayout.width(freeWidth: ComposerRailGeometry.narrowestSupportedScreenWidth,
                                                      roomy: false)
        XCTAssertGreaterThanOrEqual(largeur, ComposerInlinePanelLayout.minimumWidth,
                                    "trois vignettes d'options par rangée, même sur un iPhone SE")
    }

    /// **Toute la hauteur libre, jamais un plafond arbitraire** — le panneau
    /// prend ce que son contenu demande, jusqu'à la hauteur libre du couloir.
    func test_panelHeight_epouseLeContenu_jusquALaHauteurLibre() {
        XCTAssertEqual(ComposerInlinePanelLayout.height(content: 180, freeHeight: 700), 180)
        XCTAssertEqual(ComposerInlinePanelLayout.height(content: 900, freeHeight: 700),
                       ComposerInlinePanelLayout.maxHeight(freeHeight: 700))
        XCTAssertGreaterThan(ComposerInlinePanelLayout.maxHeight(freeHeight: 700),
                             ComposerObjectEditorRail.optionsMaxHeight,
                             "l'ancien plafond de la bande basse (260 pt) ne borne plus les options")
        XCTAssertGreaterThan(ComposerInlinePanelLayout.height(content: 0, freeHeight: 700), 0,
                             "une hauteur nulle à la première passe ferait clignoter le panneau")
    }

    /// **Le haut reste la place du panneau** (#9138) ; le bas n'est qu'un repli,
    /// pris quand le haut cacherait l'objet réglé ET que le bas le cache moins
    /// (#9495). Les deux places gardent la colonne des sous-outils à droite.
    func test_panelFrame_enHautParDefaut_leBasNEstQuUnRepli() {
        let libre = CGSize(width: 402, height: 700)
        let haut = ComposerInlinePanelLayout.frame(edge: .top, free: libre, panelHeight: 180)
        XCTAssertEqual(haut.minY, ComposerRailGeometry.gutter)
        XCTAssertEqual(haut.maxX, 402 - ComposerRailGeometry.outerMargin
                       - ComposerRailGeometry.railWidth - ComposerRailGeometry.gutter)
        XCTAssertEqual(haut.width, ComposerInlinePanelLayout.width(freeWidth: 402, roomy: false))
        let bas = ComposerInlinePanelLayout.frame(edge: .bottom, free: libre, panelHeight: 180)
        XCTAssertEqual(bas.maxY, 700 - ComposerRailGeometry.gutter)
        XCTAssertEqual(bas.minX, haut.minX)

        let partout = CGRect(x: 0, y: 0, width: 402, height: 700)
        XCTAssertEqual(ComposerInlinePanelLayout.edge(object: partout, free: libre, panelHeight: 180), .top,
                       "un objet que les deux places couvrent autant garde le panneau en haut")
        let enHaut = CGRect(x: 100, y: 40, width: 200, height: 200)
        XCTAssertEqual(ComposerInlinePanelLayout.edge(object: enHaut, free: libre, panelHeight: 180), .bottom)
    }

    // MARK: - Le panneau ne couvre jamais l'objet qu'on règle (#9143)

    /// La scène libre d'un iPhone de 402 pt et sa carte 9:16, en global.
    private let libre402 = CGRect(x: 0, y: 62, width: 402, height: 700)
    private let carte402 = CGRect(x: 10, y: 96, width: 382, height: 679)

    /// Le panneau tel qu'il se pose : son côté, sa hauteur réduite comprise.
    private func panneauPose(_ placement: ComposerInlinePanelPlacement, contenu: CGFloat,
                             libre: CGSize) -> CGRect {
        ComposerInlinePanelLayout.frame(
            edge: placement.edge, free: libre,
            panelHeight: ComposerInlinePanelLayout.height(content: contenu, placement: placement))
    }

    /// **Le défaut d'origine** (capture 9138-texte-police) : un texte au centre,
    /// la police ouverte — une liste plus haute que la scène libre. Le panneau
    /// le couvrait de quelque côté qu'on le range ; il se réduit désormais au
    /// côté qui a le plus de place, et défile.
    @MainActor
    func test_placement_laPoliceDUnTexteAuCentre_seReduit_etNeLeCouvrePas() {
        let texte = MeeshySceneObject.text(StoryTextObject(text: "Bonjour", y: 0.5))
        guard let objet = ComposerInlinePanelLayout.sceneFrame(of: texte, card: carte402,
                                                               container: libre402) else {
            return XCTFail("un texte posé a un cadre sur la scène")
        }
        let police: CGFloat = 686
        for cote in [ComposerInlinePanelEdge.top, .bottom] {
            XCTAssertTrue(ComposerInlinePanelLayout.frame(edge: cote, free: libre402.size, panelHeight: police)
                .intersects(objet), "le témoin du défaut ne tombe plus (\(cote))")
        }
        let place = ComposerInlinePanelLayout.placement(object: objet, free: libre402.size, panelHeight: police)
        XCTAssertLessThan(place.maxHeight, police, "le panneau se réduit")
        XCTAssertGreaterThanOrEqual(place.maxHeight, ComposerInlinePanelLayout.minimumReducedHeight)
        XCTAssertFalse(panneauPose(place, contenu: police, libre: libre402.size).intersects(objet),
                       "le texte réglé reste visible pendant le réglage")
    }

    /// Un objet en haut de la scène renvoie le panneau en bas, sur toute sa
    /// hauteur de contenu — rien à réduire.
    func test_placement_unObjetEnHaut_lePanneauDescend_sansSeReduire() {
        let objet = CGRect(x: 100, y: 40, width: 200, height: 120)
        let place = ComposerInlinePanelLayout.placement(object: objet, free: libre402.size, panelHeight: 180)
        XCTAssertEqual(place.edge, .bottom)
        XCTAssertEqual(place.maxHeight, ComposerInlinePanelLayout.maxHeight(freeHeight: 700))
        XCTAssertFalse(panneauPose(place, contenu: 180, libre: libre402.size).intersects(objet))
    }

    /// Sans cadre connu, et quand l'objet ne laisse aucune place utile, le
    /// panneau garde le haut et toute sa hauteur : il ne disparaît jamais.
    func test_placement_sansCadre_ouSansPlace_hautEtPleineHauteur() {
        let pleine = ComposerInlinePanelLayout.maxHeight(freeHeight: 700)
        XCTAssertEqual(ComposerInlinePanelLayout.placement(object: nil, free: libre402.size, panelHeight: 400),
                       ComposerInlinePanelPlacement(edge: .top, maxHeight: pleine))
        let geant = CGRect(x: 0, y: 60, width: 402, height: 580)
        XCTAssertEqual(ComposerInlinePanelLayout.placement(object: geant, free: libre402.size,
                                                           panelHeight: 400).maxHeight, pleine)
    }

    /// **Chaque famille posée a un cadre** — le texte, le sticker et la puce de
    /// son aussi, pas seulement le média du #9495. Le fond n'en a pas : il
    /// couvre la carte entière.
    @MainActor
    func test_sceneFrame_chaqueFamillePosee_aSonCadre_leFondAucun() {
        let poses: [MeeshySceneObject] = [
            .text(StoryTextObject(text: "Haut", y: 0.2)),
            .sticker(StorySticker(emoji: "🔥", y: 0.2)),
            .media(StoryMediaObject(id: "m", kind: .image, aspectRatio: 0.75, y: 0.2))
        ]
        for objet in poses {
            guard let cadre = ComposerInlinePanelLayout.sceneFrame(of: objet, card: carte402,
                                                                   container: libre402) else {
                XCTFail("\(objet.kind) n'aurait pas de cadre"); continue
            }
            XCTAssertGreaterThan(cadre.height, 0)
            XCTAssertEqual(cadre.midY, carte402.minY - libre402.minY + 0.2 * carte402.height, accuracy: 1,
                           "\(objet.kind) : le centre du calque, dans le repère du panneau")
        }
        let fond = StoryMediaObject(id: "f", kind: .image, aspectRatio: 0.5625, isBackground: true)
        XCTAssertNil(ComposerInlinePanelLayout.sceneFrame(of: .media(fond), card: carte402, container: libre402))
    }

    // MARK: - Clavier levé et iPad (#9146)

    /// **Clavier levé, la scène libre s'arrête au clavier** : le calque de
    /// chrome est comprimé par sa zone sûre, la carte non (`ignoresSafeArea(
    /// .keyboard)`). iPhone de 874 pt, clavier à 538 : 476 pt de scène libre.
    private let libreClavier = CGRect(x: 0, y: 62, width: 402, height: 476)

    /// **Un texte EN SAISIE ne se voit pas là où le modèle le pose** : le
    /// canvas le recentre sur la carte, sans rotation, le temps de la frappe
    /// (`StoryCanvasUIView.anchorInlineEditing`). C'est ce bloc que le panneau
    /// laisse voir — pas la position que le texte retrouvera à la fermeture.
    @MainActor
    func test_sceneFrame_unTexteEnSaisie_seLitAuCentreDeLaCarte_sansRotation() throws {
        let texte = MeeshySceneObject.text(StoryTextObject(text: "Bonjour", y: 0.85, rotation: 30))
        let pose = try XCTUnwrap(ComposerInlinePanelLayout.sceneFrame(of: texte, card: carte402,
                                                                     container: libre402))
        let saisi = try XCTUnwrap(ComposerInlinePanelLayout.sceneFrame(of: texte, card: carte402,
                                                                      container: libre402, typing: true))
        XCTAssertEqual(saisi.midY, carte402.midY - libre402.minY, accuracy: 0.5)
        XCTAssertEqual(saisi.midX, carte402.midX - libre402.minX, accuracy: 0.5)
        XCTAssertEqual(saisi.width, carte402.width, accuracy: 0.5, "aucune rotation pendant la frappe")
        XCTAssertGreaterThan(pose.midY, saisi.midY + 100, "hors saisie, le texte reste où le modèle le pose")
        let sticker = MeeshySceneObject.sticker(StorySticker(emoji: "🔥", y: 0.2))
        XCTAssertEqual(ComposerInlinePanelLayout.sceneFrame(of: sticker, card: carte402, container: libre402,
                                                           typing: true),
                       ComposerInlinePanelLayout.sceneFrame(of: sticker, card: carte402, container: libre402),
                       "seul un texte se saisit")
    }

    /// **Le défaut du clavier levé** : un texte posé bas (sous le clavier) puis
    /// rouvert en saisie. Lu à sa position du modèle, il est hors de la scène
    /// libre, donc le panneau prend le haut sur toute la hauteur — et couvre
    /// le bloc que l'auteur est en train de taper au centre.
    @MainActor
    func test_placement_clavierLeve_laPoliceNeCouvrePasLeTexteEnSaisie() throws {
        let texte = MeeshySceneObject.text(StoryTextObject(text: "Bonjour", y: 0.85))
        let libre = libreClavier.size
        let saisi = try XCTUnwrap(ComposerInlinePanelLayout.sceneFrame(of: texte, card: carte402,
                                                                      container: libreClavier, typing: true))
        XCTAssertLessThan(saisi.maxY, libre.height, "le bloc en saisie se voit au-dessus du clavier")
        let police: CGFloat = 686
        let pose = ComposerInlinePanelLayout.sceneFrame(of: texte, card: carte402, container: libreClavier)
        let aveugle = ComposerInlinePanelLayout.placement(object: pose, free: libre, panelHeight: police)
        XCTAssertTrue(panneauPose(aveugle, contenu: police, libre: libre).intersects(saisi),
                      "le témoin du défaut : lu à sa place du modèle, le texte saisi est couvert")

        let place = ComposerInlinePanelLayout.placement(object: saisi, free: libre, panelHeight: police)
        let panneau = panneauPose(place, contenu: police, libre: libre)
        XCTAssertFalse(panneau.intersects(saisi), "le texte saisi reste visible pendant le réglage")
        XCTAssertGreaterThanOrEqual(place.maxHeight, ComposerInlinePanelLayout.minimumReducedHeight)
        XCTAssertLessThanOrEqual(panneau.maxY, libre.height, "le panneau ne passe jamais sous le clavier")
    }

    /// Clavier levé, le bas de la scène libre est le haut du clavier : un objet
    /// en haut renvoie le panneau contre le clavier, jamais dessous.
    func test_placement_clavierLeve_leBasEstLeHautDuClavier() {
        let libre = libreClavier.size
        let objet = CGRect(x: 60, y: 30, width: 280, height: 90)
        let place = ComposerInlinePanelLayout.placement(object: objet, free: libre, panelHeight: 220)
        XCTAssertEqual(place.edge, .bottom)
        let panneau = panneauPose(place, contenu: 220, libre: libre)
        XCTAssertEqual(panneau.maxY, libre.height - ComposerRailGeometry.gutter)
        XCTAssertFalse(panneau.intersects(objet))
    }

    /// **Une scène qui disparaît sous le clavier ne fait plus bouger le
    /// panneau** : un objet tout entier sous le clavier n'a rien à montrer.
    func test_placement_clavierLeve_unObjetSousLeClavier_hautPleineHauteur() {
        let libre = libreClavier.size
        let sousLeClavier = CGRect(x: 40, y: 520, width: 300, height: 120)
        XCTAssertEqual(ComposerInlinePanelLayout.placement(object: sousLeClavier, free: libre, panelHeight: 400),
                       ComposerInlinePanelPlacement(edge: .top,
                                                    maxHeight: ComposerInlinePanelLayout.maxHeight(freeHeight: 476)))
    }

    /// iPad 11 pouces en portrait : scène libre de 834 × 1100, carte 9:16
    /// centrée, panneau en carte de 320 pt à côté du rail.
    private let libreIPad = CGRect(x: 0, y: 40, width: 834, height: 1100)
    private let carteIPad = CGRect(x: 108, y: 60, width: 618, height: 1099)

    /// **Sur iPad, le panneau est une carte de 320 pt calée sur le rail**, et la
    /// loi raisonne sur CETTE carte, pas sur la largeur d'un téléphone.
    func test_panelFrame_iPad_carteDe320CaleeSurLeRail() {
        let cadre = ComposerInlinePanelLayout.frame(edge: .top, free: libreIPad.size, panelHeight: 300, roomy: true)
        XCTAssertEqual(cadre.width, ComposerRailGeometry.roomyPanelWidth)
        XCTAssertEqual(cadre.maxX, 834 - ComposerRailGeometry.roomyMargin
                       - ComposerRailGeometry.railWidth - ComposerRailGeometry.gutter)
        XCTAssertEqual(cadre.minY, ComposerRailGeometry.gutter)
    }

    /// Un objet que la carte du panneau ne touche pas — à gauche d'une grande
    /// scène — le laisse en haut sur toute sa hauteur : rien à éviter.
    @MainActor
    func test_placement_iPad_unObjetHorsDeLaCarte_hautPleineHauteur() throws {
        let sticker = MeeshySceneObject.sticker(StorySticker(emoji: "🔥", x: 0.15, y: 0.3))
        let objet = try XCTUnwrap(ComposerInlinePanelLayout.sceneFrame(of: sticker, card: carteIPad,
                                                                      container: libreIPad))
        let place = ComposerInlinePanelLayout.placement(object: objet, free: libreIPad.size,
                                                        panelHeight: 686, roomy: true)
        XCTAssertEqual(place, ComposerInlinePanelPlacement(edge: .top,
                                                           maxHeight: ComposerInlinePanelLayout.maxHeight(freeHeight: 1100)))
    }

    /// Un texte qui traverse la carte, lui, la fait se réduire — la même loi
    /// qu'au téléphone, sur la géométrie de l'iPad.
    @MainActor
    func test_placement_iPad_laPoliceDUnTexteAuCentre_seReduit_horsDuTexte() throws {
        let texte = MeeshySceneObject.text(StoryTextObject(text: "Bonjour", y: 0.45))
        let objet = try XCTUnwrap(ComposerInlinePanelLayout.sceneFrame(of: texte, card: carteIPad,
                                                                      container: libreIPad))
        let police: CGFloat = 1200
        let place = ComposerInlinePanelLayout.placement(object: objet, free: libreIPad.size,
                                                        panelHeight: police, roomy: true)
        let panneau = ComposerInlinePanelLayout.frame(
            edge: place.edge, free: libreIPad.size,
            panelHeight: ComposerInlinePanelLayout.height(content: police, placement: place), roomy: true)
        XCTAssertLessThan(place.maxHeight, police)
        XCTAssertFalse(panneau.intersects(objet))
    }

    /// **iPad en multitâche** (Slide Over, Split View étroit) : la classe de
    /// taille redevient compacte, la scène libre a la largeur d'un téléphone
    /// étroit. Le panneau prend ce que le rail laisse, sans sortir à gauche, et
    /// garde au moins trois vignettes de large.
    func test_panelFrame_iPadMultitache_largeurCompacte_tientDansLaFenetre() {
        let libre = CGSize(width: 320, height: 1000)
        let cadre = ComposerInlinePanelLayout.frame(edge: .top, free: libre, panelHeight: 300, roomy: false)
        XCTAssertGreaterThanOrEqual(cadre.minX, 0)
        XCTAssertGreaterThanOrEqual(cadre.width, ComposerInlinePanelLayout.minimumWidth)
        XCTAssertEqual(cadre.maxX, 320 - ComposerRailGeometry.outerMargin
                       - ComposerRailGeometry.railWidth - ComposerRailGeometry.gutter)
    }

    /// **Un toucher dans le panneau ne termine pas la saisie en ligne.** Une
    /// `ScrollView` renvoie le clavier dès qu'on la fait défiler (défaut
    /// `.automatic`) : le canvas perd son premier répondant, annonce une fin de
    /// saisie, et le modèle referme le texte — l'auteur qui parcourt les
    /// polices perdait son clavier au premier glissé.
    func test_plaque_neRenvoieJamaisLeClavier() throws {
        let code = try source("Meeshy/Features/Main/Composer/ComposerInlineToolPanel.swift")
            .components(separatedBy: .whitespacesAndNewlines).joined()
        let debut = try XCTUnwrap(code.range(of: "structComposerTrailingOptionsPlate<"))
        let fin = try XCTUnwrap(code.range(of: "extensionComposerInlinePanelLayout{", range: debut.upperBound..<code.endIndex))
        let plaque = String(code[debut.upperBound..<fin.lowerBound])
        XCTAssertTrue(plaque.contains(".scrollDismissesKeyboard(.never)"),
                      "la plaque d'options ne doit pas renvoyer le clavier de la saisie en ligne")
    }

    /// Le cadre que la plaque évite est celui du texte EN SAISIE quand c'est lui
    /// qu'on règle.
    func test_panneau_lisLeCadreDuTexteEnSaisie() throws {
        let code = try source("Meeshy/Features/Main/Composer/ComposerInlineToolPanel.swift")
            .components(separatedBy: .whitespacesAndNewlines).joined()
        XCTAssertTrue(code.contains("typing:viewModel.textEditingMode.activeTextId==edit.objectId"),
                      "le panneau doit lire le texte là où le canvas le montre pendant la frappe")
    }

    // MARK: - La politique du chrome : l'édition en place met la scène en focus

    func test_toolFocus_editionEnPlace_masqueToutSaufLeRailDroitEtSesControles() {
        let ouvert = ComposerToolFocus.toolIsOpen(railOpensTool: false, editsInline: true)
        XCTAssertTrue(ouvert)
        let visibles = Set(ComposerToolFocus.Chrome.allCases.filter {
            ComposerToolFocus.isShown($0, toolIsOpen: ouvert)
        })
        XCTAssertEqual(visibles, [.trailingRail, .toolControls],
                       "audience, publication, en-tête, frise des scènes, portes, son et description cèdent")
    }

    func test_toolFocus_retourALaScene_rendToutLeChrome() {
        let ouvert = ComposerToolFocus.toolIsOpen(railOpensTool: false, editsInline: false)
        XCTAssertFalse(ouvert)
        let visibles = Set(ComposerToolFocus.Chrome.allCases.filter {
            ComposerToolFocus.isShown($0, toolIsOpen: ouvert)
        })
        XCTAssertEqual(visibles, Set(ComposerToolFocus.Chrome.allCases).subtracting([.toolControls]))
    }

    // MARK: - La colonne droite : sous-outils, actions, puis (x) — sans trou

    func test_trailingColumn_editionEnPlace_sousOutilsOuvertMarquePuisSortie() {
        let sections = ComposerInlineEditing.sections(for: .background(isVideo: false), hasTrimmableSource: false)
        let focus = ComposerTrailingColumn.focus(
            railMode: .doors([]),
            selection: (sections: sections, open: .media(.actions), actions: []))
        XCTAssertEqual(focus, .object(sections: sections, open: .media(.actions), actions: []))
        XCTAssertEqual(ComposerTrailingColumn.options(for: focus), [
            .editorSection(.media(.filter), isOpen: false),
            .editorSection(.media(.adjust), isOpen: false),
            .editorSection(.media(.effects), isOpen: false),
            .editorSection(.media(.actions), isOpen: true),
            .editorSection(.media(.altText), isOpen: false),
            .exitObject,
        ])
        XCTAssertEqual(ComposerTrailingColumn.foot(for: focus, timeServed: true), [.undo, .redo],
                       "annuler et rétablir restent pendant l'édition")
    }

    func test_trailingColumn_editionEnPlace_lePiedSuitLesSousOutils_sansTrou() {
        let focus = ComposerTrailingColumn.Focus.object(sections: [.media(.filter)], open: nil, actions: [])
        XCTAssertTrue(ComposerTrailingColumn.footFollowsOptions(for: focus),
                      "aucun ressort entre la sortie et l'historique pendant l'édition en place")
        XCTAssertFalse(ComposerTrailingColumn.footFollowsOptions(for: .tool([])),
                       "le dessin garde l'historique au pouce (#8713)")
        XCTAssertFalse(ComposerTrailingColumn.footFollowsOptions(for: .scene(effects: [], open: nil)))
    }

    func test_trailingColumn_unOutilDeDessinOuvert_lEmporteSurLEditionEnPlace() {
        let controle = ComposerToolControl(id: "drawing.tool", symbolName: "pencil", label: "Stylo", isExpanded: false)
        let focus = ComposerTrailingColumn.focus(
            railMode: .tool([controle]),
            selection: (sections: [.media(.filter)], open: nil, actions: []))
        XCTAssertEqual(focus, .tool([controle]))
    }

    @MainActor
    func test_section_peintSonEtatOuvert() {
        XCTAssertTrue(ComposerTrailingColumnPaint(.editorSection(.media(.filter), isOpen: true)).isOn)
        XCTAssertFalse(ComposerTrailingColumnPaint(.editorSection(.media(.filter), isOpen: false)).isOn)
    }

    // MARK: - Aucune porte vers l'ancien éditeur depuis la scène

    /// **Le site unique d'ouverture rend la scène à l'édition en place** avant
    /// toute présentation plein écran : menu du fond, vignette, « Modifier »,
    /// sous-outils, rognage et jetons passent tous par lui.
    func test_openObjectEditor_consulteLEditionEnPlace_avantDOuvrirLEcranPleinEcran() throws {
        let hote = try source("Meeshy/Features/Main/Composer/MeeshyComposerHost+ObjectEditing.swift")
        let corps = try XCTUnwrap(hote.range(of: "func openObjectEditor(")
            .map { String(hote[$0.lowerBound...].prefix(900)) })
        let enPlace = try XCTUnwrap(corps.range(of: "beginInlineEdit("))
        let ecran = try XCTUnwrap(corps.range(of: "editedObject = ComposerEditedObject"))
        XCTAssertLessThan(enPlace.lowerBound, ecran.lowerBound,
                          "le site unique d'ouverture doit rendre l'objet à l'édition en place")
    }

    /// **« Modifier » sur un média, un sticker ou un lieu reste sur la scène.**
    func test_editSceneItem_mediaStickerLieu_nOuvrentPlusLEcranPleinEcran() throws {
        let code = try source("Meeshy/Features/Main/Composer/MeeshyComposerHost+SceneColumns.swift")
            .components(separatedBy: .whitespacesAndNewlines).joined()
        let debut = try XCTUnwrap(code.range(of: "funceditSceneItem(_id:String,kind:StoryCanvasUIView.CanvasItemKind){"))
        let branche = try XCTUnwrap(code.range(of: "case.media,.sticker,.place:", range: debut.upperBound..<code.endIndex))
        let corps = String(code[branche.upperBound...].prefix(120))
        XCTAssertTrue(corps.contains("beginInlineEdit("), "la branche doit ouvrir l'édition en place")
        XCTAssertFalse(corps.contains("openObjectEditor("))
    }

    private func source(_ chemin: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent(chemin)
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }
}
