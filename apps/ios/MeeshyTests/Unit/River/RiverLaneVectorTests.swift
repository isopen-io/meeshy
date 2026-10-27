import XCTest
@testable import Meeshy

/// Vecteurs partagés (R-130/R2/R3, `tasks/lentille-workshop-execution.md`
/// §7/§7bis/§7ter, ligne R-132) — les MÊMES trois fichiers JSON que la suite
/// Jest `packages/shared/__tests__/vectors/river-*.vectors.test.ts`, copiés
/// comme ressource de bundle (`project.yml`, `MeeshyTests.resources`,
/// `../../packages/shared/fixtures`, `type: folder` — déjà câblée, aucune
/// modification de `project.yml` requise ici : le dossier `reading-modes/`
/// y est déjà exposé et les trois fichiers `river-*.vectors.json` y
/// arrivent avec lui).
///
/// Ce fichier prouve la parité de `RiverLaneResolver` contre
/// `packages/shared/utils/river-lanes.ts` — vecteur par vecteur, 59 cas
/// (`river-lanes.vectors.json` 24, `river-step.vectors.json` 20,
/// `river-headers.vectors.json` 15). Chaque fichier est un OBJET
/// (`{ "$format": …, "vectors": […] }`), pas un tableau à la racine — comme
/// `accent.vectors.json` (vérifié en lisant les trois fichiers avant
/// d'écrire ce décodeur, jamais supposé par analogie avec les suites qui
/// chargent un tableau nu).
///
/// **Vecteurs et témoins de couverture** — `resolveRiverLanes` et
/// `resolveRiverStep`/`resolveRiverLaneHeaders` sont vectorisées ; leurs deux
/// aides `resolveRiverLivingLanes`/`resolveRiverLaneAt` ne le sont PAS
/// (aucun fichier `river-living-lanes.vectors.json` ni
/// `river-lane-at.vectors.json` n'existe — seules les trois fonctions
/// d'entrée `{lanes,step,headers}` sont vectorisées côté loi partagée). Les
/// témoins `test_resolveRiverLivingLanes_*`/`test_resolveRiverLaneAt_*`
/// ci-dessous transposent les cas correspondants de
/// `packages/shared/__tests__/river-lanes.test.ts` (describes
/// `resolveRiverLivingLanes`, `resolveRiverLaneAt`, et le dernier `it` de
/// « resolveRiverStep — sérialisée, la rivière EST le fil ») — ils éprouvent
/// le MIROIR (ces deux fonctions n'existent nulle part ailleurs), pas une
/// peau : aucune vue n'est montée ici.
///
/// **Nommage** — `RiverLaneVectorTests` ne porte aucun jeton de
/// `FINAL_PHASE_CLASS_PATTERN` (`apps/ios/meeshy.sh:1591`, qui contient
/// notamment `Conversation`) : reste en phase 1 du gate local, comme les
/// sept autres suites de vecteurs `reading-modes/`.
final class RiverLaneVectorTests: XCTestCase {

    // MARK: - Enveloppe de fichier (miroir du décodeur `AccentVectorTests`)

    private struct VectorFileJSON<Vector: Decodable>: Decodable {
        let vectors: [Vector]
    }

    // MARK: - Formes JSON tolérantes — entrée `{messages, participants, viewerId, …}`

    private struct VectorMessageJSON: Decodable {
        let id: String
        let senderId: String
        let createdAt: String
        let replyToMessageId: String?
        /// OPTIONNEL, comme côté TS (`RiverMessageInput.isSystem?`) : les
        /// vecteurs antérieurs à la règle « un avis n'est la voix de
        /// personne » ne portent pas la clé, et décrivent une rivière de pure
        /// parole. Absent vaut `false`.
        let isSystem: Bool?
    }

    private struct VectorParticipantJSON: Decodable {
        let id: String
        let displayName: String
    }

    private struct VectorLanesInputJSON: Decodable {
        let messages: [VectorMessageJSON]
        let participants: [VectorParticipantJSON]
        let viewerId: String
        let silenceWindowMs: Double?
        let maxLanes: Int?
        let minVoices: Int?
        let dayBoundaryOffsetMinutes: Double?
    }

    private static func toResolveInput(_ raw: VectorLanesInputJSON) -> RiverLaneResolver.ResolveRiverLanesInput {
        RiverLaneResolver.ResolveRiverLanesInput(
            messages: raw.messages.map { message in
                RiverLaneResolver.RiverMessageInput(
                    id: message.id,
                    senderId: message.senderId,
                    createdAt: .iso8601(message.createdAt),
                    replyToMessageId: message.replyToMessageId,
                    isSystem: message.isSystem ?? false
                )
            },
            participants: raw.participants.map { RiverLaneResolver.RiverParticipantInput(id: $0.id, displayName: $0.displayName) },
            viewerId: raw.viewerId,
            silenceWindowMs: raw.silenceWindowMs,
            maxLanesOverride: raw.maxLanes,
            minVoicesOverride: raw.minVoices,
            dayBoundaryOffsetMinutes: raw.dayBoundaryOffsetMinutes
        )
    }

    // MARK: - `river-lanes.vectors.json` : forme JSON de `RiverGeometry` attendue

    private struct ExpectedNodeJSON: Decodable, Equatable {
        let rank: Int
        let kind: String
        let messageId: String
    }

    private struct ExpectedSpanJSON: Decodable, Equatable {
        let startRank: Int
        let endRank: Int
        let isOpen: Bool
        let nodes: [ExpectedNodeJSON]
    }

    private struct ExpectedLaneJSON: Decodable, Equatable {
        let laneId: String
        let laneIndex: Int
        let isViewer: Bool
        let colorSeed: String
        let spans: [ExpectedSpanJSON]
    }

    private struct ExpectedBubbleJSON: Decodable, Equatable {
        let messageId: String
        let laneId: String
        let laneIndex: Int
        let rank: Int
        let createdAtMs: Double
        let isViewer: Bool
        let replyToMessageId: String?
        let isFirstInGroup: Bool
        let isSystem: Bool
    }

    private struct ExpectedConnectorJSON: Decodable, Equatable {
        let fromMessageId: String
        let toMessageId: String
        let fromLaneIndex: Int
        let toLaneIndex: Int
        let fromRank: Int
        let toRank: Int
    }

    private struct ExpectedGeometryJSON: Decodable, Equatable {
        let lanes: [ExpectedLaneJSON]
        let bubbles: [ExpectedBubbleJSON]
        let connectors: [ExpectedConnectorJSON]
        let rankCount: Int
        let laneCount: Int
        let voiceCount: Int
        let layout: String
        let serializationReason: String?
        let silenceWindowMs: Double
        let maxLanes: Int
        let minVoices: Int
    }

    private struct LanesVectorCase: Decodable {
        let _label: String
        let input: VectorLanesInputJSON
        let expected: ExpectedGeometryJSON
    }

    /// Projette la `RiverGeometry` RÉELLE dans la même forme que `expected`
    /// — jamais l'inverse (le miroir ne réimplémente pas la loi, il en
    /// projette la sortie pour comparaison).
    private static func project(_ geometry: RiverLaneResolver.RiverGeometry) -> ExpectedGeometryJSON {
        ExpectedGeometryJSON(
            lanes: geometry.lanes.map { lane in
                ExpectedLaneJSON(
                    laneId: lane.laneId,
                    laneIndex: lane.laneIndex,
                    isViewer: lane.isViewer,
                    colorSeed: lane.colorSeed,
                    spans: lane.spans.map { span in
                        ExpectedSpanJSON(
                            startRank: span.startRank,
                            endRank: span.endRank,
                            isOpen: span.isOpen,
                            nodes: span.nodes.map { ExpectedNodeJSON(rank: $0.rank, kind: $0.kind.rawValue, messageId: $0.messageId) }
                        )
                    }
                )
            },
            bubbles: geometry.bubbles.map { bubble in
                ExpectedBubbleJSON(
                    messageId: bubble.messageId,
                    laneId: bubble.laneId,
                    laneIndex: bubble.laneIndex,
                    rank: bubble.rank,
                    createdAtMs: bubble.createdAtMs,
                    isViewer: bubble.isViewer,
                    replyToMessageId: bubble.replyToMessageId,
                    isFirstInGroup: bubble.isFirstInGroup,
                    isSystem: bubble.isSystem
                )
            },
            connectors: geometry.connectors.map { connector in
                ExpectedConnectorJSON(
                    fromMessageId: connector.fromMessageId,
                    toMessageId: connector.toMessageId,
                    fromLaneIndex: connector.fromLaneIndex,
                    toLaneIndex: connector.toLaneIndex,
                    fromRank: connector.fromRank,
                    toRank: connector.toRank
                )
            },
            rankCount: geometry.rankCount,
            laneCount: geometry.laneCount,
            voiceCount: geometry.voiceCount,
            layout: geometry.layout.rawValue,
            serializationReason: geometry.serializationReason?.rawValue,
            silenceWindowMs: geometry.silenceWindowMs,
            maxLanes: geometry.maxLanes,
            minVoices: geometry.minVoices
        )
    }

    // MARK: - `river-step.vectors.json`

    private struct VectorCursorJSON: Decodable, Equatable {
        let laneIndex: Int
        let rank: Int
    }

    private struct StepInputJSON: Decodable {
        let lanes: VectorLanesInputJSON
        let cursor: VectorCursorJSON
        let direction: String
    }

    private struct StepExpectedJSON: Decodable, Equatable {
        let cursor: VectorCursorJSON
        let reason: String
    }

    private struct StepVectorCase: Decodable {
        let _label: String
        let input: StepInputJSON
        let expected: StepExpectedJSON
    }

    // MARK: - `river-headers.vectors.json`

    private struct HeadersInputJSON: Decodable {
        let lanes: VectorLanesInputJSON
        let focusRank: Double
        let fadeRanks: Int?
    }

    private struct HeaderExpectedJSON: Decodable {
        let laneIndex: Int
        let laneId: String
        let colorSeed: String
        let isViewer: Bool
        let alpha: Double
    }

    private struct HeadersVectorCase: Decodable {
        let _label: String
        let input: HeadersInputJSON
        let expected: [HeaderExpectedJSON]
    }

    // MARK: - Chargement des vecteurs (bundle de tests)

    /// Ressource de bundle : `packages/shared/fixtures/reading-modes/<resourceBaseName>.json`,
    /// câblée via `project.yml` (`MeeshyTests.resources`,
    /// `../../packages/shared/fixtures`, `type: folder`). Fichier introuvable,
    /// JSON invalide, ou tableau `vectors` vide (leçon 257) ⇒ `XCTFail`
    /// explicite + tableau vide retourné — jamais de vert silencieux à zéro
    /// cas exécuté.
    private static func loadVectors<Vector: Decodable>(resourceBaseName: String) -> [Vector] {
        guard let url = Bundle(for: RiverLaneVectorTests.self).url(
            forResource: resourceBaseName,
            withExtension: "json",
            subdirectory: "fixtures/reading-modes"
        ) else {
            XCTFail("""
                \(resourceBaseName).json introuvable dans le bundle de tests sous \
                fixtures/reading-modes/. Vérifier la ressource \
                `../../packages/shared/fixtures` (type: folder) dans project.yml, \
                puis `xcodegen generate`.
                """)
            return []
        }

        do {
            let data = try Data(contentsOf: url)
            let file = try JSONDecoder().decode(VectorFileJSON<Vector>.self, from: data)
            guard !file.vectors.isEmpty else {
                XCTFail("""
                    \(resourceBaseName).json contient ZÉRO cas — une suite de vecteurs ne doit \
                    jamais charger zéro cas (leçon 257, jamais de vert silencieux)
                    """)
                return []
            }
            return file.vectors
        } catch {
            XCTFail("\(resourceBaseName).json présent mais illisible/mal formé : \(error)")
            return []
        }
    }

    // MARK: - Garde de harnais (leçon 257) + RE-PREUVE des comptes (24+20+15 = 59)

    func test_vectors_allThreeFilesLoadAtLeastOneCase() {
        XCTAssertFalse((Self.loadVectors(resourceBaseName: "river-lanes.vectors") as [LanesVectorCase]).isEmpty)
        XCTAssertFalse((Self.loadVectors(resourceBaseName: "river-step.vectors") as [StepVectorCase]).isEmpty)
        XCTAssertFalse((Self.loadVectors(resourceBaseName: "river-headers.vectors") as [HeadersVectorCase]).isEmpty)
    }

    /// Re-preuve mécanique (règle RE-PROUVER) : 24+22+15 = 61 cas au total.
    /// Un changement de l'un de ces comptes doit être investigué avant
    /// d'ajuster ce nombre. (53 jusqu'à la règle « un avis système n'est la
    /// voix de personne », qui a ajouté 3 cas `river-lanes`, 1 `river-step` et
    /// 2 `river-headers`.)
    ///
    /// **59 → 61 le 2026-08-22** : l'itération 245 (`2a75b1775`, « les couloirs
    /// vivants par colonne, pas par naissance ») a ajouté DEUX vecteurs
    /// `river-step` sans toucher à ce fichier, qui les compte — le compteur a
    /// donc rougi sur `main` pour tout le monde. Les deux cas ont été
    /// VÉRIFIÉS un par un avant d'ajuster le nombre, comme cette docstring
    /// l'exige : `colonne-partagee-pas-a-droite-atteint-la-colonne-voisine`
    /// (curseur `laneIndex 2, rank 7`) et
    /// `colonne-partagee-pas-a-gauche-atteint-la-plus-proche` (`laneIndex 4,
    /// rank 10`), tous deux `reason: "moved"`. Ce ne sont pas des cas de
    /// remplissage : ils visent exactement le défaut que ce correctif répare —
    /// un pas latéral en COLONNES PARTAGÉES, là où l'ordre de naissance
    /// faisait sauter par-dessus une branche adjacente. L'assertion reste une
    /// ÉGALITÉ : la relâcher en `>=` rendrait un jeu amputé vert (leçon 257).
    func test_vectors_totalCaseCount_isSixtyOne() {
        let lanesCount = (Self.loadVectors(resourceBaseName: "river-lanes.vectors") as [LanesVectorCase]).count
        let stepCount = (Self.loadVectors(resourceBaseName: "river-step.vectors") as [StepVectorCase]).count
        let headersCount = (Self.loadVectors(resourceBaseName: "river-headers.vectors") as [HeadersVectorCase]).count

        XCTAssertEqual(lanesCount, 24, "river-lanes.vectors.json ne contient plus 24 cas.")
        XCTAssertEqual(stepCount, 22, "river-step.vectors.json ne contient plus 22 cas.")
        XCTAssertEqual(headersCount, 15, "river-headers.vectors.json ne contient plus 15 cas.")
        XCTAssertEqual(lanesCount + stepCount + headersCount, 61, "61 vecteurs Rivière attendus au total.")
    }

    /// Les vecteurs EXERCENT-ils la règle système ? Un jeu amputé de ses cas
    /// système repasserait au vert en ne prouvant plus rien (leçon 257) — la
    /// garde des comptes ci-dessus ne dit pas QUOI a disparu.
    func test_vectors_exerciseSystemNotices() {
        let cases: [LanesVectorCase] = Self.loadVectors(resourceBaseName: "river-lanes.vectors")
        let withNotice = cases.filter { $0.input.messages.contains { $0.isSystem == true } }

        XCTAssertFalse(withNotice.isEmpty, "aucun vecteur river-lanes ne porte d'avis système.")
        XCTAssertTrue(
            withNotice.contains { $0.expected.bubbles.contains { $0.isSystem } },
            "aucun vecteur ne SERT d'avis système dans ses bulles."
        )
    }

    // MARK: - Rejeu — `resolveRiverLanes` (21 vecteurs)

    func test_resolveRiverLanes_matchesAllSharedVectors() {
        let cases: [LanesVectorCase] = Self.loadVectors(resourceBaseName: "river-lanes.vectors")
        XCTAssertFalse(cases.isEmpty, "aucun vecteur river-lanes chargé — voir test_vectors_allThreeFilesLoadAtLeastOneCase")

        for testCase in cases {
            let geometry = RiverLaneResolver.resolveRiverLanes(Self.toResolveInput(testCase.input))
            XCTAssertEqual(
                Self.project(geometry), testCase.expected,
                "[\(testCase._label)] géométrie ne correspond pas au vecteur partagé"
            )
        }
    }

    // MARK: - Rejeu — `resolveRiverStep` (19 vecteurs)

    func test_resolveRiverStep_matchesAllSharedVectors() {
        let cases: [StepVectorCase] = Self.loadVectors(resourceBaseName: "river-step.vectors")
        XCTAssertFalse(cases.isEmpty, "aucun vecteur river-step chargé — voir test_vectors_allThreeFilesLoadAtLeastOneCase")

        for testCase in cases {
            let geometry = RiverLaneResolver.resolveRiverLanes(Self.toResolveInput(testCase.input.lanes))
            guard let direction = RiverLaneResolver.RiverStepDirection(rawValue: testCase.input.direction) else {
                XCTFail("[\(testCase._label)] direction inconnue dans le vecteur : \(testCase.input.direction)")
                continue
            }
            let cursor = RiverLaneResolver.RiverCursor(laneIndex: testCase.input.cursor.laneIndex, rank: testCase.input.cursor.rank)
            let step = RiverLaneResolver.resolveRiverStep(
                RiverLaneResolver.ResolveRiverStepInput(geometry: geometry, cursor: cursor, direction: direction)
            )

            XCTAssertEqual(step.cursor.laneIndex, testCase.expected.cursor.laneIndex, "[\(testCase._label)] cursor.laneIndex")
            XCTAssertEqual(step.cursor.rank, testCase.expected.cursor.rank, "[\(testCase._label)] cursor.rank")
            XCTAssertEqual(step.reason.rawValue, testCase.expected.reason, "[\(testCase._label)] reason")
        }
    }

    // MARK: - Rejeu — `resolveRiverLaneHeaders` (13 vecteurs)

    func test_resolveRiverLaneHeaders_matchesAllSharedVectors() {
        let cases: [HeadersVectorCase] = Self.loadVectors(resourceBaseName: "river-headers.vectors")
        XCTAssertFalse(cases.isEmpty, "aucun vecteur river-headers chargé — voir test_vectors_allThreeFilesLoadAtLeastOneCase")

        for testCase in cases {
            let geometry = RiverLaneResolver.resolveRiverLanes(Self.toResolveInput(testCase.input.lanes))
            let headers = RiverLaneResolver.resolveRiverLaneHeaders(
                RiverLaneResolver.ResolveRiverLaneHeadersInput(
                    geometry: geometry,
                    focusRank: testCase.input.focusRank,
                    fadeRanksOverride: testCase.input.fadeRanks
                )
            )

            XCTAssertEqual(headers.count, testCase.expected.count, "[\(testCase._label)] nombre d'en-têtes")
            for (actualHeader, expectedHeader) in zip(headers, testCase.expected) {
                XCTAssertEqual(actualHeader.laneIndex, expectedHeader.laneIndex, "[\(testCase._label)] laneIndex")
                XCTAssertEqual(actualHeader.laneId, expectedHeader.laneId, "[\(testCase._label)] laneId")
                XCTAssertEqual(actualHeader.colorSeed, expectedHeader.colorSeed, "[\(testCase._label)] colorSeed")
                XCTAssertEqual(actualHeader.isViewer, expectedHeader.isViewer, "[\(testCase._label)] isViewer")
                XCTAssertEqual(actualHeader.alpha, expectedHeader.alpha, accuracy: 1e-9, "[\(testCase._label)] alpha")
            }
        }
    }

    // MARK: - Témoins de comportement — fonctions NON vectorisées
    //
    // `resolveRiverLivingLanes`/`resolveRiverLaneAt` n'ont pas de fichier de
    // vecteurs dédié (seules `resolveRiverLanes`/`resolveRiverStep`/
    // `resolveRiverLaneHeaders` le sont). Les témoins ci-dessous transposent
    // les cas correspondants de `river-lanes.test.ts` — comparaison avec la
    // suite TS en tête de fichier : `describe('resolveRiverLivingLanes …')`
    // (L299-317), `describe('resolveRiverLaneAt …')` (L628-657), et le
    // dernier `it` de « resolveRiverStep — sérialisée » (L784-788), qui
    // éprouve `resolveRiverLivingLanes` en mode sérialisé sans qu'aucun
    // vecteur `river-step` ne l'exerce. Aucune vue montée : ces témoins
    // n'éprouvent que le miroir.

    private static let t0: Double = 1_786_957_200_000 // miroir de T0 (`Date.parse('2026-08-17T09:00:00.000Z')`) côté river-lanes.test.ts

    private static func at(_ minutes: Double) -> RiverLaneResolver.RiverTimestamp {
        .epochMilliseconds(t0 + minutes * 60_000)
    }

    private static func message(_ id: String, _ senderId: String, _ minutes: Double, replyTo: String? = nil) -> RiverLaneResolver.RiverMessageInput {
        RiverLaneResolver.RiverMessageInput(id: id, senderId: senderId, createdAt: Self.at(minutes), replyToMessageId: replyTo)
    }

    /// Miroir du helper `notice` de `river-lanes.test.ts` : un avis SYSTÈME,
    /// qui porte l'ARRIVANT pour auteur (`join-notice.ts`).
    private static func notice(_ id: String, _ senderId: String, _ minutes: Double) -> RiverLaneResolver.RiverMessageInput {
        RiverLaneResolver.RiverMessageInput(id: id, senderId: senderId, createdAt: Self.at(minutes), replyToMessageId: nil, isSystem: true)
    }

    private static func geometry(_ messages: [RiverLaneResolver.RiverMessageInput]) -> RiverLaneResolver.RiverGeometry {
        RiverLaneResolver.resolveRiverLanes(RiverLaneResolver.ResolveRiverLanesInput(
            messages: messages,
            participants: Self.defaultParticipants,
            viewerId: "me"
        ))
    }

    private static let defaultParticipants: [RiverLaneResolver.RiverParticipantInput] = [
        .init(id: "me", displayName: "Moi"),
        .init(id: "mia", displayName: "Mia"),
        .init(id: "sarah", displayName: "Sarah"),
        .init(id: "tom", displayName: "Tom"),
        .init(id: "lena", displayName: "Lena"),
    ]

    /// Miroir de `SILENCE_MINUTES` (`RIVER_LANE_SILENCE_WINDOW_MS / MINUTE`).
    private static let silenceMinutes: Double = RiverLaneResolver.laneSilenceWindowMs / 60_000

    private static func laneOf(_ geometry: RiverLaneResolver.RiverGeometry, _ laneId: String) throws -> RiverLaneResolver.RiverLane {
        try XCTUnwrap(geometry.lanes.first { $0.laneId == laneId }, "couloir \(laneId) absent de la géométrie")
    }

    /// Miroir du helper `crowd` de `river-lanes.test.ts` : `count` voix,
    /// chacune un unique message, aucun lecteur parmi elles (`viewerId: "absent"`).
    private static func crowd(_ count: Int, minutes: (Int) -> Double) -> RiverLaneResolver.ResolveRiverLanesInput {
        RiverLaneResolver.ResolveRiverLanesInput(
            messages: (0..<count).map { index in Self.message("m\(index)", "p\(index)", minutes(index)) },
            participants: (0..<count).map { index in .init(id: "p\(index)", displayName: "P\(index)") },
            viewerId: "absent"
        )
    }

    // — resolveRiverLivingLanes — seules les branches vivantes sont navigables (river-lanes.test.ts L299-317)

    func test_resolveRiverLivingLanes_returnsOnlyLivingLanesAtRank_inColumnOrder() {
        let geometry = RiverLaneResolver.resolveRiverLanes(RiverLaneResolver.ResolveRiverLanesInput(
            messages: [
                Self.message("a", "mia", 0),
                Self.message("b", "sarah", 1),
                Self.message("c", "tom", Self.silenceMinutes + 5),
            ],
            participants: Self.defaultParticipants,
            viewerId: "me"
        ))

        XCTAssertEqual(RiverLaneResolver.resolveRiverLivingLanes(geometry, rank: 0), [0])
        XCTAssertEqual(RiverLaneResolver.resolveRiverLivingLanes(geometry, rank: 1), [0, 1])
        XCTAssertEqual(RiverLaneResolver.resolveRiverLivingLanes(geometry, rank: 2), [2])
    }

    func test_resolveRiverLivingLanes_returnsEmptyAxis_outsideWindowRanks() {
        let geometry = RiverLaneResolver.resolveRiverLanes(RiverLaneResolver.ResolveRiverLanesInput(
            messages: [
                Self.message("a", "mia", 0),
                Self.message("b", "sarah", 1),
                Self.message("c", "tom", Self.silenceMinutes + 5),
            ],
            participants: Self.defaultParticipants,
            viewerId: "me"
        ))

        XCTAssertEqual(RiverLaneResolver.resolveRiverLivingLanes(geometry, rank: 9), [])
    }

    /// Dernier témoin de « resolveRiverStep — sérialisée, la rivière EST le
    /// fil » (river-lanes.test.ts L784-788) : sérialisée, un seul couloir
    /// vivant sur tout rang de la fenêtre, rien au-delà.
    func test_resolveRiverLivingLanes_serialized_singleColumnOnEveryRankOfWindow() {
        let thread = RiverLaneResolver.resolveRiverLanes(RiverLaneResolver.ResolveRiverLanesInput(
            messages: [Self.message("a", "mia", 0), Self.message("b", "sarah", 1)],
            participants: Self.defaultParticipants,
            viewerId: "me"
        ))
        XCTAssertEqual(thread.layout, .serialized)

        XCTAssertEqual(RiverLaneResolver.resolveRiverLivingLanes(thread, rank: 0), [0])
        XCTAssertEqual(RiverLaneResolver.resolveRiverLivingLanes(thread, rank: 1), [0])
        XCTAssertEqual(RiverLaneResolver.resolveRiverLivingLanes(thread, rank: 2), [])
    }

    // — resolveRiverLaneAt — une colonne partagée dit QUI l'occupe à cette hauteur (river-lanes.test.ts L628-657)

    func test_resolveRiverLaneAt_returnsTheCurrentLivingOccupant_neverTheFirstEverOnTheColumn() {
        let shared = RiverLaneResolver.resolveRiverLanes(Self.crowd(10) { index in Double(index) * (Self.silenceMinutes + 5) })

        XCTAssertEqual(RiverLaneResolver.resolveRiverLaneAt(shared, laneIndex: 0, rank: 0)?.laneId, "p0")
        XCTAssertEqual(RiverLaneResolver.resolveRiverLaneAt(shared, laneIndex: 0, rank: 4)?.laneId, "p4")
        XCTAssertEqual(RiverLaneResolver.resolveRiverLaneAt(shared, laneIndex: 0, rank: 9)?.laneId, "p9")
    }

    func test_resolveRiverLaneAt_returnsNil_onExtinguishedColumnAtThisRank() throws {
        let geometry = RiverLaneResolver.resolveRiverLanes(RiverLaneResolver.ResolveRiverLanesInput(
            messages: [
                Self.message("a", "mia", 0),
                Self.message("b", "sarah", 1),
                Self.message("c", "tom", Self.silenceMinutes + 5),
            ],
            participants: Self.defaultParticipants,
            viewerId: "me"
        ))
        let miaLane = try Self.laneOf(geometry, "mia")

        XCTAssertNil(RiverLaneResolver.resolveRiverLaneAt(geometry, laneIndex: miaLane.laneIndex, rank: 2))
        XCTAssertNil(RiverLaneResolver.resolveRiverLaneAt(geometry, laneIndex: 42, rank: 0))
    }

    func test_resolveRiverLaneAt_serialized_singleColumnBelongsToTheAuthorOfTheRank() {
        let geometry = RiverLaneResolver.resolveRiverLanes(RiverLaneResolver.ResolveRiverLanesInput(
            messages: [Self.message("a", "mia", 0), Self.message("b", "sarah", 1)],
            participants: Self.defaultParticipants,
            viewerId: "me"
        ))

        XCTAssertEqual(RiverLaneResolver.resolveRiverLaneAt(geometry, laneIndex: 0, rank: 0)?.laneId, "mia")
        XCTAssertEqual(RiverLaneResolver.resolveRiverLaneAt(geometry, laneIndex: 0, rank: 1)?.laneId, "sarah")
        XCTAssertNil(RiverLaneResolver.resolveRiverLaneAt(geometry, laneIndex: 1, rank: 0))
    }

    // Transposé de river-lanes.test.ts « sérialisée, ne nomme AUCUNE colonne au
    // rang d'une annonce — même quand l'arrivant parlera ensuite » : aucun
    // vecteur JSON n'exerce `resolveRiverLaneAt`, le miroir se tient à la main.
    func test_resolveRiverLaneAt_serialized_namesNoColumnAtTheRankOfANotice_evenWhenTheNewcomerSpeaksNext() {
        let geometry = Self.geometry([
            Self.notice("j", "mia", 0),
            Self.message("a", "mia", 1),
            Self.message("b", "sarah", 2),
        ])

        XCTAssertEqual(geometry.layout, .serialized)
        XCTAssertNil(RiverLaneResolver.resolveRiverLaneAt(geometry, laneIndex: 0, rank: 0))
        XCTAssertEqual(RiverLaneResolver.resolveRiverLaneAt(geometry, laneIndex: 0, rank: 1)?.laneId, "mia")
        XCTAssertEqual(RiverLaneResolver.resolveRiverLaneAt(geometry, laneIndex: 0, rank: 2)?.laneId, "sarah")
    }

    // — Un avis système n'est la voix de personne (river-lanes.test.ts,
    //   describe « un avis système n'est la voix de personne »).
    //
    //   Les vecteurs partagés couvrent déjà la voix, le couloir, le
    //   regroupement après l'annonce et le nom d'en-tête. Les témoins
    //   ci-dessous transposent les cas de la suite TS qu'AUCUN vecteur
    //   n'exerce : le voisinage des deux côtés, l'absence de nœud sur la
    //   branche de la personne concernée, et la réponse adressée à une
    //   annonce.

    func test_systemNotice_breaksTheGroupOnBothSides_neverContinuesANeighbour() {
        let geometry = Self.geometry([
            Self.message("a", "mia", 0),
            Self.notice("j", "mia", 1),
            Self.message("b", "mia", 2),
        ])

        XCTAssertEqual(geometry.bubbles.map(\.isFirstInGroup), [true, true, true])
    }

    func test_systemNotice_addsNoNode_toTheBranchOfThePersonItConcerns() throws {
        let geometry = Self.geometry([
            Self.message("a", "mia", 0),
            Self.message("b", "sarah", 1),
            Self.message("c", "tom", 2),
            Self.notice("j", "mia", 3),
        ])
        let nodes = try Self.laneOf(geometry, "mia").spans.flatMap(\.nodes)

        XCTAssertEqual(nodes.count, 1, "l'avis a ajouté un nœud à la branche de Mia")
        XCTAssertEqual(nodes.first?.messageId, "a")
        XCTAssertEqual(nodes.first?.rank, 0)
        XCTAssertEqual(nodes.first?.kind, .bubble)
    }

    func test_replyToASystemNotice_summonsNoBranch_andDrawsNoConnector() {
        let geometry = Self.geometry([
            Self.message("a", "mia", 0),
            Self.notice("j", "lena", 1),
            Self.message("b", "sarah", 2, replyTo: "j"),
            Self.message("c", "tom", 3),
        ])

        XCTAssertEqual(geometry.lanes.map(\.laneId), ["mia", "sarah", "tom"])
        XCTAssertEqual(geometry.connectors, [])
        XCTAssertEqual(geometry.voiceCount, 3)
    }

    /// `isSystem` est OPTIONNEL côté TS (`readonly isSystem?: boolean`) : le
    /// miroir Swift tient le même contrat par un défaut `false`, sans quoi
    /// tous les appelants existants auraient dû être réécrits.
    func test_riverMessageInput_isSystem_defaultsToFalse() {
        let plain = RiverLaneResolver.RiverMessageInput(id: "a", senderId: "mia", createdAt: Self.at(0))

        XCTAssertFalse(plain.isSystem)
        XCTAssertEqual(Self.geometry([plain]).bubbles.map(\.isSystem), [false])
    }
}
