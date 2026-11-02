import Foundation
import MeeshySDK
import os

/// **Le régime d'une réponse rapide se CONFIRME avant tout clair** (#13165,
/// suivi de #13067, règle fail-closed #9229, bout en bout irréversible #12949).
///
/// La garde du régime (`EndToEndDestinationGuard`) lit ce que CET appareil a
/// vu : sa mémoire, la ligne de la liste, le fil en cache. Une conversation
/// passée chiffrée de bout en bout sur un AUTRE appareil pendant que celui-ci
/// dormait n'y est pas : la réponse depuis la bannière posait alors une ligne,
/// une entrée d'outbox et une requête en clair, que la passerelle refusait
/// trop tard.
///
/// Trois sources, dans l'ordre, et une seule qui dit le bout en bout scelle :
/// 1. la garde, nourrie du mode que porte le push (`conversationEncryptionMode`,
///    ou `encryptionMode`) : il ne peut qu'AJOUTER le bout en bout, car il date
///    de l'envoi du message et la conversation a pu basculer depuis ;
/// 2. le mode relu de la passerelle juste avant l'envoi, borné dans le temps :
///    seul lui peut dire le clair ;
/// 3. faute de relecture (hors ligne, délai, erreur), le régime n'est PAS
///    confirmé : la réponse suit le chemin chiffré — le coffre, ou rien —,
///    jamais l'outbox ni le réseau.
///
/// Modèle de menace : serveur honnête, appareil en retard sur le régime ;
/// serveur qui sert sans mode une conversation vue chiffrée (la garde). Hors
/// modèle : la bascule qui survient entre la relecture et la requête (la
/// passerelle refuse alors le clair, `E2EE_PLAINTEXT_REFUSED`), et un serveur
/// malveillant qui ment sur le mode d'une conversation que l'appareil n'a
/// jamais vue chiffrée (#12520).
struct NotificationReplyRegime {
    enum Destination: Equatable {
        /// La passerelle vient de servir un régime où elle lit le message.
        case readableByServer
        /// Une source dit le bout en bout : le clair ne quitte pas le coffre.
        case endToEnd
        /// Le régime n'a pas pu être relu : traité comme le bout en bout.
        case unconfirmed
    }

    /// Les clés du push qui portent le mode : celle de la conversation, et
    /// celle du message, qui ne peut dire `e2ee` que dans une conversation
    /// chiffrée de bout en bout.
    static let pushedModeKeys = ["conversationEncryptionMode", "encryptionMode"]

    let destinationGuard: EndToEndDestinationGuard
    let servedMode: @MainActor (String) async throws -> String?
    var limit: Duration = .seconds(6)

    /// Les modes portés par le push. Une valeur qui n'est pas une chaîne se lit
    /// comme un mode inconnu, donc comme le bout en bout.
    static func pushedModes(_ userInfo: [AnyHashable: Any]) -> [String?] {
        pushedModeKeys.compactMap { key -> String? in
            guard let value = userInfo[key], !(value is NSNull) else { return nil }
            return value as? String ?? unreadableMode
        }
    }

    private static let unreadableMode = "unreadable"

    @MainActor
    func destination(of conversationId: String, userInfo: [AnyHashable: Any]) async -> Destination {
        if await destinationGuard.seals(conversationId, served: Self.pushedModes(userInfo)) { return .endToEnd }
        guard let served = await freshlyServedMode(of: conversationId) else {
            Logger.e2ee.warning("notification reply: regime not confirmed by the gateway, kept off the network")
            return .unconfirmed
        }
        return await destinationGuard.seals(conversationId, served: [served.mode]) ? .endToEnd : .readableByServer
    }

    @MainActor
    private func freshlyServedMode(of conversationId: String) async -> ServedMode? {
        let slot = OSAllocatedUnfairLock<ServedMode?>(initialState: nil)
        let read = servedMode
        let fetch = Task { @MainActor in
            do {
                let served = ServedMode(mode: try await read(conversationId))
                slot.withLock { $0 = served }
            } catch {}
        }
        await BoundedWait.first(of: fetch, orAfter: limit)
        fetch.cancel()
        return slot.withLock { $0 }
    }

    private struct ServedMode: Sendable {
        let mode: String?
    }
}
