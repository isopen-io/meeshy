import Foundation
import MeeshySDK

/// LE MODÈLE DE LA CARTE DU GUIDE (#9379) — ce que `GameGuideCardView` affiche,
/// bâti depuis la loi (`GameGuide`) : un MOMENT (`GameGuide.moment`) ou une
/// ÉTAPE de l'intégration (`GameGuide.onboardingSteps`). La carte ne décide rien
/// — ni qui parle, ni quand, ni en entier ou en court : elle le reçoit. Miroir
/// de `apps/web/src/lib/game-guide/card.ts`.
struct GuideCard: Equatable, Identifiable {
    struct Step: Equatable {
        /// 1 à 7.
        let index: Int
        let total: Int
    }

    /// La clé « vue » que le serveur garde : celle du moment, ou `onboarding.<étape>`.
    let key: String
    let speaker: GuideSpeaker
    let mood: GuideMood
    let copy: GuideCopy
    let action: GuideAction
    let presentation: GuidePresentation
    /// Présent pour une étape d'intégration : « Étape 3 sur 7 ».
    let step: Step?
    /// Le moment se photographie (conception, partie VI) : la carte propose « Immortaliser ».
    let photo: Bool

    var id: String { key }
}

/// Les deux colibris que la carte pose : un seul locuteur, ou les deux ensemble
/// pour les grands moments. Les identifiants sont ceux du catalogue
/// `MeeStickerCatalog` — le dessin n'est jamais recopié.
struct GuideFigures: Equatable {
    let meeFilmID: String?
    let meoFilmID: String?
}

enum GameGuideCard {

    /// Les moments que la conception range parmi les photos : nouveau rang ou
    /// division, nouveau palier de niveau, Prestige, première Meesh, palier du
    /// trésor.
    static let photoMoments: Set<GuideMomentKey> = [.newRank, .newTier, .level100, .firstMint, .treasuryTier]

    static func isPhotoMoment(_ key: GuideMomentKey) -> Bool {
        photoMoments.contains(key)
    }

    static func ofMoment(_ moment: GuideMoment) -> GuideCard {
        GuideCard(
            key: moment.key.rawValue,
            speaker: moment.speaker,
            mood: moment.mood,
            copy: GameGuideCopy.moment(moment),
            action: moment.action,
            presentation: moment.presentation,
            step: nil,
            photo: isPhotoMoment(moment.key)
        )
    }

    static func ofStep(_ step: OnboardingStep) -> GuideCard {
        GuideCard(
            key: GameGuide.onboardingSeenKey(step.key),
            speaker: step.speaker,
            mood: step.mood,
            copy: GameGuideCopy.step(step),
            action: step.action,
            presentation: .full,
            step: GuideCard.Step(index: step.index, total: GameGuide.onboardingSteps.count),
            photo: false
        )
    }

    // MARK: - Les figures

    private static func meeFilm(_ mood: GuideMood) -> String {
        switch mood {
        case .guide: "mee-bonjour"
        case .cheer: "mee-fete"
        case .minting: "mee-jackpot"
        case .ready: "mee-coucou"
        case .streak: "mee-danse"
        case .counting: "mee-je-reflechis"
        case .calm: "mee-sourire"
        case .sad: "mee-pleure"
        case .proud: "mee-bravo"
        }
    }

    private static func meoFilm(_ mood: GuideMood) -> String {
        switch mood {
        case .guide: "meo-salut"
        case .cheer: "meo-bravo"
        case .minting: "meo-muscles"
        case .ready: "meo-clin"
        case .streak: "meo-feu-artifice"
        case .counting: "meo-hmm"
        case .calm: "meo-ok"
        case .sad: "meo-effondre"
        case .proud: "meo-roi"
        }
    }

    static func figures(speaker: GuideSpeaker, mood: GuideMood) -> GuideFigures {
        switch speaker {
        case .mee: GuideFigures(meeFilmID: meeFilm(mood), meoFilmID: nil)
        case .meo: GuideFigures(meeFilmID: nil, meoFilmID: meoFilm(mood))
        case .duo: GuideFigures(meeFilmID: meeFilm(mood), meoFilmID: meoFilm(mood))
        }
    }
}
