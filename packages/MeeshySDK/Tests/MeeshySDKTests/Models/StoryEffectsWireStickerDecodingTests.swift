import XCTest
@testable import MeeshySDK

/// **Le contrat FIL → APP pour les stickers d'une story.**
///
/// La charge ci-dessous n'est pas inventée : c'est la réponse EXACTE de
/// `GET /api/v1/posts/<id>` pour une story publiée le 2026-09-02, relevée sur
/// la production. Une story portait douze gabarits, un par famille, et aucun
/// n'apparaissait à l'écran — d'où la question que ce témoin tranche : le
/// défaut est-il AVANT le dessin (décodage) ou APRÈS (montage) ?
///
/// Le dessin, lui, est déjà gardé ailleurs (`StickerTemplateRendererTests`,
/// inventaire 120 ↔ 120). Ce fichier garde le maillon qui le précède, et que
/// rien ne couvrait : **ce que le serveur ENVOIE se décode-t-il en stickers
/// que l'app sait classer ?** Un `decodeIfPresent` qui échoue rend `nil`, et
/// `nil` est indistinguable d'une story sans sticker — la panne serait alors
/// SILENCIEUSE, exactement comme une erreur avalée en tableau vide.
final class StoryEffectsWireStickerDecodingTests: XCTestCase {

    /// La charge du fil, réduite à trois familles représentatives : une à
    /// slots NOMMÉS (le lieu), une à slots multiples (l'heure) et une SANS
    /// slot (la météo). Les trois formes de `slots` que le catalogue produit.
    private var chargeDuFil: Data {
        Data("""
        {
          "background": "#0B1020",
          "stickerObjects": [
            {"id":"pub-0","emoji":"","x":0.22,"y":0.18,"scale":0.45,"rotation":0,
             "zIndex":0,"postMediaId":"","templateId":"location.compass",
             "slots":{"placeName":"Le Marais","placeDetail":"Paris"},
             "baseSize":140,"anchor":{"x":0.5,"y":0.5}},
            {"id":"pub-1","emoji":"","x":0.5,"y":0.18,"scale":0.45,"rotation":0,
             "zIndex":1,"postMediaId":"","templateId":"time.alarm",
             "slots":{"time":"14:32","hour":"14","minute":"32","date":"2 septembre 2026"},
             "baseSize":140,"anchor":{"x":0.5,"y":0.5}},
            {"id":"pub-2","emoji":"","x":0.78,"y":0.18,"scale":0.45,"rotation":0,
             "zIndex":2,"postMediaId":"","templateId":"weather.cloudy",
             "slots":{},"baseSize":140,"anchor":{"x":0.5,"y":0.5}}
          ]
        }
        """.utf8)
    }

    private func effets() throws -> StoryEffects {
        try JSONDecoder().decode(StoryEffects.self, from: chargeDuFil)
    }

    /// **Les stickers du fil ARRIVENT.** `nil` ici expliquerait à lui seul un
    /// canvas vide, sans qu'aucune couche n'ait à être fautive.
    func test_lesStickersDuFil_seDécodent() throws {
        let stickers = try effets().stickerObjects
        XCTAssertNotNil(stickers, "`stickerObjects` perdu au décodage — le canvas serait vide sans coupable.")
        XCTAssertEqual(stickers?.count, 3)
    }

    /// **Chaque sticker du fil est classé GABARIT.** C'est `kind` qui décide
    /// quel chemin de rendu prend la couche ; mal classé, un gabarit partirait
    /// sur la branche emoji et rendrait son repli — un défaut qui RESSEMBLE à
    /// un rendu réussi, donc qu'on ne voit pas en regardant l'écran.
    func test_chaqueSticker_estClasséGabarit() throws {
        for sticker in try XCTUnwrap(effets().stickerObjects) {
            XCTAssertEqual(sticker.kind, .template,
                           "\(sticker.templateId) classé \(sticker.kind) — il rendrait son emoji de repli.")
            XCTAssertFalse(sticker.templateId.isEmpty)
        }
    }

    /// **Les slots survivent au décodage.** Ce sont EUX que le dessinateur
    /// peint : un gabarit sans ses slots dessine sa silhouette vide, ce qui,
    /// à l'écran, ne se distingue pas d'un gabarit correct mal rempli.
    func test_lesSlots_surviventAuDécodage() throws {
        let parId = Dictionary(uniqueKeysWithValues: try XCTUnwrap(effets().stickerObjects).map { ($0.id, $0) })
        XCTAssertEqual(parId["pub-0"]?.slots["placeName"], "Le Marais")
        XCTAssertEqual(parId["pub-1"]?.slots["time"], "14:32")
        XCTAssertEqual(parId["pub-2"]?.slots.isEmpty, true, "La météo n'a pas de slot — et n'en invente pas.")
    }

    /// **La pose survit aussi.** Un sticker décodé à la bonne place mais avec
    /// une échelle perdue serait rendu — hors cadre, ou trop petit pour être vu.
    func test_laPose_surviteAuDécodage() throws {
        let premier = try XCTUnwrap(effets().stickerObjects?.first)
        XCTAssertEqual(premier.x, 0.22, accuracy: 0.001)
        XCTAssertEqual(premier.scale, 0.45, accuracy: 0.001)
        XCTAssertEqual(premier.baseSize, 140, accuracy: 0.001)
    }

    // MARK: - Le maillon suivant : du fil jusqu'à la slide que le LECTEUR rend

    /// **Les stickers arrivent jusqu'à la slide du lecteur.**
    ///
    /// `StoryReaderRepresentable` ne rend pas un `StoryItem` : il rend le
    /// produit de `toRenderableSlide(preferredLanguages:)`. Cette fonction
    /// RECOMPOSE `effects` — elle hydrate les durées média, réécrit les URL
    /// audio, élit un fond legacy. Autant d'occasions de reconstruire un
    /// `StoryEffects` en oubliant une famille au passage.
    ///
    /// Les stickers n'y sont touchés par aucune de ces branches, et c'est
    /// précisément pourquoi ce témoin existe : ce qu'aucune ligne ne modifie
    /// est ce qu'aucune ligne ne protège. Une future branche qui reconstruirait
    /// `effects` champ par champ les perdrait en silence — le canvas serait
    /// vide sans qu'aucun décodage, aucun dessinateur ni aucun inventaire
    /// n'ait cessé d'être juste.
    func test_lesStickers_atteignentLaSlideDuLecteur() throws {
        let item = StoryItem(id: "story-sonde", content: "sonde", storyEffects: try effets())

        let slide = item.toRenderableSlide(preferredLanguages: ["fr"])

        XCTAssertEqual(slide.effects.stickerObjects?.count, 3,
                       "La slide rendue par le lecteur a perdu les stickers du fil.")
        XCTAssertEqual(slide.effects.stickerObjects?.first?.templateId, "location.compass")
        XCTAssertEqual(slide.effects.stickerObjects?.first?.slots["placeName"], "Le Marais")
    }
}
