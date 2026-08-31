import XCTest
@testable import Meeshy
@testable import MeeshySDK

/// **« Un seul objet à la fois » n'avait AUCUN témoin à l'écran** (#4073, vue `1c`).
///
/// La vue `1c` s'appelle « Éditeur de scène — objet sélectionné ». Elle dessine
/// l'objet dans un cadre violet, quatre poignées d'angle, et un badge
/// `TEXT · PLAN FG · z 2` posé juste au-dessus. Rien de tout cela n'existait :
/// `StoryCanvasUIView` n'avait aucune notion d'objet sélectionné.
///
/// L'inspecteur changeait bien de contenu, les contrôleurs du rail *trailing*
/// apparaissaient bien, le menu d'appui long s'ouvrait bien — tous portaient sur
/// un objet que **rien ne désignait**. Le seul indice offert à l'auteur était
/// que la rangée de jetons avait changé.
///
/// > Le doc-comment de `editOverlayLayer` promettait « snap guides, **selection
/// > markers** » depuis toujours, et seuls les guides existaient. Un commentaire
/// > qui décrit un mécanisme absent ne se fait contredire par rien (leçon 335) ;
/// > celui-ci a survécu à toutes les passes parce qu'il énonçait la bonne
/// > intention, au bon endroit, dans les bons mots.
///
/// ## Ce que cette garde tient, et ce qu'elle ne peut pas tenir
///
/// Elle vérifie la CHAÎNE — que l'id descend du meuble jusqu'au canvas, et que
/// le canvas repose son cadre à chaque reconstruction de calques. Elle ne peut
/// pas prouver qu'un cadre est PEINT : cela se mesure à l'écran, et c'est la
/// preuve que l'issue demande en clôture.
///
/// Les deux moitiés sont nécessaires. La chaîne sans le pixel, c'est le défaut
/// que le même lot vient de corriger sur les jetons — un contrat rempli par
/// personne. Le pixel sans la chaîne ne se reproduit pas.
final class ComposerSelectionMarkerWiringGuardTests: XCTestCase {

    private func compact(_ s: String) -> String {
        s.components(separatedBy: .whitespacesAndNewlines).joined()
    }

    /// La surface de SCÈNE, lue à son chemin réel.
    ///
    /// `AppSourceGuard.composerSurfaceSource()` désigne la surface **DOCUMENT**
    /// — un homonyme dangereux : la garde aurait été verte en lisant un fichier
    /// qui ne contient rien de ce qu'elle interroge, dans un sens comme dans
    /// l'autre. Le fusible ci-dessous est ce qui distingue les deux.
    private func sceneSurfaceSource() throws -> String {
        var racine = URL(fileURLWithPath: #filePath)
        for _ in 0..<4 { racine = racine.deletingLastPathComponent() }
        let url = racine.appendingPathComponent(
            "Meeshy/Features/Main/Composer/ComposerSceneSurface.swift")
        let brut = try String(contentsOf: url, encoding: .utf8)
        XCTAssertTrue(brut.contains("struct ComposerSceneSurface"),
                      "ce n'est pas la surface de scène — la garde lirait à côté")
        return AppSourceGuard.stripComments(brut)
    }

    private func sdkSource(_ chemin: String) throws -> String {
        var racine = URL(fileURLWithPath: #filePath)
        for _ in 0..<6 { racine = racine.deletingLastPathComponent() }
        let url = racine.appendingPathComponent("packages/MeeshySDK/Sources/MeeshyUI/" + chemin)
        let brut = try String(contentsOf: url, encoding: .utf8)
        XCTAssertGreaterThan(brut.count, 800,
                             "source vide ou déplacée — la garde serait verte par omission : \(chemin)")
        return AppSourceGuard.stripComments(brut)
    }

    // MARK: - La chaîne, du meuble au calque

    /// **Le meuble descend l'id qu'il tient déjà.** Il le possède depuis
    /// toujours — les jetons et le rail *trailing* le lisent — et c'est
    /// précisément ce qui rend l'absence si discrète : rien ne manquait en
    /// amont, seul le dernier maillon n'était pas posé.
    func test_leMeuble_descendLaSelectionJusquALaSurface() throws {
        let source = compact(try AppSourceGuard.composerHostSource())
        XCTAssertTrue(source.contains("selectedItemId:selectedSceneItemId"),
                      "le meuble ne dit pas au canvas quel objet est sélectionné")
        XCTAssertTrue(source.contains("selectionBadge:ComposerObjectChips.badge(forSelected:"),
                      "le badge n'est pas composé par la règle")
    }

    /// **La surface fait suivre, elle ne re-décide pas.** Même contrat que pour
    /// les deux rails, la bande et les jetons : une seconde loi 4 écrite ici
    /// divergerait de la première.
    func test_laSurface_faitSuivreAuCanvas() throws {
        let source = compact(try sceneSurfaceSource())
        XCTAssertTrue(source.contains("selectedItemId:selectedItemId"))
        XCTAssertTrue(source.contains("selectionBadge:selectionBadge"))
    }

    /// **Le pont SwiftUI le pose sur la vue UIKit.** Sans cette ligne, les deux
    /// champs traverseraient tout l'arbre pour mourir dans un `struct` que
    /// personne ne lit — la forme exacte du défaut voisin, un cran plus bas.
    func test_lePont_poseLeMarqueurSurLaVue() throws {
        let source = compact(try sdkSource("Story/Canvas/StoryCanvasRepresentable.swift"))
        XCTAssertTrue(source.contains("uiView.setSelectionMarker(id:selectedItemId,badge:selectionBadge)"))
    }

    /// **Le cadre se repose à CHAQUE reconstruction de calques.**
    ///
    /// `rebuildLayers` détache puis ré-attache tous les calques d'objet. Un
    /// cadre posé une seule fois désignerait une frame périmée dès le premier
    /// déplacement — il resterait à l'écran, à l'ancien endroit, en désignant
    /// le vide.
    func test_leCadre_seReposeAChaqueReconstruction() throws {
        let source = compact(try sdkSource("Story/Canvas/StoryCanvasUIView+Rendering.swift"))
        XCTAssertTrue(source.contains("refreshSelectionMarker()"),
                      "le cadre ne suivrait pas l'objet")
    }

    /// **Le calque vit dans `editOverlayLayer`**, dont la `zPosition` est
    /// 10 000 : au-dessus de tout, y compris du calque de dessin (9 999). Un
    /// cadre rangé dans `itemsContainer` serait aussi un candidat au hit-test,
    /// et taper son propre cadre sélectionnerait « le cadre ».
    func test_leCadre_vitHorsDesObjets_doncHorsDuHitTest() throws {
        let source = compact(try sdkSource("Story/Canvas/StoryCanvasUIView+SelectionMarker.swift"))
        XCTAssertTrue(source.contains("editOverlayLayer.addSublayer(calque)"))
        XCTAssertFalse(source.contains("itemsContainer.addSublayer"),
                       "un cadre rangé parmi les objets deviendrait lui-même touchable")
    }

    /// **Le fusible de la chaîne.** Si la règle du badge disparaissait, les
    /// quatre témoins ci-dessus pourraient rester verts sur une chaîne qui
    /// transporte `nil` de bout en bout.
    func test_laRegleDuBadge_existeEtRendUneChaine() {
        var slide = StorySlide(id: "s")
        var texte = StoryTextObject(text: "Dernier soir", x: 0.5, y: 0.5)
        texte.zIndex = 2
        slide.effects.textObjects = [texte]

        let badge = ComposerObjectChips.badge(forSelected: texte.id, in: slide,
                                              locale: Locale(identifier: "fr_FR"))
        XCTAssertEqual(badge, "TEXTE · PLAN FG · z 2")
    }
}
