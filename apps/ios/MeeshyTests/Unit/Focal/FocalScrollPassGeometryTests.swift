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
    /// empêche la bande de coller au bord bas. `bandLift` vient du miroir de
    /// la bande du FIL (`FocalFocusCurve.threadFocusBandOffset` = 150, spec
    /// §5 « focusY = bas − 150 »), jamais d'un littéral — et jamais la bande
    /// de la LISTE (140), qui reste à la Lentille.
    func test_focusY_composerHidden_floorsOnBandLift() {
        let focusY = geometry.focusY(viewportHeight: 800, bottomClearance: 0)
        XCTAssertEqual(
            focusY, 800 - FocalFocusCurve.threadFocusBandOffset, accuracy: Self.epsilon,
            "FocalPerspectiveGeometry.focusY : composeur masqué ⇒ H − FocalFocusCurve.threadFocusBandOffset (plancher de bande, spec §5)"
        )
        XCTAssertEqual(
            focusY, 800 - 150, accuracy: Self.epsilon,
            "spec §5 : le plancher de la bande du fil est 150 — pas le 140 de la liste"
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

    /// L'ÉCHELLE et l'ALPHA ne se réécrivent JAMAIS : pour une même distance,
    /// le transform du pass doit rendre exactement
    /// `FocalFocusCurve.focusCurve(_, .thread)` — fondu de distance COMPRIS
    /// (rétabli 2026-08-18 par le réancrage sur la spec §5 : `alpha =
    /// min(plafond, 1 − 0.82f)`, plancher 0.18).
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
                "FocalPerspectiveGeometry.transform (d=\(distance)) doit rendre l'échelle du miroir FocalFocusCurve.focusCurve(.thread) — aucune constante recopiée"
            )
            XCTAssertEqual(
                transform.alpha,
                min(FocalPassConstants.opaqueAlphaCeiling, expected.alpha),
                accuracy: Self.epsilon,
                "spec §5 (réancrée 2026-08-18) : alpha = min(plafond, alpha de la courbe) — le fondu de distance est RÉTABLI (d=\(distance))"
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
        XCTAssertEqual(transform.scale, thread.scale, accuracy: Self.epsilon,
                       "FocalPerspectiveGeometry doit consommer le variant .thread de FocalFocusCurve")
        XCTAssertNotEqual(transform.scale, list.scale, accuracy: Self.epsilon,
                          "le pass du FIL ne doit jamais consommer le variant .list (courbe de la Lentille)")
    }

    // =========================================================================
    // §4.3 — CORRECTION D'ANCRAGE (l'écart #2 du contrat)
    // =========================================================================

    /// Distance qui rend EXACTEMENT `s = 0.8` sur la courbe du fil, redérivée
    /// du miroir GELÉ à chaque exécution :
    ///
    ///     s = 1 − scaleDecay · min(1, d / maxDistance)
    ///     0.8 = 1 − scaleDecay · d/maxDistance
    ///     d   = maxDistance · (1 − 0.8) / scaleDecay
    ///
    /// Sous la loi SPEC (`maxDistance = 380`, `scaleDecay = 0.40` — spec
    /// « Focal Grandeur Nature » §5, réancrée 2026-08-18, miroir de
    /// `FOCUS_CURVE_CONSTANTS.thread`) : `d = 380 · 0.2 / 0.40 = 190`,
    /// `f = 190/380 = 0.5`, `s = 1 − 0.40 · 0.5 = 0.8` ✓ — le cas coté
    /// retombe exactement sur le `190` historique du contrat.
    ///
    /// Écrite en formule plutôt qu'en nombre : garde R15, l'attendu se dérive
    /// du miroir, jamais posé en dur — c'est ce qui a laissé ce test vert à
    /// travers DEUX amendements de la loi (`380→520` puis `520→380`).
    private static let distanceForScale080: CGFloat =
        FocalFocusCurve.threadMaxDistance * (0.2 / FocalFocusCurve.threadScaleDecay)

    /// Cas coté du §4.3, verbatim : `h = 100`, `s = 0.8` ⇒ `ty = −10`, et le
    /// bord `bounds.y = 0` (bord BAS visuel, après inversion) reste en place.
    /// La distance est choisie pour que le miroir rende exactement `s = 0.8`
    /// — l'attendu reste dérivé du miroir, jamais posé en dur.
    ///
    /// **Recalibré — déplacé par `0612c8ca` (« transpose la cinématique de la
    /// maquette de référence — constantes ET pivot »), l'invariant est
    /// inchangé :** le bord BAS visuel reste invariant par le transform, et le
    /// cas coté du contrat (`h = 100`, `s = 0.8`, `ty = −10`) est reproduit
    /// VERBATIM. Seule la distance qui produit ce `s = 0.8` a bougé, parce que
    /// la loi gelée a été amendée sous elle (`380/0.40` → `520/0.38`) ; elle
    /// est désormais redérivée du miroir (`distanceForScale080`) au lieu
    /// d'être figée.
    func test_transform_anchorCorrection_keepsTheBottomEdgeFixed() {
        let height: CGFloat = 100
        let distance = Self.distanceForScale080
        let scale = FocalFocusCurve.focusCurve(distance: distance, variant: .thread).scale
        XCTAssertEqual(scale, 0.8, accuracy: Self.epsilon,
                       "pré-condition du cas coté §4.3 : la distance dérivée du miroir doit rendre s=0.8 sur la courbe du fil")

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
    ///
    /// **Recalibré — déplacé par `0612c8ca` (« transpose la cinématique de la
    /// maquette de référence — constantes ET pivot »), l'invariant est
    /// inchangé :** les SIGNES suivent toujours la direction de lecture, et
    /// l'ancre `.center` ne translate toujours pas. Ce que ce commit a changé,
    /// c'est le PIVOT de l'échelle : la maquette de référence
    /// (`docs/design/2026-08-15-conversation-modes-verdict.html`) écrit
    /// `transform-origin: "18% bottom"`, si bien que la compensation ne vaut
    /// plus une demi-largeur mais `(0.5 − 0.18)` de largeur. L'attendu est
    /// donc recalculé, jamais relâché — et la MAGNITUDE est asserted comme
    /// avant, pas seulement le signe.
    ///
    /// **Le calcul, à la main, depuis la loi spec.**
    ///
    /// 1. Distance : `d = distanceForScale080 = 380 · 0.2 / 0.40 = 190`
    /// 2. Facteur  : `f = min(1, d/380) = 0.5`
    /// 3. Échelle  : `s = 1 − 0.40 · f = 0.80`, donc `shrink = 1 − s = 0.20`
    /// 4. Pivot    : `0.5 − threadHorizontalPivot = 0.5 − 0.16 = 0.34`
    /// 5. `|tx| = w · 0.34 · shrink = 320 · 0.34 · 0.20 = `**`21.76`**
    ///
    /// **Pourquoi le nombre ET la formule.** Le pivot est une cote de
    /// cinématique, pas de courbe ; son domicile normatif est désormais la
    /// SPEC (`docs/design/2026-08-15-focal-spec-integration.html` §5,
    /// `anchorPoint (0.16, 1.0)` — réancrée 2026-08-18, remplace le
    /// `18% bottom` de la maquette vol. 3). Les deux assertions n'ancrent
    /// donc pas au même endroit — le `21.76` tient la production à la SPEC,
    /// la formule la tient au MIROIR — et il faut les deux : la formule seule
    /// laisserait passer un miroir qu'on aurait éloigné de la référence, le
    /// nombre seul laisserait passer une géométrie qui aurait cessé de lire le
    /// miroir. Aucune n'est redondante.
    func test_transform_leadingAnchor_signsFollowLayoutDirection() {
        let size = CGSize(width: 320, height: 100)
        let distance = Self.distanceForScale080
        let ltr = geometry.transform(distance: distance, cellSize: size, horizontalAnchor: .leading,
                                     isRightToLeft: false, alphaCeiling: FocalPassConstants.opaqueAlphaCeiling)
        let rtl = geometry.transform(distance: distance, cellSize: size, horizontalAnchor: .leading,
                                     isRightToLeft: true, alphaCeiling: FocalPassConstants.opaqueAlphaCeiling)
        let centered = geometry.transform(distance: distance, cellSize: size, horizontalAnchor: .center,
                                          isRightToLeft: false, alphaCeiling: FocalPassConstants.opaqueAlphaCeiling)

        // 320 · (0.5 − 0.16) · 0.20 — cf. le calcul détaillé ci-dessus.
        XCTAssertEqual(ltr.translation.width, -21.76, accuracy: Self.epsilon,
                       "FocalPerspectiveGeometry.transform : tx = −w·(0.5 − pivot)·(1−s) en LTR (spec §5, anchorPoint x = 0.16)")
        XCTAssertEqual(rtl.translation.width, 21.76, accuracy: Self.epsilon,
                       "FocalPerspectiveGeometry.transform : tx = +w·(0.5 − pivot)·(1−s) en RTL (§4.3)")
        XCTAssertEqual(centered.translation.width, 0, accuracy: Self.epsilon,
                       "FocalPerspectiveGeometry.transform : tx = 0 pour l'ancre .center (§4.3)")

        // Les DEUX directions sont exactement opposées — le pivot déplace la
        // magnitude, jamais la symétrie (c'est cette symétrie, et non le
        // nombre, qui fait de `.leading` un bord d'ATTAQUE).
        XCTAssertEqual(ltr.translation.width, -rtl.translation.width, accuracy: Self.epsilon,
                       "LTR et RTL doivent rester rigoureusement opposés — le pivot change la magnitude, jamais la symétrie de direction")

        // Le pivot et l'échelle sont LUS dans le miroir, jamais recopiés : si
        // `0612c8ca` est un jour amendé à son tour, c'est CETTE assertion qui
        // dira que le `20.48` ci-dessus a cessé de décrire la loi.
        let shrink = 1 - FocalFocusCurve.focusCurve(distance: distance, variant: .thread).scale
        let expected = size.width * (0.5 - FocalFocusCurve.threadHorizontalPivot) * shrink
        XCTAssertEqual(abs(ltr.translation.width), expected, accuracy: Self.epsilon,
                       "la magnitude de tx doit rester `w · (0.5 − threadHorizontalPivot) · (1 − s)` — dérivée du miroir, jamais d'un littéral survivant à un amendement")
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

    /// Loin au-dessus de la bande, c'est la COURBE qui domine le plafond —
    /// `alpha = min(0.7, 1 − 0.82f)` (spec §5, fondu rétabli 2026-08-18) :
    /// à `d = 380`, la courbe rend son plancher 0.18 < 0.7. Le plafond ne
    /// RELÈVE jamais une rangée estompée par la distance.
    func test_alphaCeiling_farFromBand_curveDominatesTheCeiling() {
        let transform = geometry.transform(
            distance: 380,
            cellSize: CGSize(width: 320, height: 100),
            horizontalAnchor: .leading,
            isRightToLeft: false,
            alphaCeiling: FocalPassConstants.optimisticAlphaCeiling
        )
        let curve = FocalFocusCurve.focusCurve(distance: 380, variant: .thread)
        XCTAssertEqual(transform.alpha, curve.alpha, accuracy: Self.epsilon,
                       "spec §5 : alpha = min(plafond optimiste, alpha de la courbe) — loin de la bande, la courbe (0.18) domine le plafond (0.7)")
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

    /// Hystérésis : le courant garde la main tant qu'il reste dans la bande
    /// du FIL, dont la demi-hauteur vient du miroir
    /// (`threadFocusBandHysteresis` = 95, spec §5 / recette §7 « sans
    /// oscillation entre deux rangées (hystérésis 95 px) » — plus jamais le
    /// 45 de la bande de la LISTE, qui faisait trembler l'élection entre deux
    /// rangées hautes).
    func test_election_currentKeepsFocusInsideTheHysteresisBand() {
        let focusY = geometry.focusY(viewportHeight: 800, bottomClearance: 0)
        let candidates = [
            FocalFocusCurve.RowCandidate(id: "m1", midY: focusY + FocalFocusCurve.threadFocusBandHysteresis),
            FocalFocusCurve.RowCandidate(id: "m2", midY: focusY - 1)
        ]
        XCTAssertEqual(
            geometry.electFocus(candidates: candidates, focusY: focusY, current: "m1"), "m1",
            "hystérésis (spec §5) : le courant garde le focus à la borne INCLUSIVE ±FocalFocusCurve.threadFocusBandHysteresis — sinon la carte tremble au défilement"
        )
        XCTAssertEqual(
            FocalFocusCurve.threadFocusBandHysteresis, 95, accuracy: Self.epsilon,
            "recette §7 : l'hystérésis du fil est 95 px — 45 est la demi-bande de la LISTE (Lentille), pas du fil"
        )
    }

    func test_election_currentLosesFocusOutsideTheHysteresisBand() {
        let focusY = geometry.focusY(viewportHeight: 800, bottomClearance: 0)
        let candidates = [
            FocalFocusCurve.RowCandidate(id: "m1", midY: focusY + FocalFocusCurve.threadFocusBandHysteresis + 1),
            FocalFocusCurve.RowCandidate(id: "m2", midY: focusY - 10)
        ]
        XCTAssertEqual(
            geometry.electFocus(candidates: candidates, focusY: focusY, current: "m1"), "m2",
            "hystérésis (spec §5) : hors bande, le plus proche reprend la carte"
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
    // §4.7bis — Atterrissage d'élection (zone d'activation sans conflit)
    // =========================================================================

    /// Un élu dont le bord bas visuel passe sous le composeur est ramené à
    /// `gap` points au-dessus : `offset = minY − bottomClearance − gap`.
    /// Vérification : H=800, inset.top=180, gap=12, minY=1140, offset=1000
    /// ⇒ visualBottom = 800 − (1140−1000) = 660 > 800−180−12 = 608 ⇒ cible 948.
    func test_settleOffset_straddlingElected_landsAboveTheComposer() throws {
        let offset = geometry.settleContentOffsetY(
            cellMinY: 1140, currentOffsetY: 1000, viewportHeight: 800,
            bottomClearance: 180, headClearance: 0, contentHeight: 3000, gap: 12
        )
        XCTAssertEqual(
            try XCTUnwrap(offset), 948, accuracy: Self.epsilon,
            "§4.7bis : l'élu qui chevauche le composeur atterrit bord bas à `gap` du haut du composeur — offset = minY − bottomClearance − gap"
        )
    }

    /// Élu déjà au clair (bord bas au-dessus du composeur + gap) : AUCUN
    /// mouvement — le nudge ne doit jamais se faire sentir quand tout va bien.
    func test_settleOffset_electedAlreadyClear_returnsNil() {
        let offset = geometry.settleContentOffsetY(
            cellMinY: 1200, currentOffsetY: 1000, viewportHeight: 800,
            bottomClearance: 180, headClearance: 0, contentHeight: 3000, gap: 12
        )
        XCTAssertNil(offset, "§4.7bis : un élu déjà entièrement au-dessus du composeur ne déclenche aucun nudge")
    }

    /// Au bas du fil (offset = −inset.top), le message le plus récent frôle
    /// toujours le composeur par construction : le clamp rend le déplacement
    /// nul et le fil ne bouge pas.
    func test_settleOffset_atConversationBottom_clampNeutralizesTheNudge() {
        let offset = geometry.settleContentOffsetY(
            cellMinY: 0, currentOffsetY: -180, viewportHeight: 800,
            bottomClearance: 180, headClearance: 0, contentHeight: 3000, gap: 12
        )
        XCTAssertNil(offset, "§4.7bis : au bas du fil, le clamp à −bottomClearance neutralise le nudge — on ne repousse jamais le dernier message")
    }

    /// La cible est bornée à la plage réellement défilable, comme
    /// `landingContentOffsetY` (§4.7).
    func test_settleOffset_clampsToTheScrollableRange() throws {
        let offset = geometry.settleContentOffsetY(
            cellMinY: 400, currentOffsetY: 290, viewportHeight: 800,
            bottomClearance: 180, headClearance: 100, contentHeight: 900, gap: 12
        )
        XCTAssertEqual(
            try XCTUnwrap(offset), 200, accuracy: Self.epsilon,
            "§4.7bis : la cible est bornée à contentSize.height − H + headClearance (900 − 800 + 100 = 200)"
        )
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

    private static func describeAll(_ indexPath: IndexPath) -> FocalScrollPass.CellDescriptor {
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
        pass.apply(to: collectionView, describe: Self.describeAll)

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
        pass.apply(to: collectionView, describe: Self.describeAll)

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
                       "spec §5 (réancrée 2026-08-18) : le fondu de distance est RÉTABLI — l'alpha écrit est celui de la courbe gelée (min avec le plafond, ici 1)")
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
        pass.apply(to: collectionView, describe: Self.describeAll)
        let first = try cell(8).layer.transform
        let firstAlpha = try cell(8).alpha

        pass.apply(to: collectionView, describe: Self.describeAll)
        pass.apply(to: collectionView, describe: Self.describeAll)

        XCTAssertTrue(
            CATransform3DEqualToTransform(try cell(8).layer.transform, first),
            "FocalScrollPass.apply doit être idempotent (§4.2) — il lit cell.center/cell.bounds, JAMAIS cell.frame qui intègre déjà le transform posé"
        )
        XCTAssertEqual(try cell(8).alpha, firstAlpha, accuracy: 0.0001,
                       "FocalScrollPass.apply doit être idempotent sur l'alpha aussi")
    }

    /// **La contrepartie BÉHAVIORALE de l'exception `cell.frame`.**
    ///
    /// `isFullyVisible` est le seul endroit du pass qui lise `cell.frame`, et
    /// c'est délibéré (« on teste ce que l'œil voit, pas la boîte de layout »).
    /// La garde source `test_pass_readsCenterAndBounds_neverFrame` a donc dû
    /// nommer cette exception au lieu de l'interdire — et une interdiction qui
    /// s'assouplit doit être remplacée, pas seulement documentée.
    ///
    /// Ce qu'elle protégeait, c'est l'IDEMPOTENCE : `frame` intègre le
    /// transform déjà écrit, donc une lecture mal placée ferait dériver le
    /// résultat d'une passe à l'autre (et il y a six sites d'appel). Ici on
    /// l'éprouve directement, sur la vraie collection inversée : le verdict de
    /// visibilité doit être STABLE en rejouant la passe. Il l'est parce que la
    /// lecture suit l'écriture de la MÊME passe (première boucle : tous les
    /// transforms ; seconde boucle : la décoration), et que le transform est
    /// une fonction déterministe d'entrées elles-mêmes invariantes par lui
    /// (`center`, `bounds`, `contentOffset`, `contentInset`).
    ///
    /// Une lecture de `frame` qui se glisserait dans l'ARITHMÉTIQUE ferait
    /// tomber le témoin d'idempotence ci-dessus ; une lecture qui rendrait le
    /// VERDICT instable fait tomber celui-ci. Les deux moitiés de l'invariant
    /// §4.2 sont couvertes, quoi que dise le grep.
    func test_isFullyVisible_verdictIsStableAcrossRepeatedPasses() throws {
        let pass = makePass()
        pass.apply(to: collectionView, describe: Self.describeAll)

        var first: [Int: Bool] = [:]
        for index in 0..<Self.itemCount {
            guard let realized = collectionView.cellForItem(at: IndexPath(item: index, section: 0)) else { continue }
            first[index] = pass.isFullyVisible(realized, in: collectionView)
        }
        XCTAssertFalse(first.isEmpty, "pré-condition : au moins une cellule réalisée par ce montage")

        // 1. Rejeu pur — six sites d'appel, la passe tourne plusieurs fois par
        //    frame sans que rien n'ait bougé entre-temps.
        pass.apply(to: collectionView, describe: Self.describeAll)
        pass.apply(to: collectionView, describe: Self.describeAll)

        for (index, expected) in first {
            guard let realized = collectionView.cellForItem(at: IndexPath(item: index, section: 0)) else { continue }
            XCTAssertEqual(
                pass.isFullyVisible(realized, in: collectionView), expected,
                "§4.2 : le verdict d'`isFullyVisible` doit être IDENTIQUE après rejeu de la passe (cellule \(index)) — la décoration ne doit pas dépendre du nombre de passes déjà jouées"
            )
        }

        // 2. Le cas RÉEL de la dérive : une re-mesure a remis la cellule à
        //    l'identité, la passe la repose. Un pass qui nourrirait son calcul
        //    de la sortie de la frame PRÉCÉDENTE verrait ici deux boîtes
        //    différentes ; le verdict doit pourtant retomber sur le même.
        let verdictBefore = try XCTUnwrap(first[8], "pré-condition : la cellule 8 doit être réalisée")
        let erased = try cell(8)
        erased.layer.transform = CATransform3DIdentity
        pass.apply(to: collectionView, describe: Self.describeAll)
        XCTAssertEqual(
            pass.isFullyVisible(try cell(8), in: collectionView), verdictBefore,
            "§4.2 : après effacement du transform par une re-mesure puis repose, le verdict d'`isFullyVisible` doit retomber EXACTEMENT sur le même — c'est la seule lecture de `cell.frame` du pass, et c'est ce qui borne l'exception nommée dans `test_pass_readsCenterAndBounds_neverFrame`"
        )
    }

    // MARK: - Filtrage des cellules non éligibles (§4.8)

    /// `localId == nil` (jour, typing, début de conversation) : la cellule
    /// SUIT la perspective comme n'importe quelle rangée — elle ne fait que
    /// rester hors de l'élection.
    ///
    /// Règle reprise de la maquette de référence, dont le sélecteur balaie
    /// `.msg, .daysep, .pont, .agent` et n'élit que parmi `.msg`
    /// (`docs/design/2026-08-15-conversation-modes-verdict.html`). L'ancienne
    /// version de ce test exigeait l'identité : à l'écran, les pastilles de
    /// date flottaient alors en taille et opacité pleines par-dessus un texte
    /// réduit, et se chevauchaient entre elles.
    func test_apply_ineligibleCells_followThePerspectiveLikeAnyRow() throws {
        let pass = makePass()
        pass.apply(to: collectionView) { indexPath in
            indexPath.item == 8
                ? FocalScrollPass.CellDescriptor.ineligible
                : FocalScrollPass.CellDescriptor(localId: "m\(indexPath.item)")
        }

        let dayHeader = try cell(8)
        let neighbour = try cell(7)
        XCTAssertEqual(
            dayHeader.layer.transform.m11, neighbour.layer.transform.m11, accuracy: 0.05,
            "un séparateur de jour doit être mis à l'échelle comme la rangée voisine — sinon il flotte en taille pleine par-dessus un texte réduit"
        )
        XCTAssertEqual(
            dayHeader.alpha, neighbour.alpha, accuracy: 0.05,
            "un séparateur de jour doit s'estomper comme la rangée voisine"
        )
    }

    func test_apply_ineligibleCells_neverWinTheFocus() {
        let pass = makePass()
        let focused = pass.apply(to: collectionView) { _ in FocalScrollPass.CellDescriptor.ineligible }
        XCTAssertNil(focused, "§4.8 : une cellule sans localId ne peut pas être élue — aucune carte de focus sur un séparateur de jour")
        XCTAssertNil(pass.focusedLocalId, "FocalScrollPass.focusedLocalId doit rester nil quand aucun candidat n'est éligible")
    }

    // MARK: - §4.7bis — Élection épinglée pendant l'atterrissage

    /// L'épingle fige l'élection sur un candidat VISIBLE, même si un autre est
    /// plus proche de la bande — le nudge déplace la liste, pas le choix du
    /// lecteur.
    func test_apply_pinnedFocus_overridesTheElection() throws {
        let pass = makePass()
        let free = try XCTUnwrap(pass.apply(to: collectionView, describe: Self.describeAll))

        let other = free == "m2" ? "m3" : "m2"
        pass.pinnedFocusLocalId = other
        let pinned = pass.apply(to: collectionView, describe: Self.describeAll)

        XCTAssertEqual(pinned, other, "§4.7bis : l'épingle fige l'élection le temps de l'atterrissage")
    }

    /// Une épingle sur un id qui n'est plus à l'écran (recyclage pendant
    /// l'animation) n'immobilise rien : l'élection normale reprend.
    func test_apply_pinnedFocusOffScreen_electionResumes() {
        let pass = makePass()
        pass.pinnedFocusLocalId = "fantome-hors-ecran"
        let elected = pass.apply(to: collectionView, describe: Self.describeAll)

        XCTAssertNotEqual(elected, "fantome-hors-ecran", "§4.7bis : une épingle sur un fantôme n'immobilise rien")
        XCTAssertNotNil(elected, "§4.7bis : l'élection normale reprend quand l'épinglé a quitté l'écran")
    }

    // MARK: - Élection sur la vraie géométrie

    func test_apply_electsTheRowClosestToTheFocusLine() throws {
        let pass = makePass()
        let focused = pass.apply(to: collectionView, describe: Self.describeAll)

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
        let focused = pass.apply(to: collectionView, describe: Self.describeAll)

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
        pass.apply(to: collectionView, describe: Self.describeAll)
        XCTAssertNotNil(pass.focusedLocalId, "pré-condition : un focus est élu en mode Focal")

        pass.rendering = .off
        let focused = pass.apply(to: collectionView, describe: Self.describeAll)

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
        pass.apply(to: collectionView, describe: Self.describeAll)

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
        pass.apply(to: collectionView, describe: Self.describeAll)
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
        pass.apply(to: collectionView, describe: Self.describeAll)
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
