import Combine
import Foundation
import MeeshyE2EE
import MeeshySDK

/// Compte les appareils chiffrés qu'un utilisateur a publiés (`GET
/// /e2ee/keys/:userId/devices`).
protocol EndToEndPeerDeviceCounting: Sendable {
    func encryptedDeviceCount(of userId: String) async throws -> Int
}

nonisolated struct EndToEndDirectoryDeviceCounter: EndToEndPeerDeviceCounting {
    var directory: any E2EEDirectoryClientProviding = E2EEDirectoryClient()

    func encryptedDeviceCount(of userId: String) async throws -> Int {
        try await directory.devices(userId: userId).devices.count
    }
}

/// Ce que cet appareil SAIT des pairs sans appareil chiffré (#20074) : appris
/// à l'ouverture d'un fil chiffré par la liste de leurs appareils, confirmé par
/// le refus `recipientHasNoDevice` d'un envoi, oublié dès que la liste en
/// montre un. Une lecture qui échoue ne change rien : on ne dit que ce qu'on
/// sait, jamais un bandeau sur une supposition.
///
/// Partagé par l'application (`shared`) : le fil rouvert le sait sans attendre
/// le réseau (cache-first), et le relit en silence.
final class EndToEndPeerDeviceReach: ObservableObject {
    static let shared = EndToEndPeerDeviceReach()

    @Published private(set) var withoutEncryptedDevice: Set<String> = []
    private let counter: any EndToEndPeerDeviceCounting

    init(counter: any EndToEndPeerDeviceCounting = EndToEndDirectoryDeviceCounter()) {
        self.counter = counter
    }

    nonisolated deinit {}

    func lacksEncryptedDevice(_ userId: String) -> Bool {
        withoutEncryptedDevice.contains(userId)
    }

    /// Relit la liste des appareils du pair ; une erreur laisse l'état tel quel.
    func refresh(_ userId: String) async {
        guard !userId.isEmpty, let count = try? await counter.encryptedDeviceCount(of: userId) else { return }
        guard count == 0 else { return forget(userId) }
        confirmWithoutDevice(userId)
    }

    /// L'envoi chiffré l'a constaté : le pair n'a aucun appareil chiffré.
    func confirmWithoutDevice(_ userId: String) {
        guard !userId.isEmpty, !withoutEncryptedDevice.contains(userId) else { return }
        withoutEncryptedDevice.insert(userId)
    }

    private func forget(_ userId: String) {
        guard withoutEncryptedDevice.contains(userId) else { return }
        withoutEncryptedDevice.remove(userId)
    }
}

/// Le bandeau « ne peut pas recevoir de messages chiffrés » se montre dans un
/// tête-à-tête chiffré de bout en bout dont le pair est CONNU sans appareil
/// chiffré, et seulement là.
enum EndToEndPeerWithoutDeviceBannerRule {
    static func shows(sealsEndToEnd: Bool, isDirect: Bool, peerLacksDevice: Bool) -> Bool {
        sealsEndToEnd && isDirect && peerLacksDevice
    }

    static func title(peerName: String) -> String {
        let name = PeerFirstName.of(peerName)
        guard !name.isEmpty else {
            return String(localized: "conversation.e2ee.peerWithoutDevice.titleAnonymous",
                          defaultValue: "Votre correspondant ne peut pas recevoir de messages chiffrés",
                          bundle: .main)
        }
        return String(localized: "conversation.e2ee.peerWithoutDevice.title",
                      defaultValue: "\(name) ne peut pas recevoir de messages chiffrés",
                      bundle: .main)
    }
}

/// Le refus 409 `E2EE_PARTICIPANT_WITHOUT_DEVICE` (#20073) d'une bascule ou
/// d'une création de direct en bout en bout : rien n'est activé, et la phrase
/// nomme le membre sans appareil. La bascule nomme les membres
/// (`withoutDeviceUserIds`), la création non : sans liste, c'est le pair.
enum EndToEndParticipantWithoutDeviceRefusal {
    static func matches(_ error: any Error) -> Bool {
        (error as? MeeshyError)?.e2eeCode == E2EEErrorCode.participantWithoutDevice
    }

    static func withoutDeviceUserIds(in error: any Error) -> [String] {
        guard case .rejected(let rejection)? = error as? MeeshyError else { return [] }
        return rejection.withoutDeviceUserIds
    }

    /// La phrase : le prénom du pair s'il est nommé (ou si personne ne l'est),
    /// sinon la phrase sans nom — un autre membre, ou moi-même.
    static func message(peerUserId: String?, peerName: String?, withoutDeviceUserIds: [String]) -> String {
        let namesPeer = withoutDeviceUserIds.isEmpty || peerUserId.map(withoutDeviceUserIds.contains) == true
        let name = namesPeer ? PeerFirstName.of(peerName) : ""
        guard !name.isEmpty else {
            return String(localized: "conversation.e2ee.participantWithoutDevice.anonymous",
                          defaultValue: "Un membre ne peut pas encore recevoir de messages chiffrés : rien n’est activé.",
                          bundle: .main)
        }
        return String(localized: "conversation.e2ee.participantWithoutDevice.named",
                      defaultValue: "\(name) ne peut pas encore recevoir de messages chiffrés : rien n’a été activé.",
                      bundle: .main)
    }
}
