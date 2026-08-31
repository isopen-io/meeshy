// GÉNÉRÉ — ne pas éditer à la main.
//
// Source : services/gateway/route-manifest.json, via la MÊME dérivation que le
// catalogue TypeScript (packages/shared/api/build-catalog.ts). Régénérer après
// tout changement de route :
//
//   cd packages/shared && npm run ios-endpoints:generate
//
// Les politiques d'authentification et de réessai ne sont PAS ici : ce sont des
// décisions client, écrites à la main en redéfinition de `MeeshyEndpoint`.

import Foundation

public enum VoiceEndpoint: MeeshyEndpoint, Sendable {
    case adminMetrics
    case analysis
    case analyze
    case compare
    case feedback
    case history
    case jobByJobId(jobId: String)
    case languages
    case profile
    case profileByProfileId(profileId: String)
    case profileConsent
    case profileRegister
    case transcribe
    case translate
    case translateAsync

    public var path: String {
        switch self {
        case .adminMetrics: return "/api/v1/voice/admin/metrics"
        case .analysis: return "/api/v1/voice/analysis"
        case .analyze: return "/api/v1/voice/analyze"
        case .compare: return "/api/v1/voice/compare"
        case .feedback: return "/api/v1/voice/feedback"
        case .history: return "/api/v1/voice/history"
        case .jobByJobId(let jobId): return "/api/v1/voice/job/\(jobId)"
        case .languages: return "/api/v1/voice/languages"
        case .profile: return "/api/v1/voice/profile"
        case .profileByProfileId(let profileId): return "/api/v1/voice/profile/\(profileId)"
        case .profileConsent: return "/api/v1/voice/profile/consent"
        case .profileRegister: return "/api/v1/voice/profile/register"
        case .transcribe: return "/api/v1/voice/transcribe"
        case .translate: return "/api/v1/voice/translate"
        case .translateAsync: return "/api/v1/voice/translate/async"
        }
    }
}
