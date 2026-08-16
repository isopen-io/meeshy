import XCTest
import UIKit
@testable import Meeshy

/// F-084 (WS-5) — la GÉOMÉTRIE du pass de perspective du fil, prouvée sur le
/// type pur `FocalPerspectiveGeometry` (aucune `UICollectionView` ici : la
/// classe sœur `FocalScrollPassWriteTests`, plus bas dans ce fichier, monte
/// la vraie collection inversée).
///
/// **Aucune constante de loi n'est recopiée dans ce fichier** (garde R15) :
/// chaque attendu se dérive du miroir GELÉ `FocalFocusCurve`
/// (`focusCurve(distance:variant:.thread)`, `focusBandOffset`,
/// `focusBandHalfHeight`) ou de `FocalPassConstants` (le domicile UNIQUE des
/// cotes du §4 absentes du miroir et du token). Un test qui écrirait `380`
/// ou `0.82` en dur créerait la seconde source de vérité que tout ce chantier
/// interdit.
///
/// Contrat : `tasks/focal-implementation-contract.md` §4.1→§4.9.
final class FocalScrollPassGeometryTests: XCTestCase {

    private let geometry = FocalPerspectiveGeometry.standard

    /// Tolérance de comparaison flottante — même ordre que les suites de
    /// vecteurs partagées (`FocusCurveVectorTests`, `toBeCloseTo(x, 4)`).
    private static let epsilon: CGFloat = 0.0001

    // =========================================================================
    // §4.2 — Contenu → écran (la géométrie INVERSÉE)
    // =========================================================================

    /// Vérification littérale du §4.2 : une cellule à `p = 0` (index 0, pile à
    /// l'offset) doit sortir à `visualY = H`, le BAS de l'écran — c'est là que
    /// vit le message le plus récent dans la collection retournée
    /// (`MessageListViewController.swift:484`, `CGAffineTransform(scaleX: 1, y: -1)`).
    func test_visualMidY_offsetItselfLandsOnTheVisualBottom() {
        let visual = geometry.visualMidY(contentMidY: 240, contentOffsetY: 240, viewportHeight: 800)
        XCTAssertEqual(
            visual, 800, accuracy: Self.epsilon,
            "FocalPerspectiveGeometry.visualMidY : contentMidY == contentOffsetY doit rendre H (bas visuel) — géométrie inversée du §4.2"
        )
    }

    /// L'inversion, en une assertion : un contenu d'ordonnée PLUS GRANDE (plus
    /// ancien, plus haut dans le tableau d'items) sort PLUS HAUT à l'écran
    /// (ordonnée écran plus petite).
    func test_visualMidY_isInverted_olderContentSitsHigherOnScreen() {
        let recent = geometry.visualMidY(contentMidY: 100, contentOffsetY: 0, viewportHeight: 800)
        let older = geometry.visualMidY(contentMidY: 500, contentOffsetY: 0, viewportHeight: 800)
        XCTAssertEqual(recent, 700, accuracy: Self.epsilon, "FocalPerspectiveGeometry.visualMidY : H − (contentMidY − offset)")
        XCTAssertEqual(older, 300, accuracy: Self.epsilon, "FocalPerspectiveGeometry.visualMidY : H − (contentMidY − offset)")
        XCTAssertLessThan(
            older, recent,
            "géométrie inversée : un contentY plus grand est PLUS HAUT à l'écran — si cette assertion tombe, le pass a été écrit pour une liste normale"
        )
    }

    /// Idempotence de la conversion : deux appels de suite sur les mêmes
    /// entrées rendent la même sortie (le pass est appelé depuis SIX sites,
    /// §4.8 — il ne doit jamais lire sa propre sortie de la frame précédente).
    func test_visualMidY_isPure_sameInputsSameOutput() {
        let first = geometry.visualMidY(contentMidY: 333, contentOffsetY: 111, viewportHeight: 800)
        let second = geometry.visualMidY(contentMidY: 333, contentOffsetY: 111, viewportHeight: 800)
        XCTAssertEqual(first, second, accuracy: Self.epsilon, "FocalPerspectiveGeometry.visualMidY doit être pure (idempotence du pass, §4.2)")
    }

    // =========================================================================
    // §4.3 — Ligne de focus
    // =========================================================================

    /// Composeur masqué (`contentInset.top == 0`) : le plancher `bandLift`
    /// empêche la bande de coller au bord bas. `bandLift` vient du miroir GELÉ
    /// (`FocalFocusCurve.focusBandOffset`), jamais d'un littéral.
    func test_focusY_composerHidden_floorsOnBandLift() {
        let focusY = geometry.focusY(viewportHeight: 800, bottomClearance: 0)
        XCTAssertEqual(
            focusY, 800 - FocalFocusCurve.focusBandOffset, accuracy: Self.epsilon,
            "FocalPerspectiveGeometry.focusY : composeur masqué ⇒ H − FocalFocusCurve.focusBandOffset (plancher de bande, §4.3)"
        )
    }

    /// Composeur au repos (~146 pt mesurés, §4.3) : `146 + bandGap` dépasse le
    /// plancher, la bande se cale donc sur le composeur.
    func test_focusY_composerAtRest_clearsTheComposer() {
        let composer: CGFloat = 146
        let focusY = geometry.focusY(viewportHeight: 800, bottomClearance: composer)
        XCTAssertEqual(
            focusY, 800 - (composer + FocalPassConstants.bandGap), accuracy: Self.epsilon,
            "FocalPerspectiveGeometry.focusY : au repos la bande se pose au-dessus du composeur (composer + FocalPassConstants.bandGap, §4.3)"
        )
    }

    /// Clavier ouvert : la bande MONTE (ordonnée écran plus petite). C'est
    /// toute la raison du `max(bandLift, contentInset.top + bandGap)` — avec
    /// le littéral `150` de la spec, le message au point passerait sous le
    /// clavier.
    func test_focusY_keyboardOpen_bandRisesAboveTheKeyboard() {
        let atRest = geometry.focusY(viewportHeight: 800, bottomClearance: 146)
        let withKeyboard = geometry.focusY(viewportHeight: 800, bottomClearance: 420)
        XCTAssertEqual(
            withKeyboard, 800 - (420 + FocalPassConstants.bandGap), accuracy: Self.epsilon,
            "FocalPerspectiveGeometry.focusY : clavier ouvert ⇒ H − (contentInset.top + bandGap)"
        )
        XCTAssertLessThan(
            withKeyboard, atRest,
            "la ligne de focus doit MONTER quand le clavier s'ouvre (§4.3) — sinon la rangée nette finit sous le clavier"
        )
    }

    // =========================================================================
    // §4.3 — Distance : rien ne s'estompe SOUS la bande
    // =========================================================================

    func test_distance_belowTheBand_isZero_theCrispZoneExists() {
        let focusY = geometry.focusY(viewportHeight: 800, bottomClearance: 0)
        let distance = geometry.distance(visualMidY: focusY + 120, focusY: focusY)
        XCTAssertEqual(
            distance, 0, accuracy: Self.epsilon,
            "FocalPerspectiveGeometry.distance : sous la ligne de focus la distance est nulle (zone nette, critère §WS-5)"
        )
    }

    func test_distance_aboveTheBand_growsUpwards() {
        let focusY: CGFloat = 660
        XCTAssertEqual(geometry.distance(visualMidY: 460, focusY: focusY), 200, accuracy: Self.epsilon,
                       "FocalPerspectiveGeometry.distance : d = max(0, focusY − visualMidY)")
    }

    // =========================================================================
    // §4.3 — Échelle / opacité : DÉLÉGUÉES au miroir gelé, jamais recalculées
    // =========================================================================

    /// La courbe ne se réécrit JAMAIS : pour une même distance, le transform
    /// du pass doit rendre exactement `FocalFocusCurve.focusCurve(_, .thread)`.
    func test_transform_delegatesScaleAndAlphaToTheFrozenCurve() {
        for distance in [CGFloat(0), 60, 190, 379, 380, 900] {
            let expected = FocalFocusCurve.focusCurve(distance: distance, variant: .thread)
            let transform = geometry.transform(
                distance: distance,
                cellSize: CGSize(width: 320, height: 100),
                horizontalAnchor: .leading,
                isRightToLeft: false,
                alphaCeiling: FocalPassConstants.opaqueAlphaCeiling
            )
            XCTAssertEqual(
                transform.scale, expected.scale, accuracy: Self.epsilon,
                "FocalPerspectiveGeometry.transform (d=\(distance)) doit rendre l'échelle du miroir GELÉ FocalFocusCurve.focusCurve(.thread) — aucune constante recopiée"
            )
            XCTAssertEqual(
                transform.alpha, expected.alpha, accuracy: Self.epsilon,
                "FocalPerspectiveGeometry.transform (d=\(distance)) doit rendre l'alpha du miroir GELÉ FocalFocusCurve.focusCurve(.thread)"
            )
        }
    }

    /// Le variant du FIL, pas celui de la LISTE (A3 « une forme, deux jeux de
    /// constantes »). À `d = 400` la liste et le fil divergent franchement —
    /// c'est le test qui attrape un `.list` copié-collé.
    func test_transform_usesThreadVariant_neverList() {
        let distance: CGFloat = 400
        let thread = FocalFocusCurve.focusCurve(distance: distance, variant: .thread)
        let list = FocalFocusCurve.focusCurve(distance: distance, variant: .list)
        let transform = geometry.transform(
            distance: distance,
            cellSize: CGSize(width: 320, height: 100),
            horizontalAnchor: .leading,
            isRightToLeft: false,
            alphaCeiling: FocalPassConstants.opaqueAlphaCeiling
        )
        XCTAssertEqual(transform.alpha, thread.alpha, accuracy: Self.epsilon,
                       "FocalPerspectiveGeometry doit consommer le variant .thread de FocalFocusCurve")
        XCTAssertNotEqual(transform.alpha, list.alpha, accuracy: Self.epsilon,
                          "le pass du FIL ne doit jamais consommer le variant .list (courbe de la Lentille)")
    }

    // =========================================================================
    // §4.3 — CORRECTION D'ANCRAGE (l'écart #2 du contrat)
    // =========================================================================

    /// Cas coté du §4.3, verbatim : `h = 100`, `s = 0.8` ⇒ `ty = −10`, et le
    /// bord `bounds.y = 0` (bord BAS visuel, après inversion) reste en place.
    /// La distance `190` est choisie pour que le miroir rende exactement
    /// `s = 0.8` — l'attendu reste dérivé du miroir, jamais posé en dur.
    func test_transform_anchorCorrection_keepsTheBottomEdgeFixed() {
        let height: CGFloat = 100
        let distance: CGFloat = 190
        let scale = FocalFocusCurve.focusCurve(distance: distance, variant: .thread).scale
        XCTAssertEqual(scale, 0.8, accuracy: Self.epsilon,
                       "pré-condition du cas coté §4.3 : d=190 doit rendre s=0.8 sur la courbe du fil")

        let transform = geometry.transform(
            distance: distance,
            cellSize: CGSize(width: 320, height: height),
            horizontalAnchor: .leading,
            isRightToLeft: false,
            alphaCeiling: FocalPassConstants.opaqueAlphaCeiling
        )

        XCTAssertEqual(
            transform.translation.height, -10, accuracy: Self.epsilon,
            "FocalPerspectiveGeometry.transform : ty = −(h/2)·(1−s) = −10 pour h=100, s=0.8 (cas coté §4.3) — sans cette translation, la cellule REMONTE en rétrécissant"
        )

        // Le bord `bounds.y = 0` est à −h/2 de l'ancre (0.5, 0.5). Après
        // `y' = s·y + ty` il doit être resté au même endroit.
        let edgeBefore = -height / 2
        let edgeAfter = scale * edgeBefore + transform.translation.height
        XCTAssertEqual(
            edgeAfter, edgeBefore, accuracy: Self.epsilon,
            "correction d'ancrage §4.3 : le bord bas visuel (bounds.y == 0, espace de CONTENU) doit être invariant par le transform"
        )
    }

    /// Généralisation : l'invariance du bord bas vaut pour TOUTE distance et
    /// TOUTE hauteur — pas seulement sur le cas coté.
    func test_transform_anchorCorrection_holdsForEveryDistanceAndHeight() {
        for height in [CGFloat(44), 100, 260, 640] {
            for distance in [CGFloat(0), 95, 190, 380, 1200] {
                let transform = geometry.transform(
                    distance: distance,
                    cellSize: CGSize(width: 320, height: height),
                    horizontalAnchor: .leading,
                    isRightToLeft: false,
                    alphaCeiling: FocalPassConstants.opaqueAlphaCeiling
                )
                let edgeBefore = -height / 2
                let edgeAfter = transform.scale * edgeBefore + transform.translation.height
                XCTAssertEqual(
                    edgeAfter, edgeBefore, accuracy: Self.epsilon,
                    "correction d'ancrage §4.3 rompue pour h=\(height), d=\(distance) — FocalPerspectiveGeometry.transform"
                )
            }
        }
    }

    /// `anchorPoint` n'est JAMAIS touché (§4.3, raisons (a)(b)(c)) : toute la
    /// correction passe par `m41`/`m42`. Preuve indirecte mais dure : à échelle
    /// pleine (`s == 1`) la translation doit être exactement nulle.
    func test_transform_atFullScale_translationIsZero() {
        let transform = geometry.transform(
            distance: 0,
            cellSize: CGSize(width: 320, height: 100),
            horizontalAnchor: .leading,
            isRightToLeft: false,
            alphaCeiling: FocalPassConstants.opaqueAlphaCeiling
        )
        XCTAssertEqual(transform.scale, 1, accuracy: Self.epsilon)
        XCTAssertEqual(transform.translation.width, 0, accuracy: Self.epsilon,
                       "FocalPerspectiveGeometry.transform : aucune translation à l'échelle pleine (sinon la rangée nette se décale)")
        XCTAssertEqual(transform.translation.height, 0, accuracy: Self.epsilon,
                       "FocalPerspectiveGeometry.transform : aucune translation à l'échelle pleine")
    }

    /// Ancrage horizontal du bord d'attaque (colonne pastille/nom) : négatif en
    /// LTR, positif en RTL, nul en `.center`.
    func test_transform_leadingAnchor_signsFollowLayoutDirection() {
        let size = CGSize(width: 320, height: 100)
        let ltr = geometry.transform(distance: 190, cellSize: size, horizontalAnchor: .leading,
                                     isRightToLeft: false, alphaCeiling: FocalPassConstants.opaqueAlphaCeiling)
        let rtl = geometry.transform(distance: 190, cellSize: size, horizontalAnchor: .leading,
                                     isRightToLeft: true, alphaCeiling: FocalPassConstants.opaqueAlphaCeiling)
        let centered = geometry.transform(distance: 190, cellSize: size, horizontalAnchor: .center,
                                          isRightToLeft: false, alphaCeiling: FocalPassConstants.opaqueAlphaCeiling)

        XCTAssertEqual(ltr.translation.width, -32, accuracy: Self.epsilon,
                       "FocalPerspectiveGeometry.transform : tx = −(w/2)·(1−s) en LTR (§4.3)")
        XCTAssertEqual(rtl.translation.width, 32, accuracy: Self.epsilon,
                       "FocalPerspectiveGeometry.transform : tx = +(w/2)·(1−s) en RTL (§4.3)")
        XCTAssertEqual(centered.translation.width, 0, accuracy: Self.epsilon,
                       "FocalPerspectiveGeometry.transform : tx = 0 pour l'ancre .center (§4.3)")
    }

    // =========================================================================
    // §4.4 — Plafond d'alpha (envoi optimiste)
    // =========================================================================

    /// `alpha = min(alphaCeiling, 1 − 0.82·f)` : dans la bande (`d == 0`), une
    /// rangée optimiste plafonne à `FocalPassConstants.optimisticAlphaCeiling`.
    func test_alphaCeiling_optimisticRow_capsInsideTheBand() {
        let transform = geometry.transform(
            distance: 0,
            cellSize: CGSize(width: 320, height: 100),
            horizontalAnchor: .leading,
            isRightToLeft: false,
            alphaCeiling: FocalPassConstants.optimisticAlphaCeiling
        )
        XCTAssertEqual(
            transform.alpha, FocalPassConstants.optimisticAlphaCeiling, accuracy: Self.epsilon,
            "§4.4 : une rangée optimiste plafonne à FocalPassConstants.optimisticAlphaCeiling même pile au focus"
        )
        XCTAssertEqual(transform.scale, 1, accuracy: Self.epsilon,
                       "§4.4 : le plafond d'alpha ne touche JAMAIS l'échelle")
    }

    /// Loin au-dessus de la bande, c'est la courbe qui gagne (elle passe sous
    /// le plafond) — `min`, pas « la valeur optimiste toujours ».
    func test_alphaCeiling_farFromBand_curveWinsOverCeiling() {
        let distance: CGFloat = 380
        let curveAlpha = FocalFocusCurve.focusCurve(distance: distance, variant: .thread).alpha
        let transform = geometry.transform(
            distance: distance,
            cellSize: CGSize(width: 320, height: 100),
            horizontalAnchor: .leading,
            isRightToLeft: false,
            alphaCeiling: FocalPassConstants.optimisticAlphaCeiling
        )
        XCTAssertLessThan(curveAlpha, FocalPassConstants.optimisticAlphaCeiling,
                          "pré-condition : à saturation la courbe du fil descend sous le plafond optimiste")
        XCTAssertEqual(transform.alpha, curveAlpha, accuracy: Self.epsilon,
                       "§4.4 : alpha = min(plafond, courbe) — le plafond ne doit jamais RELEVER une rangée estompée")
    }

    /// Le plafond par défaut (rangée confirmée) est l'opacité pleine.
    func test_alphaCeiling_confirmedRow_isOpaqueInsideTheBand() {
        let transform = geometry.transform(
            distance: 0,
            cellSize: CGSize(width: 320, height: 100),
            horizontalAnchor: .leading,
            isRightToLeft: false,
            alphaCeiling: FocalPassConstants.opaqueAlphaCeiling
        )
        XCTAssertEqual(transform.alpha, 1, accuracy: Self.epsilon,
                       "une rangée confirmée dans la bande est pleinement opaque (§4.3/§4.4)")
    }

    // =========================================================================
    // §4.9 — Reduce Motion
    // =========================================================================

    /// « Tout à 1, élection conservée » : le transform plat garde l'échelle 1,
    /// aucune translation, et l'alpha au PLAFOND (pas 1 — une rangée optimiste
    /// reste pâle, c'est une information produit, pas une animation).
    func test_flatTransform_reduceMotion_isIdentityAtCeiling() {
        let opaque = geometry.flatTransform(alphaCeiling: FocalPassConstants.opaqueAlphaCeiling)
        XCTAssertEqual(opaque.scale, 1, accuracy: Self.epsilon, "§4.9 : Reduce Motion ⇒ échelle 1")
        XCTAssertEqual(opaque.alpha, 1, accuracy: Self.epsilon, "§4.9 : Reduce Motion ⇒ alpha au plafond")
        XCTAssertEqual(opaque.translation, .zero, "§4.9 : Reduce Motion ⇒ aucune translation compensatoire (rien n'est mis à l'échelle)")

        let optimistic = geometry.flatTransform(alphaCeiling: FocalPassConstants.optimisticAlphaCeiling)
        XCTAssertEqual(
            optimistic.alpha, FocalPassConstants.optimisticAlphaCeiling, accuracy: Self.epsilon,
            "§4.9 : Reduce Motion garde le plafond optimiste — l'envoi en vol reste pâle"
        )
    }

    /// Les DEUX sources de Reduce Motion (§4.9) — la clé système ET la bascule
    /// in-app. Le défaut de 25+ vues du dépôt (lire la clé système seule) ne se
    /// reproduit pas ici.
    func test_renderingResolution_readsBothReduceMotionSources() {
        XCTAssertEqual(
            FocalScrollPass.resolveRendering(usesPerspective: true, systemReduceMotion: false, userForcedReduceMotion: false),
            .perspective,
            "FocalScrollPass.resolveRendering : mode Focal + aucune réduction ⇒ perspective"
        )
        XCTAssertEqual(
            FocalScrollPass.resolveRendering(usesPerspective: true, systemReduceMotion: true, userForcedReduceMotion: false),
            .flat,
            "FocalScrollPass.resolveRendering : Reduce Motion SYSTÈME ⇒ rendu plat (§4.9)"
        )
        XCTAssertEqual(
            FocalScrollPass.resolveRendering(usesPerspective: true, systemReduceMotion: false, userForcedReduceMotion: true),
            .flat,
            "FocalScrollPass.resolveRendering : bascule IN-APP (\\.meeshyForceReduceMotion) ⇒ rendu plat — la clé système seule ne suffit pas (§4.9)"
        )
        XCTAssertEqual(
            FocalScrollPass.resolveRendering(usesPerspective: false, systemReduceMotion: false, userForcedReduceMotion: false),
            .off,
            "FocalScrollPass.resolveRendering : mode sans perspective (Script/bulles) ⇒ pass éteint (§4.8 site 6)"
        )
    }

    // =========================================================================
    // §3.4 / §4.6 — Élection du focus (hystérésis du miroir gelé)
    // =========================================================================

    func test_election_picksTheClosestCandidateWhenNoCurrent() {
        let focusY = geometry.focusY(viewportHeight: 800, bottomClearance: 0)
        let candidates = [
            FocalFocusCurve.RowCandidate(id: "m0", midY: focusY + 100),
            FocalFocusCurve.RowCandidate(id: "m1", midY: focusY + 20),
            FocalFocusCurve.RowCandidate(id: "m2", midY: focusY - 60)
        ]
        XCTAssertEqual(
            geometry.electFocus(candidates: candidates, focusY: focusY, current: nil), "m1",
            "FocalPerspectiveGeometry.electFocus doit déléguer à FocalFocusCurve.electFocusRow (le plus proche gagne)"
        )
    }

    /// Hystérésis : le courant garde la main tant qu'il reste dans la bande,
    /// dont la demi-hauteur vient du miroir GELÉ (`focusBandHalfHeight`).
    func test_election_currentKeepsFocusInsideTheHysteresisBand() {
        let focusY = geometry.focusY(viewportHeight: 800, bottomClearance: 0)
        let candidates = [
            FocalFocusCurve.RowCandidate(id: "m1", midY: focusY + FocalFocusCurve.focusBandHalfHeight),
            FocalFocusCurve.RowCandidate(id: "m2", midY: focusY - 1)
        ]
        XCTAssertEqual(
            geometry.electFocus(candidates: candidates, focusY: focusY, current: "m1"), "m1",
            "hystérésis (§3.4) : le courant garde le focus à la borne INCLUSIVE ±FocalFocusCurve.focusBandHalfHeight — sinon la carte tremble au défilement"
        )
    }

    func test_election_currentLosesFocusOutsideTheHysteresisBand() {
        let focusY = geometry.focusY(viewportHeight: 800, bottomClearance: 0)
        let candidates = [
            FocalFocusCurve.RowCandidate(id: "m1", midY: focusY + FocalFocusCurve.focusBandHalfHeight + 1),
            FocalFocusCurve.RowCandidate(id: "m2", midY: focusY - 10)
        ]
        XCTAssertEqual(
            geometry.electFocus(candidates: candidates, focusY: focusY, current: "m1"), "m2",
            "hystérésis (§3.4) : hors bande, le plus proche reprend la carte"
        )
    }

    func test_election_noCandidates_yieldsNil() {
        XCTAssertNil(
            geometry.electFocus(candidates: [], focusY: 660, current: "m1"),
            "aucun candidat (jour/typing/start seuls à l'écran) ⇒ aucun focus"
        )
    }

    // =========================================================================
    // §4.5 — Inset de tête
    // =========================================================================

    /// La lecture du §4.5, prouvée de bout en bout : avec `headInset` ajouté à
    /// `contentInset.bottom`, l'offset MAXIMAL amène le centre du message le
    /// plus ancien exactement sur la ligne de focus.
    func test_headInset_letsTheOldestMessageReachTheFocusBand() {
        let viewport: CGFloat = 800
        let bottomClearance: CGFloat = 146      // composeur au repos
        let topInset: CGFloat = 59              // bande îlot
        let firstRowHeight: CGFloat = 64
        let contentHeight: CGFloat = 4000

        let focusY = geometry.focusY(viewportHeight: viewport, bottomClearance: bottomClearance)
        let headInset = geometry.headInset(
            viewportHeight: viewport,
            bottomClearance: bottomClearance,
            headClearance: topInset,
            firstRowHeight: firstRowHeight
        )
        XCTAssertGreaterThan(headInset, 0, "FocalPerspectiveGeometry.headInset doit être strictement positif sur un fil déroulé jusqu'au plus ancien (§4.5)")

        // maxOffset = contentSize.height − H + contentInset.bottom, où
        // contentInset.bottom == topInset + headInset (§4.5, applyTopInsetToViews).
        let maxOffset = contentHeight - viewport + topInset + headInset
        // Le message le plus ancien est le DERNIER item : son centre est à
        // contentHeight − firstRowHeight/2.
        let oldestVisualMidY = geometry.visualMidY(
            contentMidY: contentHeight - firstRowHeight / 2,
            contentOffsetY: maxOffset,
            viewportHeight: viewport
        )
        XCTAssertEqual(
            oldestVisualMidY, focusY, accuracy: Self.epsilon,
            "§4.5 : à l'offset maximal, le tout premier message doit atteindre EXACTEMENT la ligne de focus — sinon il se lit collé au haut de l'écran"
        )
    }

    func test_headInset_isClampedToZero_whenTheBandIsAlreadyReachable() {
        let inset = geometry.headInset(
            viewportHeight: 400,
            bottomClearance: 0,
            headClearance: 300,
            firstRowHeight: 600
        )
        XCTAssertEqual(inset, 0, accuracy: Self.epsilon,
                       "FocalPerspectiveGeometry.headInset : jamais négatif (clamp bas du §4.5)")
    }

    func test_headInset_isClampedToTheViewportRatio() {
        let viewport: CGFloat = 1000
        let inset = geometry.headInset(
            viewportHeight: viewport,
            bottomClearance: 0,
            headClearance: 0,
            firstRowHeight: 0
        )
        XCTAssertEqual(
            inset, viewport * FocalPassConstants.headInsetMaxRatio, accuracy: Self.epsilon,
            "FocalPerspectiveGeometry.headInset : plafonné à H · FocalPassConstants.headInsetMaxRatio (§4.5)"
        )
    }

    // =========================================================================
    // §4.7 — Atterrissage dans la bande (recherche, saut de citation)
    // =========================================================================

    func test_landingOffset_putsTheTargetCentreOnTheFocusLine() {
        let viewport: CGFloat = 800
        let bottomClearance: CGFloat = 146
        let targetCentre: CGFloat = 1000

        let focusY = geometry.focusY(viewportHeight: viewport, bottomClearance: bottomClearance)
        let offset = geometry.landingContentOffsetY(
            cellCenterY: targetCentre,
            viewportHeight: viewport,
            bottomClearance: bottomClearance,
            headClearance: 59,
            contentHeight: 4000
        )
        let landedMidY = geometry.visualMidY(contentMidY: targetCentre, contentOffsetY: offset, viewportHeight: viewport)
        XCTAssertLessThanOrEqual(
            abs(landedMidY - focusY), FocalPassConstants.landingTolerance,
            "§4.7 : après scrollToMessageFast, |visualMidY(cible) − focusY| doit rester ≤ FocalPassConstants.landingTolerance"
        )
    }

    func test_landingOffset_isClampedToTheScrollableRange() {
        let viewport: CGFloat = 800
        let bottomClearance: CGFloat = 146
        let headClearance: CGFloat = 59
        let contentHeight: CGFloat = 4000

        // Cible collée au bas du contenu (le message le plus récent) : la
        // bande voudrait un offset négatif au-delà du dégagement composeur.
        let tooLow = geometry.landingContentOffsetY(
            cellCenterY: 0, viewportHeight: viewport, bottomClearance: bottomClearance,
            headClearance: headClearance, contentHeight: contentHeight
        )
        XCTAssertEqual(
            tooLow, -bottomClearance, accuracy: Self.epsilon,
            "§4.7 : l'offset d'atterrissage ne descend jamais sous −contentInset.top (bas visuel) — FocalPerspectiveGeometry.landingContentOffsetY"
        )

        let tooHigh = geometry.landingContentOffsetY(
            cellCenterY: contentHeight - 1, viewportHeight: viewport, bottomClearance: bottomClearance,
            headClearance: headClearance, contentHeight: contentHeight
        )
        XCTAssertEqual(
            tooHigh, contentHeight - viewport + headClearance, accuracy: Self.epsilon,
            "§4.7 : l'offset d'atterrissage ne dépasse jamais contentSize.height − H + contentInset.bottom"
        )
    }

    /// Contenu plus court que le viewport : la plage de défilement est vide,
    /// `maxOffset` doit retomber sur `minOffset` (jamais l'inverse).
    func test_landingOffset_shortContent_collapsesToTheMinimum() {
        let offset = geometry.landingContentOffsetY(
            cellCenterY: 100, viewportHeight: 800, bottomClearance: 146,
            headClearance: 59, contentHeight: 200
        )
        XCTAssertEqual(offset, -146, accuracy: Self.epsilon,
                       "§4.7 : contenu plus court que l'écran ⇒ offset = minOffset (max(minOffset, …))")
    }

    // =========================================================================
    // §4.8 — Les SIX sites d'appel, en DONNÉES (leçon 257)
    // =========================================================================

    /// Le contrat dit « aucun n'est optionnel ». La liste vit donc en données,
    /// pas en prose : WS-6 (F-085) écrira sa garde de montage en ÉGALITÉ
    /// D'ENSEMBLES contre `FocalPassCallSite.allCases`.
    func test_callSites_areSixAndCarryTheirHostAnchor() {
        XCTAssertEqual(
            FocalPassCallSite.allCases.count, 6,
            "§4.8 : SIX sites d'appel, aucun optionnel — FocalPassCallSite doit tous les porter"
        )
        for site in FocalPassCallSite.allCases {
            XCTAssertFalse(
                site.hostAnchor.isEmpty,
                "FocalPassCallSite.\(site.rawValue) doit nommer son ancre hôte — c'est ce que la garde de montage de WS-6 grep dans MessageListViewController.swift"
            )
        }
        XCTAssertEqual(
            Set(FocalPassCallSite.allCases.map(\.hostAnchor)).count, 6,
            "les six ancres hôtes doivent être distinctes — deux sites qui partagent une ancre rendent la garde WS-6 aveugle à l'un des deux"
        )
    }
}

// =============================================================================
// Écriture réelle sur une UICollectionView INVERSÉE
// =============================================================================

/// Le double demandé par le contrat §WS-5 : une vraie `UICollectionView`
/// retournée (`CGAffineTransform(scaleX: 1, y: -1)`, comme
/// `MessageListViewController.swift:484`), montée en fenêtre, 20 cellules
/// factices de hauteur ABSOLUE (déterminisme : pas de self-sizing ici, la
/// hauteur estimée est le sujet de WS-6).
@MainActor
final class FocalScrollPassWriteTests: XCTestCase {

    private static let rowHeight: CGFloat = 80
    private static let viewport = CGSize(width: 390, height: 800)
    private static let itemCount = 20

    private var window: UIWindow!
    private var collectionView: UICollectionView!
    private var source: StubSource!

    override func setUp() async throws {
        try await super.setUp()
        let layout = UICollectionViewCompositionalLayout { _, _ in
            let size = NSCollectionLayoutSize(
                widthDimension: .fractionalWidth(1),
                heightDimension: .absolute(FocalScrollPassWriteTests.rowHeight)
            )
            let item = NSCollectionLayoutItem(layoutSize: size)
            let group = NSCollectionLayoutGroup.vertical(layoutSize: size, subitems: [item])
            let section = NSCollectionLayoutSection(group: group)
            section.interGroupSpacing = 0
            return section
        }

        collectionView = UICollectionView(
            frame: CGRect(origin: .zero, size: Self.viewport),
            collectionViewLayout: layout
        )
        collectionView.contentInsetAdjustmentBehavior = .never
        collectionView.transform = CGAffineTransform(scaleX: 1, y: -1)
        collectionView.register(UICollectionViewCell.self, forCellWithReuseIdentifier: StubSource.reuseId)
        source = StubSource(count: Self.itemCount)
        collectionView.dataSource = source

        window = UIWindow(frame: CGRect(origin: .zero, size: Self.viewport))
        window.rootViewController = UIViewController()
        window.rootViewController?.view.addSubview(collectionView)
        window.makeKeyAndVisible()
        collectionView.layoutIfNeeded()
    }

    override func tearDown() async throws {
        window.isHidden = true
        window = nil
        collectionView = nil
        source = nil
        try await super.tearDown()
    }

    // MARK: - Helpers

    private func makePass() -> FocalScrollPass {
        let pass = FocalScrollPass()
        pass.rendering = .perspective
        return pass
    }

    private func describeAll(_ indexPath: IndexPath) -> FocalScrollPass.CellDescriptor {
        FocalScrollPass.CellDescriptor(localId: "m\(indexPath.item)")
    }

    private func cell(_ item: Int) throws -> UICollectionViewCell {
        try XCTUnwrap(
            collectionView.cellForItem(at: IndexPath(item: item, section: 0)),
            "la cellule \(item) doit être réalisée — FocalScrollPassWriteTests monte 20 items de 80 pt dans un viewport de 800 pt"
        )
    }

    // MARK: - Zone nette / zone estompée

    /// Critère §WS-5 : « une cellule dont `visualMidY > focusY` (sous la bande)
    /// a `scale == 1` et `alpha == alphaCeiling` — la zone nette existe ».
    func test_apply_cellBelowTheBand_staysCrisp() throws {
        let pass = makePass()
        pass.apply(to: collectionView, describe: describeAll)

        let bottom = try cell(0)
        XCTAssertTrue(
            CATransform3DIsIdentity(bottom.layer.transform),
            "la cellule la plus récente (bas visuel, sous la bande) doit rester à l'identité — FocalScrollPass.apply"
        )
        XCTAssertEqual(bottom.alpha, 1, accuracy: 0.0001, "la zone nette est pleinement opaque (critère §WS-5)")
    }

    /// Loin au-dessus de la bande : la cellule DOIT être mise à l'échelle et
    /// estompée, avec exactement les valeurs de la courbe gelée.
    func test_apply_cellFarAboveTheBand_matchesTheFrozenCurve() throws {
        let pass = makePass()
        pass.apply(to: collectionView, describe: describeAll)

        let geometry = FocalPerspectiveGeometry.standard
        let viewport = collectionView.bounds.height
        let focusY = geometry.focusY(viewportHeight: viewport, bottomClearance: collectionView.contentInset.top)

        let index = 8
        let target = try cell(index)
        let visualMidY = geometry.visualMidY(
            contentMidY: target.center.y,
            contentOffsetY: collectionView.contentOffset.y,
            viewportHeight: viewport
        )
        let distance = geometry.distance(visualMidY: visualMidY, focusY: focusY)
        XCTAssertGreaterThan(distance, 0, "pré-condition : l'item \(index) doit être AU-DESSUS de la bande de focus")

        let expected = FocalFocusCurve.focusCurve(distance: distance, variant: .thread)
        XCTAssertEqual(target.layer.transform.m11, expected.scale, accuracy: 0.0001,
                       "FocalScrollPass.apply doit écrire l'échelle de FocalFocusCurve.focusCurve(.thread) dans m11")
        XCTAssertEqual(target.layer.transform.m22, expected.scale, accuracy: 0.0001,
                       "FocalScrollPass.apply doit écrire la même échelle en Y (échelle pure, symétrique en signe — elle traverse l'inversion parentale, §4.3)")
        XCTAssertEqual(target.alpha, expected.alpha, accuracy: 0.0001,
                       "FocalScrollPass.apply doit écrire l'alpha de la courbe gelée")
        XCTAssertEqual(
            target.layer.transform.m42,
            -(target.bounds.height / 2) * (1 - expected.scale),
            accuracy: 0.0001,
            "FocalScrollPass.apply doit écrire la translation compensatoire ty = −(h/2)(1−s) dans m42 (§4.3) — jamais toucher anchorPoint"
        )
    }

    /// Idempotence (§4.2) : le pass est appelé depuis six sites, le rejouer
    /// doit rendre le même transform. Ce test attrape la lecture de
    /// `cell.frame` (dépendante du transform déjà posé) au lieu de
    /// `cell.center`/`cell.bounds`.
    func test_apply_isIdempotent_acrossRepeatedCalls() throws {
        let pass = makePass()
        pass.apply(to: collectionView, describe: describeAll)
        let first = try cell(8).layer.transform
        let firstAlpha = try cell(8).alpha

        pass.apply(to: collectionView, describe: describeAll)
        pass.apply(to: collectionView, describe: describeAll)

        XCTAssertTrue(
            CATransform3DEqualToTransform(try cell(8).layer.transform, first),
            "FocalScrollPass.apply doit être idempotent (§4.2) — il lit cell.center/cell.bounds, JAMAIS cell.frame qui intègre déjà le transform posé"
        )
        XCTAssertEqual(try cell(8).alpha, firstAlpha, accuracy: 0.0001,
                       "FocalScrollPass.apply doit être idempotent sur l'alpha aussi")
    }

    // MARK: - Filtrage des cellules non éligibles (§4.8)

    /// `localId == nil` (jour, typing, début de conversation) : remise à
    /// l'identité, JAMAIS mise à l'échelle, même très loin de la bande.
    func test_apply_ineligibleCells_areResetToIdentity() throws {
        let pass = makePass()
        pass.apply(to: collectionView) { indexPath in
            indexPath.item == 8
                ? FocalScrollPass.CellDescriptor.ineligible
                : FocalScrollPass.CellDescriptor(localId: "m\(indexPath.item)")
        }

        let dayHeader = try cell(8)
        XCTAssertTrue(
            CATransform3DIsIdentity(dayHeader.layer.transform),
            "§4.8 : une cellule .dayHeader/.typingIndicator/.conversationStart (localId nil) est remise à l'identité, jamais mise à l'échelle"
        )
        XCTAssertEqual(dayHeader.alpha, 1, accuracy: 0.0001, "§4.8 : une cellule non éligible reste pleinement opaque")
    }

    func test_apply_ineligibleCells_neverWinTheFocus() {
        let pass = makePass()
        let focused = pass.apply(to: collectionView) { _ in FocalScrollPass.CellDescriptor.ineligible }
        XCTAssertNil(focused, "§4.8 : une cellule sans localId ne peut pas être élue — aucune carte de focus sur un séparateur de jour")
        XCTAssertNil(pass.focusedLocalId, "FocalScrollPass.focusedLocalId doit rester nil quand aucun candidat n'est éligible")
    }

    // MARK: - Élection sur la vraie géométrie

    func test_apply_electsTheRowClosestToTheFocusLine() throws {
        let pass = makePass()
        let focused = pass.apply(to: collectionView, describe: describeAll)

        let geometry = FocalPerspectiveGeometry.standard
        let viewport = collectionView.bounds.height
        let focusY = geometry.focusY(viewportHeight: viewport, bottomClearance: collectionView.contentInset.top)

        var bestId: String?
        var bestDistance = CGFloat.greatestFiniteMagnitude
        for index in 0..<Self.itemCount {
            guard let realized = collectionView.cellForItem(at: IndexPath(item: index, section: 0)) else { continue }
            let midY = geometry.visualMidY(
                contentMidY: realized.center.y,
                contentOffsetY: collectionView.contentOffset.y,
                viewportHeight: viewport
            )
            let distance = abs(midY - focusY)
            if distance < bestDistance {
                bestDistance = distance
                bestId = "m\(index)"
            }
        }

        XCTAssertEqual(
            focused, bestId,
            "FocalScrollPass.apply doit élire la rangée dont le visualMidY est le plus proche de focusY (§3.4) — élection calculée sur la géométrie INVERSÉE"
        )
        XCTAssertEqual(pass.focusedLocalId, focused, "FocalScrollPass.focusedLocalId doit refléter la valeur renvoyée par apply")
    }

    // MARK: - §4.4 plafond optimiste sur une cellule réelle

    func test_apply_optimisticRow_capsItsAlpha() throws {
        let pass = makePass()
        pass.apply(to: collectionView) { indexPath in
            FocalScrollPass.CellDescriptor(
                localId: "m\(indexPath.item)",
                alphaCeiling: indexPath.item == 0 ? FocalPassConstants.optimisticAlphaCeiling : FocalPassConstants.opaqueAlphaCeiling
            )
        }
        XCTAssertEqual(
            try cell(0).alpha, FocalPassConstants.optimisticAlphaCeiling, accuracy: 0.0001,
            "§4.4 : la rangée optimiste plafonne à FocalPassConstants.optimisticAlphaCeiling — et c'est le PASS qui écrit cell.alpha, jamais la rangée"
        )
    }

    // MARK: - §4.9 Reduce Motion

    func test_apply_reduceMotion_writesNoTransformButKeepsTheElection() throws {
        let pass = FocalScrollPass()
        pass.rendering = .flat
        let focused = pass.apply(to: collectionView, describe: describeAll)

        XCTAssertNotNil(focused, "§4.9 : Reduce Motion CONSERVE l'élection — la surbrillance survit, l'animation non")
        for index in [0, 4, 8] {
            XCTAssertTrue(
                CATransform3DIsIdentity(try cell(index).layer.transform),
                "§4.9 : Reduce Motion ⇒ aucun transform sur la cellule \(index) (FocalScrollPass.apply, rendering == .flat)"
            )
            XCTAssertEqual(try cell(index).alpha, 1, accuracy: 0.0001,
                           "§4.9 : Reduce Motion ⇒ alpha au plafond, pas la courbe")
        }
    }

    /// Mode sans perspective (Script, bulles) : le pass ne participe pas —
    /// tout à l'identité, plus aucun focus (§4.8 site 6).
    func test_apply_whenOff_resetsEverythingAndDropsTheFocus() throws {
        let pass = makePass()
        pass.apply(to: collectionView, describe: describeAll)
        XCTAssertNotNil(pass.focusedLocalId, "pré-condition : un focus est élu en mode Focal")

        pass.rendering = .off
        let focused = pass.apply(to: collectionView, describe: describeAll)

        XCTAssertNil(focused, "§4.8 site 6 : passer en Script doit remettre tout à l'identité et abandonner le focus")
        XCTAssertNil(pass.focusedLocalId, "FocalScrollPass.focusedLocalId doit retomber à nil quand le pass s'éteint")
        for index in [0, 4, 8] {
            XCTAssertTrue(
                CATransform3DIsIdentity(try cell(index).layer.transform),
                "§4.8 site 6 : la cellule \(index) doit revenir à l'identité en mode Script"
            )
            XCTAssertEqual(try cell(index).alpha, 1, accuracy: 0.0001, "§4.8 site 6 : alpha rétabli à 1 en mode Script")
        }
    }

    // MARK: - Reset des cellules recyclées (§4.8, « aucun prepareForReuse »)

    func test_reset_returnsARecycledCellToIdentity() throws {
        let pass = makePass()
        pass.apply(to: collectionView, describe: describeAll)

        let recycled = try cell(8)
        XCTAssertFalse(CATransform3DIsIdentity(recycled.layer.transform), "pré-condition : la cellule 8 porte un transform")

        pass.reset(recycled)
        XCTAssertTrue(
            CATransform3DIsIdentity(recycled.layer.transform),
            "FocalScrollPass.reset doit rendre la cellule à l'identité — sans lui, une cellule recyclée hérite du transform de son occupant précédent (§4.8)"
        )
        XCTAssertEqual(recycled.alpha, 1, accuracy: 0.0001, "FocalScrollPass.reset doit rétablir alpha = 1")
    }

    func test_resetAll_clearsEveryVisibleCell() throws {
        let pass = makePass()
        pass.apply(to: collectionView, describe: describeAll)
        pass.resetAll(in: collectionView)

        for cell in collectionView.visibleCells {
            XCTAssertTrue(
                CATransform3DIsIdentity(cell.layer.transform),
                "FocalScrollPass.resetAll doit remettre TOUTES les cellules visibles à l'identité"
            )
            XCTAssertEqual(cell.alpha, 1, accuracy: 0.0001, "FocalScrollPass.resetAll doit rétablir alpha = 1 partout")
        }
        XCTAssertNil(pass.focusedLocalId, "FocalScrollPass.resetAll abandonne le focus courant")
    }

    // MARK: - Site 2 : la cellule entrante seule (willDisplay)

    /// `scrollViewDidScroll` ne se déclenche pas quand une cellule se réalise
    /// sans changement d'offset — le site 2 traite la cellule entrante SEULE,
    /// et ne doit surtout pas ré-élire le focus sur ce candidat unique.
    func test_applySingleCell_writesItsTransformWithoutStealingTheFocus() throws {
        let pass = makePass()
        pass.apply(to: collectionView, describe: describeAll)
        let electedBefore = pass.focusedLocalId

        let incoming = try cell(9)
        incoming.layer.transform = CATransform3DIdentity
        pass.apply(to: incoming, in: collectionView, descriptor: FocalScrollPass.CellDescriptor(localId: "m9"))

        XCTAssertFalse(
            CATransform3DIsIdentity(incoming.layer.transform),
            "§4.8 site 2 : la cellule entrante doit recevoir son transform immédiatement (sinon elle apparaît nette puis saute)"
        )
        XCTAssertEqual(
            pass.focusedLocalId, electedBefore,
            "§4.8 site 2 : traiter UNE cellule ne doit jamais ré-élire le focus — un candidat unique gagnerait toujours"
        )
    }

    // MARK: - Stub de data source

    @MainActor
    final class StubSource: NSObject, UICollectionViewDataSource {
        static let reuseId = "focal.stub.cell"
        private let count: Int

        init(count: Int) {
            self.count = count
            super.init()
        }

        func collectionView(_ collectionView: UICollectionView, numberOfItemsInSection section: Int) -> Int { count }

        func collectionView(_ collectionView: UICollectionView, cellForItemAt indexPath: IndexPath) -> UICollectionViewCell {
            collectionView.dequeueReusableCell(withReuseIdentifier: Self.reuseId, for: indexPath)
        }
    }
}
