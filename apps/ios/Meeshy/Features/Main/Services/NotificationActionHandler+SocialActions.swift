import UIKit
import Combine
@preconcurrency import UserNotifications
import MeeshySDK
import os

private nonisolated let logger = MeeshyLog.logger(.push)

extension NotificationActionHandler {
    // MARK: - Inline comment on social pushes (R3/R4)

    /// Threading rule (spec D4-R3, décidé) :
    ///  - comment / thread notifications → the produced comment is a threaded
    ///    reply to THE notified comment (`parentId = commentId`) ;
    ///  - `friend_new_post` (or any non-thread type) → root comment ;
    ///  - missing `commentId` on a thread type → degrade to a root comment
    ///    rather than dropping the user's text.
    nonisolated static func threadedParentCommentId(
        type: String,
        notifiedCommentId: String?
    ) -> String? {
        let threadReplyTypes: Set<String> = [
            "post_comment",
            "comment_reply",
            "story_new_comment",
            "story_thread_reply",
            "friend_story_comment"
        ]
        guard threadReplyTypes.contains(type),
              let notifiedCommentId,
              !notifiedCommentId.isEmpty else { return nil }
        return notifiedCommentId
    }

    func handleComment(
        _ payload: NotificationPayload,
        userInfo: [AnyHashable: Any],
        replyText: String?
    ) async {
        guard let postId = payload.postId else {
            logger.warning("comment action without postId — ignoring")
            return
        }
        let text = (replyText ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else {
            logger.warning("comment action with empty text — ignoring")
            return
        }
        guard isRegisteredUser() else {
            logger.warning("comment action from an anonymous session — commenting requires a registered account, ignoring")
            return
        }

        let parentId = Self.threadedParentCommentId(
            type: payload.type ?? "",
            notifiedCommentId: userInfo["commentId"] as? String
        )
        let clientMutationId = ClientMutationId.generate()
        // #9743, M2 — l'auteur est le compte que le JETON désigne, et la
        // notification doit s'adresser à lui.
        guard let owner = NotificationReplyFailure.author(token: authTokenProvider(), userInfo: userInfo) else {
            CommentSendTrace.log("notification : réponse refusée — le jeton ne désigne pas le destinataire")
            notifyUnsentComment()
            return
        }
        let comment = CreateCommentPayload(
                    clientMutationId: clientMutationId,
                    postId: postId,
                    parentCommentId: parentId,
                    content: text,
                    // #6587 — une réponse rapide depuis l'écran verrouillé n'a
                    // PAS de pastille : il n'y a aucune langue déclarée à
                    // porter. `nil` laisse le repli serveur s'appliquer, EXACTEMENT
                    // comme sur la tentative REST jumelle ci-dessous — les deux
                    // chemins partagent le même cmid et doivent donner le même
                    // commentaire, quel que soit celui qui atterrit le premier.
                    originalLanguage: nil,
                    authorId: owner
        )

        await prepareReplyQueue()
        var kept = false
        do {
            try await replyQueue.enqueueComment(comment, ownerId: owner)
            kept = true
        } catch {
            logger.error("comment outbox enqueue failed: \(error.localizedDescription, privacy: .private)")
        }

        do {
            try await commentPublisher.publish(comment, pieces: [])
            kept = true
            logger.info("notification comment sent")
        } catch {
            logger.error("comment REST send failed — outbox row will retry with the same mutation id: \(error.localizedDescription, privacy: .private)")
        }
        if !kept {
            CommentSendTrace.log("notification : ni envoyée ni gardée — l'utilisateur est prévenu")
            notifyUnsentComment()
        }

        // #6999 — commenter, c'est consommer : la notification commentée passe
        // lue, et le FIL du post quitte le centre. Ce chemin ne faisait que le
        // second, laissant la ligne de cloche non lue — contrairement à
        // `reply`, son jumeau côté conversation, qui marque lu depuis toujours.
        await consumeTapped(payload)
        removeDeliveredForPost(postId)
    }

    // MARK: - Friend request accept / decline (R5)

    /// R5 — ACCEPT/DECLINE execute the REST response in background instead of
    /// the historical navigation (which parked a `pendingNotificationPayload`
    /// that lock-screen taps never consumed — the request was neither
    /// accepted nor refused). The push carries `senderId` (and
    /// `friendRequestId` once the gateway enriches its payload); when only
    /// the sender is known, the pending request is resolved via
    /// `receivedRequests`.
    func handleFriendResponse(
        _ payload: NotificationPayload,
        userInfo: [AnyHashable: Any],
        accepted: Bool
    ) async {
        let type = payload.type ?? ""
        guard type == "friend_request" || type == "contact_request" else {
            // accept/decline are only registered on MEESHY_FRIEND_REQUEST —
            // an unexpected type falls back to the historical navigation.
            openNotification(userInfo)
            return
        }
        guard isRegisteredUser() else {
            logger.warning("friend request action from an anonymous session — ignoring")
            return
        }
        // La demande s'adressait à un autre compte de l'appareil : la trancher
        // ici accepterait ou refuserait celle du compte ACTIF venue du même
        // expéditeur.
        guard NotificationReplyFailure.isAddressed(to: currentUserId(), userInfo: userInfo) else {
            logger.warning("friend request action on a notification addressed to another account — ignoring")
            return
        }

        do {
            guard let requestId = try await resolveFriendRequestId(payload, userInfo: userInfo) else {
                logger.warning("friend request action without resolvable request id — falling back to navigation")
                openNotification(userInfo)
                return
            }
            _ = try await friendService.respond(requestId: requestId, accepted: accepted)
            logger.info("friend request \(requestId, privacy: .public) \(accepted ? "accepted" : "declined", privacy: .public) from notification")
            // #6999 — la demande est TRANCHÉE : sa notification est consommée.
            // Le chemin `reply` le faisait déjà (via `localMarkRead`) ; celui-ci
            // retirait la bannière et laissait la ligne de cloche non lue, avec
            // son compteur — une demande d'ami n'a ni `conversationId` ni
            // `postId`, donc aucun autre chemin ne l'aurait rattrapée.
            await consumeTapped(payload)
            if let senderId = payload.senderId {
                Self.removeDeliveredNotifications(
                    matching: {
                        ($0["type"] as? String) == type
                            && ($0["senderId"] as? String) == senderId
                    }
                )
            }
        } catch {
            // A thrown resolution (`receivedRequests`) or a failed `respond`
            // must not silently drop the user's intent — surface the app on
            // the request screen, same degradation as the unresolvable-id
            // path above. The banner is only purged on success, so the user
            // can also re-tap later.
            logger.error("friend request \(accepted ? "accept" : "decline", privacy: .public) failed: \(error.localizedDescription, privacy: .public) — falling back to navigation")
            openNotification(userInfo)
        }
    }

    private func resolveFriendRequestId(
        _ payload: NotificationPayload,
        userInfo: [AnyHashable: Any]
    ) async throws -> String? {
        if let explicit = userInfo["friendRequestId"] as? String, !explicit.isEmpty {
            return explicit
        }
        guard let senderId = payload.senderId else { return nil }
        let pending = try await friendService.friendRequests(
            direction: .received, status: "pending", q: nil, cursor: nil, limit: 50
        )
        return pending.data.first(where: { $0.senderId == senderId })?.id
    }
}
