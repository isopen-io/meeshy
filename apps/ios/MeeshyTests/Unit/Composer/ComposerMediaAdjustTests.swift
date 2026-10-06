import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **Une image éditée dans la scène retrouve ses réglages et sa comparaison**
/// (#9175). Depuis #9170, une image de composition s'édite en place
/// (`MediaEditTool`) et non plus dans l'éditeur plein écran ; ces témoins
/// tiennent ce que la scène sert à sa place.
final class ComposerMediaAdjustTests: XCTestCase {

    // MARK: - Le sous-outil est servi à l'image POSÉE, et à elle seule

    func test_reglages_sontServisALImagePosee_justeApresLeFiltre() {
        let sections = ComposerInlineEditing.sections(for: .image, hasTrimmableSource: false)
        let filtre = sections.firstIndex(of: .media(.filter))
        XCTAssertEqual(sections.firstIndex(of: .media(.adjust)), filtre.map { $0 + 1 },
                       "On choisit un rendu, puis on le règle.")
    }

    /// #9169 : la vidéo posée peint ses réglages trame par trame — le
    /// sous-outil lui est servi, en tête puisqu'elle n'a pas de filtre.
    func test_reglages_servisAUneVideoPosee_avantLeRognage() {
        let sections = ComposerInlineEditing.sections(for: .video, hasTrimmableSource: true)
        XCTAssertEqual(sections.first, .media(.adjust))
        XCTAssertLessThan(sections.firstIndex(of: .media(.adjust)) ?? .max, sections.firstIndex(of: .media(.trim)) ?? .min)
    }

    /// Une vidéo n'offre que les réglages qu'elle peint : ni netteté ni flou.
    func test_lePanneauDUneVideo_neMontreNiNetteteNiFlou() {
        let video = ComposerMediaAdjustPanel.kinds(for: .video)
        XCTAssertFalse(video.contains(.sharpness))
        XCTAssertFalse(video.contains(.blur))
        XCTAssertEqual(ComposerMediaAdjustPanel.kinds(for: .image), AdjustmentKind.allCases)
        XCTAssertEqual(ComposerMediaAdjustPanel.kinds(for: nil), AdjustmentKind.allCases)
    }

    /// Ce que VoiceOver annonce pendant la comparaison nomme le bon média.
    func test_lOriginalAnnonce_nommeLaVideoQuandOnCompareUneVideo() {
        XCTAssertNotEqual(ComposerAdjustCopy.original(for: .video), ComposerAdjustCopy.original(for: .image))
        XCTAssertNotEqual(ComposerAdjustCopy.compareHint(for: .video), ComposerAdjustCopy.compareHint(for: .image))
    }

    func test_reglages_nonServisAuFond_niAuxAutresFamilles() {
        let familles: [ComposerInlineFamily] = [.background(isVideo: false), .background(isVideo: true),
                                                .text, .audio, .sticker, .place]
        for famille in familles {
            XCTAssertFalse(ComposerInlineEditing.sections(for: famille, hasTrimmableSource: true)
                .contains(.media(.adjust)), "\(famille) offrirait un curseur que rien ne peint")
        }
    }

    func test_leRailDeLEditeurDObjet_retireLesReglagesQuandLObjetNeLesPeintPas() {
        XCTAssertFalse(ComposerObjectEditorRail.entries(for: .media, offersAdjust: false).contains(.media(.adjust)))
        XCTAssertTrue(ComposerObjectEditorRail.entries(for: .media).contains(.media(.adjust)))
    }

    func test_lOutil_porteSonMotEtSonGlyphe() {
        XCTAssertTrue(MediaEditTool.served.contains(.adjust))
        XCTAssertFalse(ComposerObjectEditorCopy.media(.adjust).isEmpty)
        XCTAssertFalse(ComposerObjectEditorRail.symbolName(.media(.adjust)).isEmpty)
        for kind in AdjustmentKind.allCases {
            XCTAssertFalse(ComposerAdjustCopy.label(kind).isEmpty, "\(kind) sans intitulé")
        }
    }

    // MARK: - Un réglage à la fois (#9495)

    func test_leCurseurUnique_piloteLeReglageTouche_tantQueLeMediaLePeint() {
        let image = ComposerMediaAdjustPanel.kinds(for: .image)
        XCTAssertEqual(ComposerMediaAdjustPanel.shown(nil, among: image), image.first,
                       "Rien touché : le premier réglage de la rangée.")
        XCTAssertEqual(ComposerMediaAdjustPanel.shown(.contrast, among: image), .contrast)
        let video = ComposerMediaAdjustPanel.kinds(for: .video)
        XCTAssertEqual(ComposerMediaAdjustPanel.shown(.blur, among: video), video.first,
                       "Une vidéo ne peint pas le flou : le curseur ne le pilote pas.")
        XCTAssertNil(ComposerMediaAdjustPanel.shown(.exposure, among: []))
    }

    func test_laValeurEcrite_estSignee_zeroSansSigne() {
        XCTAssertEqual(ComposerAdjustCopy.signed(12), "+12")
        XCTAssertEqual(ComposerAdjustCopy.signed(-40), "-40")
        XCTAssertEqual(ComposerAdjustCopy.signed(0), "0")
    }

    /// « Maintenir pour comparer » se tronquait à 402 pt (« Maintenir pour
    /// co… ») : l'intitulé est COURT, le geste est dit par l'indice VoiceOver.
    func test_comparer_porteUnIntituleCourt_etLIndiceDitLeGeste() {
        XCTAssertLessThanOrEqual(ComposerAdjustCopy.compare.count, 12, ComposerAdjustCopy.compare)
        XCTAssertFalse(ComposerAdjustCopy.compareHint(for: .image).isEmpty)
    }

    // MARK: - Le panneau laisse voir l'objet qu'on règle (#9495)

    /// La hauteur du panneau compact — boutons, curseur et rangée de réglages,
    /// marges du verre comprises.
    private let compactPanel: CGFloat = 184

    /// L'écran : la scène libre (repère du panneau) et la carte 9:16, en global.
    private struct Ecran {
        let nom: String
        let free: CGRect
        let card: CGRect
    }

    /// iPhone 16 Pro / 17 (402 pt) et iPhone SE (375 pt), outil ouvert.
    private var ecrans: [Ecran] {
        [Ecran(nom: "402", free: CGRect(x: 0, y: 62, width: 402, height: 700),
               card: CGRect(x: 10, y: 96, width: 382, height: 679)),
         Ecran(nom: "375", free: CGRect(x: 0, y: 20, width: 375, height: 560),
               card: CGRect(x: 10, y: 44, width: 355, height: 631))]
    }

    @MainActor
    private func cadre(_ media: StoryMediaObject, in ecran: Ecran) -> CGRect {
        let pose = StoryMediaLayer.renderedPose(for: media, geometry: CanvasGeometry(renderSize: ecran.card.size))
        return ComposerInlinePanelLayout.objectFrame(center: pose.center, size: pose.size, anchor: media.anchor,
                                                     rotationDegrees: media.rotation,
                                                     card: ecran.card, container: ecran.free)
    }

    @MainActor
    private func panneau(_ media: StoryMediaObject, in ecran: Ecran) -> CGRect {
        let objet = cadre(media, in: ecran)
        let cote = ComposerInlinePanelLayout.edge(object: objet, free: ecran.free.size, panelHeight: compactPanel)
        return ComposerInlinePanelLayout.frame(edge: cote, free: ecran.free.size, panelHeight: compactPanel)
    }

    @MainActor
    func test_uneImageEnHautDeLaScene_lePanneauDescend_etNeLaCouvrePas() {
        let image = StoryMediaObject(id: "haut", kind: .image, aspectRatio: 0.75, y: 0.28)
        for ecran in ecrans {
            let objet = cadre(image, in: ecran)
            XCTAssertEqual(ComposerInlinePanelLayout.edge(object: objet, free: ecran.free.size,
                                                          panelHeight: compactPanel), .bottom, ecran.nom)
            XCTAssertFalse(panneau(image, in: ecran).intersects(objet), "\(ecran.nom) : l'image réglée serait cachée")
        }
    }

    @MainActor
    func test_uneImageEnBasDeLaScene_lePanneauResteEnHaut_etNeLaCouvrePas() {
        let image = StoryMediaObject(id: "bas", kind: .image, aspectRatio: 0.75, y: 0.72)
        for ecran in ecrans {
            let objet = cadre(image, in: ecran)
            XCTAssertEqual(ComposerInlinePanelLayout.edge(object: objet, free: ecran.free.size,
                                                          panelHeight: compactPanel), .top, ecran.nom)
            XCTAssertFalse(panneau(image, in: ecran).intersects(objet), "\(ecran.nom) : l'image réglée serait cachée")
        }
    }

    /// L'image posée par défaut (au centre, ratio 3:4) reste visible à côté du
    /// panneau compact — ce que neuf curseurs empilés (686 pt) empêchaient, de
    /// quelque côté qu'on les range.
    @MainActor
    func test_lImagePoseeAuCentre_resteVisible_ceQueLaPileDeCurseursEmpechait() {
        let image = StoryMediaObject(id: "centre", kind: .image, aspectRatio: 0.75)
        for ecran in ecrans {
            let objet = cadre(image, in: ecran)
            XCTAssertFalse(panneau(image, in: ecran).intersects(objet), ecran.nom)
            for cote in [ComposerInlinePanelEdge.top, .bottom] {
                let pile = ComposerInlinePanelLayout.frame(edge: cote, free: ecran.free.size, panelHeight: 686)
                XCTAssertTrue(pile.intersects(objet), "\(ecran.nom) : le témoin du défaut ne tombe plus")
            }
        }
    }

    func test_sansCadreConnu_lePanneauResteEnHaut() {
        let libre = CGSize(width: 402, height: 700)
        XCTAssertEqual(ComposerInlinePanelLayout.edge(object: nil, free: libre, panelHeight: compactPanel), .top)
        XCTAssertEqual(ComposerInlinePanelLayout.edge(object: .null, free: libre, panelHeight: compactPanel), .top)
    }

    func test_seulsLeFiltreLesReglagesEtLeRecadrage_rangentLePanneauSelonLObjet() {
        XCTAssertTrue(ComposerInlinePanelLayout.keepsObjectInSight(.media(.adjust)))
        XCTAssertTrue(ComposerInlinePanelLayout.keepsObjectInSight(.media(.filter)))
        XCTAssertTrue(ComposerInlinePanelLayout.keepsObjectInSight(.media(.crop)),
                      "Un recadrage se juge à l'œil, comme un filtre (#9499)")
        XCTAssertFalse(ComposerInlinePanelLayout.keepsObjectInSight(.media(.trim)))
        XCTAssertFalse(ComposerInlinePanelLayout.keepsObjectInSight(.timing))
    }

    /// Une image tournée d'un quart de tour occupe sa boîte englobante, pas
    /// son rectangle d'origine — et la carte se ramène au repère du panneau.
    func test_leCadreDUnObjetTourne_estSaBoiteEnglobante_dansLeRepereDuPanneau() {
        let cadre = ComposerInlinePanelLayout.objectFrame(center: CGPoint(x: 100, y: 100),
                                                          size: CGSize(width: 40, height: 100),
                                                          anchor: CGPoint(x: 0.5, y: 0.5), rotationDegrees: 90,
                                                          card: CGRect(x: 0, y: 50, width: 300, height: 500),
                                                          container: CGRect(x: 0, y: 0, width: 300, height: 600))
        XCTAssertEqual(cadre.width, 100, accuracy: 0.001)
        XCTAssertEqual(cadre.height, 40, accuracy: 0.001)
        XCTAssertEqual(cadre.midY, 150, accuracy: 0.001, "la carte commence 50 pt sous le haut du panneau")
    }

    // MARK: - La valeur lue : un écart à l'original, de −100 à +100

    func test_laValeurLue_vautZeroAuNeutre_etCentAuxBornes() {
        for kind in AdjustmentKind.allCases {
            XCTAssertEqual(ComposerAdjustCopy.displayValue(kind, kind.neutralValue), 0, "\(kind)")
            XCTAssertEqual(ComposerAdjustCopy.displayValue(kind, kind.range.upperBound), 100, "\(kind)")
        }
        XCTAssertEqual(ComposerAdjustCopy.displayValue(.exposure, -2), -100)
        XCTAssertEqual(ComposerAdjustCopy.displayValue(.contrast, 1.25), 50,
                       "Un contraste de 1,25 se lit +50, jamais « 1.25 ».")
    }

    // MARK: - Comparer : la scène montre l'ORIGINAL, le modèle ne bouge pas

    private func slide() -> StorySlide {
        var regle = StoryMediaObject(id: "regle", kind: .image, aspectRatio: 1)
        regle.filter = StoryFilter.warm.rawValue
        regle.adjustments = ImageAdjustments(exposure: 0.8)
        var voisin = StoryMediaObject(id: "voisin", kind: .image, aspectRatio: 1)
        voisin.adjustments = ImageAdjustments(contrast: 1.3)
        var effets = StoryEffects()
        effets.mediaObjects = [regle, voisin]
        var slide = StorySlide()
        slide.effects = effets
        return slide
    }

    private func media(_ slide: StorySlide, _ id: String) -> StoryMediaObject? {
        slide.effects.mediaObjects?.first { $0.id == id }
    }

    func test_comparer_montreLOriginalDeLImageComparee_seule() {
        let montree = ComposerLookComparison.shown(slide(), comparing: "regle")
        XCTAssertNil(media(montree, "regle")?.filter)
        XCTAssertNil(media(montree, "regle")?.adjustments)
        XCTAssertEqual(media(montree, "voisin")?.adjustments, ImageAdjustments(contrast: 1.3),
                       "Le voisin garde son rendu : on compare UNE image.")
    }

    func test_sansComparaison_laSceneMontreLeModele() {
        let modele = slide()
        let montree = ComposerLookComparison.shown(modele, comparing: nil)
        XCTAssertEqual(media(montree, "regle")?.adjustments, media(modele, "regle")?.adjustments)
        XCTAssertEqual(media(montree, "regle")?.filter, "warm")
    }

    func test_uneEcriturePendantLaComparaison_nEffacePasLeRenduCompare() {
        let modele = slide()
        var ecrite = ComposerLookComparison.shown(modele, comparing: "regle")
        ecrite.effects.mediaObjects?[0].x = 0.3
        let rendue = ComposerLookComparison.written(ecrite, over: modele, comparing: "regle")
        XCTAssertEqual(media(rendue, "regle")?.x, 0.3, "Le geste fait pendant la comparaison est gardé…")
        XCTAssertEqual(media(rendue, "regle")?.filter, "warm", "…et le rendu comparé revient au modèle.")
        XCTAssertEqual(media(rendue, "regle")?.adjustments, ImageAdjustments(exposure: 0.8))
    }
}
