import XCTest
import UIKit
@testable import Meeshy

/// F-084 (WS-5) — la carte de focus et le flash d'atterrissage (contrat §4.6,
/// §4.7). Un `UICollectionViewCell` nu suffit : la décoration ne connaît que
/// `contentView.layer`.
@MainActor
final class FocalFocusDecorationTests: XCTestCase {

    private var decoration: FocalFocusDecoration!
    private var cell: UICollectionViewCell!

    override func setUp() async throws {
        try await super.setUp()
        decoration = FocalFocusDecoration()
        cell = UICollectionViewCell(frame: CGRect(x: 0, y: 0, width: 390, height: 120))
        cell.layoutIfNeeded()
    }

    override func tearDown() async throws {
        decoration = nil
        cell = nil
        try await super.tearDown()
    }

    private let accent = "#6366F1"

    // MARK: - Carte de focus (§4.6)

    func test_update_focusedCell_installsTheCardWithTokenGeometry() throws {
        decoration.update(cell: cell, isFocused: true, accentHex: accent, isDark: false)

        let card = try XCTUnwrap(
            decoration.cardLayer(attachedTo: cell),
            "FocalFocusDecoration.update(isFocused: true) doit installer un CALayer de carte sur la cellule"
        )
        XCTAssertTrue(card.superlayer === cell.contentView.layer,
                      "la carte doit vivre dans cell.contentView.layer (§4.6)")
        XCTAssertEqual(cell.contentView.layer.sublayers?.first, card,
                       "la carte doit être insérée à l'index 0 — DERRIÈRE le contenu SwiftUI, jamais par-dessus")
        XCTAssertEqual(card.cornerRadius, FocalMetrics.FocusCard.radius,
                       "rayon de la carte = FocalMetrics.FocusCard.radius (token thread.focusCard.radius), jamais un littéral")
        XCTAssertEqual(card.borderWidth, FocalMetrics.FocusCard.ringSize,
                       "anneau de la carte = FocalMetrics.FocusCard.ringSize (token thread.focusCard.ringSize)")
        XCTAssertEqual(
            card.frame,
            cell.contentView.bounds.insetBy(
                dx: FocalMetrics.FocusCard.marginHorizontal,
                dy: FocalMetrics.FocusCard.marginVertical
            ),
            "cadre de la carte = bounds − marges thread.focusCard (FocalMetrics.FocusCard.margin*)"
        )
        XCTAssertEqual(card.opacity, 1, accuracy: 0.0001, "la carte de la rangée focalisée est visible")
    }

    /// La cellule ne doit pas accumuler un layer par passe : la carte est
    /// RÉUTILISÉE (critère « le pass n'alloue pas »).
    func test_update_repeated_reusesTheSameLayer() throws {
        decoration.update(cell: cell, isFocused: true, accentHex: accent, isDark: false)
        let first = try XCTUnwrap(decoration.cardLayer(attachedTo: cell))
        let sublayersAfterFirst = cell.contentView.layer.sublayers?.count ?? 0

        for _ in 0..<10 {
            decoration.update(cell: cell, isFocused: true, accentHex: accent, isDark: false)
        }

        XCTAssertTrue(
            decoration.cardLayer(attachedTo: cell) === first,
            "FocalFocusDecoration doit réutiliser le CALayer de la cellule (NSMapTable à clés faibles) — un layer neuf par passe alloue à 120 Hz"
        )
        XCTAssertEqual(
            cell.contentView.layer.sublayers?.count ?? 0, sublayersAfterFirst,
            "aucun layer supplémentaire ne doit s'empiler au fil des passes"
        )
    }

    func test_update_unfocused_hidesTheCardButKeepsItForReuse() throws {
        decoration.update(cell: cell, isFocused: true, accentHex: accent, isDark: false)
        decoration.update(cell: cell, isFocused: false, accentHex: accent, isDark: false)

        let card = try XCTUnwrap(
            decoration.cardLayer(attachedTo: cell),
            "la carte reste attachée (réutilisée au retour du focus), seule son opacité tombe"
        )
        XCTAssertEqual(card.opacity, 0, accuracy: 0.0001,
                       "FocalFocusDecoration.update(isFocused: false) doit masquer la carte")
    }

    /// Une cellule jamais focalisée ne doit pas se voir créer de layer : sur
    /// 12 cellules visibles, une seule porte la carte.
    func test_update_neverFocused_createsNoLayerAtAll() {
        decoration.update(cell: cell, isFocused: false, accentHex: accent, isDark: false)
        XCTAssertNil(
            decoration.cardLayer(attachedTo: cell),
            "FocalFocusDecoration ne doit créer un layer que pour la cellule ÉLUE — pas pour les 11 autres"
        )
    }

    func test_clear_removesEveryDecorationLayer() {
        decoration.update(cell: cell, isFocused: true, accentHex: accent, isDark: false)
        decoration.flash(cell: cell, accentHex: accent, strong: false)

        decoration.clear(cell)

        XCTAssertNil(decoration.cardLayer(attachedTo: cell),
                     "FocalFocusDecoration.clear doit retirer la carte — sinon une cellule recyclée affiche celle de son occupant précédent (§4.8)")
        XCTAssertNil(decoration.flashLayer(attachedTo: cell),
                     "FocalFocusDecoration.clear doit retirer le layer de flash")
        XCTAssertTrue(
            (cell.contentView.layer.sublayers ?? []).allSatisfy { $0.name != "focal.focus.card" && $0.name != "focal.focus.flash" },
            "aucun layer de décoration ne doit survivre à clear(_:)"
        )
    }

    // MARK: - Flash d'atterrissage (§4.7)

    /// LE point du §4.7 : le flash ne touche NI `cell.transform` NI
    /// `cell.alpha`. L'ancien `flashCell` les écrivait et effaçait donc la
    /// perspective sur exactement la cellule où atterrit la recherche.
    func test_flash_neverWritesCellTransformNorCellAlpha() {
        cell.layer.transform = CATransform3DMakeScale(0.8, 0.8, 1)
        cell.alpha = 0.59
        let transformBefore = cell.layer.transform

        decoration.flash(cell: cell, accentHex: accent, strong: true)

        XCTAssertTrue(
            CATransform3DEqualToTransform(cell.layer.transform, transformBefore),
            "§4.7 : le flash ne doit PAS écrire cell.transform — c'est ce que faisait flashCell, et c'est ce qui effaçait la perspective à l'atterrissage"
        )
        XCTAssertEqual(cell.alpha, 0.59, accuracy: 0.0001,
                       "§4.7 : le flash ne doit PAS écrire cell.alpha (le pass en est le seul écrivain, §4.4)")
    }

    func test_flash_animatesADedicatedLayer() throws {
        decoration.flash(cell: cell, accentHex: accent, strong: false)

        let flash = try XCTUnwrap(
            decoration.flashLayer(attachedTo: cell),
            "FocalFocusDecoration.flash doit poser un layer de surbrillance dédié"
        )
        let animation = try XCTUnwrap(
            flash.animation(forKey: "focal.focus.flash.opacity") as? CAKeyframeAnimation,
            "le flash doit être une animation d'opacité sur le layer dédié (§4.7)"
        )
        XCTAssertEqual(
            animation.duration,
            FocalPassConstants.Flash.riseDuration + FocalPassConstants.Flash.fallDuration,
            accuracy: 0.0001,
            "durée du flash = montée + descente de FocalPassConstants.Flash (cadences reprises de flashCell)"
        )
        XCTAssertEqual(animation.values?.count, 3,
                       "le flash monte puis redescend : trois valeurs d'opacité")
    }

    func test_flash_strongIsMorePronouncedThanNormal() {
        XCTAssertGreaterThan(
            FocalPassConstants.Flash.strongPeakOpacity, FocalPassConstants.Flash.peakOpacity,
            "le flash `strong` doit rester le plus marqué des deux — c'est la sémantique de flashCell(strong:) qu'on préserve"
        )
        XCTAssertLessThan(
            FocalPassConstants.Flash.strongDelay, FocalPassConstants.Flash.delay,
            "le flash `strong` (saut rapide) part plus tôt — cadence reprise verbatim de MessageListViewController.flashCell"
        )
    }

    func test_flash_repeated_reusesTheSameLayer() throws {
        decoration.flash(cell: cell, accentHex: accent, strong: false)
        let first = try XCTUnwrap(decoration.flashLayer(attachedTo: cell))
        decoration.flash(cell: cell, accentHex: accent, strong: true)

        XCTAssertTrue(
            decoration.flashLayer(attachedTo: cell) === first,
            "FocalFocusDecoration.flash doit réutiliser le layer de surbrillance de la cellule"
        )
    }

    // MARK: - F-086bis — `immediate`, extension RÉTRO-COMPATIBLE (arbitrage coordinateur)

    /// Tolérance de comparaison sur `CACurrentMediaTime()` : la mesure prend
    /// un temps non nul entre l'appel à `flash` et l'assertion — quelques
    /// millisecondes de marge absorbent cette latence sans affaiblir la
    /// distinction (les délais réels comparés, 0,25 s/0,35 s, sont un ordre
    /// de grandeur au-dessus).
    private static let beginTimeTolerance: CFTimeInterval = 0.05

    private func flashBeginTime(_ testCell: UICollectionViewCell) throws -> CFTimeInterval {
        let flash = try XCTUnwrap(
            decoration.flashLayer(attachedTo: testCell),
            "FocalFocusDecoration.flash doit poser un layer de surbrillance dédié"
        )
        let animation = try XCTUnwrap(
            flash.animation(forKey: "focal.focus.flash.opacity") as? CAKeyframeAnimation
        )
        return animation.beginTime
    }

    /// `immediate: true` supprime le délai INTERNE — `beginTime` doit tomber
    /// à (quasi) `CACurrentMediaTime()`, PAS `CACurrentMediaTime() + delay`.
    /// Réservé à l'appelant qui a DÉJÀ payé l'acquisition de cellule côté
    /// hôte (WS-6, `MessageListViewController.flashCell`, §4.7).
    func test_flash_immediate_hasNoInternalDelay_normal() throws {
        let before = CACurrentMediaTime()
        decoration.flash(cell: cell, accentHex: accent, strong: false, immediate: true)
        let beginTime = try flashBeginTime(cell)

        XCTAssertEqual(
            beginTime, before, accuracy: Self.beginTimeTolerance,
            "flash(immediate: true) doit poser beginTime ≈ CACurrentMediaTime() (aucun délai interne) — sinon le délai externe déjà payé par l'appelant s'additionne (tempo Focal doublé, F-086bis)."
        )
    }

    func test_flash_immediate_hasNoInternalDelay_strong() throws {
        let before = CACurrentMediaTime()
        decoration.flash(cell: cell, accentHex: accent, strong: true, immediate: true)
        let beginTime = try flashBeginTime(cell)

        XCTAssertEqual(
            beginTime, before, accuracy: Self.beginTimeTolerance,
            "flash(strong: true, immediate: true) doit AUSSI poser beginTime ≈ CACurrentMediaTime() — `immediate` s'applique aux deux cadences (normal ET fort)."
        )
    }

    /// Défaut `immediate: false` : comportement EXACT d'avant l'extension —
    /// AUCUN appelant existant n'est modifié (contrat de l'arbitrage
    /// F-086bis : « aucun autre appelant modifié »).
    func test_flash_defaultParameter_stillDelaysInternally() throws {
        let before = CACurrentMediaTime()
        decoration.flash(cell: cell, accentHex: accent, strong: false)
        let beginTime = try flashBeginTime(cell)

        XCTAssertEqual(
            beginTime, before + FocalPassConstants.Flash.delay, accuracy: Self.beginTimeTolerance,
            "Sans `immediate` (défaut `false`), flash doit conserver EXACTEMENT son délai interne historique (FocalPassConstants.Flash.delay) — rétro-compatibilité stricte, aucun appelant existant ne doit changer de comportement."
        )
    }

    /// L'ordre normal < fort (délai du fort strictement inférieur) reste
    /// vrai `immediate` ou non — seul `beginTime` change avec `immediate`,
    /// jamais la relation d'ordre entre les deux cadences.
    func test_flash_immediate_preservesNormalLessThanStrongOrdering() {
        XCTAssertLessThan(
            FocalPassConstants.Flash.strongDelay, FocalPassConstants.Flash.delay,
            "l'ordre normal < fort doit rester vrai sur les constantes elles-mêmes, quel que soit `immediate` — F-086bis ne touche à aucune cadence, seulement à beginTime."
        )
    }
}
