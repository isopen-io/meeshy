import XCTest
@testable import Meeshy
@testable import MeeshySDK

/// **Combien d'objets la scène porte** (#4935).
///
/// > Directive porteur 2026-09-03 : « à la place de "Edit object", ce n'est pas
/// > mieux d'avoir une flèche `< N` où N est le nombre d'objets sur la scène
/// > actif ? »
///
/// ## Le mot « actif » avait deux lectures, et une seule tient
///
/// « Actif à cet instant » (fenêtre temporelle couvrant le temps courant) aurait
/// fait CHANGER le chiffre pendant qu'on déplace un curseur de temps — un nombre
/// qui bouge sans qu'on l'ait touché. C'est donc « présent sur la slide » qui est
/// retenu, et le doc-comment de la règle le dit, pour que le mot ne se relise pas
/// à l'envers dans six mois.
///
/// ## Mais « présent » n'est pas « tout ce qui est dans les tableaux »
///
/// C'est le témoin qui porte la loi : un FOND — média ou son — vit dans les
/// mêmes tableaux que les objets posés, et n'est pas un objet. Il n'a pas de
/// position, pas de puce, pas de sélection (#4918), et l'éditeur ne peut pas
/// l'ouvrir. Le compter ferait promettre à la flèche N objets dont l'auteur ne
/// trouverait jamais le dernier.
final class ComposerSceneObjectCountTests: XCTestCase {

    private func slide(_ build: (inout StoryEffects) -> Void) -> StorySlide {
        var effets = StoryEffects()
        build(&effets)
        var s = StorySlide(id: "s1")
        s.effects = effets
        return s
    }

    private func audio(_ id: String, background: Bool) -> StoryAudioPlayerObject {
        var son = StoryAudioPlayerObject(postMediaId: "", placement: "overlay",
                                         x: 0.5, y: 0.5, volume: 1, waveformSamples: [])
        son.id = id
        son.isBackground = background ? true : nil
        return son
    }

    // MARK: - Le cas nominal

    func test_uneSceneVide_neCompteRien() {
        XCTAssertEqual(ComposerSceneObjectCount.posed(on: slide { _ in }), 0)
    }

    func test_lesCinqFamilles_comptentToutes() {
        let s = slide { e in
            e.textObjects = [StoryTextObject(id: "t1", text: "salut")]
            e.mediaObjects = [StoryMediaObject(id: "m1", aspectRatio: 1)]
            e.stickerObjects = [StorySticker(id: "k1", emoji: "🎈")]
            e.locationObjects = [StoryLocationObject(id: "l1",
                                                place: SharedPlace(latitude: 48.8, longitude: 2.3, name: "Paris"))]
            e.audioPlayerObjects = [audio("a1", background: false)]
        }
        XCTAssertEqual(ComposerSceneObjectCount.posed(on: s), 5,
                       "les cinq familles de `MeeshySceneObject` comptent, aucune n'est oubliée")
    }

    // MARK: - Le témoin qui PORTE la loi

    /// **Un FOND n'est pas un objet posé**, et il vit pourtant dans les mêmes
    /// tableaux. Sans ce témoin, « compter les tableaux » et « compter les
    /// objets » rendent le même verdict sur toute scène sans fond — c'est-à-dire
    /// sur le cas nominal, et sur lui seul.
    func test_unFond_neCompteJamais() {
        let s = slide { e in
            e.textObjects = [StoryTextObject(id: "t1", text: "salut")]
            e.mediaObjects = [StoryMediaObject(id: "fond", aspectRatio: 1.777, isBackground: true)]
            e.audioPlayerObjects = [audio("bg", background: true)]
        }
        XCTAssertEqual(ComposerSceneObjectCount.posed(on: s), 1,
                       "un média de fond et un son de fond ne se posent pas : la flèche "
                       + "promettrait des objets que l'auteur ne trouverait jamais")
    }

    /// Et le fond ne masque pas ses VOISINS de premier plan : la règle écarte
    /// celui qui est en fond, pas la famille entière.
    func test_leFond_nEcartePasSesVoisins() {
        let s = slide { e in
            e.audioPlayerObjects = [audio("bg", background: true), audio("a1", background: false)]
            e.mediaObjects = [StoryMediaObject(id: "fond", aspectRatio: 1.777, isBackground: true),
                              StoryMediaObject(id: "m1", aspectRatio: 1)]
        }
        XCTAssertEqual(ComposerSceneObjectCount.posed(on: s), 2)
    }
}
