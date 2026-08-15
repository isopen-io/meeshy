import XCTest
import SwiftUI
@testable import Meeshy

/// Perspective de liste (contrat LWS-8 / I-069, §4.1) — la passe de
/// compositor `LentillePerspective`.
///
/// **Suite PARTIELLE, ouverte** : I-073 la complète (le contrat la nomme dans
/// ses cinq fichiers de test LWS-8). Ce que ce lot verrouille tient en quatre
/// phrases :
///
/// 1. La passe **rend exactement ce que le miroir gelé prédit** — sur une
///    dizaine de distances couvrant les deux côtés de la bande, la borne de
///    saturation et le fondu court sous la bande. Le miroir
///    (`FocalFocusCurve`, GELÉ S1) est la SEULE loi ; la perspective n'en
///    recopie ni une constante ni une formule.
/// 2. `reduce motion` ⇒ **identité** (opacité 1, échelle 1) — l'élection,
///    elle, est conservée (LWS-8/I-070), mais aucune transformation ne joue.
/// 3. La **bande** de focus se lit dans le miroir (`focusBandOffset`), jamais
///    en dur, et le SIGNE de la distance suit la convention documentée par le
///    miroir (positif = au-DESSUS de la bande).
/// 4. **Garde de source** : `Lentille/Perspective/` ne contient ni
///    `frame(height:`, ni `invalidate`, ni `layoutIfNeeded` — l'invariant
///    « zéro relayout » du §4.1 — et n'écrit aucune constante de loi (garde
///    R15, `scripts/check-law-literals.sh`, commentaires compris).
///
/// **Leçon 257** — le contenu de `Lentille/Perspective/` est DÉCOUVERT par
/// `FileManager`, jamais recopié dans une liste : un fichier ajouté demain
/// entre automatiquement dans le périmètre, et la suite échoue explicitement
/// si elle n'en charge aucun. Une garde qui charge zéro fichier passe toujours
/// au vert sans rien vérifier.
///
/// **Nommage** — aucun jeton de `FINAL_PHASE_CLASS_PATTERN`
/// (`apps/ios/meeshy.sh:1584`) dans `LentillePerspectiveCurveTests` : cette
/// suite reste en phase 1, comme `FocusCurveVectorTests`.
final class LentillePerspectiveCurveTests: XCTestCase {

    // MARK: - Tolérance

    /// Même tolérance que `FocusCurveVectorTests` (miroir de `toBeCloseTo(x, 4)`).
    private static let tolerance: CGFloat = 0.0001

    private func assertClose(
        _ actual: CGFloat,
        _ expected: CGFloat,
        _ message: String,
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        XCTAssertEqual(actual, expected, accuracy: Self.tolerance, message, file: file, line: line)
    }

    /// Les distances de la passe sont DÉRIVÉES des constantes du miroir, jamais
    /// écrites en dur : une suite qui recopierait « 520 » testerait sa propre
    /// copie de la loi, pas la loi. Onze points, choisis pour couvrir les
    /// quatre régimes de la courbe `.list` : au-delà de la saturation, la rampe
    /// linéaire, la bande elle-même, et le fondu court sous la bande (jusqu'à
    /// son propre plafond, puis au-delà).
    private static var probeDistances: [CGFloat] {
        let maxDistance = FocalFocusCurve.listMaxDistance
        let belowBand = FocalFocusCurve.listBelowBandDistance
        return [
            -2 * belowBand,
            -belowBand,
            -belowBand / 2,
            -1,
            0,
            1,
            maxDistance / 4,
            maxDistance / 2,
            maxDistance - 1,
            maxDistance,
            2 * maxDistance
        ]
    }

    // MARK: - 1. La passe rend ce que le miroir prédit

    /// Le témoin central : sur chaque distance sondée, la passe rend
    /// EXACTEMENT le `Result` du miroir, variant `.list`. Un jour où
    /// quelqu'un « optimise » la passe en recopiant la formule, ce test
    /// continue de passer tant que la copie est fidèle — c'est pourquoi il
    /// est doublé, ci-dessous, par une garde de source qui interdit les
    /// constantes, et par les deux témoins de discrimination qui suivent.
    func test_pass_rendersExactlyWhatTheFrozenMirrorPredicts_onEveryProbedDistance() {
        for distance in Self.probeDistances {
            let expected = FocalFocusCurve.focusCurve(distance: distance, variant: .list)
            let actual = LentillePerspective.pass(distance: distance, reduceMotion: false)

            assertClose(
                actual.alpha, expected.alpha,
                "Opacité divergente à d=\(distance) : la passe doit DÉLÉGUER à " +
                "`FocalFocusCurve.focusCurve(distance:variant:.list)` (miroir GELÉ S1, " +
                "`packages/shared/utils/focus-curve.ts`), jamais recalculer la courbe."
            )
            assertClose(
                actual.scale, expected.scale,
                "Échelle divergente à d=\(distance) : même cause, même remède — la loi " +
                "vit dans le miroir, la perspective ne fait que l'appliquer."
            )
        }
    }

    /// Discrimination n° 1 — le VARIANT. Une passe qui appellerait le miroir
    /// avec `.thread` (la courbe du fil : rampe plus courte, fondu bien plus
    /// agressif) satisferait « elle délègue au miroir » tout en peignant la
    /// mauvaise perspective. Les deux variants diffèrent à mi-rampe du fil.
    func test_pass_usesTheListVariant_neverTheThreadVariant() {
        let distance = FocalFocusCurve.threadMaxDistance / 2
        let list = FocalFocusCurve.focusCurve(distance: distance, variant: .list)
        let thread = FocalFocusCurve.focusCurve(distance: distance, variant: .thread)

        XCTAssertNotEqual(
            list, thread,
            "Prérequis du témoin : à d=\(distance) les deux variants du miroir doivent " +
            "différer, sinon ce test ne discrimine rien (leçon 266 — un témoin qui ne " +
            "sépare pas les deux mondes ne mesure pas la propriété en cause)."
        )
        XCTAssertEqual(
            LentillePerspective.pass(distance: distance, reduceMotion: false), list,
            "La perspective de la LISTE doit consommer le variant `.list` : dans la liste " +
            "on SCANNE vingt rangs (§4.3, « une asymétrie voulue — ne pas l'unifier »), " +
            "dans le fil on LIT un message. Le variant `.thread` grossit et efface bien " +
            "plus vite ; l'appliquer ici détruirait le balayage."
        )
    }

    /// Discrimination n° 2 — l'ORDRE. Une passe qui inverserait `alpha` et
    /// `scale` reste « égale au miroir » composante par composante… si on ne
    /// vérifie qu'une seule d'entre elles. À mi-rampe de la liste, la loi rend
    /// deux valeurs très différentes : `alpha` a chuté d'une demi-décote,
    /// `scale` d'à peine quelques centièmes.
    func test_pass_doesNotSwapAlphaAndScale() {
        let distance = FocalFocusCurve.listMaxDistance / 2
        let result = LentillePerspective.pass(distance: distance, reduceMotion: false)

        assertClose(
            result.alpha, 1 - FocalFocusCurve.listAlphaDecay * 0.5,
            "À mi-rampe, l'opacité vaut `1 − listAlphaDecay/2` — recomposée ici depuis les " +
            "CONSTANTES du miroir, jamais depuis un nombre écrit à la main."
        )
        assertClose(
            result.scale, 1 - FocalFocusCurve.listScaleDecay * 0.5,
            "À mi-rampe, l'échelle vaut `1 − listScaleDecay/2`. Si ce témoin rougit avec " +
            "la valeur d'`alpha`, les deux composantes ont été interverties."
        )
        XCTAssertGreaterThan(
            result.scale, result.alpha,
            "Invariant de forme de la courbe `.list` : l'échelle bouge à peine (la hauteur " +
            "du rang ne doit pas sembler changer sous le pouce) là où l'opacité chute " +
            "franchement. Une échelle plus basse que l'opacité signale un échange."
        )
    }

    /// La passe n'invente aucune borne : elle hérite de celles du miroir.
    /// L'opacité reste dans `[0, 1]`, l'échelle ne descend jamais sous
    /// `1 − listScaleDecay`, et l'opacité décroît de façon monotone à mesure
    /// qu'on s'éloigne au-dessus de la bande.
    func test_pass_staysWithinTheMirrorsBounds_andDecaysMonotonicallyAboveTheBand() {
        for distance in Self.probeDistances {
            let result = LentillePerspective.pass(distance: distance, reduceMotion: false)
            XCTAssertGreaterThanOrEqual(result.alpha, 0, "Opacité négative à d=\(distance).")
            XCTAssertLessThanOrEqual(result.alpha, 1, "Opacité supérieure à 1 à d=\(distance).")
            XCTAssertGreaterThanOrEqual(
                result.scale, 1 - FocalFocusCurve.listScaleDecay - Self.tolerance,
                "Échelle sous le plancher de la loi à d=\(distance)."
            )
            XCTAssertLessThanOrEqual(
                result.scale, 1 + Self.tolerance,
                "Échelle au-dessus de 1 à d=\(distance) : la perspective RÉTRÉCIT ce qui " +
                "s'éloigne, elle ne grossit jamais rien (§4.3 — la liste ne grossit RIEN)."
            )
        }

        let ramp = [CGFloat(0), FocalFocusCurve.listMaxDistance / 4, FocalFocusCurve.listMaxDistance / 2, FocalFocusCurve.listMaxDistance]
        for (previous, next) in zip(ramp, ramp.dropFirst()) {
            let before = LentillePerspective.pass(distance: previous, reduceMotion: false)
            let after = LentillePerspective.pass(distance: next, reduceMotion: false)
            XCTAssertGreaterThan(
                before.alpha, after.alpha,
                "L'opacité doit décroître strictement de d=\(previous) à d=\(next) : plus un " +
                "rang s'éloigne au-dessus de la bande, plus il s'efface."
            )
        }
    }

    // MARK: - 2. Reduce motion ⇒ identité

    /// Critère LWS-8 : « reduce motion ⇒ toutes les opacités à 1 ». La passe
    /// devient l'IDENTITÉ — pas « une courbe plus douce », pas « la moitié de
    /// la décote » : exactement 1 et 1, sur toutes les distances, y compris
    /// celles où la courbe normale sature.
    func test_reduceMotion_makesThePassTheIdentity_onEveryDistance() {
        for distance in Self.probeDistances {
            let result = LentillePerspective.pass(distance: distance, reduceMotion: true)
            assertClose(
                result.alpha, 1,
                "Opacité ≠ 1 à d=\(distance) sous reduce motion — critère d'acceptation " +
                "LWS-8 : « toutes les opacités à 1, focus card = fond seul, élection " +
                "CONSERVÉE ». L'élection survit (I-070) ; la transformation, non."
            )
            assertClose(
                result.scale, 1,
                "Échelle ≠ 1 à d=\(distance) sous reduce motion : une échelle résiduelle " +
                "est exactement le mouvement que le réglage demande de supprimer."
            )
        }
    }

    /// Le témoin qui SÉPARE les deux mondes : à une distance où la courbe
    /// normale s'écarte franchement de l'identité, les deux modes doivent
    /// différer. Sans lui, une passe accidentellement toujours-identité
    /// passerait le test ci-dessus au vert.
    func test_reduceMotion_actuallyChangesTheOutcome_whereTheCurveIsNotIdentity() {
        let distance = FocalFocusCurve.listMaxDistance
        let moving = LentillePerspective.pass(distance: distance, reduceMotion: false)
        let still = LentillePerspective.pass(distance: distance, reduceMotion: true)

        XCTAssertNotEqual(
            moving, still,
            "À la distance de saturation, la passe normale et la passe reduce-motion " +
            "doivent différer : si elles coïncident, la perspective ne joue JAMAIS et le " +
            "test d'identité ci-dessus ne prouve rien (leçon 266)."
        )
    }

    // MARK: - 3. La bande de focus vient du miroir, et le signe est celui du miroir

    /// La bande de focus est ancrée au BAS de la région visible, à la distance
    /// que le miroir publie (`focusBandOffset`, §4.2) — jamais un nombre écrit
    /// dans la peau.
    func test_focusBand_isAnchoredToTheViewportBottom_byTheMirrorsOffset() {
        for viewportBottom in [CGFloat(0), 100, 812, 1024] {
            assertClose(
                LentilleFocusBand.centerY(viewportBottom: viewportBottom),
                viewportBottom - FocalFocusCurve.focusBandOffset,
                "Le centre de la bande doit valoir `bas de la région visible − " +
                "FocalFocusCurve.focusBandOffset` (miroir de `FOCUS_BAND_OFFSET`). " +
                "Recopier la cote dans la peau ferait diverger la perspective de " +
                "l'élection, qui lit la MÊME bande."
            )
        }
    }

    /// Convention de signe du miroir (documentée dans `focusCurve`) : `d` est
    /// la distance verticale AU-DESSUS de la bande. Un rang pile dans la bande
    /// a `d = 0` ; un rang plus haut à l'écran (donc `midY` plus petit) a `d`
    /// positif ; un rang sous la bande a `d` négatif — le seul cas qui active
    /// le fondu court.
    func test_distance_followsTheMirrorsSignConvention() {
        let viewportBottom: CGFloat = 812
        let bandCenter = LentilleFocusBand.centerY(viewportBottom: viewportBottom)

        assertClose(
            LentillePerspective.distance(rowMidY: bandCenter, viewportBottom: viewportBottom), 0,
            "Un rang dont le milieu tombe au centre de la bande est à distance NULLE."
        )
        XCTAssertGreaterThan(
            LentillePerspective.distance(rowMidY: bandCenter - 200, viewportBottom: viewportBottom), 0,
            "Un rang PLUS HAUT à l'écran (midY plus petit) est au-DESSUS de la bande : sa " +
            "distance est positive, c'est lui que la courbe estompe."
        )
        XCTAssertLessThan(
            LentillePerspective.distance(rowMidY: bandCenter + 200, viewportBottom: viewportBottom), 0,
            "Un rang SOUS la bande a une distance négative — le seul régime où le fondu " +
            "court du miroir (`listBelowBandDistance`/`listBelowBandAlphaCap`) s'applique."
        )
    }

    /// Bout à bout : un rang sous la bande doit s'estomper par le fondu COURT
    /// du miroir, pas par la rampe longue. Le témoin compare deux distances
    /// symétriques : sous la bande, l'opacité chute plus vite qu'au-dessus.
    func test_belowTheBand_theShortFadeApplies_notTheLongRamp() {
        let step = FocalFocusCurve.listBelowBandDistance
        let above = LentillePerspective.pass(distance: step, reduceMotion: false)
        let below = LentillePerspective.pass(distance: -step, reduceMotion: false)

        XCTAssertLessThan(
            below.alpha, above.alpha,
            "À distance égale de part et d'autre de la bande, le rang du DESSOUS doit être " +
            "plus effacé : son fondu a un rayon bien plus court que la rampe du dessus " +
            "(§4.1). L'inverse signalerait une distance de signe inversé."
        )
        assertClose(
            below.scale, 1,
            "Sous la bande, seule l'OPACITÉ bouge : le terme d'échelle du miroir est borné " +
            "à `[0, 1]` en `f` et ne contribue rien pour `d < 0`."
        )
    }

    // MARK: - 4. L'origine de la transformation vient de LentilleMetrics

    /// §4.3 — `transform-origin: 16% 50%`. La cote vit dans `LentilleMetrics`
    /// (miroir de `lentille-tokens.json`), la peau la LIT.
    func test_transformOrigin_isReadFromLentilleMetrics_neverWrittenInTheSkin() {
        XCTAssertEqual(
            LentillePerspective.transformOrigin,
            UnitPoint(x: LentilleMetrics.Row.transformOriginX, y: LentilleMetrics.Row.transformOriginY),
            "Le pivot du zoom doit être `LentilleMetrics.Row.transformOriginX/Y` — la cote " +
            "normative du contrat §4.3, dont le domicile de vérité est " +
            "`packages/shared/design/lentille-tokens.json`."
        )
        XCTAssertNotEqual(
            LentillePerspective.transformOrigin, .center,
            "Un pivot centré est le DÉFAUT de SwiftUI : si l'origine y retombe, la cote " +
            "n'a pas été appliquée et le rang rétrécit vers son milieu au lieu de pivoter " +
            "près de l'avatar."
        )
    }

    // MARK: - 5. Garde de source — Lentille/Perspective/

    private static var iosRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Lentille
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
    }

    private static var perspectiveDirectory: URL {
        iosRoot.appendingPathComponent("Meeshy/Features/Main/Lentille/Perspective")
    }

    /// Tout `.swift` de `Lentille/Perspective/`, DÉCOUVERT au moment du test
    /// (leçon 257) — jamais une liste de noms recopiée à la main.
    private func perspectiveSources() throws -> [(name: String, code: String)] {
        let entries = try FileManager.default.contentsOfDirectory(
            at: Self.perspectiveDirectory,
            includingPropertiesForKeys: nil
        )
        return try entries
            .filter { $0.pathExtension == "swift" }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
            .map { ($0.lastPathComponent, try String(contentsOf: $0, encoding: .utf8)) }
    }

    private func listViewSource() throws -> String {
        try String(
            contentsOf: Self.iosRoot.appendingPathComponent("Meeshy/Features/Main/Views/ConversationListView.swift"),
            encoding: .utf8
        )
    }

    private func normalizedCode(_ source: String) -> String {
        AppSourceGuard.stripComments(source)
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }

    private func occurrences(of needle: String, in haystack: String) -> Int {
        haystack.components(separatedBy: needle).count - 1
    }

    func test_guardDiscoversAtLeastOnePerspectiveFile_neverSilentlyEmpty() throws {
        XCTAssertFalse(
            try perspectiveSources().isEmpty,
            "La garde n'a chargé AUCUN fichier depuis `\(Self.perspectiveDirectory.path)`. " +
            "Une garde qui charge zéro fichier passe TOUJOURS au vert sans avoir rien " +
            "vérifié (leçon 257) — c'est le pire défaut possible de cette suite."
        )
    }

    /// Critère d'acceptation LWS-8, mot pour mot : « garde de source —
    /// `Lentille/Perspective/` ne contient ni `frame(height:`, ni `invalidate`,
    /// ni `layoutIfNeeded` ». C'est l'invariant « zéro relayout » du §4.1 : la
    /// hauteur du rang (constante) n'apparaît NULLE PART dans la loi de
    /// perspective, et rien n'y demande au layout de recommencer.
    func test_perspective_neverTouchesLayout() throws {
        for source in try perspectiveSources() {
            let code = normalizedCode(source.code)
            for forbidden in ["frame(height:", "invalidate", "layoutIfNeeded"] {
                XCTAssertEqual(
                    occurrences(of: forbidden, in: code), 0,
                    "\(source.name) contient « \(forbidden) » : la perspective est une passe " +
                    "de COMPOSITOR pure (§4.1 — `transform` et `opacity` SEULS, jamais une " +
                    "hauteur, jamais une police). Toucher au layout coûterait un relayout " +
                    "par frame sur tous les rangs visibles et casserait le critère R2 " +
                    "(hauteur constante, moins d'une milliseconde par frame)."
                )
            }
        }
    }

    /// « Opacité et échelle SEULES ». Tout autre effet visuel — flou, rotation,
    /// décalage, teinte — sort du contrat : il change ce que le §4.1 décrit
    /// comme la loi complète de la perspective.
    func test_perspective_appliesOpacityAndScaleOnly() throws {
        let sources = try perspectiveSources()
        let joined = sources.map { normalizedCode($0.code) }.joined(separator: " ")

        for forbidden in [
            "blur(", "rotationEffect(", "rotation3DEffect(", "offset(",
            "brightness(", "saturation(", "hueRotation(", "contrast(",
            "grayscale(", "colorMultiply(", "font("
        ] {
            XCTAssertEqual(
                occurrences(of: forbidden, in: joined), 0,
                "`Lentille/Perspective/` applique « \(forbidden) » : la loi §4.1 n'autorise " +
                "que l'OPACITÉ et l'ÉCHELLE. Un effet de plus, si peu coûteux soit-il en " +
                "apparence, sort du contrat et déborde du budget compositor (R2)."
            )
        }

        XCTAssertGreaterThan(
            occurrences(of: ".opacity(", in: joined), 0,
            "Aucune application d'opacité trouvée : la passe ne peint plus rien."
        )
        XCTAssertGreaterThan(
            occurrences(of: ".scaleEffect(", in: joined), 0,
            "Aucune application d'échelle trouvée : la passe ne peint plus rien."
        )
    }

    /// Garde R15, alignée sur `scripts/check-law-literals.sh` (qui scanne bien
    /// `Lentille/**` hors `Core/**`) : lecture BRUTE, commentaires compris —
    /// le script ne « strip » rien, et cette suite ne doit pas être plus
    /// tolérante que la CI qu'elle double.
    func test_perspective_carriesNoLawLiteral_commentsIncluded() throws {
        let hardLiterals = ["520", "380", "160", "140", "45", "0.45", "0.82", "0.40", "0.35", "0.04", "900"]
        for source in try perspectiveSources() {
            for literal in hardLiterals {
                XCTAssertEqual(
                    occurrences(of: literal, in: source.code), 0,
                    "\(source.name) contient « \(literal) » (source BRUTE, commentaires " +
                    "compris) — constante de la loi de focus ou de la bande. Elle se LIT " +
                    "sur `FocalFocusCurve` (miroir GELÉ de " +
                    "`packages/shared/utils/focus-curve.ts`), jamais recopiée dans une peau : " +
                    "`scripts/check-law-literals.sh` rougirait en CI sur la même ligne."
                )
            }
        }
    }

    /// La passe DÉLÈGUE : le nom du miroir doit apparaître, et aucune formule
    /// concurrente ne doit vivre à côté de lui.
    func test_perspective_delegatesToTheFrozenMirror() throws {
        let joined = try perspectiveSources().map { normalizedCode($0.code) }.joined(separator: " ")

        XCTAssertTrue(
            joined.contains("FocalFocusCurve.focusCurve(distance: distance, variant: .list)"),
            "La passe doit appeler `FocalFocusCurve.focusCurve(distance:variant:)` avec le " +
            "variant `.list` — un appel littéral, repérable, qui rend impossible une " +
            "réécriture silencieuse de la courbe."
        )
        XCTAssertTrue(
            joined.contains("FocalFocusCurve.focusBandOffset"),
            "La bande doit être lue sur le miroir : la perspective et l'élection (I-070) " +
            "partagent la MÊME bande, donc la même source."
        )
    }

    // MARK: - 6. Montage — le drapeau décide, et rien n'est monté sous OFF

    /// Critère I-069 : « drapeau OFF ⇒ aucun effet appliqué, le modificateur
    /// n'est même pas monté ». La forme qui le garantit est un `@ViewBuilder`
    /// à deux branches : `self` nu sous OFF, le modificateur sous ON. Un
    /// modificateur monté-mais-inerte satisferait « aucun effet visible » tout
    /// en payant une passe de compositor par rang et par frame.
    func test_perspectiveModifier_isNotEvenMounted_whenTheFlagIsOff() throws {
        let joined = try perspectiveSources().map { normalizedCode($0.code) }.joined(separator: " ")

        XCTAssertTrue(
            joined.contains("if isEnabled { modifier(LentillePerspective()) } else { self }"),
            "Le point d'entrée `lentillePerspective(isEnabled:)` doit rendre `self` NU sous " +
            "drapeau OFF — pas un modificateur neutralisé. Sous OFF, `.visualEffect` ne " +
            "doit pas exister dans l'arbre : le rendu d'aujourd'hui doit rester identique " +
            "au bit près."
        )
        XCTAssertEqual(
            occurrences(of: ".visualEffect", in: joined), 1,
            "Une SEULE passe de compositor dans tout `Lentille/Perspective/` : deux " +
            "`.visualEffect` sur le même rang, ce sont deux évaluations par frame pour un " +
            "seul effet visible."
        )
    }

    /// Le montage côté liste : un seul site, gardé par le drapeau lu UNE fois
    /// par section (jamais par rang — `LentilleFeatureFlag` interroge
    /// `ProcessInfo.environment` à chaque appel, et le corps d'un rang est un
    /// chemin chaud ; c'est la règle que `tracksVisibleSection` a posée en
    /// I-063bis).
    func test_conversationList_mountsThePerspectiveOncePerRow_behindTheFlag() throws {
        let code = normalizedCode(try listViewSource())

        XCTAssertEqual(
            occurrences(of: ".lentillePerspective(isEnabled: perspectiveEnabled)", in: code), 1,
            "La perspective doit être montée sur le rang en UN seul site de " +
            "`ConversationListView.swift`, avec le booléen de drapeau déjà résolu."
        )
        XCTAssertTrue(
            code.contains("let perspectiveEnabled = LentilleFeatureFlag.isLentilleListEnabled"),
            "Le drapeau doit être résolu une fois par passe de `sectionConversations` et " +
            "descendre sous forme de `Bool` : le lire dans le corps de chaque rang " +
            "rallouerait le dictionnaire d'environnement du process à chaque rang."
        )
        XCTAssertEqual(
            occurrences(of: "LentillePerspective(", in: code), 0,
            "`ConversationListView.swift` ne construit JAMAIS le modificateur directement : " +
            "il passe par `lentillePerspective(isEnabled:)`, qui porte la décision de " +
            "montage. Un appel direct contournerait la branche « drapeau OFF »."
        )
    }
}
