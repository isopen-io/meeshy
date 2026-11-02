import Foundation

/// Le motif LOCALISÉ d'un refus d'appel que la passerelle nomme par un code
/// typé (`CALL_ERROR_CODES`, `packages/shared/types/video-call.ts`). `nil` pour
/// tout autre code : l'appelant garde alors son repli habituel.
nonisolated enum CallRefusalMessage {
    static func localized(forCode code: String?) -> String? {
        switch code {
        case "CALLEE_REFUSES_NON_CONTACTS":
            return String(
                localized: "call.error.callee_refuses_non_contacts",
                defaultValue: "Cette personne n'accepte que les appels de ses contacts",
                bundle: .main
            )
        default:
            return nil
        }
    }
}
