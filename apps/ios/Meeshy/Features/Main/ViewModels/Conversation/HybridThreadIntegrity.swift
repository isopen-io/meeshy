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
/// base des messages. Ce registre retient le texte scellé de chaque message,
/// s'il est à SA place (même conversation, même auteur authentifié par
/// libsignal, même message cité — la règle de `EndToEndThreadPlaintexts`) ET
/// rattaché à CE message (`HybridDeviceLayer.isBound` : identifiant client des
/// deux côtés, instant scellé dans la fenêtre). Le verdict se rejuge à chaque
/// pose, sur la ligne telle qu'elle est : égal ⇒ vérifié ; différent ⇒ écart,
/// le texte SERVI reste affiché et celui de l'appareil se dévoile à la
/// demande ; non rattaché ⇒ invérifiable. Aucun verdict sans enveloppe : un
/// message hybride venu d'un appareil sans libsignal ne prétend rien. Une
/// instance par conversation ouverte.
final class HybridThreadIntegrity {
    /// Ce que le coffre a rendu pour un message hybride, déjà jugé à sa place.
    nonisolated enum SealedLayer: Equatable, Sendable {
        /// Rattaché à CE message : son texte scellé.
        case bound(text: String)
        /// À sa place, mais rien ne le rattache à CE message avec certitude.
        case unbound
    }

    @Published private(set) var layers: [String: SealedLayer] = [:]
    /// Les messages déjà lus au coffre : une relecture du magasin ne repasse
    /// par le coffre (et par une tâche) que pour un message neuf, ou après
    /// qu'une enveloppe de la conversation s'est ouverte (`reopen`).
    private var checked: Set<String> = []

    init() {}

    // Isolé au MainActor : une deinit isolée tue xctest au démontage hors
    // d'une tâche (iOS 18.4+/26, Swift #85663).
    // Garde : MainActorDeinitSourceGuardTests / check-ios-isolated-deinits.sh.
    nonisolated deinit {}

    /// Un message hybride d'un AUTRE membre, vivant, écrit par une personne.
    nonisolated static func awaitsVerdict(_ message: MeeshyMessage) -> Bool {
        HybridDeviceLayer.isHybrid(message.encryptionMode)
            && !message.isMe
            && message.deletedAt == nil
            && message.messageSource == .user
    }

    /// Ce message doit-il être lu au coffre à cette relecture ?
    func needsRead(_ message: MeeshyMessage) -> Bool {
        Self.awaitsVerdict(message) && !checked.contains(message.id)
    }

    /// Une enveloppe de la conversation vient de s'ouvrir : tout se relit.
    func reopen() {
        checked.removeAll()
    }

    /// La couche scellée de ce message, si son clair est au coffre ET à sa
    /// place ; `nil` sinon (aucune prétention). À sa place sans rattachement
    /// certain : `.unbound`.
    nonisolated static func layer(
        for message: MeeshyMessage,
        entry: E2EEPlaintextEntry?,
        conversationId: String
    ) -> SealedLayer? {
        guard let entry, case .readable(let content, let senderUserId) = entry else { return nil }
        guard EndToEndThreadPlaintexts.isInPlace(content, senderUserId: senderUserId, for: message, conversationId: conversationId) else {
            Logger.e2ee.warning("hybrid device layer not in place message=\(message.id, privacy: .public)")
            return nil
        }
        let bound = HybridDeviceLayer.isBound(
            sealedClientMessageId: content.clientMessageId,
            servedClientMessageId: message.servedClientMessageId ?? message.clientMessageId,
            sealedAtMilliseconds: content.sentAt,
            servedCreatedAt: message.createdAt
        )
        guard bound else {
            Logger.e2ee.warning("hybrid device layer not bound message=\(message.id, privacy: .public)")
            return .unbound
        }
        return .bound(text: content.text ?? "")
    }

    /// Le verdict sur la ligne TELLE QU'ELLE EST : une édition servie après
    /// coup se rejuge contre le texte scellé, jamais en silence.
    nonisolated static func integrity(of message: MeeshyMessage, layer: SealedLayer?) -> HybridDeviceLayerIntegrity? {
        switch layer {
        case nil: nil
        case .unbound: .unverifiable
        case .bound(let text): HybridDeviceLayer.judge(served: message.content, sealed: text, edited: message.isEdited)
        }
    }

    /// Le verdict de la couche appareil pour ce message lu au coffre.
    nonisolated static func verdict(
        for message: MeeshyMessage,
        entry: E2EEPlaintextEntry?,
        conversationId: String
    ) -> HybridDeviceLayerIntegrity? {
        integrity(of: message, layer: layer(for: message, entry: entry, conversationId: conversationId))
    }

    /// Le verdict retenu pour ce message, rejugé sur la ligne donnée.
    func integrity(of message: MeeshyMessage) -> HybridDeviceLayerIntegrity? {
        guard Self.awaitsVerdict(message) else { return nil }
        return Self.integrity(of: message, layer: layers[message.id])
    }

    /// Lit au coffre la couche appareil des messages hybrides du lot (le texte
    /// SERVI, tel que le magasin le rend) et retient chaque couche à sa place.
    func resolve(_ messages: [MeeshyMessage], from endToEnd: any EndToEndMessagingProviding, conversationId: String, account: String) async {
        let candidates = messages.filter { Self.awaitsVerdict($0) }
        guard !candidates.isEmpty else { return }
        let entries = await endToEnd.plaintexts(for: candidates.map(\.id), as: account)
        checked.formUnion(candidates.map(\.id))
        let found = candidates.reduce(into: [String: SealedLayer]()) { partial, message in
            partial[message.id] = Self.layer(for: message, entry: entries[message.id], conversationId: conversationId)
        }
        guard found.contains(where: { layers[$0.key] != $0.value }) else { return }
        layers.merge(found) { _, fresh in fresh }
    }

    /// Pose le verdict sur la ligne que la cellule rend. Le texte servi n'est
    /// JAMAIS remplacé : c'est lui que la modération, le signalement et la
    /// recherche voient ; un auteur qui enverrait un texte bénin au serveur et
    /// un autre dans ses enveloppes ne contourne rien (audit #14369).
    func apply(to message: inout MeeshyMessage) {
        message.deviceLayerIntegrity = integrity(of: message)
    }

    /// Le motif d'un signalement : en cas d'écart, les DEUX textes partent, le
    /// servi et celui de l'appareil, bornés pour tenir sous les 2 000 unités
    /// UTF-16 que la route accepte (Zod mesure en UTF-16). Le lecteur qui
    /// signale choisit de remettre au serveur le texte que l'appareil de
    /// l'expéditeur lui a scellé.
    nonisolated static func reportReason(_ reason: String?, served: String, integrity: HybridDeviceLayerIntegrity?) -> String? {
        guard let deviceText = integrity?.deviceText else { return reason }
        let parts = [
            reason.map { clipped($0, to: reportReasonBudget) },
            "[hybrid-device-layer-mismatch]",
            "served: " + clipped(served, to: reportTextBudget),
            "device: " + clipped(deviceText, to: reportTextBudget),
        ]
        return clipped(parts.compactMap { $0?.isEmpty == false ? $0 : nil }.joined(separator: "\n"), to: reportLimit)
    }

    /// Le motif du signalement de ce message du fil : en cas d'écart, les deux textes.
    func reportReason(_ reason: String?, for messageId: String, in messages: [MeeshyMessage]) -> String? {
        guard let reported = messages.first(where: { $0.id == messageId }) else { return reason }
        return Self.reportReason(reason, served: reported.content, integrity: integrity(of: reported))
    }

    nonisolated static let reportLimit = 2_000
    nonisolated private static let reportReasonBudget = 150
    nonisolated private static let reportTextBudget = 880

    /// Le plus long préfixe de caractères entiers tenant en `limit` unités UTF-16.
    nonisolated private static func clipped(_ text: String, to limit: Int) -> String {
        var units = 0
        let kept = text.prefix(while: { character in
            units += character.utf16.count
            return units <= limit
        })
        return String(kept)
    }
}
