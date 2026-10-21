import Foundation
import SocketIO
import Combine
import os

extension MessageSocketManager {

    // MARK: - Event Handlers

    func setupMessageEventHandlers() {
        guard let socket else { return }

        socket.on(clientEvent: .error) { [weak self] data, _ in
            // Never force a logout from a socket error (#10442: a guest's ended session stops the transport). Loose string
            // matching on error payloads produced false positives that kicked
            // the user out on transient failures. Socket.IO's built-in
            // reconnect loop will retry; the APIClient 401 path (which calls
            // `AuthManager.handleUnauthorized`) is the only place that can
            // trigger a silent token refresh, and even that preserves the
            // session on failure.
            self?.handleSocketError(data)
        }

        // --- Heartbeat ACK — measure RTT ---
        socket.on("heartbeat:ack") { [weak self] data, _ in
            guard let self else { return }
            guard let payload = data.first as? [String: Any],
                  let serverTimeStr = payload["serverTime"] as? String else { return }
            // Compute RTT from latencyHintMs when available (server computed it from
            // clientTime we sent). Fall back to wall-clock if the field is absent.
            let rtt: Double
            if let hint = payload["latencyHintMs"] as? Double {
                rtt = hint * 2 // hint is one-way; double for round-trip
            } else {
                // No server-computed hint: approximate from current wall time vs serverTime.
                if let serverDate = WireDate.date(from: serverTimeStr) {
                    rtt = abs(Date().timeIntervalSince(serverDate)) * 1000 // ms
                } else {
                    return
                }
            }
            Logger.socket.debug("heartbeat:ack RTT=\(rtt, format: .fixed(precision: 1))ms serverTime=\(serverTimeStr, privacy: .public)")
            self.connectionRTT.send(rtt)
        }

        // --- Message events ---

        socket.on("message:new") { [weak self] data, _ in
            guard let self else { return }
            // Phase A real-time instrumentation — log the socket arrival
            // BEFORE decoding so we capture the gateway → device delivery
            // latency cleanly (decoding is observable separately if needed).
            let recvAt = Date()
            let firstId = (data.first as? [String: Any])?["id"] as? String
            let firstCmid = (data.first as? [String: Any])?["clientMessageId"] as? String
            Logger.socket.info("perf:ios.notif.socket.message-new receivedAt=\(recvAt.timeIntervalSince1970, privacy: .public) serverId=\(firstId ?? "nil", privacy: .public) clientMessageId=\(firstCmid ?? "nil", privacy: .public)")
            self.decode(APIMessage.self, from: data) { [weak self] msg in
                self?.messageReceived.send(msg)
            }
        }

        socket.on("message:edited") { [weak self] data, _ in
            guard let self else { return }
            self.decode(APIMessage.self, from: data) { [weak self] msg in
                self?.messageEdited.send(msg)
            }
        }

        socket.on("message:deleted") { [weak self] data, _ in
            guard let self else { return }
            self.decode(MessageDeletedEvent.self, from: data) { [weak self] event in
                self?.messageDeleted.send(event)
            }
        }

        // Jumeau SERVEUR de `message:deleted` : un message autodestructible
        // échu, brûlé par `ExpiredMessagesCleanupService`. Nom distinct, effet
        // local identique — voir le doc-comment de `MessageExpiredEvent`.
        socket.on("message:expired") { [weak self] data, _ in
            guard let self else { return }
            self.decode(MessageExpiredEvent.self, from: data) { [weak self] event in
                self?.messageExpired.send(event)
            }
        }

        // L'échéance SERVIE d'un éphémère (#7451 point 5). Elle ne REMPLACE pas
        // l'échéance locale : les deux concourent et la plus PROCHE gagne
        // (`EphemeralDeadline.resolve`). C'est ce qui rend le client correct
        // avant comme après la fusion du lot gateway — sans cet événement, il
        // décompte depuis sa propre réception ; avec lui, il ne peut que
        // raccourcir.
        socket.on("message:countdown-started") { [weak self] data, _ in
            guard let self else { return }
            self.decode(MessageCountdownStartedEvent.self, from: data) { [weak self] event in
                self?.messageCountdownStarted.send(event)
            }
        }

        // Le canal de visibilité PERSONNELLE. La room est celle de
        // l'UTILISATEUR, pas du socket : l'appareil qui a émis la requête reçoit
        // l'événement lui aussi, et le retrait y est idempotent (il a déjà
        // retiré la bulle en optimiste).
        socket.on("message:hidden-for-me") { [weak self] data, _ in
            guard let self else { return }
            self.decode(MessageHiddenForMeEvent.self, from: data) { [weak self] event in
                self?.messageHiddenForMe.send(event)
            }
        }

        // Le retour en vue. Même room (celle de l'UTILISATEUR), donc l'appareil
        // qui a émis la requête le reçoit aussi — et c'est sans conséquence : la
        // relecture qu'il déclenche est idempotente.
        socket.on("message:restored-for-me") { [weak self] data, _ in
            guard let self else { return }
            self.decode(MessageRestoredForMeEvent.self, from: data) { [weak self] event in
                self?.messageRestoredForMe.send(event)
            }
        }

        registerMessageMarkHandlers(on: socket)

        // --- Reaction events ---

        // NOTE (Fix E5 — v1 limitation): realtime reaction events for messages NOT
        // currently held in the active conversation cache are silently dropped here.
        // When the user opens that conversation later, the server-persisted
        // `reactionSummary` on the Message document is the authoritative source of
        // truth and will reflect all reactions. Adding a dedicated reactions cache
        // store was evaluated (approach A) but deferred — the cross-conversation
        // realtime delta is low-value for v1 and the implementation cost is high.
        socket.on("reaction:added") { [weak self] data, _ in
            guard let self else { return }
            let recvAt = Date()
            let firstMsgId = (data.first as? [String: Any])?["messageId"] as? String
            let firstEmoji = (data.first as? [String: Any])?["emoji"] as? String
            Logger.socket.info("perf:ios.notif.socket.reaction-added receivedAt=\(recvAt.timeIntervalSince1970, privacy: .public) messageId=\(firstMsgId ?? "nil", privacy: .public) emoji=\(firstEmoji ?? "nil", privacy: .public)")
            self.decode(ReactionUpdateEvent.self, from: data) { [weak self] event in
                self?.reactionAdded.send(event)
            }
        }

        socket.on("reaction:removed") { [weak self] data, _ in
            guard let self else { return }
            let recvAt = Date()
            let firstMsgId = (data.first as? [String: Any])?["messageId"] as? String
            Logger.socket.info("perf:ios.notif.socket.reaction-removed receivedAt=\(recvAt.timeIntervalSince1970, privacy: .public) messageId=\(firstMsgId ?? "nil", privacy: .public)")
            self.decode(ReactionUpdateEvent.self, from: data) { [weak self] event in
                self?.reactionRemoved.send(event)
            }
        }

        // BUG2 A' — réactions par-image
        socket.on("attachment:reaction-added") { [weak self] data, _ in
            guard let self else { return }
            self.decode(AttachmentReactionUpdateEvent.self, from: data) { [weak self] event in
                self?.attachmentReactionAdded.send(event)
            }
        }

        socket.on("attachment:reaction-removed") { [weak self] data, _ in
            guard let self else { return }
            self.decode(AttachmentReactionUpdateEvent.self, from: data) { [weak self] event in
                self?.attachmentReactionRemoved.send(event)
            }
        }

        registerActivitySignalHandlers(on: socket)

        // --- Unread events ---

        socket.on("conversation:unread-updated") { [weak self] data, _ in
            guard let self else { return }
            self.decode(UnreadUpdateEvent.self, from: data) { [weak self] event in
                self?.unreadUpdated.send(event)
            }
        }

        // --- User status events ---

        socket.on("user:status") { [weak self] data, _ in
            guard let self else { return }
            self.decode(UserStatusEvent.self, from: data) { [weak self] event in
                self?.userStatusChanged.send(event)
            }
        }

        // --- Presence snapshot (emitted by gateway right after auth) ---
        // Le gateway envoie un seul payload `{ users: [...] }` rassemblant tous
        // les contacts du nouvel arrivant avec leur statut runtime. Le client
        // doit hydrater son store en bulk plutôt que d'attendre des transitions
        // d'état spontanées. Voir gateway `_emitPresenceSnapshot`.
        socket.on("presence:snapshot") { [weak self] data, _ in
            guard let self else { return }
            self.decode(PresenceSnapshotEvent.self, from: data) { [weak self] event in
                self?.presenceSnapshotReceived.send(event)
            }
        }

        // --- Transcription events ---

        socket.on("audio:transcription-ready") { [weak self] data, _ in
            guard let self else { return }
            self.decode(TranscriptionReadyEvent.self, from: data) { [weak self] event in
                self?.transcriptionReady.send(event)
            }
        }

        // --- Audio translation events ---

        socket.on("audio:translation-ready") { [weak self] data, _ in
            guard let self else { return }
            self.decode(AudioTranslationEvent.self, from: data) { [weak self] event in
                self?.audioTranslationReady.send(event)
            }
        }

        socket.on("audio:translations-progressive") { [weak self] data, _ in
            guard let self else { return }
            self.decode(AudioTranslationEvent.self, from: data) { [weak self] event in
                self?.audioTranslationProgressive.send(event)
            }
        }

        socket.on("audio:translations-completed") { [weak self] data, _ in
            guard let self else { return }
            self.decode(AudioTranslationEvent.self, from: data) { [weak self] event in
                self?.audioTranslationCompleted.send(event)
            }
        }

        // --- Translation / audio / transcription failure events ---

        socket.on("translation:failed") { [weak self] data, _ in
            guard let self else { return }
            self.decode(TranslationFailedEvent.self, from: data) { [weak self] event in
                self?.translationFailed.send(event)
            }
        }

        socket.on("audio:translation-failed") { [weak self] data, _ in
            guard let self else { return }
            self.decode(AudioTranslationFailedEvent.self, from: data) { [weak self] event in
                self?.audioTranslationFailed.send(event)
            }
        }

        socket.on("audio:transcription-failed") { [weak self] data, _ in
            guard let self else { return }
            self.decode(TranscriptionFailedEvent.self, from: data) { [weak self] event in
                self?.transcriptionFailed.send(event)
            }
        }

        // Le serveur a REVOQUE la session (mot de passe change, revocation de
        // tous les appareils, action admin) puis coupe la socket. Surtout PAS
        // `handleUnauthorized()` comme l'écouteur `auth:token-expired` : son
        // `refreshSession(force:)` obtiendrait un JWT neuf — `/auth/refresh` ne
        // verifie pas que la session existe encore — et re-armerait pour 24 h
        // la session qu'on vient de revoquer. Le `reason` sert l'avis d'avant la reconnexion (#9612).
        socket.on("auth:session-revoked") { [weak self] data, _ in
            let reason = SessionRevocationReason.fromSocketPayload(data)
            if self?.signalAccountDeleted(sessionRevokedPayload: data) != nil { return } // #10482 — retrait, pas « session fermée »
            Logger.socket.warning("MessageSocket: session revoked — forcing re-authentication")
            Task { @MainActor in
                AuthManager.shared.handleSessionRevoked(reason: reason)
            }
        }

        // --- Read status events ---

        socket.on("read-status:updated") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ReadStatusUpdateEvent.self, from: data) { [weak self] event in
                self?.readStatusUpdated.send(event)
            }
        }

        socket.on("attachment-status:updated") { [weak self] data, _ in
            guard let self else { return }
            self.decode(AttachmentStatusUpdatedEvent.self, from: data) { [weak self] event in
                self?.attachmentStatusUpdated.send(event)
            }
        }

        socket.on("message:pending-delivered") { [weak self] data, _ in
            guard let self else { return }
            self.decode(PendingMessagesDeliveredEvent.self, from: data) { [weak self] event in
                self?.pendingMessagesDelivered.send(event)
            }
        }

        socket.on("message:attachment-updated") { [weak self] data, _ in
            guard let self else { return }
            self.decode(AttachmentUpdatedEvent.self, from: data) { [weak self] event in
                self?.attachmentUpdated.send(event)
            }
        }

        registerTranslationHandlers(on: socket)
        registerViewOnceHandlers(on: socket)
        registerCitedPostHandlers(on: socket)
        registerConversationEngagementHandlers(on: socket)
        registerCallRecordingHandlers(on: socket)
        registerCallControlHandlers(on: socket)
        registerCallPreviewHandlers(on: socket)
        registerProfileDecorHandlers(on: socket)
        registerGameStateHandlers(on: socket)

        // --- Conversation participation events ---

        socket.on("conversation:joined") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ConversationParticipationEvent.self, from: data) { [weak self] event in
                self?.conversationJoined.send(event)
            }
        }

        socket.on("conversation:join-error") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ConversationJoinErrorEvent.self, from: data) { [weak self] event in
                self?.conversationJoinError.send(event)
            }
        }

        socket.on("conversation:left") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ConversationParticipationEvent.self, from: data) { [weak self] event in
                self?.conversationLeft.send(event)
            }
        }

        // --- Participant role events ---

        socket.on("participant:role-updated") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ParticipantRoleUpdatedEvent.self, from: data) { [weak self] event in
                self?.participantRoleUpdated.send(event)
            }
        }

        socket.on("participant:rights-updated") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ParticipantRightsUpdatedEvent.self, from: data) { [weak self] event in
                self?.participantRightsUpdated.send(event)
            }
        }

        socket.on("conversation:updated") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ConversationUpdatedEvent.self, from: data) { [weak self] event in
                self?.conversationUpdated.send(event)
            }
        }

        socket.on("conversation:participant-joined") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ParticipantJoinedEvent.self, from: data) { [weak self] event in
                self?.participantJoined.send(event)
            }
        }

        socket.on("conversation:participant-left") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ParticipantLeftEvent.self, from: data) { [weak self] event in
                self?.participantSelfLeft.send(event)
            }
        }

        socket.on("conversation:participant-banned") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ParticipantBannedEvent.self, from: data) { [weak self] event in
                self?.participantBanned.send(event)
            }
        }

        socket.on("conversation:participant-unbanned") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ParticipantUnbannedEvent.self, from: data) { [weak self] event in
                self?.participantUnbanned.send(event)
            }
        }

        socket.on("conversation:closed") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ConversationClosedEvent.self, from: data) { [weak self] event in
                self?.conversationClosed.send(event)
            }
        }

        socket.on("user:preferences-updated") { [weak self] data, _ in
            guard let self else { return }
            // One event name, two payload scopes (the gateway emits a union):
            //   conversation scope: { userId, conversationId, version, reset, preferences }
            //   category scope:     { userId, category }
            // Discriminate on `conversationId` so each lands on the right
            // publisher — the conversation scope feeds the versioned
            // `ConversationStore` path, the category scope the legacy flat path.
            if let dict = data.first as? [String: Any], dict["conversationId"] is String {
                self.decode(UserPreferencesConversationUpdatedSocketEvent.self, from: data) { [weak self] event in
                    self?.userPreferencesConversationUpdated.send(event)
                }
            } else {
                self.decode(UserPreferencesUpdatedEvent.self, from: data) { [weak self] event in
                    self?.userPreferencesUpdated.send(event)
                }
            }
        }

        socket.on("user:updated") { [weak self] data, _ in
            guard let self else { return }
            self.decode(UserUpdatedEvent.self, from: data) { [weak self] event in
                self?.userUpdated.send(event)
            }
        }

        socket.on("user:preferences-reordered") { [weak self] data, _ in
            guard let self else { return }
            self.decode(UserPreferencesReorderedSocketEvent.self, from: data) { [weak self] event in
                self?.userPreferencesReordered.send(event)
            }
        }

        socket.on("conversation:deleted") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ConversationDeletedSocketEvent.self, from: data) { [weak self] event in
                self?.conversationDeleted.send(event)
            }
        }

        socket.on("conversation:restored") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ConversationRestoredSocketEvent.self, from: data) { [weak self] event in
                self?.conversationRestored.send(event)
            }
        }

        socket.on("category:created") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CategorySocketEvent.self, from: data) { [weak self] event in
                self?.categoryCreated.send(event)
            }
        }

        socket.on("category:updated") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CategorySocketEvent.self, from: data) { [weak self] event in
                self?.categoryUpdated.send(event)
            }
        }

        socket.on("category:deleted") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CategoryDeletedSocketEvent.self, from: data) { [weak self] event in
                self?.categoryDeleted.send(event)
            }
        }

        socket.on("categories:reordered") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CategoriesReorderedSocketEvent.self, from: data) { [weak self] event in
                self?.categoriesReordered.send(event)
            }
        }

        socket.on("conversation:stats") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ConversationStatsEvent.self, from: data) { [weak self] event in
                self?.conversationStatsReceived.send(event)
            }
        }

        // --- Location events ---

        socket.on("location:live-started") { [weak self] data, _ in
            guard let self else { return }
            self.decode(LiveLocationStartedEvent.self, from: data) { [weak self] event in
                self?.liveLocationStarted.send(event)
            }
        }

        socket.on("location:live-updated") { [weak self] data, _ in
            guard let self else { return }
            self.decode(LiveLocationUpdatedEvent.self, from: data) { [weak self] event in
                self?.liveLocationUpdated.send(event)
            }
        }

        socket.on("location:live-stopped") { [weak self] data, _ in
            guard let self else { return }
            self.decode(LiveLocationStoppedEvent.self, from: data) { [weak self] event in
                self?.liveLocationStopped.send(event)
            }
        }

        // --- Conversation discovery events ---

        socket.on("conversation:new") { [weak self] data, _ in
            guard let self else { return }
            self.decode(ConversationNewEvent.self, from: data) { [weak self] event in
                self?.conversationNew.send(event)
            }
        }

        // --- Notification events ---

        socket.on("notification:new") { [weak self] data, _ in
            guard let self else { return }
            self.decode(SocketNotificationEvent.self, from: data) { [weak self] event in
                // SyncEngine A5 — observe le `_seq` per-user (pilote). Le gap
                // détecté est tracké ; le déclenchement d'une resync sur gap
                // est câblé en A5.2. `observe(nil)` (gateway antérieur) = no-op.
                Task { await SyncSeqTracker.shared.observe(event.seq) }
                self?.notificationReceived.send(event)
            }
        }

        // Intentionally NOT listening for the legacy `"notification"` event
        // here. The gateway only emits `notification:new` (see
        // `NotificationService.createNotification` → `SERVER_EVENTS.NOTIFICATION_NEW`).
        // Keeping a parallel `"notification"` listener that funneled into
        // the same `notificationReceived` subject was a latent
        // double-delivery vector — if any future gateway change emitted
        // both, every notification would arrive twice on iOS and surface
        // duplicate toasts. Single channel keeps the contract obvious.

        socket.on("notification:read") { [weak self] data, _ in
            guard let self else { return }
            self.decode(NotificationReadEvent.self, from: data) { [weak self] event in
                self?.notificationRead.send(event)
            }
        }

        socket.on("notification:deleted") { [weak self] data, _ in
            guard let self else { return }
            self.decode(NotificationDeletedEvent.self, from: data) { [weak self] event in
                self?.notificationDeleted.send(event)
            }
        }

        socket.on("notification:counts") { [weak self] data, _ in
            guard let self else { return }
            self.decode(NotificationCountsEvent.self, from: data) { [weak self] event in
                self?.notificationCounts.send(event)
            }
        }

        socket.on("notification:read-bulk") { [weak self] data, _ in
            guard let self else { return }
            self.decode(NotificationReadBulkEvent.self, from: data) { [weak self] event in
                self?.notificationReadBulk.send(event)
            }
        }

        socket.on("notification:deleted-bulk") { [weak self] data, _ in
            guard let self else { return }
            self.decode(NotificationDeletedBulkEvent.self, from: data) { [weak self] event in
                self?.notificationDeletedBulk.send(event)
            }
        }

        // --- Friend request lifecycle events ---

        socket.on("friend-request:cancelled") { [weak self] data, _ in
            guard let self else { return }
            self.decode(FriendRequestCancelledEvent.self, from: data) { event in
                Task { await MessageSocketManager.applyFriendRequestWithdrawal(otherUserId: event.cancelledBy) }
            }
        }

        socket.on("friend-request:rejected") { [weak self] data, _ in
            guard let self else { return }
            self.decode(FriendRequestRejectedEvent.self, from: data) { event in
                Task { await MessageSocketManager.applyFriendRequestRejection(rejecterId: event.rejecterId) }
            }
        }

        // --- Mention events ---

        socket.on("mention:created") { [weak self] data, _ in
            guard let self else { return }
            self.decode(MentionCreatedEvent.self, from: data) { [weak self] event in
                self?.mentionCreated.send(event)
            }
        }

        // --- Call signaling events ---

        socket.on("call:initiated") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CallOfferData.self, from: data) { [weak self] event in
                self?.callOfferReceived.send(event)
            }
        }

        socket.on("call:signal") { [weak self] data, _ in
            guard let self else { return }
            guard let first = data.first as? [String: Any],
                  let signalDict = first["signal"] as? [String: Any],
                  let signalType = signalDict["type"] as? String else { return }

            switch signalType {
            case "offer":
                self.decode(CallAnswerData.self, from: data) { [weak self] event in
                    self?.callSignalOfferReceived.send(event)
                }
            case "answer":
                self.decode(CallAnswerData.self, from: data) { [weak self] event in
                    self?.callAnswerReceived.send(event)
                }
            case "ice-candidate":
                self.decode(CallICECandidateData.self, from: data) { [weak self] event in
                    self?.callICECandidateReceived.send(event)
                }
            default:
                Logger.socket.info("Unknown call signal type: \(signalType)")
            }
        }

        socket.on("call:ended") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CallEndData.self, from: data) { [weak self] event in
                // Le replay (matché par callId) est inerte une fois l'appel
                // fini ; on libère quand même l'événement bufferisé pour ne
                // pas retenir le dernier payload participant à vie.
                self?.lastCallParticipantJoined = nil
                self?.callEnded.send(event)
            }
        }

        // Audit P1-25 — register the dedicated `call:missed` listener.
        // Gateway emits this event in addition to `call:ended` when the
        // ringing timeout fires and the callee never answered, so the iOS
        // UI can surface a missed-call state explicitly instead of having
        // to infer it from `endedBy != self`.
        socket.on("call:missed") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CallMissedData.self, from: data) { [weak self] event in
                self?.callMissed.send(event)
            }
        }

        // Audit P1-27 — `call:already-answered` fires on the user's OTHER
        // sockets when one of their devices joins the call. We surface this
        // so the receiving devices can dismiss their ringing CallKit card
        // with .answeredElsewhere instead of staying frozen indefinitely.
        socket.on("call:already-answered") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CallAlreadyAnsweredData.self, from: data) { [weak self] event in
                self?.callAlreadyAnswered.send(event)
            }
        }

        socket.on("call:participant-joined") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CallParticipantData.self, from: data) { [weak self] event in
                guard let self else { return }
                // CALL-FIX 2026-06-06 — buffer the last event. The initiator sets up
                // its `callParticipantJoined` listener only AFTER the call:initiate
                // ACK; if the callee was already in the call room (socket churn /
                // re-join / rapid retry) the gateway emits participant-joined BEFORE
                // the listener subscribes, and a PassthroughSubject doesn't replay →
                // the offer is never created → 45s ring timeout. The listener replays
                // this buffered value by callId.
                self.lastCallParticipantJoined = event
                self.callParticipantJoined.send(event)
            }
        }

        socket.on("call:participant-left") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CallParticipantData.self, from: data) { [weak self] event in
                self?.callParticipantLeft.send(event)
            }
        }

        socket.on("call:media-toggled") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CallMediaToggleData.self, from: data) { [weak self] event in
                self?.callMediaToggled.send(event)
            }
        }

        socket.on("call:error") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CallErrorData.self, from: data) { [weak self] event in
                self?.callError.send(event)
            }
        }

        socket.on("call:ice-servers-refreshed") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CallIceServersRefreshedData.self, from: data) { [weak self] event in
                self?.callIceServersRefreshed.send(event)
            }
        }

        socket.on("call:quality-alert") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CallQualityAlertData.self, from: data) { [weak self] event in
                self?.callQualityAlert.send(event)
            }
        }

        socket.on("call:screen-capture-alert") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CallScreenCaptureAlertData.self, from: data) { [weak self] event in
                self?.callScreenCaptureAlert.send(event)
            }
        }

        socket.on("call:force-leave") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CallForcedLeaveData.self, from: data) { [weak self] event in
                self?.callForcedLeave.send(event)
            }
        }

        socket.on("call:translated-segment") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CallTranslatedSegmentData.self, from: data) { [weak self] event in
                self?.callTranslatedSegmentReceived.send(event)
            }
        }

        socket.on("call:transcription-active") { [weak self] data, _ in
            guard let self else { return }
            self.decode(CallTranscriptionActiveData.self, from: data) { [weak self] event in
                self?.callTranscriptionActiveReceived.send(event)
            }
        }

    }
}
