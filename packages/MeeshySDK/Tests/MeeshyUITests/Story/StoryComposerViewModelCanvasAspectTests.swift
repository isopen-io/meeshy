import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// **La SCÈNE est figée en 9:16 — le fond n'impose plus sa forme (directive
/// porteur, 2026-08-31).**
///
/// Cette suite disait l'inverse jusqu'à cette date : « l'import du fond impose
/// le cadre et forme du Canvas » (directive du 2026-07-14), le canvas suivant le
/// ratio CONTINU du fond, clampé à [9/21, 21/9]. Une photo paysage donnait donc
/// un canvas 16:9 — ce que le porteur a mesuré sur capture, là où toutes les
/// planches du document montrent une scène verticale.
///
/// **Ce que la règle d'avant coûtait, au-delà de la forme** : le canvas changeait
/// de proportion SOUS la composition. Un texte posé sur une scène verticale se
/// retrouvait ailleurs dès qu'on ajoutait un fond paysage, et l'outil de dessin
/// traçait sur un cadre qui n'était plus celui de la carte (#4515) — deux
/// défauts distincts, une seule cause.
///
/// > Une scène qui change de forme n'est plus une scène : c'est un cadre qui
/// > suit son contenu, quand c'est au contenu de trouver sa place dans le cadre.
///
/// Les témoins portent tous sur le MÊME verdict — le fond ne décide pas — et
/// c'est voulu : la règle n'a plus qu'une réponse, et une suite qui l'éprouve
/// sur les formes extrêmes dit que l'exception n'existe pas non plus.
@MainActor
final class StoryComposerViewModelCanvasAspectTests: XCTestCase {

    private func makeBackground(kind: StoryMediaKind, aspectRatio: Double) -> StoryEffects {
        let media = StoryMediaObject(
            id: "bg-1", postMediaId: "pm-1", kind: kind,
            aspectRatio: aspectRatio, isBackground: true
        )
        var effects = StoryEffects()
        effects.mediaObjects = [media]
        return effects
    }

    /// Le cas MESURÉ par le porteur : une photo paysage posée en fond.
    func test_unFondPAYSAGE_neRendPasLaSceneLARGE() {
        let effects = makeBackground(kind: .image, aspectRatio: 16.0 / 9.0)
        XCTAssertNil(StoryComposerViewModel.canvasAspectRatio(forBackgroundOf: effects),
                     "`nil` = portrait 9:16 — la scène garde sa forme, le média s'y range")
    }

    func test_uneVIDEOpaysage_nonPlus() {
        let effects = makeBackground(kind: .video, aspectRatio: 16.0 / 9.0)
        XCTAssertNil(StoryComposerViewModel.canvasAspectRatio(forBackgroundOf: effects))
    }

    /// **Un fond DÉJÀ vertical ne fait pas exception non plus**, et c'est ce qui
    /// rend la règle simple : elle ne demande pas la forme du fond. Un témoin
    /// qui ne porterait que sur le paysage laisserait croire à une condition.
    func test_unFondDEJAvertical_neChangeRienNonPlus() {
        let effects = makeBackground(kind: .image, aspectRatio: 9.0 / 16.0)
        XCTAssertNil(StoryComposerViewModel.canvasAspectRatio(forBackgroundOf: effects))
    }

    func test_unFondPresqueCARRE_neChangeRien() {
        let effects = makeBackground(kind: .image, aspectRatio: 4.0 / 5.0)
        XCTAssertNil(StoryComposerViewModel.canvasAspectRatio(forBackgroundOf: effects))
    }

    func test_sansAucunFond_laSceneEstDejaVerticale() {
        XCTAssertNil(StoryComposerViewModel.canvasAspectRatio(forBackgroundOf: StoryEffects()))
    }

    /// Les formes EXTRÊMES étaient l'argument du clamp [9/21, 21/9] — un
    /// panorama ou une capture ultra-haute donnaient un canvas dégénéré. La
    /// règle les rend inoffensives par construction : il n'y a plus de valeur à
    /// borner, donc plus de borne à tenir juste.
    func test_lesFormesEXTREMES_nOntPlusDeBorneATenir() {
        for extreme in [4.0, 0.2, 100.0, 0.01] {
            XCTAssertNil(
                StoryComposerViewModel.canvasAspectRatio(
                    forBackgroundOf: makeBackground(kind: .image, aspectRatio: extreme)),
                "aucun ratio de fond ne peut plus déformer la scène — même absurde")
        }
    }

    /// **Le fusible.** Une règle qui rendrait `nil` par accident — parce qu'elle
    /// ne trouve plus le fond, par exemple — passerait tous les témoins
    /// ci-dessus sans rien décider. Celui-ci vérifie que le fond EST bien là :
    /// ce que la règle ignore, elle l'ignore par choix, pas par cécité.
    func test_leFondEstBienLA_quandLaRegleLIgnore() {
        let effects = makeBackground(kind: .image, aspectRatio: 16.0 / 9.0)
        XCTAssertNotNil(effects.resolvedBackgroundMedia,
                        "sans fond résolu, les témoins ci-dessus ne prouveraient rien")
    }
}
