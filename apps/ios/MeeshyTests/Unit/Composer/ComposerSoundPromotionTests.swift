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

    /// Décision porteur du 2026-11-15 (#18719) : un objet neuf se pose au
    /// centre même quand le centre est pris.
    func test_landing_whenAnotherObjectHoldsTheCentre_staysAtTheCentre() {
        let s = slide { e in
            e.textObjects = [StoryTextObject(id: "t1", text: "occupe le centre")]
            e.audioPlayerObjects = [audio("a1", background: true)]
        }
        XCTAssertEqual(ComposerSoundPromotion.landing(on: s, promoting: "a1"),
                       StoryObjectPlacement.center)
    }

    /// **La chaîne complète, de l'hôte au doigt** (#5018).
    ///
    /// La règle et l'action ont été livrées avant ce témoin, et pendant un
    /// commit l'entrée de menu n'existait sur AUCUN écran : l'action était
    /// juste, testée, et personne ne l'appelait. C'est le motif « une vue sans
    /// consommateur ne rougit nulle part », et il ne se voit par aucun test de
    /// comportement — chaque maillon est correct isolément.
    ///
    /// Le témoin épingle donc les TROIS maillons ensemble. Retirer n'importe
    /// lequel rend la promotion inatteignable sans casser quoi que ce soit
    /// d'autre.
    func test_thePromotionReachesTheFinger_hostToSurfaceToMenu() throws {
        let hote = try source("MeeshyComposerHost+Surfaces.swift")
        XCTAssertTrue(hote.contains("onPromoteBackgroundSound: promoteBackgroundSoundAction"),
                      "l'hôte fournit l'action à la surface")

        let surface = try source("ComposerSceneSurface.swift")
        XCTAssertTrue(surface.contains("onPromote: onPromoteBackgroundSound"),
                      "la surface la passe à l'en-tête")

        let entete = try source("ComposerSceneSoundHeader.swift")
        XCTAssertTrue(entete.contains("promouvoir: onPromote"),
                      "l'en-tête la remet au menu d'appui long")
    }

    private func source(_ nom: String) throws -> String {
        if nom == "ComposerSceneSurface.swift" {
            return AppSourceGuard.stripComments(try AppSourceGuard.composerSceneSurfaceSource())
        }
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Composer/\(nom)")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }
}
