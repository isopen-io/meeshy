import CoreGraphics
import XCTest
import MeeshySDK
@testable import Meeshy

/// **Faire sortir un son du FOND pour le poser sur la scène** (#5018).
///
/// Deux règles, et elles répondent à deux questions distinctes : *peut-on
/// promouvoir ?* (`promotableId`) et *où la puce atterrit-elle ?* (`landing`).
/// Les éprouver ensemble laisserait la seconde passer sur un cas où la première
/// refuse — c'est-à-dire sans jamais s'exécuter.
final class ComposerSoundPromotionTests: XCTestCase {

    private func slide(_ build: (inout StoryEffects) -> Void) -> StorySlide {
        var effets = StoryEffects()
        build(&effets)
        var s = StorySlide(id: "s1")
        s.effects = effets
        return s
    }

    private func audio(_ id: String, background: Bool,
                       x: Double = 0.5, y: Double = 0.5) -> StoryAudioPlayerObject {
        var son = StoryAudioPlayerObject(postMediaId: "", placement: "overlay",
                                         x: x, y: y, volume: 1, waveformSamples: [])
        son.id = id
        son.isBackground = background ? true : nil
        return son
    }

    // MARK: - Ce qui peut être promu

    /// Le cas que la règle doit REFUSER, et celui qu'un code naïf laisse passer.
    ///
    /// Un fond LEGACY est synthétisé depuis `backgroundAudioId` : il a un
    /// identifiant, il se résout, il se joue — mais **aucun objet ne le porte**.
    /// `toggleBackground` sur cet identifiant ne trouverait rien et ne ferait
    /// rien, en ayant l'air d'agir. Le témoin s'écrit ici plutôt que sur le cas
    /// nominal, parce que le cas nominal ne distingue pas une règle juste d'une
    /// règle absente.
    func test_promotableId_refusesALegacyBackground_thatNoObjectBacks() {
        let fond = audio("legacy", background: true)
        XCTAssertNil(ComposerSoundPromotion.promotableId(background: fond, audioObjects: []),
                     "un fond sans objet derrière lui n'a rien à promouvoir")
    }

    func test_promotableId_refusesWhenThereIsNoBackgroundAtAll() {
        XCTAssertNil(ComposerSoundPromotion.promotableId(background: nil,
                                                         audioObjects: [audio("a1", background: false)]))
    }

    func test_promotableId_returnsTheObjectId_whenTheBackgroundIsMaterialised() {
        let fond = audio("a1", background: true)
        XCTAssertEqual(ComposerSoundPromotion.promotableId(background: fond, audioObjects: [fond]),
                       "a1")
    }

    // MARK: - Où la puce atterrit

    /// Sur une scène vide, le premier objet reste au CENTRE — la cascade ne
    /// déplace que ce qui aurait recouvert. Punir le cas nominal pour protéger
    /// le second serait le défaut inverse.
    func test_landing_onAnEmptyScene_isTheCentre() {
        let s = slide { e in e.audioPlayerObjects = [audio("a1", background: true)] }
        XCTAssertEqual(ComposerSoundPromotion.landing(on: s, promoting: "a1"),
                       StoryObjectPlacement.center)
    }

    /// **Le son promu ne s'évite pas LUI-MÊME.**
    ///
    /// Il vit déjà dans `audioPlayerObjects` — c'est le même objet qui change
    /// de plan, pas un objet neuf. Sans l'exclusion, la cascade décalerait la
    /// puce pour ne pas recouvrir l'endroit qu'elle quitte : un décalage sans
    /// aucune raison visible, sur le cas le plus courant qui soit (promouvoir
    /// le seul son d'une scène).
    func test_landing_doesNotAvoidTheVeryObjectBeingPromoted() {
        let s = slide { e in
            e.audioPlayerObjects = [audio("a1", background: true, x: 0.5, y: 0.5)]
        }
        XCTAssertEqual(ComposerSoundPromotion.landing(on: s, promoting: "a1"),
                       StoryObjectPlacement.center,
                       "l'objet promu quitte sa place : elle n'est pas occupée")
    }

    func test_landing_stepsAsideWhenAnotherObjectHoldsTheCentre() {
        let s = slide { e in
            e.textObjects = [StoryTextObject(id: "t1", text: "occupe le centre")]
            e.audioPlayerObjects = [audio("a1", background: true)]
        }
        let place = ComposerSoundPromotion.landing(on: s, promoting: "a1")
        XCTAssertNotEqual(place, StoryObjectPlacement.center,
                          "une place prise fait avancer la cascade")
    }

    // MARK: - L'inventaire des positions

    func test_positions_ignoreBackgrounds_whichHaveNoPlaceOnTheScene() {
        let s = slide { e in
            e.audioPlayerObjects = [audio("fond", background: true)]
            e.mediaObjects = {
                var m = StoryMediaObject(id: "m1", aspectRatio: 1)
                m.isBackground = true
                return [m]
            }()
        }
        XCTAssertTrue(ComposerScenePosedObjects.positions(on: s).isEmpty,
                      "un fond occupe toute la scène : il n'a pas de position à éviter")
    }

    func test_positions_coverTheFiveFamilies() {
        let s = slide { e in
            e.textObjects = [StoryTextObject(id: "t1", text: "salut")]
            e.mediaObjects = [StoryMediaObject(id: "m1", aspectRatio: 1)]
            e.stickerObjects = [StorySticker(id: "k1", emoji: "🎈")]
            e.locationObjects = [StoryLocationObject(id: "l1",
                                                place: SharedPlace(latitude: 48.8, longitude: 2.3, name: "Paris"))]
            e.audioPlayerObjects = [audio("a1", background: false)]
        }
        XCTAssertEqual(ComposerScenePosedObjects.positions(on: s).count, 5,
                       "les cinq familles de `MeeshySceneObject` ont une position")
    }

    /// **Les deux énumérations des cinq familles ne doivent pas diverger.**
    ///
    /// `ComposerSceneObjectCount.posed` compte, `ComposerScenePosedObjects.positions`
    /// situe. Elles ne se dérivent pas l'une de l'autre — deux objets au même
    /// point restent deux objets — mais elles partagent leur INVENTAIRE, et rien
    /// dans le type ne l'impose. Une sixième famille ajoutée à l'une seule
    /// passerait en silence : le compte dirait six, la cascade éviterait cinq
    /// places.
    func test_bothEnumerationsListTheSameFiveCollections() throws {
        let code = try source("ComposerSceneObjectCount.swift")
        for famille in ["textObjects", "mediaObjects", "stickerObjects",
                        "locationObjects", "audioPlayerObjects"] {
            XCTAssertEqual(code.components(separatedBy: famille).count - 1, 2,
                           "\(famille) doit être énumérée par le compte ET par les positions")
        }
    }

    private func source(_ nom: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/\(nom)")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }
}
