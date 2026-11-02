import XCTest
@testable import MeeshySDK

/// #13918 (R6 du spec « un seul compositeur ») — **toucher un objet posé le
/// fait passer au premier plan**, quelle que soit sa famille ; le fond n'entre
/// jamais dans l'ordre, et toucher l'objet déjà devant ne change rien.
final class SceneFrontPromotionTests: XCTestCase {

    private func scene() -> StoryEffects {
        var effets = StoryEffects()
        effets.mediaObjects = [StoryMediaObject(id: "fond", kind: .image, aspectRatio: 1, isBackground: true,
                                                zIndex: 40),
                               StoryMediaObject(id: "photo", kind: .image, aspectRatio: 1, zIndex: 2)]
        effets.textObjects = [StoryTextObject(id: "texte", text: "salut", zIndex: 1)]
        effets.stickerObjects = [StorySticker(id: "sticker", emoji: "🔥", zIndex: 5)]
        effets.locationObjects = [StoryLocationObject(id: "lieu",
                                                      place: SharedPlace(latitude: 48.8, longitude: 2.3, name: "Gare"),
                                                      zIndex: 3)]
        var son = StoryAudioPlayerObject(id: "son", postMediaId: "pm-1", name: "Voix")
        son.zIndex = 4
        effets.audioPlayerObjects = [son]
        return effets
    }

    private func dessus(_ effets: StoryEffects) -> String? {
        effets.sceneObjects.filter { !$0.isBackground }.last?.id
    }

    func test_toucherUnObjet_lePlaceAuSommet_quelleQueSoitSaFamille() throws {
        for id in ["texte", "photo", "lieu", "son"] {
            let apres = try XCTUnwrap(scene().broughtToFront(id), "\(id) n'était pas devant : il doit monter")
            XCTAssertEqual(dessus(apres), id, "\(id) passe devant tout")
            XCTAssertEqual(apres.sceneObject(id: id)?.zIndex, 6, "le rang suit le plus haut des AUTRES objets posés")
        }
    }

    func test_toucherA_puisB_metBAuDessusDeA() throws {
        let a = try XCTUnwrap(scene().broughtToFront("texte"))
        let b = try XCTUnwrap(a.broughtToFront("lieu"))
        XCTAssertEqual(b.sceneObjects.filter { !$0.isBackground }.suffix(2).map(\.id), ["texte", "lieu"])
    }

    func test_toucherLObjetDejaDevant_neChangeRien() {
        XCTAssertNil(scene().broughtToFront("sticker"), "aucun changement ⇒ aucune étape d'annulation")
    }

    func test_leFond_nEntreJamaisDansLOrdre() throws {
        XCTAssertNil(scene().broughtToFront("fond"))
        let apres = try XCTUnwrap(scene().broughtToFront("texte"))
        XCTAssertEqual(apres.mediaObjects?.first { $0.id == "fond" }?.zIndex, 40, "le rang du fond reste le sien")
        XCTAssertEqual(apres.mediaObjects?.first { $0.id == "fond" }?.isBackground, true)
    }

    func test_unIdInconnu_neChangeRien() {
        XCTAssertNil(scene().broughtToFront("parti"))
    }

    /// **À rang égal, l'objet touché doit DÉPASSER**, pas rejoindre. Deux objets
    /// au rang 0 (le défaut) se départagent par famille : un texte touché sous
    /// un sticker du même rang restait dessous.
    func test_aRangEgal_lObjetTouche_passeDevant() throws {
        var effets = StoryEffects()
        effets.textObjects = [StoryTextObject(id: "texte", text: "salut", zIndex: 0)]
        effets.stickerObjects = [StorySticker(id: "sticker", emoji: "🔥", zIndex: 0)]

        let apres = try XCTUnwrap(effets.broughtToFront("texte"))

        XCTAssertEqual(dessus(apres), "texte")
        XCTAssertEqual(apres.textObjects.first?.zIndex, 1)
    }

    /// Le lecteur lit le rang PUBLIÉ : la scène v3 doit dire le même ordre.
    func test_laPublication_garderLOrdreObtenu() throws {
        let apres = try XCTUnwrap(scene().broughtToFront("texte"))
        let publiee = try XCTUnwrap(CanvasV3.migratedScene(apres, id: "s1"))
        let devant = publiee.objects.filter { $0.plane == .fg }.max { $0.z < $1.z }
        XCTAssertEqual(devant?.id, "texte")
    }

    /// **Un ancien contenu sans rang publié** : le fil donne aux objets sans
    /// `zIndex` leur rang d'insertion. L'objet touché doit les dépasser aussi,
    /// et publier SON rang.
    func test_unAncienContenuSansRang_publieLObjetToucheDevant() throws {
        let brut = #"{"textObjects":[{"id":"texte","content":"salut"}],"#
            + #""stickerObjects":[{"id":"a","emoji":"🔥"},{"id":"b","emoji":"⭐️"}]}"#
        let effets = try JSONDecoder().decode(StoryEffects.self, from: Data(brut.utf8))

        let apres = try XCTUnwrap(effets.broughtToFront("texte"))
        let publiee = try XCTUnwrap(CanvasV3.migratedScene(apres, id: "s1"))

        let devant = publiee.objects.filter { $0.plane == .fg }.max { $0.z < $1.z }
        XCTAssertEqual(devant?.id, "texte")
    }

    /// Le brouillon garde l'ordre : la slide se réencode avec le rang obtenu.
    func test_leBrouillon_garderLOrdreObtenu() throws {
        let apres = try XCTUnwrap(scene().broughtToFront("lieu"))
        let relue = try JSONDecoder().decode(StorySlide.self,
                                             from: JSONEncoder().encode(StorySlide(id: "s", effects: apres)))
        XCTAssertEqual(dessus(relue.effects), "lieu")
    }
}
