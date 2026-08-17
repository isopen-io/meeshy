import XCTest
import UIKit
@testable import Meeshy

/// F-084 (WS-5) — la carte de focus et le flash d'atterrissage (contrat §4.6,
/// §4.7). Un `UICollectionViewCell` nu suffit : la décoration ne connaît que
/// `contentView.layer`.
///
/// **Recalibrage — essai visuel, déplacé par `16844104` (« coupe le cadre de
/// focus derrière un interrupteur »).** Ce commit a posé
/// `drawsFocusCard = false` : `update(isFocused: true)` sort désormais par la
/// garde avant d'avoir créé le moindre `CALayer`, et les trois témoins de
/// §4.6 dénonçaient l'absence d'une couche que la production ne pose plus.
///
/// L'invariant est INCHANGÉ : les cotes du token `thread.focusCard`,
/// l'insertion à l'index 0 DERRIÈRE le contenu hébergé, le layer réutilisé
/// par cellule (`NSMapTable` à clés faibles) et le masquage-sans-destruction
/// sont tous encore écrits — seulement inatteignables par le chemin par
/// défaut tant que dure l'essai. Un essai visuel suspend un RENDU, il
/// n'amende aucune cote ; laisser ces quatre-là sans témoin le temps qu'il
/// dure, c'est se préparer à rétablir le cadre sans filet.
///
/// Les témoins les éprouvent donc sur une décoration dont l'interrupteur est
/// OUVERT (`FocalFocusDecoration(drawsFocusCard: true)`), et un témoin NEUF
/// — `test_switchOff_drawsNoCardAtAll` — couvre la position d'essai
/// elle-même. La suite prouve maintenant les DEUX positions de
/// l'interrupteur là où elle n'en prouvait qu'une.
@MainActor
final class FocalFocusDecorationTests: XCTestCase {

    private var decoration: FocalFocusDecoration!
    private var cell: UICollectionViewCell!

    override func setUp() async throws {
        try await super.setUp()
        decoration = FocalFocusDecoration(drawsFocusCard: true)
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
        // Spec Magnificence 2026-08-17 : la rangée élue porte un FOND
        // accentué, jamais un bord. La carte est le PREMIER sublayer
        // (index 0, derrière le contenu SwiftUI hébergé) — le halo n'existe
        // plus.
        let sublayers = cell.contentView.layer.sublayers ?? []
        XCTAssertEqual(sublayers.first, card,
                       "le fond doit occuper l'index 0 — DERRIÈRE le contenu SwiftUI, jamais par-dessus")
        XCTAssertEqual(card.cornerRadius, FocalMetrics.FocusCard.radius,
                       "rayon du fond = FocalMetrics.FocusCard.radius (token thread.focusCard.radius), jamais un littéral")
        XCTAssertEqual(card.borderWidth, 0,
                       "FOND accentué, JAMAIS un bord (choix user, spec Magnificence) — borderWidth doit rester 0")
        XCTAssertNotNil(card.backgroundColor,
                        "le fond porte la teinte accent translucide — c'est LUI qui signale l'élu")
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

    func test_update_neverInstallsAHalo() {
        decoration.update(cell: cell, isFocused: true, accentHex: accent, isDark: false)
        let names = (cell.contentView.layer.sublayers ?? []).compactMap(\.name)
        XCTAssertFalse(
            names.contains("focal.focus.halo"),
            "le halo appartenait au design à BORDURE — le fond accentué vit seul (spec Magnificence)"
        )
    }

    func test_productionSwitch_drawsTheAccentBackground() {
        XCTAssertTrue(
            FocalFocusDecoration.drawsFocusCard,
            "l'essai « sans décoration » est terminé : la spec Magnificence rallume la décoration sous sa nouvelle forme — fond accentué sans bord"
        )
    }

    func test_update_focusTransition_fadesSoftly() throws {
        decoration.update(cell: cell, isFocused: true, accentHex: accent, isDark: false)
        let card = try XCTUnwrap(decoration.cardLayer(attachedTo: cell))
        XCTAssertNotNil(
            card.animation(forKey: "focal.focus.fade"),
            "l'apparition du fond est FONDUE (spec : « fondu doux à l'entrée/sortie ») — jamais un flip sec d'opacité"
        )

        decoration.update(cell: cell, isFocused: false, accentHex: accent, isDark: false)
        XCTAssertNotNil(
            card.animation(forKey: "focal.focus.fade"),
            "la disparition aussi est fondue"
        )
        XCTAssertEqual(card.opacity, 0, accuracy: 0.0001, "la valeur MODÈLE tombe bien à 0 — l'animation n'est qu'un habillage")
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

    /// **La position d'ESSAI de l'interrupteur (`16844104`), son propre
    /// témoin.** Avec `drawsFocusCard: false` — la valeur que porte la
    /// production — une rangée ÉLUE ne doit se voir poser NI carte, NI halo,
    /// NI aucun autre layer de décoration : « rien n'est dessiné » est la
    /// demande, pas « quelque chose de transparent est dessiné ». Un layer
    /// posé puis mis à `opacity = 0` coûterait une allocation par cellule
    /// élue pour un résultat invisible.
    ///
    /// Ce témoin est le pendant des trois ci-dessus : ensemble ils gèlent les
    /// deux positions, si bien que rétablir le cadre (repasser la constante à
    /// `true`) fera tomber CELUI-CI et seulement lui — un signal, pas une
    /// surprise.
    func test_switchOff_drawsNoCardAtAll() {
        let dark = FocalFocusDecoration(drawsFocusCard: false)

        dark.update(cell: cell, isFocused: true, accentHex: accent, isDark: false)

        XCTAssertNil(
            dark.cardLayer(attachedTo: cell),
            "interrupteur fermé (`drawsFocusCard: false`) : même ÉLUE, la cellule ne doit se voir créer aucun layer de carte — l'essai visuel demande qu'on ne dessine RIEN, pas qu'on dessine du transparent"
        )
        // Nommément, plutôt que par « la cellule n'a aucun sous-layer » : ce
        // que la décoration doit s'interdire, ce sont SES layers à elle. Une
        // couche interne qu'UIKit poserait un jour sur `contentView` ne dit
        // rien de cet interdit et ne doit pas faire rougir ce témoin.
        XCTAssertTrue(
            (cell.contentView.layer.sublayers ?? []).allSatisfy { ($0.name ?? "").hasPrefix("focal.focus.") == false },
            "interrupteur fermé : aucun layer de décoration `focal.focus.*` (carte, halo) ne doit être posé sur la cellule élue"
        )
    }

    /// Le flash d'atterrissage (§4.7) est d'une AUTRE nature — un signal
    /// transitoire de recherche, pas le cadre de la rangée élue. L'essai
    /// visuel ne le touche pas, et ce témoin l'épingle : couper le cadre ne
    /// doit jamais couper le flash par ricochet.
    func test_switchOff_stillFlashesOnLanding() throws {
        let dark = FocalFocusDecoration(drawsFocusCard: false)

        dark.flash(cell: cell, accentHex: accent, strong: false)

        XCTAssertNotNil(
            dark.flashLayer(attachedTo: cell),
            "interrupteur fermé : le flash d'atterrissage (§4.7) reste actif — il ne dépend pas du cadre de focus (doc de `drawsFocusCard` : « Ne touche PAS le flash »)"
        )
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
            (cell.contentView.layer.sublayers ?? []).allSatisfy { ($0.name ?? "").hasPrefix("focal.focus.") == false },
            "aucun layer de décoration `focal.focus.*` (carte, halo, flash) ne doit survivre à clear(_:)"
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
