import Testing
import Foundation
@testable import MeeshySDK

/// LES CONCEPTS DE « PROGRESSION », DANS L'ORDRE (#9564) — le miroir Swift de `progressionConcepts()`
/// (`packages/shared/utils/progression-layout.ts`, témoin `progression-concepts.test.ts`). La première page,
/// les fiches et le tableau de bord parcourent la MÊME liste : écrite une fois de chaque côté, comparée ici
/// clé pour clé à celle du partagé.
@Suite("ProgressionConcepts — une ligne par concept, dans l'ordre déclaré, présente seulement si sa donnée est servie")
struct ProgressionConceptsTests {

    private static func progress(meesh: Bool = false, reach: [String: Int]? = nil) -> EngagementProgress {
        EngagementProgressResolver.resolve(APIEngagementProgress(
            counters: [], milestones: [],
            streak: .init(currentStreakDays: 0, longestStreakDays: 0),
            level: .init(engagementScore: 0),
            meesh: meesh ? .init(balance: 1, mintedLifetime: 1, debitablePoints: 0, floorPoints: 0, missingPoints: 0, mintCost: 1200) : nil,
            elan: nil, achievementReach: reach
        ))
    }

    @Test("l'ordre est celui de l'issue, clé pour clé")
    func order_isTheDeclaredOne() {
        #expect(ProgressionConcept.allCases.map(\.rawValue) == [
            "level", "points", "meesh", "glory", "flame", "missions", "league", "season", "prestige",
            "elans", "badges", "defis", "succes", "showcase", "atlas",
        ])
    }

    @Test("les quinze concepts sont servis quand la passerelle sert tout")
    func served_everything_allFifteen() {
        let all = ProgressionConceptSource(
            meesh: true, defis: true, game: true, league: true, season: true, prestige: true, trophies: true, atlas: true
        )
        #expect(ProgressionConcepts.served(all) == ProgressionConcept.allCases)
    }

    @Test("l'ordre déclaré tient quelles que soient les lignes absentes")
    func served_partial_keepsTheOrder() {
        let served = ProgressionConcepts.served(ProgressionConceptSource(game: true, league: true, atlas: true))
        let ranks = served.compactMap { ProgressionConcept.allCases.firstIndex(of: $0) }
        #expect(ranks == ranks.sorted())
        #expect(Set(served).count == served.count)
        #expect(served == [.level, .points, .meesh, .glory, .flame, .missions, .league, .elans, .badges, .succes, .atlas])
    }

    @Test("devant un ancien serveur sans carte d'atteignabilité : niveau, Flamme, Élans, badges, succès")
    func served_oldServer_keepsTheFiveOfBefore() {
        #expect(ProgressionConcepts.served(ProgressionConceptSource()) == [.level, .flame, .elans, .badges, .succes])
    }

    @Test("les Meeshes entrent dès que le solde est servi, même sans bloc game")
    func served_meeshBalanceAlone_addsMeesh() {
        #expect(ProgressionConcepts.served(ProgressionConceptSource(meesh: true))
            == [.level, .meesh, .flame, .elans, .badges, .succes])
    }

    @Test("les Meeshes entrent avec le bloc game, même sans solde")
    func served_gameWithoutBalance_addsMeesh() {
        #expect(ProgressionConcepts.served(ProgressionConceptSource(game: true)).contains(.meesh))
    }

    @Test("les défis suivent la carte d'atteignabilité : sans section, pas de ligne")
    func served_defis_followTheSections() {
        #expect(!ProgressionConcepts.served(ProgressionConceptSource()).contains(.defis))
        #expect(ProgressionConcepts.served(ProgressionConceptSource(defis: true)).contains(.defis))
    }

    @Test("points, gloire et missions n'existent qu'avec le bloc game")
    func served_gameOnlyConcepts() {
        let without = ProgressionConcepts.served(ProgressionConceptSource(meesh: true, defis: true))
        let with = ProgressionConcepts.served(ProgressionConceptSource(game: true))
        for concept in [ProgressionConcept.points, .glory, .missions] {
            #expect(!without.contains(concept))
            #expect(with.contains(concept))
        }
    }

    @Test("une extension ne se lit pas sans le bloc game qui la porte")
    func served_extensionWithoutGame_isAbsent() {
        let orphan = ProgressionConceptSource(game: false, league: true, season: true, prestige: true, trophies: true, atlas: true)
        #expect(ProgressionConcepts.served(orphan) == [.level, .flame, .elans, .badges, .succes])
    }

    @Test("chaque extension sert SA ligne, et elle seule")
    func served_eachExtension_itsOwnLine() {
        let base = Set(ProgressionConcepts.served(ProgressionConceptSource(game: true)))
        let cases: [(ProgressionConceptSource, ProgressionConcept)] = [
            (ProgressionConceptSource(game: true, league: true), .league),
            (ProgressionConceptSource(game: true, season: true), .season),
            (ProgressionConceptSource(game: true, prestige: true), .prestige),
            (ProgressionConceptSource(game: true, trophies: true), .showcase),
            (ProgressionConceptSource(game: true, atlas: true), .atlas),
        ]
        for (source, concept) in cases {
            #expect(Set(ProgressionConcepts.served(source)).subtracting(base) == [concept])
        }
    }

    @Test("la progression résolue alimente la source : solde et sections")
    func source_fromResolvedProgress() {
        let old = ProgressionConceptSource(progress: Self.progress(), game: nil)
        #expect(!old.meesh)
        #expect(!old.game)
        #expect(old.defis == !Self.progress().achievementSections.isEmpty)
        #expect(ProgressionConceptSource(progress: Self.progress(meesh: true), game: nil).meesh)
        #expect(ProgressionConcepts.served(for: Self.progress(meesh: true), game: nil).contains(.meesh))
    }
}
