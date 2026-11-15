import SwiftUI
import MeeshySDK

/// L'IDENTITÉ D'UN FAIT RENDU (#11180, épopée § 3.3) — un fait ne paraît qu'une fois par écran. MIROIR de `FactId`
/// (`apps/web/src/lib/view/progression-state.ts`) : les mêmes noms, sur le web et sur iOS.
///
/// Le dédoublonnage compare des IDENTITÉS, jamais des chaînes. Le même fait habillé autrement (une ligne, une phrase
/// qui l'enchâsse, un autre libellé) reste le même fait ; deux rendus de la même identité sur un écran sont un défaut.
nonisolated struct ProgressionFactID: RawRepresentable, Hashable, Sendable, CustomStringConvertible {
    let rawValue: String

    init(rawValue: String) { self.rawValue = rawValue }

    var description: String { rawValue }

    static let level = Self(rawValue: "level")
    static let tier = Self(rawValue: "tier")
    static let levelNext = Self(rawValue: "level_next")
    static let levelTop = Self(rawValue: "level_top")
    static let levelRecord = Self(rawValue: "level_record")
    static let levelProgress = Self(rawValue: "level_progress")
    static let levelStep = Self(rawValue: "level_step")
    static let score = Self(rawValue: "score")

    static let sparksPocket = Self(rawValue: "sparks_pocket")
    static let sparksLifetime = Self(rawValue: "sparks_lifetime")
    static let sparksDebt = Self(rawValue: "sparks_debt")

    static let meeshHeld = Self(rawValue: "meesh_held")
    static let minted = Self(rawValue: "minted")
    static let treasuryTier = Self(rawValue: "treasury_tier")
    static let treasuryNext = Self(rawValue: "treasury_next")
    static let treasuryLocked = Self(rawValue: "treasury_locked")
    static let mintNext = Self(rawValue: "mint_next")
    static let mintPrice = Self(rawValue: "mint_price")
    static let mintMissing = Self(rawValue: "mint_missing")
    static let mintGlory = Self(rawValue: "mint_glory")
    static let mintNextSpecial = Self(rawValue: "mint_next_special")
    static let canMint = Self(rawValue: "can_mint")

    static let rank = Self(rawValue: "rank")
    static let glory = Self(rawValue: "glory")
    static let rankNext = Self(rawValue: "rank_next")
    static let gloryMissing = Self(rawValue: "glory_missing")

    static let streak = Self(rawValue: "streak")
    static let streakRecord = Self(rawValue: "streak_record")
    static let flameForm = Self(rawValue: "flame_form")
    static let freezes = Self(rawValue: "freezes")
    static let flameState = Self(rawValue: "flame_state")

    static let missionsDone = Self(rawValue: "missions_done")
    static let missionsUnlockLevel = Self(rawValue: "missions_unlock_level")
    static let chest = Self(rawValue: "chest")
    static let missionExpiring = Self(rawValue: "mission_expiring")
    static let prismDay = Self(rawValue: "prism_day")

    static let league = Self(rawValue: "league")
    static let leaguePlace = Self(rawValue: "league_place")
    static let weekPoints = Self(rawValue: "week_points")
    static let leagueCloses = Self(rawValue: "league_closes")
    static let leagueZone = Self(rawValue: "league_zone")
    static let leagueMissing = Self(rawValue: "league_missing")
    static let leagueFriends = Self(rawValue: "league_friends")
    static let leagueFriendsDoor = Self(rawValue: "league_friends_door")
    static let leagueUnlockLevel = Self(rawValue: "league_unlock_level")

    static let season = Self(rawValue: "season")
    static let seasonWeek = Self(rawValue: "season_week")
    static let seasonSteps = Self(rawValue: "season_steps")
    static let seasonStars = Self(rawValue: "season_stars")
    static let seasonNext = Self(rawValue: "season_next")
    static let seasonSeal = Self(rawValue: "season_seal")

    static let prestigeStars = Self(rawValue: "prestige_stars")
    static let prestigeGlory = Self(rawValue: "prestige_glory")
    static let prestigeDoor = Self(rawValue: "prestige_door")

    static let factor = Self(rawValue: "factor")
    static let elanFamilies = Self(rawValue: "elan_families")
    static let tailwind = Self(rawValue: "tailwind")
    static let prismHour = Self(rawValue: "prism_hour")

    static let trophies = Self(rawValue: "trophies")
    static let showcaseVisibility = Self(rawValue: "showcase_visibility")
    static let atlasStamps = Self(rawValue: "atlas_stamps")
    static let atlasLeft = Self(rawValue: "atlas_left")
    static let atlasPending = Self(rawValue: "atlas_pending")
    static let atlasVisibility = Self(rawValue: "atlas_visibility")

    /// « 3 / 12 » pour Médailles, Défis, Hauts faits : ce qui est obtenu.
    static func earned(_ concept: ProgressionConcept) -> Self { Self(rawValue: "\(concept.rawValue)_earned") }
    /// « encore 9 à décrocher » : ce qui reste.
    static func left(_ concept: ProgressionConcept) -> Self { Self(rawValue: "\(concept.rawValue)_left") }
    /// Une famille de médailles, chacune son fait.
    static func badgeFamily(_ family: EngagementAxisFamily) -> Self { Self(rawValue: "badge_family_\(family.rawValue)") }
}

/// Un texte et les faits qu'il porte : la ligne d'une carte (un fait, ou deux pour « Coffret · le Coffre s'ouvre à
/// 100 »), ou la phrase d'état d'une fiche, qui en enchâsse plusieurs.
nonisolated struct ProgressionFactText: Equatable, Sendable {
    let text: String
    let facts: [ProgressionFactID]

    init(_ text: String, _ facts: ProgressionFactID...) {
        self.text = text
        self.facts = facts
    }

    init(text: String, facts: [ProgressionFactID]) {
        self.text = text
        self.facts = facts
    }

    /// Deux phrases à la suite : leurs faits s'additionnent, chacun une fois.
    func then(_ next: ProgressionFactText) -> ProgressionFactText {
        ProgressionFactText(text: text + " " + next.text,
                            facts: facts + next.facts.filter { !facts.contains($0) })
    }
}

/// Le fait que l'EMBLÈME lui-même montre (l'anneau porte le niveau), et ce qu'un lecteur d'écran en entend.
nonisolated struct ProgressionEmblemFact: Equatable, Sendable {
    let fact: ProgressionFactID
    let label: String
}

// MARK: - Les faits que l'écran RENDU déclare

/// Les faits qu'un écran du jeu a réellement rendus, dans l'ordre : chaque vue qui montre un chiffre le DÉCLARE par
/// `GameFactsTag`. Une préférence remonte l'arbre rendu — une branche non montée ne déclare rien —, et la garde lit
/// ce qui est monté, pas ce que le code prévoit.
nonisolated struct GameFactsKey: PreferenceKey {
    static var defaultValue: [ProgressionFactID] { [] }

    static func reduce(value: inout [ProgressionFactID], nextValue: () -> [ProgressionFactID]) {
        value.append(contentsOf: nextValue())
    }
}

/// Déclare les faits qu'une vue montre : `.modifier(GameFactsTag(…))`. Un modificateur, pas une extension de `View` :
/// la garde de cohésion mesure `View` en unité.
struct GameFactsTag: ViewModifier {
    let facts: [ProgressionFactID]

    init(_ facts: [ProgressionFactID]) { self.facts = facts }

    /// Le fait que la vue montre ; `nil` : elle n'en montre aucun.
    init(_ fact: ProgressionFactID?) { self.facts = fact.map { [$0] } ?? [] }

    func body(content: Content) -> some View {
        content.transformPreference(GameFactsKey.self) { $0.append(contentsOf: facts) }
    }
}
