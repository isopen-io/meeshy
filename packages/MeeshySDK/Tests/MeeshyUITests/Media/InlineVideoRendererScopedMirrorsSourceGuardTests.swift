import XCTest
@testable import MeeshyUI

/// **Une feuille de liste ne s'abonne jamais à un singleton global : elle
/// cantonne ce qu'elle lit** (#6226).
///
/// `SharedAVPlayerManager` republie `currentTime` toutes les 200 ms — un
/// battement thermique, par conception. `_InlineRenderer` ne lit jamais cette
/// valeur : il lui faut `activeURL`, `player`, `duration` et `isMuted`. Mais
/// `@ObservedObject` s'abonne à l'OBJET, pas aux champs lus : un renderer
/// existe par vidéo montée — bulles de message, cartes du fil, commentaires,
/// rangées Focal, détail de post — et dès qu'UNE vidéo joue, toutes ces vues
/// se réévaluent cinq fois par seconde, y compris celles qui n'affichent
/// qu'une vignette. Le `.equatable()` du parent ne protège pas : l'invalidation
/// naît DANS le renderer.
///
/// Le correctif est écrit à côté, avec sa raison : `ReelFeedVideoSurface`
/// porte des miroirs `@State` alimentés par `.onReceive`, parce que le même
/// abonnement « re-rendait CHAQUE carte du fil en continu ».
///
/// **Le plein écran, lui, garde son observation** : il DESSINE la barre de
/// progression, donc `currentTime` est exactement ce qu'il lui faut. Une
/// garde qui interdirait l'observation partout confondrait un abonnement
/// inutile avec un abonnement justifié.
final class InlineVideoRendererScopedMirrorsSourceGuardTests: XCTestCase {

    private func renderersSource() throws -> String {
        ComposerSourceGuard.stripComments(
            try String(
                contentsOf: ComposerSourceGuard.packageRoot
                    .appendingPathComponent("Sources/MeeshyUI/Media/MeeshyVideoPlayer+Renderers.swift"),
                encoding: .utf8
            )
        )
    }

    /// Le fichier porte quatre renderers ; la loi ne vaut que pour celui qui
    /// est monté PAR CELLULE. Une garde qui lit le fichier entier jugerait
    /// aussi le plein écran, dont l'abonnement est justifié.
    private func inlineRendererSource() throws -> String {
        let code = try renderersSource()
        guard let start = code.range(of: "internal struct _InlineRenderer"),
              let end = code.range(of: "internal struct _MiniRenderer")
        else {
            XCTFail("Les bornes du renderer en ligne sont introuvables : la garde ne mesure plus rien.")
            return ""
        }
        return String(code[start.lowerBound..<end.lowerBound])
    }

    func test_theInlineRendererDoesNotSubscribeToTheSharedEngine() throws {
        let inline = try inlineRendererSource()
        XCTAssertFalse(
            inline.contains("@ObservedObject private var manager"),
            "`_InlineRenderer` ne doit pas OBSERVER `SharedAVPlayerManager` : il existe un renderer par vidéo montée, et le moteur republie `currentTime` à 5 Hz (#6226)."
        )
        XCTAssertTrue(
            inline.contains("private let manager = SharedAVPlayerManager.shared"),
            "`_InlineRenderer` doit tenir le moteur en référence NUE — il l'appelle (`load`, `play`, `release`), ce qui n'exige aucun abonnement (#6226)."
        )
    }

    /// **Le pendant : ce que le renderer cesse d'observer, il doit le
    /// recevoir.** Sans les miroirs, une vidéo qui devient active ne
    /// s'afficherait plus — un défaut de correction, pire que la cadence qu'il
    /// corrige.
    func test_theInlineRendererMirrorsEveryFieldItDraws() throws {
        let inline = try inlineRendererSource()
        for field in ["activeURL", "player", "duration", "isMuted"] {
            XCTAssertTrue(
                inline.contains(".onReceive(manager.$\(field))"),
                "`_InlineRenderer` lit `\(field)` dans son body : sans miroir `.onReceive(manager.$\(field))`, la valeur se fige à sa naissance (#6226)."
            )
        }
    }

    func test_theFullscreenRendererKeepsTheSubscriptionItNeeds() throws {
        let code = try renderersSource()
        guard let start = code.range(of: "internal struct _FullscreenRenderer") else {
            return XCTFail("Le renderer plein écran est introuvable : la garde ne mesure plus rien.")
        }
        XCTAssertTrue(
            code[start.lowerBound...].contains("@ObservedObject private var manager"),
            "`_FullscreenRenderer` DOIT observer le moteur : il dessine la barre de progression, donc `currentTime` est précisément ce qu'il lui faut (#6226)."
        )
    }
}
