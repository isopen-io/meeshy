import Testing
import Foundation
@testable import MeeshySDK

/// La boîte de cadre d'un texte se détache du fond : elle peut exister en
/// liseré seul, et « Aucun » la supprime quoi qu'il arrive. Trois champs
/// optionnels la décrivent — leur absence doit rendre EXACTEMENT le
/// comportement d'avant, sans quoi les stories déjà publiées changeraient
/// d'apparence à la première relecture.
struct StoryTextFrameBoxTests {

    private func text(background: StoryTextBackgroundStyle? = nil,
                      frameShape: String? = nil,
                      frameBorderWidth: Double? = nil) -> StoryTextObject {
        var obj = StoryTextObject(id: "t1", text: "Bonjour")
        obj.backgroundStyle = background
        obj.frameShape = frameShape
        obj.frameBorderWidth = frameBorderWidth
        return obj
    }

    // MARK: - hasFrameBox

    @Test func aFondSeulSuffitAFaireUneBoite() {
        #expect(text(background: .solid(hex: "000000")).hasFrameBox)
        #expect(text(background: .glass(radius: 24)).hasFrameBox)
    }

    @Test func unLisereSeulSuffitAussi_sansAucunFond() {
        #expect(text(frameBorderWidth: 2).hasFrameBox)
    }

    @Test func sansFondNiLisere_aucuneBoite() {
        #expect(!text().hasFrameBox)
        #expect(!text(frameBorderWidth: 0).hasFrameBox)
    }

    @Test func aucunCadreSupprimeLaBoite_memeAvecUnFondEtUnLisere() {
        let obj = text(background: .solid(hex: "000000"),
                       frameShape: StoryTextFrameShape.none.rawValue,
                       frameBorderWidth: 4)
        #expect(!obj.hasFrameBox)
    }

    @Test func formeAbsente_resteArrondi_jamaisAucun() {
        #expect(text().parsedFrameShape == StoryTextFrameShape.rounded)
    }

    @Test func aucunCadreNeTracePasDeChemin() {
        #expect(!StoryTextFrameShape.none.usesCustomPath)
    }

    // MARK: - Marge

    @Test func margeAbsente_vautUn() {
        #expect(text().resolvedFramePaddingScale == 1.0)
    }

    @Test func margeBorneeEntreZeroEtTrois() {
        var obj = text()
        obj.framePaddingScale = -5
        #expect(obj.resolvedFramePaddingScale == 0)
        obj.framePaddingScale = 99
        #expect(obj.resolvedFramePaddingScale == 3)
        obj.framePaddingScale = 1.4
        #expect(obj.resolvedFramePaddingScale == 1.4)
    }

    // MARK: - Codable

    @Test func lesTroisChampsSurvivent_auRoundTrip() throws {
        var obj = StoryTextObject(id: "t1", text: "Bonjour")
        obj.frameShape = StoryTextFrameShape.speech.rawValue
        obj.framePaddingScale = 1.8
        obj.frameBorderWidth = 3.5
        obj.frameBorderColor = "FF2E63"

        let data = try JSONEncoder().encode(obj)
        let back = try JSONDecoder().decode(StoryTextObject.self, from: data)

        #expect(back.parsedFrameShape == StoryTextFrameShape.speech)
        #expect(back.framePaddingScale == 1.8)
        #expect(back.frameBorderWidth == 3.5)
        #expect(back.frameBorderColor == "FF2E63")
    }

    /// Un JSON écrit AVANT ce travail n'a aucun des trois champs : il doit se
    /// décoder sans erreur et rendre le comportement historique.
    @Test func unJsonLegacySeDecode_enComportementHistorique() throws {
        let json = Data("""
        {"id":"t1","text":"Bonjour","x":0.5,"y":0.5,"scale":1,"rotation":0,
         "zIndex":0,"fontSize":96,"fontFamily":"system"}
        """.utf8)

        let obj = try JSONDecoder().decode(StoryTextObject.self, from: json)

        #expect(obj.framePaddingScale == nil)
        #expect(obj.frameBorderWidth == nil)
        #expect(obj.frameBorderColor == nil)
        #expect(obj.resolvedFramePaddingScale == 1.0)
        #expect(obj.parsedFrameShape == StoryTextFrameShape.rounded)
        #expect(!obj.hasFrameBox)
    }
}
