import Foundation
import Testing
@testable import MeeshySDK

/// **Recomposer la story d'autrui ne change pas son FOND** (#9994, règle du
/// porteur du 2026-10-10). Le premier plan et les textes restent libres.
///
/// La règle se juge sur la slide entière parce que les écritures du composer
/// ne passent pas toutes par une fonction nommée : les gestes du canvas, le
/// panneau Cadre et l'annulation remplacent la slide d'un bloc. Le verrou les
/// rattrape toutes au même endroit.
struct StoryBackgroundLockTests {

    private func background(id: String = "bg") -> StoryMediaObject {
        StoryMediaObject(id: id, postMediaId: "", mediaURL: "file:///bg.jpg", mediaType: "image",
                         aspectRatio: 0.5625, isBackground: true)
    }

    private func foreground(id: String = "fg") -> StoryMediaObject {
        StoryMediaObject(id: id, postMediaId: "", mediaURL: "file:///fg.jpg", mediaType: "image",
                         aspectRatio: 1.5, x: 0.3, y: 0.4, scale: 0.6)
    }

    private func slide(mediaObjects: [StoryMediaObject]? = nil) -> StorySlide {
        var effects = StoryEffects(background: "#112233", filter: "vivid", filterIntensity: 0.7,
                                   textObjects: [StoryTextObject(id: "t1", text: "Bonjour")],
                                   mediaObjects: mediaObjects,
                                   backgroundTransform: StoryBackgroundTransform(scale: 1.2, videoFitMode: "fill"),
                                   canvasAspectRatio: nil)
        effects.stickerObjects = []
        return StorySlide(id: "s1", effects: effects)
    }

    private func sceneSlide() -> StorySlide { slide(mediaObjects: [background(), foreground()]) }

    // MARK: - Ce qui ne bouge pas

    @Test func uneSlideIntacte_nAppelleAucuneCorrection() {
        let sut = StoryBackgroundLock(locking: sceneSlide())
        #expect(sut.enforced(sceneSlide()) == nil)
    }

    @Test func uneAutreSlide_nEstPasConcernee() {
        let sut = StoryBackgroundLock(locking: sceneSlide())
        var other = sceneSlide()
        other.id = "s2"
        other.effects.background = "#FFFFFF"
        #expect(sut.enforced(other) == nil)
    }

    // MARK: - Le fond est rétabli

    @Test func laCouleurDuFond_estRetablie() throws {
        let sut = StoryBackgroundLock(locking: sceneSlide())
        var touched = sceneSlide()
        touched.effects.background = "#FFFFFF"

        let fixed = try #require(sut.enforced(touched))
        #expect(fixed.effects.background == "#112233")
    }

    @Test func leFiltreDuFond_estRetabli() throws {
        let sut = StoryBackgroundLock(locking: sceneSlide())
        var touched = sceneSlide()
        touched.effects.filter = "mono"
        touched.effects.filterIntensity = 0.1

        let fixed = try #require(sut.enforced(touched))
        #expect(fixed.effects.filter == "vivid")
        #expect(fixed.effects.filterIntensity == 0.7)
    }

    @Test func leCadrageDuFond_estRetabli() throws {
        let sut = StoryBackgroundLock(locking: sceneSlide())
        var touched = sceneSlide()
        touched.effects.backgroundTransform = StoryBackgroundTransform(scale: 2, offsetX: 40, videoFitMode: "fit")

        let fixed = try #require(sut.enforced(touched))
        #expect(fixed.effects.backgroundTransform?.scale == 1.2)
        #expect(fixed.effects.backgroundTransform?.offsetX == nil)
        #expect(fixed.effects.backgroundTransform?.videoFitMode == "fill")
    }

    @Test func leMediaDeFondDeplaceOuFiltre_estRetabli() throws {
        let sut = StoryBackgroundLock(locking: sceneSlide())
        var touched = sceneSlide()
        touched.effects.mediaObjects?[0].x = 0.9
        touched.effects.mediaObjects?[0].filter = "noir"

        let fixed = try #require(sut.enforced(touched))
        let bg = try #require(fixed.effects.mediaObjects?.first { $0.id == "bg" })
        #expect(bg.x == 0.5)
        #expect(bg.filter == nil)
    }

    @Test func leMediaDeFondSupprime_estRemis() throws {
        let sut = StoryBackgroundLock(locking: sceneSlide())
        var touched = sceneSlide()
        touched.effects.mediaObjects?.removeAll { $0.id == "bg" }

        let fixed = try #require(sut.enforced(touched))
        #expect(fixed.effects.resolvedBackgroundMedia?.id == "bg")
    }

    @Test func leFondRetrogradeEnPremierPlan_redevientLeFond() throws {
        let sut = StoryBackgroundLock(locking: sceneSlide())
        var touched = sceneSlide()
        touched.effects.mediaObjects?[0].isBackground = false

        let fixed = try #require(sut.enforced(touched))
        #expect(fixed.effects.resolvedBackgroundMedia?.id == "bg")
    }

    @Test func unPremierPlanPromuEnFond_redevientUnPremierPlan() throws {
        let sut = StoryBackgroundLock(locking: sceneSlide())
        var touched = sceneSlide()
        touched.effects.mediaObjects?[0].isBackground = false
        touched.effects.mediaObjects?[1].isBackground = true

        let fixed = try #require(sut.enforced(touched))
        #expect(fixed.effects.mediaObjects?.filter(\.isBackground).map(\.id) == ["bg"])
    }

    /// Une story sans média de fond (fond coloré, ou image héritée gardée à part)
    /// ne peut pas en recevoir un.
    @Test func sansMediaDeFond_aucunObjetNePeutLeDevenir() throws {
        let sut = StoryBackgroundLock(locking: slide(mediaObjects: [foreground()]))
        var touched = slide(mediaObjects: [foreground()])
        touched.effects.mediaObjects?[0].isBackground = true

        let fixed = try #require(sut.enforced(touched))
        #expect(fixed.effects.resolvedBackgroundMedia == nil)
    }

    // MARK: - Le premier plan et les textes restent libres

    @Test func lePremierPlanEtLesTextes_survivent_aLaCorrection() throws {
        let sut = StoryBackgroundLock(locking: sceneSlide())
        var touched = sceneSlide()
        touched.effects.background = "#FFFFFF"
        touched.effects.mediaObjects?[1].x = 0.8
        touched.effects.textObjects.append(StoryTextObject(id: "t2", text: "Salut"))
        touched.effects.mediaObjects?.append(foreground(id: "fg2"))

        let fixed = try #require(sut.enforced(touched))
        #expect(fixed.effects.mediaObjects?.first { $0.id == "fg" }?.x == 0.8)
        #expect(fixed.effects.mediaObjects?.contains { $0.id == "fg2" } == true)
        #expect(fixed.effects.textObjects.map(\.id) == ["t1", "t2"])
    }

    @Test func lePremierPlanSeul_bougeSansCorrection() {
        let sut = StoryBackgroundLock(locking: sceneSlide())
        var touched = sceneSlide()
        touched.effects.mediaObjects?[1].x = 0.8
        touched.effects.mediaObjects?.removeAll { $0.id == "fg" }
        #expect(sut.enforced(touched) == nil)
    }

    @Test func leVerrou_designeSonObjetDeFond() {
        #expect(StoryBackgroundLock(locking: sceneSlide()).backgroundObjectId == "bg")
        #expect(StoryBackgroundLock(locking: slide(mediaObjects: [foreground()])).backgroundObjectId == nil)
    }
}
