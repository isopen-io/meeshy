import SwiftUI
import MeeshySDK

/// UN TÉLÉPHONE INJOIGNABLE QUI DURE (#20241) — la passerelle me sert que le téléphone d'un proche ne répond plus depuis
/// `unreachableSince` (son dernier signe de vie, après ses sondes : `PHONE_REACHABILITY_CONFIG`). Passé
/// `minimumSilence`, ce qui exige son téléphone ne peut plus aboutir : le talkie devient un message vocal, « Demander un
/// relevé » disparaît. Sans état servi, ou au-delà du TTL du contrat, rien ne change : ce client ne devine rien.
nonisolated enum PhoneUnreachableLasting {
    /// Cinq minutes de silence au moins depuis le dernier signe de vie. La passerelle n'en sert un état qu'après ses
    /// deux sondes : le seuil écarte seulement une horloge ou un épisode tout juste ouvert.
    static let minimumSilence: TimeInterval = 5 * 60

    static func isLasting(_ state: PhoneReachabilityState?, now: Date) -> Bool {
        guard let state, !state.isExpired(at: now) else { return false }
        return now.timeIntervalSince(state.unreachableSince) >= minimumSilence
    }

    /// Le temps qu'il reste avant que le silence compte ; `nil` quand il compte déjà ou qu'il n'y a rien à attendre.
    static func remaining(_ state: PhoneReachabilityState?, now: Date) -> TimeInterval? {
        guard let state, !state.isExpired(at: now) else { return nil }
        let left = minimumSilence - now.timeIntervalSince(state.unreachableSince)
        return left > 0 ? left : nil
    }
}

/// « Demander un relevé » (batterie, au Sang) : il réveille le téléphone de la personne. Un téléphone qu'on SAIT
/// injoignable ne répondra pas : la rangée ne se propose pas (rien de non actionnable).
nonisolated enum ProfileBatteryPullOffer {
    static func offers(canPull: Bool, unreachable: PhoneReachabilityState?, now: Date) -> Bool {
        canPull && !PhoneUnreachableLasting.isLasting(unreachable, now: now)
    }
}

/// Lit, pour une personne, si son téléphone est injoignable depuis assez longtemps : la valeur du cache tout de suite,
/// chacun de ses changements, et le passage du seuil sans attendre un autre événement.
struct PhoneUnreachableLastingReader: ViewModifier {
    let userId: String
    @Binding var lasting: Bool
    @State private var state: PhoneReachabilityState?

    func body(content: Content) -> some View {
        content
            .task(id: userId) {
                state = nil
                lasting = false
                guard !userId.isEmpty else { return }
                for await next in PhoneReachabilityLiveState.stream(of: userId).values {
                    state = next
                    lasting = PhoneUnreachableLasting.isLasting(next, now: Date())
                }
            }
            .task(id: state) {
                guard let wait = PhoneUnreachableLasting.remaining(state, now: Date()) else { return }
                do {
                    try await Task.sleep(for: .seconds(wait + 1))
                } catch {
                    return
                }
                lasting = PhoneUnreachableLasting.isLasting(state, now: Date())
            }
    }
}
