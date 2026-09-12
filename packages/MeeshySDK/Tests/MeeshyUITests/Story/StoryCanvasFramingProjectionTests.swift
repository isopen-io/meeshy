import XCTest
import CoreGraphics
import MeeshySDK
@testable import MeeshyUI

/// **UNE loi de cadrage, deux projections** (#6141, moitié de convergence).
///
/// L'issue déclare en « Ce que ça crée » : « `StoryCanvasFraming.resolve` en
/// devient une **projection** dans le même lot : une seule loi, l'ancienne API
/// préservée ». Le lot avait livré le solveur neuf et laissé la story avec le
/// sien — deux lois pour une seule question, exactement la dimension 11 que
/// l'issue vise.
///
/// ## Ce que chaque moitié mesure
///
/// 1. **Le SITE** : `resolve` passe par `MediaStageFraming`. C'est la seule
///    moitié qui puisse rougir sur ce défaut — les deux lois rendaient déjà le
///    même nombre, donc aucun témoin de VALEUR ne pouvait dire qu'elles étaient
///    deux.
/// 2. **L'ÉQUIVALENCE** : le nombre rendu ne bouge pas. C'est la condition que
///    l'issue pose à la convergence — « si la projection change le rendu de la
///    story, elle devient sa propre issue et le lot s'arrête là ». La table
///    ci-dessous la prouve terme à terme, sur la valeur que la loi de la story
///    calculait elle-même avant la convergence.
///
/// ## Pourquoi la projection ne porte QUE l'échelle
///
/// `MediaStageFraming` rend des COTES, `StoryCanvasFraming` un `scale`/`offset`.
/// La loi partagée est l'ajustement au ratio dans la région réservée — les deux
/// la calculent, et c'est elle qui ne doit exister qu'une fois. L'ALIGNEMENT
/// vertical (`center` / `top` / `bottom`) est une question que le plateau de
/// lecture ne pose pas : elle reste à la story, et l'offset avec elle.
final class StoryCanvasFramingProjectionTests: XCTestCase {

    // MARK: - 1 · Le site : une seule loi

    private func sdkSource(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Story/
            .deletingLastPathComponent()   // MeeshyUITests/
            .deletingLastPathComponent()   // Tests/
            .deletingLastPathComponent()   // MeeshySDK/
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// **Deux solveurs de cadrage dans un dépôt qui n'en déclare qu'un.** Ce
    /// témoin est le seul qui puisse le voir : les deux lois rendent le même
    /// nombre, donc leur DOUBLON est invisible à toute assertion de valeur —
    /// jusqu'au jour où l'une bouge.
    func test_laStory_ajusteParLaLoiPartagee_etNonParLaSienne() throws {
        let code = try sdkSource("Sources/MeeshyUI/Story/StoryCanvasFraming.swift")
        XCTAssertTrue(code.contains("MediaStageFraming"),
                      "`StoryCanvasFraming.resolve` doit être une PROJECTION du solveur partagé (#6141)")
    }

    // MARK: - 2 · L'équivalence : le rendu de la story ne bouge pas

    /// La loi que la story portait AVANT la convergence, recopiée ici et nulle
    /// part ailleurs. Un témoin d'équivalence qui appellerait le code de
    /// production des deux côtés ne mesurerait que lui-même.
    private func echelleHistorique(viewport: CGSize,
                                   headerInset: CGFloat,
                                   bottomInset: CGFloat,
                                   sideInset: CGFloat,
                                   ratio: CGFloat) -> CGFloat {
        let intrinsic = CanvasGeometry.aspectFitSize(in: viewport, ratio: ratio)
        guard intrinsic.width > 0, intrinsic.height > 0,
              viewport.width > 0, viewport.height > 0 else { return 1 }
        let regionTop = max(0, headerInset)
        let regionBottom = max(regionTop, viewport.height - max(0, bottomInset))
        let regionHeight = max(0, regionBottom - regionTop)
        let regionWidth = max(0, viewport.width - 2 * max(0, sideInset))
        guard regionHeight > 0, regionWidth > 0 else { return 1 }
        return min(1, max(0, min(regionHeight / intrinsic.height, regionWidth / intrinsic.width)))
    }

    /// Les cas qui séparent les deux contraintes : la HAUTEUR qui mord (sheet
    /// ouvert), la LARGEUR qui mord (marges latérales sur une carte haute), un
    /// fond PAYSAGE (16:9), et les deux bords d'iPhone du projet.
    private static let table: [(viewport: CGSize, header: CGFloat, bottom: CGFloat,
                                side: CGFloat, ratio: CGFloat, nom: String)] = [
        (CGSize(width: 402, height: 874), 100, 320, 0, CanvasGeometry.portraitRatio, "9:16, hauteur contrainte"),
        (CGSize(width: 402, height: 874), 100, 320, 24, CanvasGeometry.portraitRatio, "9:16, marges latérales"),
        (CGSize(width: 402, height: 874), 0, 0, 0, CanvasGeometry.portraitRatio, "9:16, région pleine"),
        (CGSize(width: 402, height: 874), 60, 120, 20, CanvasGeometry.landscapeRatio, "16:9, fond paysage"),
        (CGSize(width: 390, height: 844), 120, 380, 12, CanvasGeometry.portraitRatio, "iPhone 16 Pro, sheet ouvert"),
        (CGSize(width: 440, height: 956), 90, 260, 0, CanvasGeometry.portraitRatio, "iPhone 17 Pro Max"),
    ]

    func test_laProjection_rendExactementLEchelleHistorique() {
        for cas in Self.table {
            let resultat = StoryCanvasFraming.resolve(
                StoryCanvasFraming.Input(viewport: cas.viewport,
                                         headerInset: cas.header,
                                         bottomInset: cas.bottom,
                                         sideInset: cas.side,
                                         state: .carded,
                                         cardedCornerRadius: 22,
                                         canvasRatio: cas.ratio)
            )
            let attendue = echelleHistorique(viewport: cas.viewport,
                                             headerInset: cas.header,
                                             bottomInset: cas.bottom,
                                             sideInset: cas.side,
                                             ratio: cas.ratio)
            XCTAssertEqual(resultat.scale, attendue, accuracy: 0.0001,
                           "la convergence ne doit RIEN changer au rendu de la story — cas « \(cas.nom) »")
        }
    }

    /// **Le plancher du plateau de lecture ne descend PAS dans la story.** C'est
    /// la seule différence de fond entre les deux hôtes : une carte de story se
    /// laisse rétrécir par le sheet, un cadre de galerie ne descend jamais sous
    /// trois fois son overlay. La projection passe donc un plancher NUL — et si
    /// quelqu'un le remontait, la carte cesserait de suivre le sheet en silence.
    func test_laProjection_neSeVoitImposerAucunPlancher() {
        let viewport = CGSize(width: 402, height: 874)
        // Sheet largement ouvert : la région libre tombe sous 330 pt, le plancher
        // du plateau de lecture. La carte doit tout de même s'y rétrécir.
        let serre = StoryCanvasFraming.resolve(
            StoryCanvasFraming.Input(viewport: viewport,
                                     headerInset: 100,
                                     bottomInset: 560,
                                     sideInset: 0,
                                     state: .carded,
                                     cardedCornerRadius: 22)
        )
        let intrinsic = CanvasGeometry.aspectFitSize(in: viewport, ratio: CanvasGeometry.portraitRatio)
        let regionHeight = viewport.height - 100 - 560
        XCTAssertEqual(serre.scale, regionHeight / intrinsic.height, accuracy: 0.0001,
                       "la carte suit la région libre, même sous le plancher du plateau de lecture")
    }
}
