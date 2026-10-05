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

    func test_sections_image_filtreActionsDescription() {
        XCTAssertEqual(ComposerInlineEditing.sections(for: .image, hasTrimmableSource: false),
                       [.media(.filter), .media(.actions), .media(.altText)])
    }

    func test_sections_video_rognageActionsDescription_sansFiltre() {
        XCTAssertEqual(ComposerInlineEditing.sections(for: .video, hasTrimmableSource: true),
                       [.media(.trim), .media(.actions), .media(.altText)],
                       "le filtre se cuit dans une image : une vidéo n'en rend aucun")
    }

    func test_sections_fond_lesMemesQuUnMediaPose() {
        XCTAssertEqual(ComposerInlineEditing.sections(for: .background(isVideo: false), hasTrimmableSource: false),
                       ComposerInlineEditing.sections(for: .image, hasTrimmableSource: false))
        XCTAssertEqual(ComposerInlineEditing.sections(for: .background(isVideo: true), hasTrimmableSource: true),
                       ComposerInlineEditing.sections(for: .video, hasTrimmableSource: true))
    }

    /// **Aucun contrôle inerte** (loi 4) : la fenêtre de temps et le plan
    /// n'écrivent que sur un TEXTE (`ComposerObjectTimingControls.apply`), donc
    /// aucune autre famille ne les offre.
    func test_sections_tempsEtPlan_reservesAuTexte() {
        let familles: [ComposerInlineFamily] = [.image, .video, .audio, .sticker, .place,
                                                .background(isVideo: false), .background(isVideo: true)]
        for famille in familles {
            let sections = ComposerInlineEditing.sections(for: famille, hasTrimmableSource: true)
            XCTAssertFalse(sections.contains(.timing), "\(famille) offrirait une fenêtre de temps sans effet")
            XCTAssertFalse(sections.contains(.plan), "\(famille) offrirait un plan sans effet")
        }
    }

    func test_sections_retouchedBackgroundImage_opensOnCrop() {
        let sections = ComposerInlineEditing.sections(for: .background(isVideo: false), hasTrimmableSource: false,
                                                      retouching: true)
        XCTAssertEqual(sections.first, .media(.crop), "Une image du fil se RECADRE d'abord (#9136)")
    }

    func test_sections_cropIsServedOnlyToARetouchedImageBackground() {
        XCTAssertFalse(ComposerInlineEditing.sections(for: .background(isVideo: false), hasTrimmableSource: false)
            .contains(.media(.crop)), "Hors retouche, le lecteur ne recadre pas un fond : rien à offrir")
        XCTAssertFalse(ComposerInlineEditing.sections(for: .background(isVideo: true), hasTrimmableSource: true,
                                                      retouching: true).contains(.media(.crop)))
        XCTAssertFalse(ComposerInlineEditing.sections(for: .image, hasTrimmableSource: false, retouching: true)
            .contains(.media(.crop)))
    }

    func test_sections_retouchedBackgroundVideo_trimsAndMutes() {
        let sections = ComposerInlineEditing.sections(for: .background(isVideo: true), hasTrimmableSource: true,
                                                      retouching: true)
        XCTAssertTrue(sections.contains(.media(.trim)))
        XCTAssertTrue(sections.contains(.media(.actions)), "Le muet vit dans les actions du média")
    }

    func test_sections_stickerEtLieu_aucunSousOutil_seulementLeursActions() {
        XCTAssertEqual(ComposerInlineEditing.sections(for: .sticker, hasTrimmableSource: false), [])
        XCTAssertEqual(ComposerInlineEditing.sections(for: .place, hasTrimmableSource: false), [])
    }

    func test_sections_son_leRognageSeulementQuandIlYADeQuoiRogner() {
        XCTAssertEqual(ComposerInlineEditing.sections(for: .audio, hasTrimmableSource: true), [.media(.trim)])
        XCTAssertEqual(ComposerInlineEditing.sections(for: .audio, hasTrimmableSource: false), [])
    }

    /// Le recadrage et la scission ne sont servis par AUCUNE famille : aucun
    /// champ du modèle ne les rend (`MediaEditTool.served`).
    func test_sections_jamaisRecadrageNiScission() {
        let familles: [ComposerInlineFamily] = [.text, .image, .video, .audio, .sticker, .place,
                                                .background(isVideo: false), .background(isVideo: true)]
        for famille in familles {
            let sections = ComposerInlineEditing.sections(for: famille, hasTrimmableSource: true)
            XCTAssertFalse(sections.contains(.media(.crop)))
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
            ComposerInlineEditing.begin(objectId: "st", family: .sticker, onSceneSurface: true,
                                        requested: .plan, hasTrimmableSource: false)?.openSection,
            nil)
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
