import Foundation

/// Le budget d'ajouts sans accord (#19812) : au-delà, la passerelle rend 429
/// `COMMUNITY_ADDITION_BUDGET_EXCEEDED` (+ `Retry-After`) et n'écrit RIEN.
///
/// Ce refus se DIT à l'auteur (« réessayez plus tard ») : le transport ne le
/// rejoue pas (`APIRetryPolicy.neverReplayed429Codes`) et le lève avec son code
/// (`MeeshyError.rejected`). Un 429 sans ce code — le plafond global par IP —
/// reste une panne ordinaire. Le refus ne dit pas QUI est saturé, l'acteur ou
/// la personne ajoutée (#20664).
public enum CommunityAdditionBudget {
    public static let refusalCode = "COMMUNITY_ADDITION_BUDGET_EXCEEDED"

    public static func isThrottled(_ error: Error) -> Bool {
        guard case MeeshyError.rejected(let rejection) = error else { return false }
        return rejection.statusCode == 429 && rejection.code == refusalCode
    }
}
