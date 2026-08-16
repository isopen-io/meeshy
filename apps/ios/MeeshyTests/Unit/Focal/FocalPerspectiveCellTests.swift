import XCTest
import UIKit
@testable import Meeshy

/// La perspective doit SURVIVRE à une application d'attributs de layout.
///
/// `UICollectionReusableView.apply(_:)` réécrit `layer.transform` depuis
/// `layoutAttributes.transform3D` (identité) et `alpha` depuis
/// `layoutAttributes.alpha` (1). Les rangées Focal s'auto-mesurent, donc la
/// collection ré-applique ses attributs en fin de `layoutSubviews` — après le
/// `scrollViewDidScroll` de la même frame. Le pass écrivait, UIKit effaçait, et
/// rien ne le reposait avant la frame suivante.
///
/// Mesuré au ralenti sur un enregistrement de 6,0 s : 36 frames sur 361
/// (10,0 %) rendues sans perspective, en 9 fenêtres dont deux de 200 ms et
/// 167 ms — les « sauts de grandissement » du rapport.
///
/// Ces tests montent l'effacement tel quel, sans simulateur ni défilement.
@MainActor
final class FocalPerspectiveCellTests: XCTestCase {

    private func makeCell() -> FocalPerspectiveCell {
        FocalPerspectiveCell(frame: CGRect(x: 0, y: 0, width: 320, height: 90))
    }

    private func makeAttributes() -> UICollectionViewLayoutAttributes {
        let attributes = UICollectionViewLayoutAttributes(forCellWith: IndexPath(item: 0, section: 0))
        attributes.frame = CGRect(x: 0, y: 0, width: 320, height: 90)
        return attributes
    }

    // MARK: - Le défaut, monté

    func test_applyLayoutAttributes_keepsTheScale() {
        let cell = makeCell()
        cell.writeFocalTransform(FocalCellTransform(scale: 0.62, alpha: 0.4, translation: CGSize(width: -30, height: -12)))

        cell.apply(makeAttributes())
        cell.layoutIfNeeded()

        XCTAssertEqual(
            cell.layer.transform.m11, 0.62, accuracy: 0.0001,
            "FocalPerspectiveCell.apply doit REPOSER l'échelle — UICollectionViewLayoutAttributes.transform3D vaut l'identité et l'écrase sinon"
        )
    }

    func test_applyLayoutAttributes_keepsTheAlpha() {
        let cell = makeCell()
        cell.writeFocalTransform(FocalCellTransform(scale: 0.62, alpha: 0.4, translation: .zero))

        cell.apply(makeAttributes())
        cell.layoutIfNeeded()

        XCTAssertEqual(
            cell.alpha, 0.4, accuracy: 0.0001,
            "FocalPerspectiveCell.apply doit REPOSER l'alpha — UICollectionViewLayoutAttributes.alpha vaut 1 et l'écrase sinon"
        )
    }

    func test_applyLayoutAttributes_keepsTheTranslation() {
        let cell = makeCell()
        cell.writeFocalTransform(FocalCellTransform(scale: 0.62, alpha: 1, translation: CGSize(width: -30, height: -12)))

        cell.apply(makeAttributes())
        cell.layoutIfNeeded()

        XCTAssertEqual(cell.layer.transform.m41, -30, accuracy: 0.0001, "FocalPerspectiveCell.apply doit reposer l'ancrage horizontal (§4.3)")
        XCTAssertEqual(cell.layer.transform.m42, -12, accuracy: 0.0001, "FocalPerspectiveCell.apply doit reposer l'ancrage vertical (§4.3)")
    }

    /// Une re-mesure peut en suivre une autre pendant plusieurs frames : reposer
    /// UNE fois ne suffit pas.
    func test_applyLayoutAttributes_repeated_keepsThePerspectiveEveryTime() {
        let cell = makeCell()
        cell.writeFocalTransform(FocalCellTransform(scale: 0.5, alpha: 0.3, translation: .zero))

        for _ in 0..<12 {
            cell.apply(makeAttributes())
        cell.layoutIfNeeded()
        }

        XCTAssertEqual(cell.layer.transform.m11, 0.5, accuracy: 0.0001, "la perspective doit survivre à une CASCADE de re-mesures, pas seulement à la première")
        XCTAssertEqual(cell.alpha, 0.3, accuracy: 0.0001, "la perspective doit survivre à une CASCADE de re-mesures, pas seulement à la première")
    }

    /// **La garde anti-crash.** Reposer le transform SYNCHRONIQUEMENT dans
    /// `apply(_:)` s'exécute au milieu de la passe de mise à jour de la
    /// collection : la mesure self-sizing voit une cellule transformée, la
    /// passe ré-invalide, ré-applique, la cellule repose — et la convergence
    /// ne vient jamais. Constaté par crash au simulateur iOS 26.1
    /// (`Meeshy-2026-08-16-214007.ips` : assertion Swift dans
    /// `_setNeedsVisibleCellsUpdate`, `_updateVisibleCellsNow` récursif).
    /// Le repose DOIT attendre `layoutSubviews`.
    func test_applyLayoutAttributes_doesNotRewriteSynchronously() {
        let cell = makeCell()
        cell.layoutIfNeeded()
        cell.writeFocalTransform(FocalCellTransform(scale: 0.5, alpha: 0.3, translation: .zero))

        cell.apply(makeAttributes())

        XCTAssertTrue(
            CATransform3DIsIdentity(cell.layer.transform),
            "apply(_:) ne doit PAS réécrire le transform dans la passe — c'est le crash iOS 26 (self-sizing non convergente) ; le repose appartient à layoutSubviews"
        )
    }

    // MARK: - Recyclage

    func test_prepareForReuse_dropsThePerspective() {
        let cell = makeCell()
        cell.writeFocalTransform(FocalCellTransform(scale: 0.5, alpha: 0.3, translation: CGSize(width: -40, height: -20)))

        cell.prepareForReuse()

        XCTAssertTrue(
            CATransform3DIsIdentity(cell.layer.transform),
            "une cellule recyclée ne doit JAMAIS hériter de la perspective de son occupant précédent"
        )
        XCTAssertEqual(cell.alpha, 1, accuracy: 0.0001, "une cellule recyclée repart pleinement opaque")
    }

    func test_prepareForReuse_thenApply_staysAtIdentity() {
        let cell = makeCell()
        cell.writeFocalTransform(FocalCellTransform(scale: 0.5, alpha: 0.3, translation: .zero))
        cell.prepareForReuse()

        cell.apply(makeAttributes())
        cell.layoutIfNeeded()

        XCTAssertTrue(
            CATransform3DIsIdentity(cell.layer.transform),
            "après recyclage, la consigne mémorisée est l'identité — la reposer ne doit pas ressusciter l'ancienne échelle"
        )
    }

    // MARK: - Le pass écrit bien à travers la cellule

    func test_scrollPassReset_routesThroughTheCell() {
        let pass = FocalScrollPass()
        let cell = makeCell()
        cell.writeFocalTransform(FocalCellTransform(scale: 0.5, alpha: 0.3, translation: .zero))

        pass.reset(cell)
        cell.apply(makeAttributes())
        cell.layoutIfNeeded()

        XCTAssertTrue(
            CATransform3DIsIdentity(cell.layer.transform),
            "FocalScrollPass.reset doit passer par FocalPerspectiveCell — sinon la consigne mémorisée survit au reset et revient à la première re-mesure"
        )
    }
}
