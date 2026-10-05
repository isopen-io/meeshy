import Foundation
import MeeshySDK

/// Le jour où l'invitation a été montrée, sur CET appareil (#8239).
protocol ActivationInviteDayStoring {
    func wasShownToday(now: Date) -> Bool
    func markShown(now: Date)
}

/// Le jour civil LOCAL, en clé stable — même forme que `StreakActivityMark`.
struct UserDefaultsActivationInviteDayStore: ActivationInviteDayStoring {
    private static let key = "meeshy.activationInvite.shownOn"
    private let defaults: UserDefaults
    private let calendar: Calendar

    init(defaults: UserDefaults = .standard, calendar: Calendar = .current) {
        self.defaults = defaults
        self.calendar = calendar
    }

    func wasShownToday(now: Date) -> Bool {
        defaults.string(forKey: Self.key) == day(now)
    }

    func markShown(now: Date) {
        defaults.set(day(now), forKey: Self.key)
    }

    private func day(_ date: Date) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return "\(c.year ?? 0)-\(c.month ?? 0)-\(c.day ?? 0)"
    }
}

/// « Validez votre compte » (#8239, loi serveur #8238) — de J7 à J28, un compte
/// à l'adresse non prouvée est invité, à l'ouverture de l'app, à la prouver et
/// à ajouter un numéro, sans quitter l'app.
///
/// La modal ne s'ouvre qu'en phase `invite` et quand il reste quelque chose à
/// demander ; au plus une fois par jour et par appareil — le jour est retenu dès
/// qu'elle s'ouvre. Ouverte, elle ABSORBE les preuves qui arrivent par
/// l'utilisateur courant (numéro vérifié dans `SecurityView`, adresse prouvée
/// par le lien) au lieu de se rouvrir.
@MainActor
final class ActivationInviteViewModel: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466) → double-free au démontage
    // hors d'une tâche. Garde : MainActorDeinitSourceGuardTests.
    nonisolated deinit {}

    @Published var isPresented = false
    @Published private(set) var activation: UserActivation?
    @Published private(set) var email: String?
    @Published private(set) var proven: [UserActivation.Channel] = []

    private let store: ActivationInviteDayStoring
    private let now: () -> Date

    init(store: ActivationInviteDayStoring = UserDefaultsActivationInviteDayStore(), now: @escaping () -> Date = Date.init) {
        self.store = store
        self.now = now
    }

    var missing: [UserActivation.Channel] { activation?.missing ?? [] }
    var isComplete: Bool { activation != nil && missing.isEmpty }
    var daysLeft: Int? { activation?.daysLeft(now: now()) }

    func userChanged(_ user: MeeshyUser?) {
        guard let user else {
            isPresented = false
            return
        }
        if isPresented {
            absorbProofs(of: user)
            return
        }
        guard let served = user.activation, served.invites, !store.wasShownToday(now: now()) else { return }
        store.markShown(now: now())
        activation = served
        email = user.email
        proven = []
        isPresented = true
    }

    func prove(_ channel: UserActivation.Channel) {
        guard let current = activation, current.missing.contains(channel) else { return }
        let rest = current.missing.filter { $0 != channel }
        activation = channel == .email
            ? UserActivation(phase: .done, deadline: nil, missing: rest)
            : UserActivation(phase: current.phase, deadline: current.deadline, missing: rest)
        proven.append(channel)
    }

    func dismiss() {
        isPresented = false
    }

    private func absorbProofs(of user: MeeshyUser) {
        if user.emailVerifiedAt != nil { prove(.email) }
        if user.phoneVerifiedAt != nil, user.phoneNumber?.isEmpty == false { prove(.phone) }
    }
}
