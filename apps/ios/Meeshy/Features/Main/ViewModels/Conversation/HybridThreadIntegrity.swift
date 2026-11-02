import Combine
import Foundation
import MeeshyE2EE
import MeeshySDK
import os

/// **Ce que la couche appareil d'un message hybride dit du texte servi, sur
/// le fil** (#14369).
///
/// L'enveloppe libsignal d'un message hybride s'ouvre comme celle d'un message
/// `e2ee` (`E2EEEnvelopeOpener`) et son clair va au coffre scellé, jamais à la
/// base des messages. Ce registre compare ce clair au texte que la passerelle
/// a servi, s'il est à SA place (même conversation, même auteur authentifié par
/// libsignal, même identifiant client, même message cité — la règle de
/// `EndToEndThreadPlaintexts`) : égal ⇒ vérifié ; différent ⇒ le texte de
/// l'auteur s'affiche et l'écart se signale ; message modifié ⇒ invérifiable.
/// Aucun verdict sans enveloppe : un message hybride venu d'un appareil sans
/// libsignal ne prétend rien. Une instance par conversation ouverte.
final class HybridThreadIntegrity {
    @Published private(set) var verdicts: [String: HybridDeviceLayerIntegrity] = [:]

    init() {}

    // Isolé au MainActor : une deinit isolée tue xctest au démontage hors
    // d'une tâche (iOS 18.4+/26, Swift #85663).
    // Garde : MainActorDeinitSourceGuardTests / check-ios-isolated-deinits.sh.
    nonisolated deinit {}

    /// Un message hybride d'un AUTRE membre, vivant, écrit par une personne.
    static func awaitsVerdict(_ message: MeeshyMessage) -> Bool {
        HybridDeviceLayer.isHybrid(message.encryptionMode)
            && !message.isMe
            && message.deletedAt == nil
            && message.messageSource == .user
    }

    /// Le verdict de la couche appareil pour ce message, s'il a un clair au
    /// coffre ET que ce clair est à sa place ; `nil` sinon (aucune prétention).
    static func verdict(
        for message: MeeshyMessage,
        entry: E2EEPlaintextEntry?,
        conversationId: String
    ) -> HybridDeviceLayerIntegrity? {
        guard let entry, case .readable(let content, let senderUserId) = entry else { return nil }
        guard EndToEndThreadPlaintexts.isInPlace(content, senderUserId: senderUserId, for: message, conversationId: conversationId) else {
            Logger.e2ee.warning("hybrid device layer not in place message=\(message.id, privacy: .public)")
            return nil
        }
        return HybridDeviceLayer.judge(served: message.content, sealed: content.text ?? "", edited: message.isEdited)
    }

    /// Lit au coffre la couche appareil des messages hybrides du lot (le texte
    /// SERVI, tel que le magasin le rend) et retient chaque verdict.
    func resolve(_ messages: [MeeshyMessage], from endToEnd: any EndToEndMessagingProviding, conversationId: String, account: String) async {
        let candidates = messages.filter(Self.awaitsVerdict)
        guard !candidates.isEmpty else { return }
        let entries = await endToEnd.plaintexts(for: candidates.map(\.id), as: account)
        let found = candidates.reduce(into: [String: HybridDeviceLayerIntegrity]()) { verdicts, message in
            verdicts[message.id] = Self.verdict(for: message, entry: entries[message.id], conversationId: conversationId)
        }
        guard found.contains(where: { verdicts[$0.key] != $0.value }) else { return }
        verdicts.merge(found) { _, fresh in fresh }
    }

    /// Pose le verdict sur la ligne que la cellule rend ; un écart y remplace
    /// le texte servi par celui que l'appareil de l'auteur a scellé.
    func apply(to message: inout MeeshyMessage) {
        guard Self.awaitsVerdict(message), let verdict = verdicts[message.id] else { return }
        message.deviceLayerIntegrity = verdict
        if case .mismatch(let deviceText) = verdict { message.content = deviceText }
    }
}
