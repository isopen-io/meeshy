import XCTest
@testable import Meeshy

/// Vecteurs partagés (contrat LWS-0, workshop `tasks/lentille-focal-workshop.md`
/// §2.3) — le MÊME JSON que la suite Jest
/// (`packages/shared/__tests__/focus-curve.test.ts`) et la future suite
/// JUnit Android, copié comme ressource de bundle (`project.yml`,
/// `MeeshyTests.resources`, `../../packages/shared/fixtures`, `type: folder`).
/// Ce fichier prouve la parité NUMÉRIQUE de `FocalFocusCurve.focusCurve`
/// contre `packages/shared/utils/focus-curve.ts` — vecteur par vecteur,
/// tolérance `1e-4`, la même que Jest (`toBeCloseTo(x, 4)`).
///
/// **Nommage** — comme `LentilleMetricsTests` (§ commentaire de classe) :
/// aucun jeton qui bascule cette suite en phase 2 du gate (`meeshy.sh`
/// `FINAL_PHASE_CLASS_PATTERN`, ligne ~1591). `FocusCurveVectorTests` ne
/// contient ni `Thread`, ni `Conversation`, ni aucun autre jeton produit —
/// vérifié par grep sur le pattern avant l'écriture de ce fichier.
final class FocusCurveVectorTests: XCTestCase {

    // MARK: - Tolérance (miroir de `toBeCloseTo(x, 4)`)

    /// Même tolérance que Jest (`toBeCloseTo(value, 4)` ≈ `1e-4`).
    private static let tolerance: CGFloat = 0.0001

    private func closeEnough(_ a: CGFloat, _ b: CGFloat, tolerance: CGFloat = Self.tolerance) -> Bool {
        abs(a - b) <= tolerance
    }

    // MARK: - Chargement des vecteurs

    /// Un cas de `focus-curve.vectors.json`. `Decodable` par défaut ignore
    /// silencieusement les clés inconnues du JSON (Swift ne réclame que les
    /// clés déclarées ici) — c'est le décodeur tolérant demandé : un champ
    /// ajouté côté fixture plus tard (métadonnées, commentaires…) ne casse
    /// jamais ce test.
    private struct Vector: Decodable {
        let label: String
        let input: Input
        let expected: Expected

        struct Input: Decodable {
            let distance: Double
            let variant: String
        }

        struct Expected: Decodable {
            let alpha: Double
            let scale: Double
        }

        enum CodingKeys: String, CodingKey {
            case label = "_label"
            case input
            case expected
        }
    }

    /// Ressource de bundle : `packages/shared/fixtures/reading-modes/focus-curve.vectors.json`,
    /// câblée via `project.yml` (`MeeshyTests.resources`, `../../packages/shared/fixtures`,
    /// `type: folder` — préserve l'arborescence `reading-modes/`).
    private static func loadVectors() -> [Vector] {
        guard let url = Bundle(for: FocusCurveVectorTests.self).url(
            forResource: "focus-curve.vectors",
            withExtension: "json",
            subdirectory: "fixtures/reading-modes"
        ) else {
            XCTFail("""
                focus-curve.vectors.json introuvable dans le bundle de tests sous \
                `fixtures/reading-modes`. Vérifier la ressource `../../packages/shared/fixtures` \
                (type: folder) dans project.yml, puis `xcodegen generate`.
                """)
            return []
        }
        guard
            let data = try? Data(contentsOf: url),
            let vectors = try? JSONDecoder().decode([Vector].self, from: data)
        else {
            XCTFail("focus-curve.vectors.json présent mais illisible ou mal formé.")
            return []
        }
        return vectors
    }

    private func variant(from raw: String) -> FocalFocusCurve.Variant? {
        switch raw {
        case "thread": return .thread
        case "list": return .list
        default: return nil
        }
    }

    // MARK: - Parité vecteur par vecteur

    /// Zéro cas ⇒ échec explicite plutôt qu'une boucle vide silencieusement
    /// verte (le piège qu'un `for` sur un tableau vide produirait sans ce
    /// garde-fou).
    func test_focusCurve_matchesAllSharedVectors() {
        let vectors = Self.loadVectors()
        XCTAssertFalse(vectors.isEmpty, "aucun vecteur chargé — focus-curve.vectors.json vide ou introuvable")

        for vector in vectors {
            guard let variant = variant(from: vector.input.variant) else {
                XCTFail("[\(vector.label)] variante inconnue dans le vecteur : \(vector.input.variant)")
                continue
            }
            let result = FocalFocusCurve.focusCurve(
                distance: CGFloat(vector.input.distance),
                variant: variant
            )

            XCTAssertTrue(
                closeEnough(result.alpha, CGFloat(vector.expected.alpha)),
                "[\(vector.label)] alpha attendu \(vector.expected.alpha), obtenu \(result.alpha)"
            )
            XCTAssertTrue(
                closeEnough(result.scale, CGFloat(vector.expected.scale)),
                "[\(vector.label)] scale attendu \(vector.expected.scale), obtenu \(result.scale)"
            )
        }
    }

    // MARK: - Témoins d'élection — bande d'hystérésis (§4.2)

    /// Oscillation `±40` autour de `focusY`, hystérésis `45` : le gagnant
    /// reste stable — le courant garde la main à chaque passe tant qu'il
    /// reste dans la bande, même quand un autre candidat serait strictement
    /// plus proche.
    func test_electFocusRow_oscillationWithin45pxHysteresis_keepsStableWinner() {
        let focusY: CGFloat = 500
        let hysteresis: CGFloat = 45
        let offsets: [CGFloat] = [40, -40, 35, -35, 20, -20, 40, -40, 0]
        var currentId: String? = "row-current"

        for offset in offsets {
            let candidates = [
                FocalFocusCurve.RowCandidate(id: "row-current", midY: focusY + offset),
                FocalFocusCurve.RowCandidate(id: "row-nearer", midY: focusY + 5),
            ]
            currentId = FocalFocusCurve.electFocusRow(
                candidates: candidates,
                focusY: focusY,
                currentId: currentId,
                hysteresis: hysteresis
            )
            XCTAssertEqual(currentId, "row-current", "offset \(offset) — le courant doit garder la main dans la bande ±\(hysteresis)")
        }
    }

    /// Borne INCLUSIVE : `distance == hysteresis` (exactement 45) garde le
    /// courant — `<=`, jamais `<`.
    func test_electFocusRow_distanceExactlyEqualsHysteresis_isInclusive_keepsCurrent() {
        let winner = FocalFocusCurve.electFocusRow(
            candidates: [
                FocalFocusCurve.RowCandidate(id: "row-current", midY: 545), // distance exactement 45
                FocalFocusCurve.RowCandidate(id: "row-nearer", midY: 505),
            ],
            focusY: 500,
            currentId: "row-current",
            hysteresis: 45
        )
        XCTAssertEqual(winner, "row-current", "borne INCLUSIVE : distance == hysteresis doit garder le courant")
    }

    /// Symétrique du témoin précédent : une fois strictement HORS bande
    /// (distance 50 > 45), le plus proche l'emporte.
    func test_electFocusRow_currentDriftsOutsideHysteresisBand_electsNearer() {
        let winner = FocalFocusCurve.electFocusRow(
            candidates: [
                FocalFocusCurve.RowCandidate(id: "row-current", midY: 550), // distance 50, hors bande
                FocalFocusCurve.RowCandidate(id: "row-nearer", midY: 505),
            ],
            focusY: 500,
            currentId: "row-current",
            hysteresis: 45
        )
        XCTAssertEqual(winner, "row-nearer")
    }

    /// `currentId` absent des candidats (rang défilé hors écran) = pas de
    /// courant : élection normale par plus proche.
    func test_electFocusRow_staleCurrentId_treatedAsNoCurrent() {
        let winner = FocalFocusCurve.electFocusRow(
            candidates: [
                FocalFocusCurve.RowCandidate(id: "row-a", midY: 495),
                FocalFocusCurve.RowCandidate(id: "row-b", midY: 700),
            ],
            focusY: 500,
            currentId: "row-gone",
            hysteresis: 45
        )
        XCTAssertEqual(winner, "row-a")
    }

    /// Égalité de distance : départage par `id` croissant, déterministe,
    /// indépendant de l'ordre du tableau.
    func test_electFocusRow_tieOnDistance_breaksByAscendingId() {
        let winner = FocalFocusCurve.electFocusRow(
            candidates: [
                FocalFocusCurve.RowCandidate(id: "b", midY: 510),
                FocalFocusCurve.RowCandidate(id: "a", midY: 490),
            ],
            focusY: 500,
            currentId: nil,
            hysteresis: 45
        )
        XCTAssertEqual(winner, "a")
    }

    /// Liste vide → `nil`.
    func test_electFocusRow_emptyCandidates_returnsNil() {
        let winner = FocalFocusCurve.electFocusRow(
            candidates: [],
            focusY: 500,
            currentId: nil,
            hysteresis: 45
        )
        XCTAssertNil(winner)
    }
}
