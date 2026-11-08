import Combine
import Foundation
import MeeshySDK
import MeeshyUI

/// Le Bring sur la fiche d'une personne (#13936, iso `user-profile-bring.tsx`) : « Bring » expliqué, « Restants
/// aujourd'hui », ABSENT quand la passerelle ne l'ouvre pas — ni bouton grisé, ni raison : un blocage ne se devine pas.
///
/// - **Le serveur décide de tout** : niveau (dès Ami), quota du jour du destinataire, blocage, service coupé.
/// - **Tant que ça sonne** : « Ça sonne chez X » et « Annuler », jusqu'à `bring:stopped` ou `expiresAt` (`BringCenter`).
/// - Le compteur se met à jour depuis la réponse de l'envoi, sans relire.
@MainActor
final class ProfileBringViewModel: ObservableObject {

    let userId: String

    @Published private(set) var availability: BringAvailability?
    @Published private(set) var ringing: BringSent?
    @Published private(set) var isSending = false
    @Published var notice: String?

    private let service: BringProviding
    private let center: BringCenter
    private var cancellables = Set<AnyCancellable>()

    nonisolated deinit {}

    init(userId: String, service: BringProviding, center: BringCenter) {
        self.userId = userId
        self.service = service
        self.center = center
        ringing = center.outgoing[userId]
        let lane = OrderedEventLane()
        center.$outgoing
            .map { $0[userId] }
            .removeDuplicates()
            .relay(through: lane) { [weak self] sent in await self?.follow(sent) }
            .store(in: &cancellables)
        lane.store(in: &cancellables)
    }

    private func follow(_ sent: BringSent?) {
        ringing = sent
    }

    /// La ligne existe : la passerelle sert `available: true`.
    var isOffered: Bool { availability?.available == true }

    func load() async {
        guard let served = try? await service.availability(userId: userId), served.userId.lowercased() == userId.lowercased() else {
            return
        }
        availability = served
    }

    /// Après la confirmation : envoyer, puis dire ce que la passerelle a répondu.
    @discardableResult
    func send(name: String) async -> BringSendOutcome? {
        guard !isSending, let current = availability, current.available, !current.isExhausted else { return nil }
        isSending = true
        defer { isSending = false }
        let outcome = await service.send(userId: userId)
        switch outcome {
        case .sent(let sent):
            center.didSend(sent)
            ringing = sent
            availability = current.counted(perDay: sent.perDay, remainingToday: sent.remainingToday)
            HapticFeedback.success()
        case .gone:
            availability = current.withdrawn
        case .quota:
            availability = current.counted(perDay: current.perDay, remainingToday: 0)
            notice = ProfileBringWording.quota(name: name)
        case .offline:
            notice = String(localized: "bring.offline", defaultValue: "Le Bring a besoin du réseau", bundle: .main)
        case .failed:
            notice = String(localized: "bring.failed", defaultValue: "Le Bring n’est pas parti, réessayez", bundle: .main)
        }
        return outcome
    }

    /// « Annuler » : le Bring cesse chez l'autre, optimiste.
    func cancel() {
        center.cancelOutgoing(to: userId)
        ringing = nil
    }
}

/// Les phrases du Bring, une clé par sens (sept langues dans `Localizable.xcstrings`).
enum ProfileBringWording {
    static var explain: String {
        String(localized: "bring.explain", defaultValue: "Pour une urgence extrême : son téléphone sonne, même en silencieux.", bundle: .main)
    }

    static var action: String { String(localized: "bring.action", defaultValue: "Bring", bundle: .main) }

    static func remaining(_ availability: BringAvailability) -> String {
        guard let left = availability.remainingToday else {
            return String(localized: "bring.unlimited", defaultValue: "Sans limite aujourd’hui", bundle: .main)
        }
        return String(format: String(localized: "bring.remaining", defaultValue: "Restants aujourd’hui : %lld", bundle: .main), left)
    }

    static func quota(name: String) -> String {
        String(format: String(localized: "bring.quota", defaultValue: "Plus de Bring aujourd’hui vers %@", bundle: .main), name)
    }

    static func ringing(name: String) -> String {
        String(format: String(localized: "bring.ringing", defaultValue: "Ça sonne chez %@", bundle: .main), name)
    }

    static var cancel: String { String(localized: "bring.cancel", defaultValue: "Annuler le Bring", bundle: .main) }

    static func confirmTitle(name: String) -> String {
        String(format: String(localized: "bring.confirm.title", defaultValue: "Faire sonner le téléphone de %@ ?", bundle: .main), name)
    }

    static func confirmBody(name: String) -> String {
        String(format: String(localized: "bring.confirm.body", defaultValue: "Le Bring est réservé aux urgences extrêmes. Il sonne jusqu’à ce que %@ l’arrête, deux minutes au plus. Meeshy n’est pas un service d’urgence : en cas de danger, appelez les secours.", bundle: .main), name)
    }

    static var confirmSend: String { String(localized: "bring.confirm.send", defaultValue: "Faire sonner", bundle: .main) }
}
