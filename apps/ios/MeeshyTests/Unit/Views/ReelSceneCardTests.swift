import XCTest
import CoreGraphics
@testable import Meeshy
import MeeshySDK

/// **Un RÉEL qui porte une scène montre LA carte de scène — celle de la story**
/// (directive porteur du 2026-09-17, 2e message, lot #6904).
///
/// > « Il faut reproduire exactement la même chose partout ! Tout simplement !
/// > Partir du fait que le composant est déjà fait et le réutiliser pour les
/// > scènes de posts et les Réels ! »
///
/// Ce fichier remplace `ReelSceneImmersiveGuardTests`, et le remplacement EST
/// la décision : cette garde PROUVAIT, mesure à l'appui, que le réel rognait
/// 44,8 pt de chaque côté de la scène — « le rognage EST celui de
/// `layout(.immersive)`, jamais un autre ». La mesure était juste ; ce qu'elle
/// verrouillait est devenu faux. Un réel ne rogne plus rien : il monte la même
/// carte 9:16 ajustée, sur le même fond dominant, aux mêmes coins, que la story
/// et que le plein écran d'un post.
///
/// > **Un témoin qui verrouille un comportement retiré par directive ne se
/// > corrige pas, il se remplace** — et le dire dans son en-tête est ce qui
/// > empêche de le « réparer » plus tard en restaurant le rognage.
final class ReelSceneCardTests: XCTestCase {

    private static let unitFile = "Meeshy/Features/Main/Views/ReelsPlayerView+Scene.swift"

    /// **Commentaires RETIRÉS, et ce n'est pas un détail** : ce fichier
    /// EXPLIQUE, dans un commentaire, le rognage qu'il vient de retirer — et le
    /// témoin de non-rognage ci-dessous a rougi sur cette explication. Une
    /// garde qui lit les commentaires valide la documentation, pas le code.
    private func source() throws -> String {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        return AppSourceGuard.stripComments(
            try String(contentsOf: root.appendingPathComponent(Self.unitFile), encoding: .utf8))
    }

    /// **Le réel MONTE la carte, et ne refait rien de ce qu'elle fait.**
    func test_laSceneDUnReel_monteLaCarteDeScene() throws {
        let src = try source()
        XCTAssertTrue(src.contains("SceneCard(layout:"),
                      "le réel doit MONTER la carte de scène, pas un assemblage équivalent")
        XCTAssertTrue(src.contains("SceneShape.layout(in:"),
                      "et recevoir sa forme de la LOI, jamais d'un aspectRatio écrit ici")
    }

    /// **Le rognage a DISPARU.** `.aspectRatio(_, contentMode: .fill)` +
    /// `.clipped()` retirait 18,2 % de la largeur de la scène (44,8 pt de
    /// chaque côté sur un iPhone 402×874) — des pixels que l'auteur avait
    /// posés. C'est ce que la directive du 3e message retire : « On préserve le
    /// même fond que pour la story ! » — un fond, pas un rognage.
    func test_laSceneDUnReel_neRognePlusRien() throws {
        let src = try source()
        XCTAssertFalse(src.contains("contentMode: .fill"),
                       "une scène de réel ne se remplit plus en rognant")
    }

    /// **Le fond est celui de la story, et par la MÊME cascade.** Le réel ne
    /// recopie pas l'élection d'empreinte du lecteur : les deux appellent
    /// `StoryItem.sceneBackdropHash`, seul site du dépôt.
    func test_leFondDUnReel_estCeluiDeLaStory() throws {
        let src = try source()
        XCTAssertTrue(src.contains("sceneBackdropHash"),
                      "l'empreinte du fond vient de la loi partagée, pas d'une cascade recopiée")
        XCTAssertEqual(SceneShape.layout(in: CGSize(width: 402, height: 874)).backdrop,
                       SceneShape.cardedBackdrop,
                       "et la loi ne connaît qu'un fond — celui de la story")
    }

    /// **La cascade d'empreinte est UNE fonction, et c'est celle du lecteur.**
    /// La scène d'abord, son premier média ensuite, une chaîne vide ne comptant
    /// pas — trois hôtes qui la recopieraient sont trois fonds qui
    /// divergeraient, exactement le défaut que ce lot retire.
    func test_lEmpreinteDuFond_estLaCascadeDuLecteur() {
        let sansRien = StoryItem(id: "r0", createdAt: Date(timeIntervalSince1970: 0))
        XCTAssertNil(sansRien.sceneBackdropHash,
                     "sans matière, aucune empreinte — SceneBackdropView retombe sur son sol")

        var effets = StoryEffects()
        effets.thumbHash = "scene"
        let parLaScene = StoryItem(id: "r1", storyEffects: effets,
                                   createdAt: Date(timeIntervalSince1970: 0))
        XCTAssertEqual(parLaScene.sceneBackdropHash, "scene")

        let parLeMedia = StoryItem(id: "r2",
                                   media: [FeedMedia(id: "m", type: .image, url: "u",
                                                     thumbHash: "media")],
                                   createdAt: Date(timeIntervalSince1970: 0))
        XCTAssertEqual(parLeMedia.sceneBackdropHash, "media",
                       "à défaut de scène, le premier média — la cascade du lecteur depuis #6141")
    }
}
