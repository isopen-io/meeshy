import Foundation
import MeeshySDK
import os

/// Entonnoir unique par lequel passe TOUT rapport de consommation d'un média.
///
/// ## Le problème qu'il résout
///
/// Six endroits postaient `POST /attachments/:id/status` en `try?` inline :
/// le lecteur audio, le lecteur vidéo partagé, le renderer vidéo, la visionneuse
/// d'images, la visionneuse de documents et le coordinateur d'enregistrement.
/// Hors-ligne, chacun échouait en silence. Une écoute dans le métro, un
/// visionnage en avion, une image ouverte dans un ascenseur : rien n'était
/// jamais remonté, et rien ne le serait au retour du réseau.
///
/// ## Pourquoi tout passe par l'outbox, même en ligne
///
/// Poster en direct quand le réseau est là et via l'outbox sinon paraît
/// économique, mais fabrique une course : deux rapports successifs sur le même
/// média peuvent alors arriver dans le désordre, et l'ordre porte du sens —
/// les segments s'accumulent, la position finale est celle du dernier rapport.
/// Un seul chemin, FIFO, garantit que le serveur voit la lecture telle qu'elle
/// s'est déroulée.
///
/// Le seul repli est l'absence de base : dans un contexte où `OfflineQueue`
/// n'a pas de pool (aperçus SwiftUI, extension), on poste en direct plutôt que
/// de perdre le rapport.
public nonisolated enum AttachmentStatusReporter {

    private static let logger = Logger(subsystem: "com.meeshy.app", category: "AttachmentStatus")

    /// Point d'injection pour les tests. Le chemin réel rend le rapport durable.
    ///
    /// `nonisolated(unsafe)` : écrit une fois au montage d'un test, lu ensuite ;
    /// aucun accès concurrent réel, et le typer en `actor` imposerait un `await`
    /// à des appelants `@MainActor` synchrones.
    public nonisolated(unsafe) static var sink: @Sendable (String, AttachmentStatusBody) async -> Void = {
        attachmentId, body in
        await persist(attachmentId: attachmentId, body: body)
    }

    /// Remonte la consommation d'un média. Ne bloque jamais l'appelant et ne
    /// jette jamais : un rapport perdu ne doit pas interrompre une lecture.
    public static func report(attachmentId: String, body: AttachmentStatusBody) {
        Task { await sink(attachmentId, body) }
    }

    /// Variante attendable, pour les appelants déjà dans un contexte async qui
    /// veulent que le rapport soit enregistré avant de continuer (fermeture
    /// d'écran, passage en arrière-plan).
    public static func reportAwaiting(attachmentId: String, body: AttachmentStatusBody) async {
        await sink(attachmentId, body)
    }

    // MARK: - Chemin réel

    static func persist(attachmentId: String, body: AttachmentStatusBody) async {
        let payload = ReportAttachmentStatusPayload(
            clientMutationId: ClientMutationId.generate(),
            attachmentId: attachmentId,
            action: body.action,
            playPositionMs: body.playPositionMs,
            durationMs: body.durationMs,
            complete: body.complete,
            wasZoomed: body.wasZoomed,
            stretches: body.stretches,
            language: body.language
        )

        do {
            _ = try await OfflineQueue.shared.enqueue(
                .reportAttachmentStatus,
                payload: payload,
                conversationId: attachmentId
            )
        } catch OfflineQueueError.poolNotConfigured {
            // Pas de base sous la main : mieux vaut un envoi direct qui peut
            // échouer qu'un rapport jeté à coup sûr.
            await postDirectly(attachmentId: attachmentId, body: body)
        } catch {
            logger.error(
                "Rapport de consommation non persisté pour \(attachmentId, privacy: .public) : \(error.localizedDescription, privacy: .public)"
            )
            await postDirectly(attachmentId: attachmentId, body: body)
        }
    }

    private static func postDirectly(attachmentId: String, body: AttachmentStatusBody) async {
        do {
            let _: APIResponse<[String: String]>? = try await APIClient.shared.post(
                AttachmentsEndpoint.byAttachmentIdStatus(attachmentId: attachmentId),
                body: body
            )
        } catch {
            logger.error(
                "Repli direct échoué pour \(attachmentId, privacy: .public) : \(error.localizedDescription, privacy: .public)"
            )
        }
    }
}
