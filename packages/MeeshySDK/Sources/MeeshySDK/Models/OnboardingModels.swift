import Foundation

// MARK: - Onboarding post-inscription — le contrat de `/me/onboarding` (#7729)
//
// Miroir Swift de `packages/shared/types/onboarding.ts` (schémas Zod d'abord,
// types dérivés). Le SERVEUR déclare le parcours — éligibilité, étapes vues,
// étapes pré-cochées par l'engagement, régime protégé, suggestions — et les
// clients ne font que l'afficher : deux racines qui décideraient chacune
// divergeraient sans qu'aucun témoin ne rougisse.
//
// Deux règles de décodage, écrites ici parce que c'est ici qu'on serait tenté
// de les relâcher :
// 1. **Un identifiant d'étape inconnu est ÉCARTÉ, jamais fatal.** Une
//    passerelle plus récente peut ajouter une étape ; l'app installée garde les
//    cinq qu'elle sait dessiner au lieu de perdre tout le parcours.
// 2. **Le régime protégé se lit FAIL-CLOSED.** `protectedRegime` absent vaut
//    `true`, et un régime protégé impose l'audience « amis » quelle que soit la
//    valeur servie à côté — la même règle que le serveur (âge inconnu ⇒
//    mineur), rejouée ici pour qu'une charge incomplète ne publie jamais en
//    public la story d'un mineur.

/// Les cinq cartes, dans l'ordre du parcours.
public enum OnboardingStepId: String, CaseIterable, Codable, Sendable, Hashable {
    case languages
    case global
    case story
    case friends
    case notifications
}

/// Ce que l'utilisateur a fait d'une carte.
public enum OnboardingStepOutcome: String, Codable, Sendable, Hashable {
    case done
    case skipped
}

/// L'audience par défaut de la première story.
public enum OnboardingStoryVisibility: String, Codable, Sendable, Hashable {
    case `public`
    case friends
}

/// Un profil proposé à la carte « Trouve ta bande ». Aucune présence, aucun
/// `lastActiveAt` : la présence ne se sert qu'entre amis, et ces profils ne le
/// sont pas encore.
public struct APIOnboardingSuggestion: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let username: String
    public let displayName: String
    public let avatarUrl: String?
    public let languages: [String]

    public init(id: String, username: String, displayName: String, avatarUrl: String?, languages: [String]) {
        self.id = id
        self.username = username
        self.displayName = displayName
        self.avatarUrl = avatarUrl
        self.languages = languages
    }
}

/// L'état servi par `GET /me/onboarding` et rendu par chaque `PATCH`.
public struct APIOnboardingState: Codable, Sendable, Equatable {
    /// Le plafond de la carte « Trouve ta bande » — le contrat en sert au plus six.
    public static let maxSuggestions = 6

    public let eligible: Bool
    /// ISO 8601, tel que la route le sérialise. Gardé en chaîne : c'est la
    /// forme du contrat, et rien à l'écran ne le date.
    public let completedAt: String?
    public let seenSteps: [OnboardingStepId]
    public let prefilledSteps: [OnboardingStepId]
    public let globalConversationId: String?
    public let protectedRegime: Bool
    public let storyDefaultVisibility: OnboardingStoryVisibility
    public let suggestions: [APIOnboardingSuggestion]

    public init(
        eligible: Bool,
        completedAt: String?,
        seenSteps: [OnboardingStepId],
        prefilledSteps: [OnboardingStepId],
        globalConversationId: String?,
        protectedRegime: Bool,
        storyDefaultVisibility: OnboardingStoryVisibility,
        suggestions: [APIOnboardingSuggestion]
    ) {
        self.eligible = eligible
        self.completedAt = completedAt
        self.seenSteps = seenSteps
        self.prefilledSteps = prefilledSteps
        self.globalConversationId = globalConversationId
        self.protectedRegime = protectedRegime
        self.storyDefaultVisibility = protectedRegime ? .friends : storyDefaultVisibility
        self.suggestions = Array(suggestions.prefix(Self.maxSuggestions))
    }

    private enum CodingKeys: String, CodingKey {
        case eligible, completedAt, seenSteps, prefilledSteps, globalConversationId
        case protectedRegime, storyDefaultVisibility, suggestions
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let isProtected = try container.decodeIfPresent(Bool.self, forKey: .protectedRegime) ?? true
        let servedVisibility = try container.decodeIfPresent(String.self, forKey: .storyDefaultVisibility)
            .flatMap(OnboardingStoryVisibility.init(rawValue:)) ?? .friends
        self.init(
            eligible: try container.decodeIfPresent(Bool.self, forKey: .eligible) ?? false,
            completedAt: try container.decodeIfPresent(String.self, forKey: .completedAt),
            seenSteps: Self.knownSteps(try container.decodeIfPresent([String].self, forKey: .seenSteps)),
            prefilledSteps: Self.knownSteps(try container.decodeIfPresent([String].self, forKey: .prefilledSteps)),
            globalConversationId: try container.decodeIfPresent(String.self, forKey: .globalConversationId),
            protectedRegime: isProtected,
            storyDefaultVisibility: servedVisibility,
            suggestions: try container.decodeIfPresent([APIOnboardingSuggestion].self, forKey: .suggestions) ?? []
        )
    }

    private static func knownSteps(_ raw: [String]?) -> [OnboardingStepId] {
        (raw ?? []).compactMap(OnboardingStepId.init(rawValue:))
    }
}

/// Le corps d'un `PATCH /me/onboarding` : une carte vue, ou la fin du parcours.
/// Un type SOMME plutôt qu'une structure aux champs optionnels — `step` sans
/// `outcome`, ou `finish` avec un `step`, ne sont pas des états du contrat, et
/// ce type ne sait pas les écrire.
public enum OnboardingUpdate: Encodable, Sendable, Equatable {
    case step(OnboardingStepId, OnboardingStepOutcome)
    case finish

    private enum CodingKeys: String, CodingKey {
        case step, outcome, finish
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .step(let step, let outcome):
            try container.encode(step, forKey: .step)
            try container.encode(outcome, forKey: .outcome)
        case .finish:
            try container.encode(true, forKey: .finish)
        }
    }
}
