import Foundation

// MARK: - Ce que ce binaire sait LIRE, déclaré à chaque requête (#9929, #9223)
//
// La production a des utilisateurs : une passerelle plus récente ne sert une
// forme nouvelle qu'au client qui la DÉCLARE, et les autres continuent de lire
// l'ancienne. `X-Canvas-Caps` et `X-Meeshy-Game-Version` disent un NIVEAU ;
// `X-Meeshy-Capabilities` dit une LISTE de capacités nommées, séparées par
// des virgules — une capacité de plus est un cas de plus ici, jamais un
// en-tête de plus.

/// Une capacité que ce binaire déclare à la passerelle.
public enum ClientCapability: String, CaseIterable, Sendable {
    /// L'étape d'onboarding `age` et `viewerWriteRestriction` dans
    /// `/me/onboarding` (#9927) : la passerelle ne les sert qu'à qui sait les
    /// dessiner.
    case onboardingAge = "onboarding-age"
}

public enum ClientCapabilities {
    public static let headerName = "X-Meeshy-Capabilities"

    /// Toutes les capacités de ce binaire, dans l'ordre de leur déclaration.
    public static let declared: [ClientCapability] = ClientCapability.allCases

    public static func headerValue(_ capabilities: [ClientCapability] = declared) -> String {
        capabilities.map(\.rawValue).joined(separator: ",")
    }
}
