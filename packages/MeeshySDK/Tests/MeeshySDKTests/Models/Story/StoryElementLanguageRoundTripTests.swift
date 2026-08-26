import Testing
@testable import MeeshySDK

/// **E3 (#3888) — la langue par élément survit à l'aller-retour wire.**
/// Le wire unifié (`ObjectV3.locale`) portait déjà la langue pour tous les
/// kinds ; le runtime ne l'exposait que sur texte/média/audio. Sticker et lieu
/// la portent désormais, et `CanvasV3Migration` l'émet ET la relit.
struct StoryElementLanguageRoundTripTests {

    @Test func stickerEtLieu_gardentLeurLangue_surLeRoundTrip() {
        var fx = StoryEffects()
        fx.stickerObjects = [StorySticker(emoji: "🎉", sourceLanguage: "wo")]
        fx.locationObjects = [StoryLocationObject(
            place: SharedPlace(latitude: 1, longitude: 2, name: "P"), sourceLanguage: "ar")]

        let wire = CanvasV3(migrating: fx)
        let back = StoryEffects(rendering: wire, sceneIndex: 0)

        #expect(back.stickerObjects?.first?.sourceLanguage == "wo")
        #expect(back.locationObjects.first?.sourceLanguage == "ar")
    }
}
