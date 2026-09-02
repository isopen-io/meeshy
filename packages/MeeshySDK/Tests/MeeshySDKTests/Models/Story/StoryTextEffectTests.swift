import Testing
import Foundation
@testable import MeeshySDK

/// **L'axe EFFET d'un texte** (#4870) : un champ à part de la police, quatre
/// valeurs, une table en em, un aller-retour Codable et v3 qui ne perd rien.
struct StoryTextEffectTests {

    // MARK: - Le champ

    @Test func anAbsentEffect_isNone() {
        let text = StoryTextObject(id: "t1", text: "X")
        #expect(text.textEffect == nil)
        #expect(text.parsedTextEffect == StoryTextEffect.none)
        #expect(text.hasTextEffect == false)
    }

    @Test func everyEffect_parsesFromItsRawValue() {
        var text = StoryTextObject(id: "t1", text: "X")
        for effect in StoryTextEffect.allCases {
            text.textEffect = effect.rawValue
            #expect(text.parsedTextEffect == effect)
        }
    }

    /// Un client plus récent peut publier un effet que celui-ci ne connaît pas :
    /// le texte se rend SANS effet, jamais pas du tout.
    @Test func anUnknownEffect_fallsBackToNone_neverThrows() throws {
        var text = StoryTextObject(id: "t1", text: "X")
        text.textEffect = "effect-from-the-future"
        #expect(text.parsedTextEffect == StoryTextEffect.none)
        #expect(text.hasTextEffect == false)

        let json = #"{"id":"t1","text":"X","textEffect":"effect-from-the-future"}"#
        let decoded = try JSONDecoder().decode(StoryTextObject.self, from: Data(json.utf8))
        #expect(decoded.textEffect == "effect-from-the-future")
        #expect(decoded.parsedTextEffect == StoryTextEffect.none)
    }

    @Test func theEffect_roundTripsThroughCodable() throws {
        let text = StoryTextObject(id: "t1", text: "Bonjour", textEffect: "glow")
        let data = try JSONEncoder().encode(text)
        let decoded = try JSONDecoder().decode(StoryTextObject.self, from: data)
        #expect(decoded.textEffect == "glow")
        #expect(decoded.parsedTextEffect == .glow)
    }

    /// `nil` ne s'écrit pas : un texte sans effet garde le JSON qu'il avait —
    /// aucun blob publié ne change de forme.
    @Test func anAbsentEffect_isNotEncoded() throws {
        let data = try JSONEncoder().encode(StoryTextObject(id: "t1", text: "X"))
        let json = try #require(String(data: data, encoding: .utf8))
        #expect(!json.contains("textEffect"))
    }

    // MARK: - La table

    @Test func none_carriesNoShadow() {
        #expect(StoryTextEffect.none.shadow == nil)
    }

    /// La lueur est un HALO : centrée, dans la couleur du texte.
    @Test func glow_isACenteredHaloInTheTextColour() throws {
        let shadow = try #require(StoryTextEffect.glow.shadow)
        #expect(shadow.offsetX == 0)
        #expect(shadow.offsetY == 0)
        #expect(shadow.blur > 0)
        #expect(shadow.usesTextColor)
    }

    /// L'ombre portée est DÉCALÉE vers le bas et floue ; le relief est décalé
    /// et NET. C'est le flou qui les distingue, pas la direction.
    @Test func shadowAndRelief_areOffsetDownwards_andOnlyShadowIsBlurred() throws {
        let shadow = try #require(StoryTextEffect.shadow.shadow)
        let relief = try #require(StoryTextEffect.relief.shadow)
        #expect(shadow.offsetY > 0)
        #expect(relief.offsetY > 0)
        #expect(shadow.blur > 0)
        #expect(relief.blur == 0)
        #expect(!shadow.usesTextColor)
        #expect(!relief.usesTextColor)
    }

    /// La table est en em : doubler la police double l'ombre. C'est ce qui
    /// permet à trois clients de rendre la même chose sans se parler.
    @Test func theTable_scalesWithTheFontSize() throws {
        let shadow = try #require(StoryTextEffect.shadow.shadow)
        let small = shadow.offset(fontSize: 50)
        let large = shadow.offset(fontSize: 100)
        #expect(large.x == small.x * 2)
        #expect(large.y == small.y * 2)
        #expect(shadow.blurRadius(fontSize: 100) == shadow.blurRadius(fontSize: 50) * 2)
    }

    /// Les API Apple prennent un rayon ≈ moitié du flou CSS : la conversion vit
    /// ICI, une fois, pas dans chaque calque.
    @Test func theAppleBlurRadius_isHalfTheCssBlur() throws {
        let glow = try #require(StoryTextEffect.glow.shadow)
        #expect(glow.blurRadius(fontSize: 100) == glow.blur * 100 / 2)
    }

    // MARK: - v3

    /// Le payload v3 porte la clé `textEffect`, et la relecture la rend — un
    /// dix-neuvième style ne coûte ni champ ni migration, un effet non plus.
    @Test func theEffect_travelsThroughTheV3Payload() throws {
        var effects = StoryEffects()
        effects.textObjects = [StoryTextObject(id: "t1", text: "Bonjour", textEffect: "relief")]
        let document = CanvasV3(migrating: effects)
        let object = try #require(document.scenes.first?.objects.first(where: { $0.kind == .text }))
        #expect(object.payload["textEffect"] == .string("relief"))

        let back = StoryEffects(rendering: document, sceneIndex: 0)
        #expect(back.textObjects.first?.textEffect == "relief")
    }
}
