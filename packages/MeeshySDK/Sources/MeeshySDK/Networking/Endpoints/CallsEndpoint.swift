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

public enum CallsEndpoint: MeeshyEndpoint, Sendable {
    case active
    case byCallId(callId: String)
    case byCallIdParticipants(callId: String)
    case byCallIdParticipantsByParticipantId(callId: String, participantId: String)
    case byCallIdTranscript(callId: String)
    case history
    case root

    public var path: String {
        switch self {
        case .active: return "/api/v1/calls/active"
        case .byCallId(let callId): return "/api/v1/calls/\(callId)"
        case .byCallIdParticipants(let callId): return "/api/v1/calls/\(callId)/participants"
        case .byCallIdParticipantsByParticipantId(let callId, let participantId): return "/api/v1/calls/\(callId)/participants/\(participantId)"
        case .byCallIdTranscript(let callId): return "/api/v1/calls/\(callId)/transcript"
        case .history: return "/api/v1/calls/history"
        case .root: return "/api/v1/calls"
        }
    }
}
