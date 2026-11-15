import Foundation
import MeeshyE2EE
import MeeshySDK
import os

/// **Le mode hybride chiffre deux fois** (#14369, décision passerelle « le
/// mode hybride chiffre deux fois »).
///
/// Dans un tête-à-tête hybride, le texte part EN CLAIR vers la passerelle
/// (couche serveur : elle le scelle au repos, le traduit, le cherche) ET scellé
/// sous libsignal pour chaque appareil du correspondant et mes autres appareils
/// approuvés (couche appareil), dans la même requête REST. Le scellement est
/// celui du bout en bout (`EndToEndMessagingProviding.deliver`, 409 Sesame
/// rechiffré) : aucune primitive nouvelle.
///
/// L'hybride ne bloque jamais l'utilisateur : sans session, sans appareil
/// chiffrant chez le correspondant, ou devant un refus de la couche appareil,
/// l'envoi repart en couche serveur seule, et la raison se journalise.
///
/// Modèle de menace : la couche appareil donne l'INTÉGRITÉ (le destinataire
/// compare le texte servi au texte scellé) et protège le transit ; elle ne
/// retire pas le clair au serveur, qui lit la couche serveur.
extension EndToEndSendSealer {

    /// L'envoi ajoute-t-il la couche appareil ? Un texte seul, dans un
    /// tête-à-tête hybride, vers un pair connu. Une conversation qui exige le
    /// bout en bout ne passe jamais par ici : elle se scelle entière.
    func sealsDeviceLayer(for outgoing: OutgoingMessage) -> Bool {
        hybridDeviceLayer
            && !requiresSeal
            && !senderUserId.isEmpty
            && EndToEndSendGate.refusal(for: outgoing, isDirect: isDirect, peerUserId: peerUserId) == nil
    }

    /// Scelle la couche appareil et la remet avec le clair par `emitSealed`
    /// (REST : le socket ne porte pas d'enveloppes) ; si la couche appareil ne
    /// peut pas naître ou est refusée, remet le clair seul par `emitPlain`.
    /// Une panne de transport remonte telle quelle : la reprise la traite.
    func deliverHybrid(
        _ outgoing: OutgoingMessage,
        context: SendAttemptContext,
        wireEffectFlags: UInt32?,
        emitSealed: @escaping @MainActor @Sendable (SealedOutgoingPayload) async throws -> SentMessageReceipt,
        emitPlain: @escaping @MainActor @Sendable (SealedOutgoingPayload) async throws -> SentMessageReceipt
    ) async throws -> SentMessageReceipt {
        let plain = plaintext(outgoing, context: context, wireEffectFlags: wireEffectFlags)
        guard let peerUserId else { return try await emitPlain(plain) }
        let plainRequest = plain.request
        let plainContent = plain.content
        let epoch = regimeEpoch
        do {
            return try await endToEnd.deliver(content(of: outgoing, context: context), from: senderUserId, to: peerUserId) { sealed in
                let request = plainRequest.withHybridDeviceLayer(
                    senderDeviceId: sealed.senderDeviceId, envelopes: sealed.envelopes,
                    unapprovedOwnDevices: sealed.unapprovedOwnDevices, regimeEpoch: epoch
                )
                do {
                    return try await emitSealed(SealedOutgoingPayload(request: request, content: plainContent, isEncrypted: false))
                } catch let error as MeeshyError {
                    if case .rejected(let rejection) = error, let mismatch = rejection.e2eeMismatch { throw mismatch }
                    throw error
                }
            }
        } catch {
            guard Self.degradesToServerLayer(error) else { throw error }
            Logger.messages.warning("hybrid device layer not sealed, server layer only reason=\(String(describing: type(of: error)), privacy: .public)")
            return try await emitPlain(plain)
        }
    }

    /// Un échec de la COUCHE APPAREIL (scellement impossible, refus `E2EE_*`
    /// de la passerelle) se replie sur la couche serveur seule. Ne se replient
    /// pas : une panne de transport ou une annulation (la reprise les traite)
    /// et le refus d'un clair (`E2EE_PLAINTEXT_REFUSED`) : la conversation est
    /// passée au bout en bout, et renvoyer le clair le referait traverser.
    static func degradesToServerLayer(_ error: any Error) -> Bool {
        switch error {
        case is CancellationError, is URLError:
            return false
        case let meeshy as MeeshyError:
            guard let code = meeshy.e2eeCode else { return false }
            return code != EndToEndSendGate.serverPlaintextRefusalCode
        default:
            return true
        }
    }
}

/// La route d'un envoi de TEXTE hors bout en bout (#14369) : un tête-à-tête
/// hybride ajoute la couche appareil, tout autre envoi part par le chemin
/// ordinaire du fil (socket d'abord, puis REST). La reprise d'une panne rejoue
/// toujours le clair seul, que le fil a déjà composé.
@MainActor
struct HybridTextRoute {
    let viewModel: ConversationViewModel
    let sealer: EndToEndSendSealer

    func emit(_ outgoing: OutgoingMessage, plain: SealedOutgoingPayload, context: SendAttemptContext) async throws -> SentMessageReceipt {
        guard sealer.sealsDeviceLayer(for: outgoing) else {
            return try await viewModel.emit(outgoing, payload: plain, context: context)
        }
        let host = viewModel
        return try await sealer.deliverHybrid(
            outgoing, context: context, wireEffectFlags: host.wireEffectFlags(context.intent),
            emitSealed: { [weak host] sealed in
                guard let host else { throw CancellationError() }
                return try await host.sendCoordinator.emit(outgoing, payload: sealed, context: context, socketFirst: false)
            },
            emitPlain: { [weak host] unsealed in
                guard let host else { throw CancellationError() }
                return try await host.emit(outgoing, payload: unsealed, context: context)
            }
        )
    }
}
