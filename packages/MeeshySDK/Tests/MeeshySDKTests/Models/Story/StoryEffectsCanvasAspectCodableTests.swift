import Testing
import Foundation
@testable import MeeshySDK

/// `StoryEffects.canvasAspectRatio` porte la forme du canvas choisie à la
/// composition. Contraintes de compat : les stories antérieures (sans la clé)
/// décodent en `nil` = portrait 9:16 par défaut ; un blob v1 qui porte la clé
/// décode en paysage.
///
/// À l'ÉCRITURE, le fil v3 letterboxe toujours les ancres libres dans le rect
/// 9:16 de sa scène (spec §C2, U20) — ça, c'est le contrat de LECTURE, et il
/// n'a pas bougé. Ce qui a changé le 2026-08-22 : la scène LOGE désormais le
/// ratio du porteur (`SceneV3.carrierAspect`), si bien que l'aller-retour
/// complet — celui que le composer emprunte à chaque sauvegarde — rend au
/// document sa forme ET ses positions d'auteur au lieu de les absorber.
struct StoryEffectsCanvasAspectCodableTests {

    private func roundTrip(_ effects: StoryEffects) throws -> StoryEffects {
        let data = try JSONEncoder().encode(effects)
        return try JSONDecoder().decode(StoryEffects.self, from: data)
    }

    /// L'aller-retour d'encodage COMPLET — `StoryEffects` → JSON v3 →
    /// `StoryEffects` — est FIDÈLE. C'est le chemin qu'emprunte toute
    /// sauvegarde : sans lui, composer une story sur un fond paysage, la
    /// sauvegarder et la rouvrir la rendait portrait, texte remonté d'un quart
    /// de cadre, sans retour possible.
    ///
    /// Sur le FIL, l'ancre reste letterboxée (`0,6266`) — U20 est intact. C'est
    /// le RETOUR qui défait le remap, le ratio du porteur étant désormais logé
    /// sur la scène.
    @Test func encodeDecode_landscapeRatio_isFAITHFUL_bothShapeAndAnchors() throws {
        var effects = StoryEffects()
        effects.canvasAspectRatio = 16.0 / 9.0
        effects.textObjects = [StoryTextObject(id: "t1", text: "Salut", x: 0.5, y: 0.9)]

        let decoded = try roundTrip(effects)

        #expect(abs((decoded.canvasAspectRatio ?? 0) - 16.0 / 9.0) < 0.000001)
        #expect(decoded.canvasAspect == .landscape)
        #expect(abs((decoded.textObjects.first?.y ?? 0) - 0.9) < 0.000001)
    }

    /// Le corollaire, qui garde U20 honnête : sur le FIL, l'ancre EST
    /// letterboxée. 9:16 dans 16:9 → hauteur utile 0,31640625, bande haute
    /// 0,341796875, donc `y = 0,9` s'écrit `0,6265625`.
    @Test func encode_landscapeRatio_stillLetterboxesOnTheWire() throws {
        var effects = StoryEffects()
        effects.canvasAspectRatio = 16.0 / 9.0
        effects.textObjects = [StoryTextObject(id: "t1", text: "Salut", x: 0.5, y: 0.9)]

        let document = CanvasV3(migrating: effects)

        #expect(document.scenes.first?.carrierAspect == 16.0 / 9.0)
        guard case .free(_, let wireY) = document.scenes[0].objects[0].anchor else {
            Issue.record("ancre libre attendue sur le fil"); return
        }
        #expect(abs(wireY - 0.6265625) < 0.000001)
    }

    @Test func decode_legacyJSONWithRatio_isLandscape() throws {
        let legacy = Data(#"{"textObjects":[],"canvasAspectRatio":1.7777777777777777}"#.utf8)
        let decoded = try JSONDecoder().decode(StoryEffects.self, from: legacy)
        #expect(abs((decoded.canvasAspectRatio ?? 0) - 16.0 / 9.0) < 0.0001)
        #expect(decoded.canvasAspect == .landscape)
    }

    @Test func encodeDecode_portraitDefault_omitsKeyAndDecodesNil() throws {
        let decoded = try roundTrip(StoryEffects())
        #expect(decoded.canvasAspectRatio == nil)
        #expect(decoded.canvasAspect == .portrait)
    }

    @Test func decode_legacyJSONWithoutKey_isPortrait() throws {
        // Une story publiée AVANT l'ajout du champ : aucune clé canvasAspectRatio.
        let legacy = Data(#"{"textObjects":[]}"#.utf8)
        let decoded = try JSONDecoder().decode(StoryEffects.self, from: legacy)
        #expect(decoded.canvasAspectRatio == nil)
        #expect(decoded.canvasAspect == .portrait)
    }
}
