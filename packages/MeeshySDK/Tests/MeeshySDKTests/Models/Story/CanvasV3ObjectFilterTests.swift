import Testing
import Foundation
@testable import MeeshySDK

/// **Filtre de slide et filtre d'objet traversent CanvasV3 sans se confondre**
/// (#8502). Les deux partagent la clé `payload.filter` : le filtre de slide va
/// au média de FOND, celui d'un média posé reste sur lui. Même règle que le
/// convertisseur gateway (`storyEffectsV3.objectFilter.test.ts`) et que le web.
struct CanvasV3ObjectFilterTests {

    private func effets(slideFilter: String?) -> StoryEffects {
        var pose = StoryMediaObject(id: "posed", postMediaId: "64b0000000000000000000aa",
                                    kind: .image, aspectRatio: 1)
        pose.filter = "warm"
        let fond = StoryMediaObject(id: "fond", postMediaId: "64b0000000000000000000bb",
                                    kind: .image, aspectRatio: 0.56, isBackground: true)
        var fx = StoryEffects()
        fx.mediaObjects = [pose, fond]
        fx.filter = slideFilter
        return fx
    }

    private func filtre(_ doc: CanvasV3, _ id: String) -> String? {
        guard case .string(let valeur)? = doc.scenes.flatMap(\.objects).first(where: { $0.id == id })?.payload["filter"]
        else { return nil }
        return valeur
    }

    @Test func leFiltreDeSlide_vaAuFond_etLeFiltreDObjet_resteSurLui() {
        let doc = CanvasV3(migrating: effets(slideFilter: "bw"))
        #expect(filtre(doc, "fond") == "bw")
        #expect(filtre(doc, "posed") == "warm")
    }

    @Test func allerRetour_rendChaqueFiltreASaPlace() {
        let doc = CanvasV3(migrating: effets(slideFilter: "bw"))
        let relu = StoryEffects(rendering: doc, sceneIndex: 0)
        #expect(relu.filter == "bw")
        #expect(relu.mediaObjects?.first { $0.id == "posed" }?.filter == "warm")
        #expect(relu.mediaObjects?.first { $0.id == "fond" }?.filter == nil,
                "Le fond ne porte pas de filtre propre : le sien EST le filtre de slide.")
    }

    @Test func sansFiltreDeSlide_leFiltreDObjetSeulVoyage() {
        let relu = StoryEffects(rendering: CanvasV3(migrating: effets(slideFilter: nil)), sceneIndex: 0)
        #expect(relu.filter == nil)
        #expect(relu.mediaObjects?.first { $0.id == "posed" }?.filter == "warm")
    }
}
