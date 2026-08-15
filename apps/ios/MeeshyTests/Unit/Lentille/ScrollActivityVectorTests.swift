import XCTest
@testable import Meeshy

/// Suite de VECTEURS — rejoue `packages/shared/fixtures/reading-modes/scroll-activity.vectors.json`
/// contre le miroir Swift de la loi (`ScrollTimePillLaw`, `Focal/Core/ScrollTimePillLaw.swift`,
/// M-044). Mêmes 8 cas que la suite Jest
/// (`packages/shared/__tests__/vectors/scroll-activity.vectors.test.ts`) et, en phase 2,
/// JUnit — les trois plateformes rejouent le MÊME fichier, sur le même commit de `fixtures/`
/// (contrat LWS-0, gel S1). Ressource de bundle : câblée via `project.yml`
/// (`MeeshyTests.resources`, `path: ../../packages/shared/fixtures`, `type: folder` — même
/// mécanique que `FocusCurveVectorTests`/`BridgeFormatterVectorTests`).
///
/// **Nommage** — comme #3010 WS-0/M-045 : aucun jeton qui bascule cette suite en phase 2 du
/// gate (`meeshy.sh` `FINAL_PHASE_CLASS_PATTERN`, ligne ~1591). `ScrollActivityVectorTests` ne
/// contient aucun des jetons de la liste (pas de `Conversation`, `Message`, `Story`… ) — reste
/// en phase 1 (suites isolées).
///
/// **Garde de harnais (leçon 257)** : `test_vectors_fileLoadsAtLeastOneCase` verrouille le
/// plancher « zéro cas ⇒ échec explicite », indépendamment du `XCTFail` déjà posé dans
/// `loadVectors()` sur fichier absent/illisible.
final class ScrollActivityVectorTests: XCTestCase {

    // MARK: - Modèle de vecteur (décodeur tolérant)

    /// `_label` documente le cas pour un message d'échec lisible. `Decodable` ignore par
    /// construction les clés JSON absentes de `CodingKeys`/des propriétés déclarées — un champ
    /// additionnel côté fixture ne fait jamais échouer ce décodage (décodeur tolérant).
    private struct Vector: Decodable {
        let label: String
        let input: Input
        let expected: Expected

        struct Input: Decodable {
            let events: [EventDTO]
            let probeAt: Double
        }

        /// `type` reste une chaîne brute au décodage — la traduction vers `ScrollActivityEvent`
        /// se fait dans `asEvent()`, seul endroit qui échoue bruyamment sur un type inconnu
        /// (plutôt que de laisser `JSONDecoder` avaler silencieusement un cas jamais prévu).
        struct EventDTO: Decodable {
            let type: String
            let at: Double

            func asEvent() throws -> ScrollActivityEvent {
                switch type {
                case "scrolled": return .scrolled(at: at)
                case "tick": return .tick(at: at)
                default:
                    throw NSError(
                        domain: "ScrollActivityVectorTests",
                        code: 1,
                        userInfo: [NSLocalizedDescriptionKey: "type d'événement inconnu dans le vecteur : \(type)"]
                    )
                }
            }
        }

        struct Expected: Decodable {
            let visible: Bool
        }

        enum CodingKeys: String, CodingKey {
            case label = "_label"
            case input
            case expected
        }
    }

    // MARK: - Chargement du fichier de vecteurs

    /// Ressource de bundle : `packages/shared/fixtures/reading-modes/scroll-activity.vectors.json`,
    /// câblée via `project.yml` (`MeeshyTests.resources`, `path: ../../packages/shared/fixtures`,
    /// `type: folder`) — l'arborescence `reading-modes/` est préservée sous le conteneur
    /// `fixtures/` du bundle.
    private static func loadVectors() -> [Vector] {
        guard let url = Bundle(for: ScrollActivityVectorTests.self).url(
            forResource: "scroll-activity.vectors",
            withExtension: "json",
            subdirectory: "fixtures/reading-modes"
        ) else {
            XCTFail("""
                scroll-activity.vectors.json introuvable dans le bundle de tests sous \
                `fixtures/reading-modes/`. Vérifier la ressource `../../packages/shared/fixtures` \
                (type: folder) dans project.yml, puis `xcodegen generate`.
                """)
            return []
        }
        guard let data = try? Data(contentsOf: url) else {
            XCTFail("scroll-activity.vectors.json présent à \(url.path) mais illisible.")
            return []
        }
        guard let vectors = try? JSONDecoder().decode([Vector].self, from: data) else {
            XCTFail("scroll-activity.vectors.json présent mais mal formé — attendu un tableau de { _label, input, expected }.")
            return []
        }
        return vectors
    }

    // MARK: - Garde de harnais (leçon 257)

    /// Le pire mode de panne d'une suite de vecteurs est le vert silencieux : un fichier vide,
    /// ou une régression de chargement, ferait passer cette suite alors qu'elle n'a rien
    /// vérifié. Ce témoin échoue explicitement si `loadVectors()` renvoie zéro cas —
    /// indépendamment du `XCTFail` déjà posé dans le loader lui-même sur fichier
    /// absent/illisible.
    func test_vectors_fileLoadsAtLeastOneCase() {
        XCTAssertFalse(Self.loadVectors().isEmpty, "scroll-activity.vectors.json a chargé ZÉRO cas — leçon 257, jamais de vert silencieux")
    }

    // MARK: - Rejeu

    /// Rejoue CHAQUE séquence de vecteur : `initialState()` → `reduce()` pour chaque
    /// événement dans l'ordre → `isVisible()` à `probeAt`. Un vecteur illisible (type
    /// d'événement inconnu) fait échouer CE cas précis, sans interrompre les autres.
    func test_vectors_replayMatchExpectedVisibility() throws {
        let vectors = Self.loadVectors()
        guard !vectors.isEmpty else {
            XCTFail("aucun vecteur chargé — voir test_vectors_fileLoadsAtLeastOneCase")
            return
        }

        for vector in vectors {
            let finalState = try vector.input.events.reduce(ScrollTimePillLaw.initialState()) { state, dto in
                ScrollTimePillLaw.reduce(state: state, event: try dto.asEvent())
            }
            let visible = ScrollTimePillLaw.isVisible(state: finalState, at: vector.input.probeAt)
            XCTAssertEqual(
                visible,
                vector.expected.visible,
                "cas « \(vector.label) » : visible attendu \(vector.expected.visible), obtenu \(visible)"
            )
        }
    }

    // MARK: - Témoins directs du contrat de `reduce` (au-delà des 8 vecteurs)

    /// `.tick` ne réarme jamais — l'état après un `.tick` est identique PAR IDENTITÉ (`==`) à
    /// l'état d'entrée, pas seulement une valeur qui coïncide.
    func test_reduce_tick_returnsSameStateByIdentity() {
        let scrolled = ScrollTimePillLaw.reduce(
            state: ScrollTimePillLaw.initialState(),
            event: .scrolled(at: 1_000)
        )
        let afterTick = ScrollTimePillLaw.reduce(state: scrolled, event: .tick(at: 1_500))
        XCTAssertEqual(afterTick, scrolled)
    }

    /// Garde R15 : la loi elle-même doit exposer `lingerMs`, pas seulement un littéral `900`
    /// enfoui dans `isVisible` — c'est CE point que les vues doivent lire.
    func test_lingerMs_is900() {
        XCTAssertEqual(ScrollTimePillLaw.lingerMs, 900)
    }
}
