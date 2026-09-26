import Foundation
import Combine
import UIKit
import GRDB
import MeeshySDK
import MeeshyUI
import os

// Extrait de `ConversationViewModel.swift` (#4942, D-MAINT-01), qui portait
// 4 832 lignes — quatre fois le plafond DUR de 1 200 de la directive
// 2026-09-02, que `FileSizeBudgetGuardTests` mesure et qui interdit d'AJOUTER
// à un fichier hors budget. Un chantier de fluidité qui doit toucher le
// chargement, l'envoi et l'observation du magasin ne pouvait pas commencer
// avant : on extrait d'abord, on ajoute ensuite. Le découpage suit une
// RESPONSABILITÉ, jamais une tranche de lignes, et ne change AUCUN
// comportement — les corps sont déplacés à l'identique.
//
// `private` est de portée FICHIER en Swift : les membres de l'hôte que cette
// extension consomme se sont élargis en interne par la découpe, pas par un
// choix de visibilité. Les propriétés STOCKÉES restent chez l'hôte — une
// extension ne peut pas en déclarer.
//
// Responsabilité tenue ici : ENVOYER — le garde-temps du POST REST, la
// déduplication du double-tap, l'insert optimiste GRDB, le chemin socket-first
// puis REST puis repli socket, la finalisation partagée à l'ACK
// (`finalizeSuccessfulSend`), le journal des tentatives, le renvoi d'un message
// en échec et la bulle optimiste d'un média. Un seul invariant gouverne le
// tout : des messages DISTINCTS partent en parallèle, seul le MÊME message
// refiré dans la fenêtre de debounce est refusé.

// MARK: - Send Timeout Helper

/// Caps an awaited async operation at `seconds`. On expiry the operation's
/// task is cancelled, so a hung/slow REST send (typical on cellular) throws
/// promptly instead of holding the optimistic `.sending` clock for the full
/// URLSession `timeoutIntervalForRequest` (60s) before the socket/outbox
/// fallback can take over. The send catch path re-emits with the SAME
/// `clientMessageId`, so the gateway dedups — no duplicate row even if the
/// cancelled POST actually landed server-side.
@MainActor
func withSendTimeout<T: Sendable>(
    seconds: Double,
    operation: @escaping () async throws -> T
) async throws -> T {
    let operationTask = Task { try await operation() }
    let watchdog = Task {
        try? await Task.sleep(for: .seconds(max(0, seconds)))
        operationTask.cancel()
    }
    defer { watchdog.cancel() }
    return try await operationTask.value
}

extension ConversationViewModel {

    // MARK: - La protection armée au composeur

    /// Ce que la rangée du composeur affiche comme ARMÉ, lu en UNE valeur.
    ///
    /// Les trois bascules restent des `@Published` distincts parce que la
    /// rangée s'y lie une par une ; mais tout ce qui ENVOIE lit cette valeur,
    /// jamais les trois champs. C'est ce qui rend impossible qu'un chemin
    /// d'envoi n'en applique que deux sur trois.
    var armedProtection: MessageProtectionIntent {
        MessageProtectionIntent(
            ephemeralDurationSeconds: ephemeralDuration?.rawValue,
            isBlurred: isBlurEnabled,
            isViewOnce: isViewOnceEnabled
        )
    }

    /// Saisit la protection armée et DÉSARME la rangée dans le même tour.
    ///
    /// Appelée une fois par tap, avant que quoi que ce soit parte : la valeur
    /// rendue voyage ensuite jusqu'à chaque message de cet envoi. Le
    /// désarmement était jusqu'ici fait à l'ACQUITTEMENT de chaque message
    /// (`finalizeSuccessfulSend`), ce qui donnait à un envoi multi-pièces une
    /// fenêtre où la protection avait déjà disparu pour les groupes suivants.
    ///
    /// Désarmer au TAP est aussi ce que l'utilisateur attend : il vient
    /// d'envoyer, la rangée s'éteint — elle ne reste pas allumée le temps d'un
    /// upload, à lui faire croire que le prochain envoi sera protégé aussi.
    func consumeArmedProtection() -> MessageProtectionIntent {
        let intent = armedProtection
        if ephemeralDuration != nil { ephemeralDuration = nil }
        if isBlurEnabled { isBlurEnabled = false }
        if isViewOnceEnabled { isViewOnceEnabled = false }
        return intent
    }

    /// Les bits que la ligne OPTIMISTE doit porter : l'axe apparition/persistant
    /// choisi au composeur, UNI à l'axe cycle de vie de la protection armée.
    ///
    /// Le serveur, lui, RECOMPOSE (`composeMessageEffectFlags`) depuis les
    /// colonnes déclarées — la charge REST n'a donc rien à unir, et c'est
    /// précisément ce qui a caché le défaut. La ligne LOCALE n'a pas cette
    /// chance : elle est lue telle quelle par la bulle, et
    /// `MessageProtectionDescriptor` lit les BITS pour la vue unique et le
    /// flou. Sans cette union, un texte armé « ① » n'avait ni puce ni voile
    /// jusqu'à la réponse serveur — l'éphémère s'en sortait par la porte de
    /// derrière (`expiresAt` suffit à le prouver), ses deux voisins non.
    func optimisticEffectFlags(_ intent: MessageProtectionIntent) -> MessageEffectFlags {
        let apparence: MessageEffectFlags = pendingEffects.hasAnyEffect ? pendingEffects.flags : MessageEffectFlags(rawValue: 0)
        return apparence.union(intent.lifecycleFlags)
    }

    // MARK: - Délai de garde de l'envoi REST

    /// REST send timeout (seconds). Far below `APIClient.timeoutIntervalForRequest`
    /// (60s): a slow/failing POST must fall through to the socket fallback +
    /// durable outbox quickly instead of pinning the optimistic `.sending`
    /// clock for a full minute on a single hung cellular attempt.
    static let sendRESTTimeoutSeconds: Double = 12

    // MARK: - Send Message

    /// Langue de composition : détectée depuis le contenu (on-device), repli sur la
    /// langue primaire de l'utilisateur puis "fr". Pure → testable sans authManager.
    nonisolated static func composeLanguage(for content: String, preferred: [String]) -> String {
        LanguageDetection.detectLanguageCode(for: content, fallback: preferred.first)
            ?? preferred.first ?? "fr"
    }

    /// Shared post-ACK finalization for a successful send, used by BOTH the
    /// socket-first fast path and the REST path so the two stay in lockstep:
    /// records the tempId→serverId mapping, drives the `.serverAck` state
    /// transition (⏱→✓), bumps the conversation to the top, persists the
    /// server-id mapping for cold-start reconciliation, and clears the
    /// ephemeral/blur/effect compose state + mention draft. `transport` only
    /// tags the perf signpost (`perf:ios.send.ack ... transport=…`) so a device
    /// trace can A/B socket-first vs rest.
    private func finalizeSuccessfulSend(
        tempId: String,
        serverId: String,
        serverCreatedAt: Date,
        text: String,
        sendStartedAt: Date,
        transport: String
    ) async {
        // Register tempId → serverId so the `message:new` broadcast reconciles
        // without creating a duplicate row. UI update (sent state) flows through
        // persistence → store observation.
        pendingServerIds[tempId] = serverId

        // GRDB server ack — state machine transitions to .sent. `try?` swallows
        // both errors AND a nil return (state machine rejected / record missing),
        // logged so the ⏱→✓ transition is observable.
        let ackResult = try? await messagePersistence.applyEvent(
            localId: tempId,
            event: .serverAck(serverId: serverId, at: serverCreatedAt)
        )
        Logger.messages.info("SendFlow PENDING->SENT tempId=\(tempId, privacy: .public) serverId=\(serverId, privacy: .public) resultState=\(ackResult.map { String(describing: $0) } ?? "nil", privacy: .public) transport=\(transport, privacy: .public)")
        let ackElapsedMs = Int(Date().timeIntervalSince(sendStartedAt) * 1000)
        Logger.messages.info("perf:ios.send.ack clientMessageId=\(tempId, privacy: .public) serverId=\(serverId, privacy: .public) transport=\(transport, privacy: .public) durationMs=\(ackElapsedMs, privacy: .public)")

        let convId = conversationId
        let msgContent = text
        let msgTime = serverCreatedAt

        // Persist server-id mapping so a cold-start REST fetch reconciles without
        // duplicate temp_…/server-id pairs.
        Task { [weak self] in
            await self?.persistMessagesUsingServerIds()
        }
        // Facette relue sur la ligne optimiste : elle porte les pièces jointes et
        // les effets réellement envoyés. Recomposer une facette « texte nu » ici
        // effacerait de la liste la photo qu'on vient d'envoyer, une seconde
        // après que l'insert optimiste l'y a mise.
        let ackedFacet = messages.first(where: { $0.id == tempId }).map {
            LastMessageFacet(message: $0, preview: msgContent, id: serverId, at: msgTime)
        } ?? LastMessageFacet.sent(id: serverId, text: msgContent, at: msgTime)
        Task {
            await ConversationSyncEngine.shared.updateConversationAfterSend(
                ackedFacet, conversationId: convId, replacing: [tempId]
            )
        }

        // Le désarmement des TROIS protections a quitté cet endroit (#7498) :
        // il se fait au TAP, par `consumeArmedProtection()`. Ici, on est à
        // l'ACQUITTEMENT d'UN message — et un tap en produit souvent plusieurs
        // (un par groupe de pièces jointes, plus le texte). Désarmer ici
        // laissait partir sans protection tout ce qui suivait le premier
        // acquittement, la rangée allumée au moment du tap.
        if pendingEffects.hasAnyEffect { pendingEffects = .none }
        mentionController.clearDraft()

        // #5218 — LE moment où la permission de notification a un sens pour un
        // compte fraîchement créé : il vient de parler à quelqu'un, donc il a
        // quelque chose à recevoir. `MeeshyApp` a posé le marqueur au lieu de
        // demander à l'ouverture (`PushPermissionDeferral`) ; ici on l'honore
        // une fois, et le marqueur disparaît.
        //
        // Ce site est le point de passage des DEUX transports acquittés par le
        // serveur (socket-first et REST) : le placer dans `sendMessage`, qui a
        // quatre `return true` dont un pour la simple mise en file HORS LIGNE,
        // demanderait la permission pour un message qui n'est pas encore parti.
        //
        // Détaché : la demande ouvre une alerte système qui peut rester à
        // l'écran indéfiniment, et rien de l'envoi ne doit l'attendre.
        Task { await PushPermissionPrompt.honourDeferredRequest() }
    }

    /// Colonne `stickerJson` du record OPTIMISTE (#4823) — même mécanique que
    /// `locationJson` : écrite EN BASE, pas seulement dans le `Message` en
    /// mémoire, sinon une écriture GRDB concurrente (`messagesDidChange`) ou
    /// un relaunch rendrait une bulle sticker muette jusqu'à l'écho serveur.
    private static func stickerJson(_ sticker: MessageSticker?, id: String) -> String? {
        sticker
            .flatMap { JSONEncoder().encodeOrLog($0, field: "stickerJson", id: id) }
            .flatMap { String(data: $0, encoding: .utf8) }
    }

    @discardableResult
    /// `attachmentReplyTo` — l'ANCRE de la pièce citée (#6164, moitié ÉCRITURE).
    ///
    /// Elle n'a de sens qu'avec `replyToId` : la garde serveur
    /// (`admitAttachmentReply`) refuse une pièce sans son message, et relit la
    /// ligne pour vérifier l'appartenance.
    ///
    /// **Sa présence CHANGE DE TRANSPORT.** Le canal socket ne la porte pas —
    /// `MessageHandler.ts` ne lit `attachmentReplyTo` nulle part et
    /// `admitAttachmentReply` n'y est pas wiré. Un envoi qui la porte est donc
    /// inéligible au socket-first ET au repli socket, exactement comme le
    /// chiffrement, l'éphémère, la vue unique, le flou et les effets : pas
    /// parce qu'il est « spécial », mais parce que ce canal PERDRAIT une part
    /// de ce qu'on lui confie — et que la perte serait invisible (le message
    /// part, l'accusé revient, seule la citation ment).
    func sendMessage(content: String, replyToId: String? = nil, storyReplyToId: String? = nil, storyReplyReference: ReplyReference? = nil, forwardedFromId: String? = nil, forwardedFromConversationId: String? = nil, attachmentIds: [String]? = nil, localAttachments: [MeeshyMessageAttachment]? = nil, protection: MessageProtectionIntent? = nil, originalLanguage: String? = nil, existingTempId: String? = nil, location: SharedPlace? = nil, sticker: MessageSticker? = nil, attachmentReplyTo: QuotedAttachmentSend? = nil) async -> Bool {
        let text = content.trimmingCharacters(in: .whitespacesAndNewlines)
        Logger.messages.info("SendFlow enter convId=\(self.conversationId, privacy: .public) textLen=\(text.count, privacy: .public) attachmentIds=\((attachmentIds ?? []).count, privacy: .public) existingTempId=\(existingTempId ?? "nil", privacy: .public) isSending=\(self.isSending, privacy: .public)")
        // Garde partagé avec le composer (`SendEligibility`) : un message
        // « lieu seul » — texte vide, aucune pièce jointe, `location` non nil —
        // est un envoi valide (lot 2, spec 2026-07-30).
        guard SendEligibility.canSend(text: text, attachmentIds: attachmentIds ?? [], location: location) else {
            Logger.messages.error("SendFlow EARLY-RETURN guard=emptyContent convId=\(self.conversationId, privacy: .public)")
            return false
        }
        // LE GESTE DU JOUR est marqué ICI (#5902) : le message a passé la garde
        // d'éligibilité, il part — par le réseau ou par l'outbox. La marque
        // sert aux rappels de série, qui s'annulent pour la journée dès qu'un
        // geste est posé. La poser sur le SUCCÈS aurait demandé de toucher les
        // quatre sorties de cette fonction, et un envoi mis en file hors ligne
        // compte tout autant : il partira.
        StreakActivityMark.marquer()

        // Debounce: a fast double-tap on the send button used to trigger two
        // concurrent `sendMessage` runs, both inserting their own optimistic
        // record with a fresh `tempId`, both POSTing the request — the user
        // saw the same content twice in the bubble list. Lifted ABOVE the
        // offline branch so a second tap while the first send is still
        // `await`-ing on the outbox write exits early instead of inserting
        // a parallel optimistic row + enqueuing twice.
        //
        // Phase 4 §6.1 fix (Bug 1 — 2026-05-26): the legacy code ran the
        // offline branch BEFORE the guard with a fire-and-forget
        // `Task { try? await OfflineQueue.shared.enqueue(...) }`, so two
        // rapid taps while offline could both reach the queue *or* the
        // second one could be lost when the actor's pending-state machine
        // observed a duplicate `clientMessageId` mid-enqueue. The guard
        // now serializes both paths and the offline enqueue is awaited.
        // No content dedup (#7985, directive porteur 2026-09-25): two
        // identical sends in a row are two MESSAGES — 😂😂😂 tapped in series
        // must all leave. Each send carries its own `clientMessageId`, the
        // ONLY dedup key: the gateway collapses a replayed message on it.
        // An accidental double-tap of the send button cannot resend either —
        // the composer clears its field synchronously on the first tap.
        inFlightSendCount += 1
        isSending = true
        Logger.messages.info("SendFlow LOCK inFlight=\(self.inFlightSendCount, privacy: .public) convId=\(self.conversationId, privacy: .public) textLen=\(text.count, privacy: .public)")
        defer {
            inFlightSendCount = max(0, inFlightSendCount - 1)
            isSending = inFlightSendCount > 0
            Logger.messages.info("SendFlow UNLOCK inFlight=\(self.inFlightSendCount, privacy: .public) convId=\(self.conversationId, privacy: .public)")
        }

        // Stop typing emission on send
        socketHandler?.stopTypingEmission()

        // Langue de composition, résolue UNE fois : la détection NL est pure et coûteuse, et six sites la recalculaient sur le même texte.
        let resolvedOriginalLanguage = originalLanguage ?? Self.composeLanguage(for: content, preferred: preferredLanguages)

        // Offline: enqueue for later delivery + show optimistic message.
        // NOTE: we only gate on network availability here — NOT on socket
        // connection state. The send path is a plain REST POST which works
        // regardless of socket status. Routing through the offline queue when
        // the socket is still handshaking (common at startup) caused the clock
        // indicator to stay visible for seconds while waiting for retryAll().
        if !networkMonitor.isOnline {
            let offlineClientMessageId = existingTempId ?? ClientMessageId.generate()
            // Spec §4.2 — record the AttachmentKind of each attachment so the
            // SyncPill mapper picks .video / .file icons instead of always
            // falling back to .image. Aligned with attachmentIds by index.
            let offlineKinds = localAttachments?.map { $0.kind.rawValue }
            let queueItem = OfflineQueueItem(
                conversationId: conversationId,
                content: text,
                clientMessageId: offlineClientMessageId,
                originalLanguage: originalLanguage,
                replyToId: replyToId,
                forwardedFromId: forwardedFromId,
                forwardedFromConversationId: forwardedFromConversationId,
                attachmentIds: attachmentIds,
                attachmentKinds: offlineKinds,
                location: location,
                sticker: sticker,
                attachmentReplyTo: attachmentReplyTo?.attachmentId
            )
            // Lieu partagé encodé pour la colonne `locationJson` du record
            // optimiste : une écriture GRDB concurrente déclenche
            // `messagesDidChange` et effacerait un lieu qui ne vivrait
            // qu'en mémoire.
            let offlineLocationJson: String? = location
                .flatMap { JSONEncoder().encodeOrLog($0, field: "locationJson", id: offlineClientMessageId) }
                .flatMap { String(data: $0, encoding: .utf8) }

            let offlineTempId = queueItem.tempId
            let offlineMessage = Message(
                id: offlineTempId,
                conversationId: conversationId,
                senderId: currentUserId,
                content: text,
                messageType: .text,
                replyToId: replyToId,
                forwardedFromId: forwardedFromId,
                forwardedFromConversationId: forwardedFromConversationId,
                createdAt: Date(),
                updatedAt: Date(),
                deliveryStatus: .sending,
                isMe: true,
                location: location,
                sticker: sticker
            )
            // Persist offline message to GRDB; store observation surfaces the row
            // automatically — no direct messages.append needed.
            let offlineRecord = MessageRecord(
                localId: offlineTempId, serverId: nil,
                conversationId: conversationId, senderId: currentUserId,
                content: text.isEmpty ? nil : text,
                originalLanguage: resolvedOriginalLanguage,
                messageType: "text", messageSource: "user", contentType: "text",
                state: .sending, retryCount: 0, lastError: nil,
                isEncrypted: false, encryptionMode: nil, encryptedPayload: nil,
                replyToId: replyToId, storyReplyToId: nil,
                forwardedFromId: forwardedFromId,
                forwardedFromConversationId: forwardedFromConversationId,
                replyToJson: nil, forwardedFromJson: nil,
                expiresAt: nil, effectFlags: 0,
                maxViewOnceCount: nil, viewOnceCount: 0,
                isEdited: false, editedAt: nil, deletedAt: nil,
                pinnedAt: nil, pinnedBy: nil,
                senderName: authManager.currentUser?.displayName,
                senderUsername: authManager.currentUser?.username,
                senderColor: nil, senderAvatarURL: authManager.currentUser?.avatar,
                deliveredCount: 0, readCount: 0,
                deliveredToAllAt: nil, readByAllAt: nil,
                createdAt: Date(), sentAt: nil,
                deliveredAt: nil, readAt: nil, updatedAt: Date(),
                attachmentsJson: nil, reactionsJson: nil,
                reactionCount: 0, currentUserReactionsJson: nil,
                mentionedUsersJson: nil,
                cachedBubbleWidth: nil, cachedBubbleHeight: nil,
                cachedLastLineWidth: nil, cachedLineCount: nil,
                cachedTimestampInline: nil,
                layoutVersion: 0, layoutMaxWidth: nil,
                changeVersion: 0,
                locationJson: offlineLocationJson,
                stickerJson: Self.stickerJson(sticker, id: offlineClientMessageId)
            )

            // `insertOptimistic` is a synchronous actor-isolated throw (no
            // suspension point inside), so `try await` lands the GRDB write
            // before the next runloop turn. The bubble is therefore in GRDB
            // BEFORE we await the queue enqueue below — pixel repaint follows
            // SwiftUI's next coalesced redraw, but the data is durable. If
            // the queue throws, the catch path flips this row to `.failed`.
            do {
                try await messagePersistence.insertOptimistic(offlineRecord)
            } catch {
                Logger.messages.error("offline insertOptimistic failed: \(error.localizedDescription, privacy: .public)")
                // Persistence is best-effort here — the outbox row below is
                // the actual source of truth. Continue.
            }

            let convId = conversationId
            let offlineMsgForCache = offlineMessage
            Task.detached(priority: .utility) {
                await CacheCoordinator.shared.messages.mergeUpdate(for: convId) { cached in
                    let cachedIds = Set(cached.map(\.id))
                    guard !cachedIds.contains(offlineMsgForCache.id) else { return cached }
                    return (cached + [offlineMsgForCache]).sorted { $0.createdAt < $1.createdAt }
                }
            }

            // Bump the conversation preview locally so the list shows the
            // just-typed message — with the correct author name — even before
            // the network returns. Without this the preview keeps the previous
            // author/content while the user waits for connectivity.
            let offlineFacet = LastMessageFacet(message: offlineMessage, preview: text)
            Task {
                await ConversationSyncEngine.shared.updateConversationAfterSend(offlineFacet, conversationId: convId)
            }

            // AWAITED enqueue (Bug 1 fix). If the outbox write throws, flip
            // the optimistic bubble to `.failed` so the user can retry — the
            // old fire-and-forget `Task { try? ... }` silently dropped the
            // message on disk-full / coding errors.
            do {
                try await offlineQueue.enqueue(queueItem)
                Logger.messages.info("Message enqueued for offline delivery")
                return true
            } catch {
                Logger.messages.error("offline enqueue failed: \(error.localizedDescription, privacy: .public)")
                try? await messagePersistence.markOptimisticFailed(
                    localId: offlineTempId,
                    reason: error.localizedDescription
                )
                return false
            }
        }

        // La protection est une VALEUR, saisie UNE fois (#7498).
        //
        // `protection` est l'intention SAISIE AU TAP par le composeur : un tap
        // produit souvent plusieurs messages (un par groupe de pièces jointes,
        // plus le texte en dernier), et la rangée se désarme dès le tap. Relire
        // l'état publié à chaque envoi faisait partir tout ce qui suivait le
        // premier groupe SANS protection, la rangée pourtant allumée — le
        // défaut « cela ne fonctionne que sur les textes » de la recette 1.1.0.
        //
        // `?? armedProtection` sert les chemins qui n'ont pas de tap derrière
        // eux (rejeu d'outbox, envoi programmatique) : ils lisent ce qui est
        // armé, comme avant. Un chemin ne peut donc pas partir SANS protection
        // par oubli ; il faudrait passer `.none` délibérément.
        let intent = protection ?? armedProtection
        let resolvedExpiresAt = intent.expiresAt()
        let resolvedEphemeralDuration = intent.ephemeralDurationSeconds
        let resolvedIsViewOnce = intent.isViewOnce
        let resolvedMaxViewOnceCount = intent.maxViewOnceCount
        let resolvedBlur = intent.wireIsBlurred

        // Build ReplyReference from quoted message or story via la helper
        // unifiee — meme logique que `insertOptimisticMediaMessage` pour
        // garantir que la quoted-reply card apparait identiquement quel que
        // soit le chemin d'envoi (texte-seul vs media).
        let replyRef = makeReplyReference(
            storyReplyReference: storyReplyReference,
            replyToId: replyToId,
            citingAttachmentId: attachmentReplyTo?.attachmentId
        )

        // Optimistic insert.
        // Phase 4 §6.1 — local id is the canonical `cid_<uuid v4 lowercase>`
        // sent end-to-end so the gateway can dedup via the unique
        // `(conversationId, clientMessageId)` index and the iOS reconciliation
        // by-cid path can match the server-assigned record without ambiguity.
        // The legacy `temp_/offline_/retry_*` prefix scheme is gone — every
        // local id (online send, offline queue, retry queue) now flows through
        // `ClientMessageId.generate()`.
        let tempId = existingTempId ?? ClientMessageId.generate()
        // Phase A real-time instrumentation: chronometer the send → ACK delta
        // so we can correlate it with the gateway-side `perf:http.message.post`
        // / `perf:messaging.handleMessage` logs through the same cmid.
        let sendStartedAt = Date()
        Logger.messages.info("perf:ios.send.start clientMessageId=\(tempId, privacy: .public) conversationId=\(self.conversationId, privacy: .public) existingTempId=\(existingTempId != nil, privacy: .public)")
        let resolvedAttachments = localAttachments ?? []
        let optimisticMessageType: Message.MessageType = {
            guard let first = resolvedAttachments.first else { return .text }
            switch first.type {
            case .image: return .image
            case .video: return .video
            case .audio: return .audio
            case .file: return .file
            case .location: return .location
            }
        }()
        // GRDB optimistic insert — the store observation surfaces the row in `messages`
        // automatically (Task 1.5: no direct messages.append here).
        if existingTempId == nil {
            // Lieu partagé encodé pour la colonne `locationJson` du record
            // optimiste : écrit EN BASE, pas seulement dans le `Message` en
            // mémoire — une écriture GRDB concurrente déclenche
            // `messagesDidChange` et effacerait une valeur purement mémoire.
            // Les transports, eux, portent le `SharedPlace` tel quel.
            let optimisticLocationJson: String? = location
                .flatMap { JSONEncoder().encodeOrLog($0, field: "locationJson", id: tempId) }
                .flatMap { String(data: $0, encoding: .utf8) }
            let persistence = messagePersistence
            let optimisticRecord = MessageRecord(
                localId: tempId, serverId: nil,
                conversationId: conversationId, senderId: currentUserId,
                content: text.isEmpty ? nil : text,
                originalLanguage: resolvedOriginalLanguage,
                messageType: optimisticMessageType.rawValue,
                messageSource: "user", contentType: "text",
                state: .sending, retryCount: 0, lastError: nil,
                isEncrypted: false, encryptionMode: nil, encryptedPayload: nil,
                replyToId: replyToId, storyReplyToId: storyReplyToId,
                forwardedFromId: forwardedFromId,
                forwardedFromConversationId: forwardedFromConversationId,
                replyToJson: replyRef.flatMap { try? JSONEncoder().encode($0) }, forwardedFromJson: nil,
                expiresAt: resolvedExpiresAt, effectFlags: optimisticEffectFlags(intent).rawValue,
                maxViewOnceCount: resolvedMaxViewOnceCount, viewOnceCount: 0,
                isEdited: false, editedAt: nil, deletedAt: nil,
                pinnedAt: nil, pinnedBy: nil,
                senderName: authManager.currentUser?.displayName,
                senderUsername: authManager.currentUser?.username,
                senderColor: nil, senderAvatarURL: authManager.currentUser?.avatar,
                deliveredCount: 0, readCount: 0,
                deliveredToAllAt: nil, readByAllAt: nil,
                createdAt: Date(), sentAt: nil,
                deliveredAt: nil, readAt: nil, updatedAt: Date(),
                attachmentsJson: nil, reactionsJson: nil,
                reactionCount: 0, currentUserReactionsJson: nil,
                mentionedUsersJson: nil,
                cachedBubbleWidth: nil, cachedBubbleHeight: nil,
                cachedLastLineWidth: nil, cachedLineCount: nil,
                cachedTimestampInline: nil,
                layoutVersion: 0, layoutMaxWidth: nil,
                changeVersion: 0,
                locationJson: optimisticLocationJson,
                stickerJson: Self.stickerJson(sticker, id: tempId)
            )
            Logger.messages.info("SendFlow insertOptimistic START tempId=\(tempId, privacy: .public) convId=\(self.conversationId, privacy: .public)")
            do {
                try await persistence.insertOptimistic(optimisticRecord)
                Logger.messages.debug("SendFlow insertOptimistic OK tempId=\(tempId, privacy: .public) state=.sending convId=\(self.conversationId, privacy: .public)")
                // Local-first: surface the just-sent message in the conversation
                // list IMMEDIATELY (preview + bump to top), before any server ACK
                // — via the same path realtime events use (cache update →
                // conversationsDidChange → reloadFromCache). Previously only the
                // offline branch did this, so an online PENDING message did not
                // appear/reorder in the list until its ACK. finalizeSuccessfulSend
                // refreshes it with the server timestamp at ACK time.
                await ConversationSyncEngine.shared.updateConversationAfterSend(
                    LastMessageFacet.sent(
                        id: tempId,
                        text: text,
                        at: optimisticRecord.createdAt,
                        attachments: resolvedAttachments,
                        isBlurred: resolvedBlur ?? false,
                        isViewOnce: resolvedIsViewOnce,
                        expiresAt: resolvedExpiresAt,
                        originalLanguage: optimisticRecord.originalLanguage,
                        location: location
                    ),
                    conversationId: conversationId
                )
            } catch {
                Logger.messages.error("SendFlow insertOptimistic FAILED tempId=\(tempId, privacy: .public) error=\(error.localizedDescription, privacy: .public)")
            }
        }

        // Déclarés hors du `do` : le bloc `catch` (repli socket) les relit.
        var finalContent: String? = text.isEmpty ? nil : text
        var isEncrypted = false
        // Spec 2026-07-08 (message-send-failure-retry-flow) — chaque tentative
        // de transport est journalisée dans `send_attempts` pour la carte
        // « Historique d'envoi » de la vue détails. Non-nil uniquement quand le
        // POST REST a réellement démarré, pour que le catch (atteignable aussi
        // par un échec de chiffrement pré-transport) n'enregistre pas de
        // fausse tentative REST.
        var restAttemptStartedAt: Date? = nil
        do {
            var encryptionMode: String? = nil

            // E2EE logic for Direct Messages
            if isDirect, let targetUserId = participantUserId, let textContent = finalContent {
                do {
                    let payloadData = Data(textContent.utf8)
                    let encryptedData = try await SessionManager.shared.encryptMessage(payloadData, for: targetUserId, conversationId: conversationId)
                    finalContent = encryptedData.base64EncodedString()
                    isEncrypted = true
                    encryptionMode = "E2EE"
                } catch {
                    Logger.messages.error("Failed to encrypt message: \(error.localizedDescription)")
                    #if DEBUG
                    // Debug-only fallback: log and continue with plaintext so dev builds don't block on E2EE setup issues.
                    #else
                    // Production: never silently downgrade an E2EE session to plaintext.
                    try? await messagePersistence.markOptimisticFailed(localId: tempId, reason: "encryption_failed")
                    throw error
                    #endif
                }
            }

            let body = SendMessageRequest(
                content: finalContent,
                originalLanguage: resolvedOriginalLanguage,
                replyToId: replyToId,
                storyReplyToId: storyReplyToId,
                forwardedFromId: forwardedFromId,
                forwardedFromConversationId: forwardedFromConversationId,
                attachmentIds: attachmentIds,
                expiresAt: resolvedExpiresAt,
                ephemeralDuration: resolvedEphemeralDuration,
                isViewOnce: resolvedIsViewOnce ? true : nil,
                maxViewOnceCount: resolvedMaxViewOnceCount,
                isBlurred: resolvedBlur,
                effectFlags: pendingEffects.hasAnyEffect ? pendingEffects.flags.rawValue : nil,
                isEncrypted: isEncrypted ? true : nil,
                encryptionMode: encryptionMode,
                clientMessageId: tempId,
                location: location,
                sticker: sticker,
                attachmentReplyTo: attachmentReplyTo
            )

            // WebSocket-first send (re-enabled 2026-06-11). On a persistent
            // socket the `message:send` ACK returns in ~200 ms, vs the 10-30 s a
            // slow-cellular REST POST + 429/503 retries can pin the optimistic
            // clock. Gated to plain text only — no attachments, no E2EE, no
            // ephemeral/view-once/blur/effects — because `message:send` does not
            // transport those; and only when the socket reports connected. A miss
            // (nil ACK / no socket) falls straight through to the REST POST below
            // with the SAME clientMessageId, so the gateway dedups (no duplicate
            // row). The disabling note below (2026-05-16/17, channel non-functional)
            // is superseded: the gateway handler is wired and ACKs are verified.
            let socketFirstEligible = messageSocket.isConnected
                && !isEncrypted
                && (attachmentIds?.isEmpty ?? true)
                && resolvedExpiresAt == nil
                && !resolvedIsViewOnce
                && resolvedBlur != true
                && !pendingEffects.hasAnyEffect
                // #6164 — l'ancre de la pièce citée n'existe que sur le corps
                // REST : le handler socket ne la lit pas, et la garde qui
                // l'ADMET (`admitAttachmentReply`) n'y est pas wirée. Sans ce
                // terme, répondre à la troisième photo d'un carrousel partirait
                // par le socket, arriverait sans ancre, et la citation
                // montrerait la première — un contrôle qui ment, sur le cas
                // NOMINAL du plein écran (#6165).
                && attachmentReplyTo == nil
            if socketFirstEligible {
                Logger.messages.info("SendFlow socket-first START tempId=\(tempId, privacy: .public) convId=\(self.conversationId, privacy: .public) — message:send before REST")
                let socketFirstStartedAt = Date()
                if let socketAck = await messageSocket.sendViaSocketFallback(
                    conversationId: conversationId,
                    content: finalContent,
                    attachmentIds: [],
                    replyToId: replyToId,
                    storyReplyToId: storyReplyToId,
                    originalLanguage: resolvedOriginalLanguage,
                    isEncrypted: false,
                    clientMessageId: tempId,
                    // Le canal socket accepte le lieu (MessageHandler.ts) : le
                    // socket-first RESTE éligible pour un message porteur de
                    // lieu — pas d'ajout à la liste d'inéligibilité ci-dessus.
                    location: location
                ) {
                    await recordSendAttempt(tempId, transport: .socketFirst, startedAt: socketFirstStartedAt, outcome: .success)
                    await finalizeSuccessfulSend(
                        tempId: tempId,
                        serverId: socketAck.messageId,
                        serverCreatedAt: socketAck.createdAt ?? Date(),
                        text: text,
                        sendStartedAt: sendStartedAt,
                        transport: "socket-first"
                    )
                    return true
                }
                await recordSendAttempt(tempId, transport: .socketFirst, startedAt: socketFirstStartedAt, outcome: .failure, errorMessage: "no ACK")
                Logger.messages.info("SendFlow socket-first MISS tempId=\(tempId, privacy: .public) — no ACK, falling through to REST")
            }

            // Send via REST. The WebSocket-first send path (commit 35b399f9,
            // 2026-05-16) was disabled because the `message:send` Socket.IO event
            // did not reach the gateway handler (investigation 2026-05-17). It is
            // now re-enabled above as a fast path; REST remains the fallback and
            // is direct (~25 ms server-side).
            Logger.messages.info("SendFlow POST /messages START tempId=\(tempId, privacy: .public) convId=\(self.conversationId, privacy: .public) — awaiting response (isSending held)")
            // Cap the REST send at `sendRESTTimeoutSeconds` (12s) instead of the
            // 60s URLSession request timeout: on a slow/intermittent cellular
            // link a hung POST otherwise pins the optimistic `.sending` clock for
            // a full minute before the socket fallback + durable outbox can take
            // over. On timeout the throw routes into the catch below (socket
            // re-emit with the SAME clientMessageId → gateway dedups).
            restAttemptStartedAt = Date()
            let responseData = try await withSendTimeout(seconds: Self.sendRESTTimeoutSeconds) {
                try await self.messageService.send(
                    conversationId: self.conversationId, request: body
                )
            }
            let serverId = responseData.id
            let serverCreatedAt = responseData.createdAt
            await recordSendAttempt(tempId, transport: .rest, startedAt: restAttemptStartedAt ?? sendStartedAt, outcome: .success)
            Logger.messages.debug("SendFlow POST OK tempId=\(tempId, privacy: .public) serverId=\(responseData.id, privacy: .public)")

            await finalizeSuccessfulSend(
                tempId: tempId,
                serverId: serverId,
                serverCreatedAt: serverCreatedAt,
                text: text,
                sendStartedAt: sendStartedAt,
                transport: "rest"
            )
            return true
        } catch {
            if let restStartedAt = restAttemptStartedAt {
                await recordSendAttempt(tempId, transport: .rest, startedAt: restStartedAt, outcome: .failure, errorMessage: error.localizedDescription)
            }
            // Permanent rejection: the other party blocked us (or we blocked
            // them from another device). Retrying never succeeds, so skip the
            // ~10s socket fallback + outbox retry — mark the row failed and tell
            // the user. Outgoing blocks are already gated by the composer zone;
            // this catches incoming blocks the client can't see ahead of time.
            if error.isUserBlockedError {
                Logger.messages.warning("perf:ios.send.fail.blocked clientMessageId=\(tempId, privacy: .public)")
                _ = try? await messagePersistence.applyEvent(localId: tempId, event: .sendFailed(error))
                FeedbackToastManager.shared.showError(
                    String(localized: "conversation.send.blocked", defaultValue: "Vous ne pouvez pas écrire à cet utilisateur.", bundle: .main)
                )
                return false
            }
            let failElapsedMs = Int(Date().timeIntervalSince(sendStartedAt) * 1000)
            Logger.messages.warning("perf:ios.send.fail clientMessageId=\(tempId, privacy: .public) durationMs=\(failElapsedMs, privacy: .public) error=\(error.localizedDescription, privacy: .public)")

            // Repli socket : le POST REST a échoué — réémettre une fois via le
            // socket avec le MÊME clientMessageId (dedup gateway → pas de doublon
            // si l'outbox rejoue le REST ensuite). On exclut les messages à
            // propriétés sensibles (éphémère, vue unique, flou, effets) que le
            // canal socket ne transporte pas intégralement : ceux-là restent sur
            // le retry REST de l'outbox qui, lui, les préserve.
            let hasSpecialProps = resolvedExpiresAt != nil
                || resolvedIsViewOnce
                || resolvedBlur == true
                || pendingEffects.hasAnyEffect
                // Même raison que le socket-first ci-dessus : le repli socket
                // perdrait l'ancre en silence. Ces envois restent sur le retry
                // REST de l'outbox, qui la préserve.
                || attachmentReplyTo != nil
            if !hasSpecialProps {
                Logger.messages.warning("SendFlow socket-fallback START tempId=\(tempId, privacy: .public) convId=\(self.conversationId, privacy: .public) — REST failed, awaiting socket ack up to ~10s (isSending held)")
                let socketFallbackStartedAt = Date()
                let socketAck = await messageSocket.sendViaSocketFallback(
                    conversationId: conversationId,
                    content: finalContent,
                    attachmentIds: attachmentIds ?? [],
                    replyToId: replyToId,
                    storyReplyToId: storyReplyToId,
                    originalLanguage: resolvedOriginalLanguage,
                    isEncrypted: isEncrypted,
                    clientMessageId: tempId,
                    location: location,
                    sticker: sticker
                )
                await recordSendAttempt(
                    tempId,
                    transport: .socketFallback,
                    startedAt: socketFallbackStartedAt,
                    outcome: socketAck != nil ? .success : .failure,
                    errorMessage: socketAck == nil ? "no ACK" : nil
                )
                if let socketAck {
                    pendingServerIds[tempId] = socketAck.messageId
                    _ = try? await messagePersistence.applyEvent(
                        localId: tempId,
                        event: .serverAck(serverId: socketAck.messageId, at: socketAck.createdAt ?? Date())
                    )
                    Logger.messages.info("perf:ios.send.ack clientMessageId=\(tempId, privacy: .public) serverId=\(socketAck.messageId, privacy: .public) transport=socket-fallback durationMs=\(failElapsedMs, privacy: .public)")
                    return true
                }
            }

            // Apply sendFailed — state machine increments retryCount and transitions
            // to .queued (retries remaining) or .failed (budget exhausted).
            // The store observation surfaces the updated state to the view.
            _ = try? await messagePersistence.applyEvent(
                localId: tempId,
                event: .sendFailed(error)
            )

            // Enqueue for persistent auto-retry. The unified outbox
            // (`OfflineQueue` + `OutboxFlusher`) owns the retry loop now —
            // exponential backoff up to 5 attempts (`OutboxFlusher.maxAttempts`)
            // with `retryExhausted` firing on the unified signal at the end.
            // Wave 1 Task 3.6 — the deleted `MessageRetryQueue` used to own a
            // parallel retry loop ; both paths converged on the same outbox
            // table so behavior is preserved while LoC drops by ~600.
            let retryKinds = localAttachments?.map { $0.kind.rawValue }
            let retryItem = OfflineQueueItem(
                conversationId: conversationId,
                content: text,
                clientMessageId: tempId,
                originalLanguage: resolvedOriginalLanguage,
                replyToId: replyToId,
                attachmentIds: attachmentIds,
                attachmentKinds: retryKinds,
                location: location,
                sticker: sticker,
                attachmentReplyTo: attachmentReplyTo?.attachmentId
            )

            // AWAITED enqueue (Bug 1 fix — online retry path, B2 2026-05-27).
            // The legacy `Task { try? await OfflineQueue.shared.enqueue(...) }`
            // fire-and-forgot the outbox write: the function returned before
            // GRDB had committed the retry row, so a process kill or a fast
            // second tap could silently drop the auto-retry. Mirror B1's
            // offline-branch fix here — `await` the injected `offlineQueue`
            // and flip the optimistic bubble to `.failed` on disk-full /
            // coding errors so the user can manually retry.
            do {
                try await offlineQueue.enqueue(retryItem)
            } catch {
                Logger.messages.error("online retry enqueue failed: \(error.localizedDescription, privacy: .public)")
                try? await messagePersistence.markOptimisticFailed(
                    localId: tempId,
                    reason: "online retry enqueue failed: \(error.localizedDescription)"
                )
            }

            return false
        }
    }

    // MARK: - Send Attempt Journal

    /// Journalise une tentative de transport dans `send_attempts` (spec
    /// 2026-07-08 message-send-failure-retry-flow). Best-effort : un échec
    /// d'écriture ne doit jamais interrompre le flux d'envoi.
    private func recordSendAttempt(
        _ tempId: String,
        transport: SendAttemptRecord.Transport,
        startedAt: Date,
        outcome: SendAttemptRecord.Outcome,
        errorMessage: String? = nil
    ) async {
        try? await messagePersistence.recordSendAttempt(
            localId: tempId,
            transport: transport,
            startedAt: startedAt,
            outcome: outcome,
            errorMessage: errorMessage
        )
    }

    // MARK: - Retry Failed Message

    func retryMessage(messageId: String) async {
        guard let idx = messageIndex(for: messageId) else { return }
        let failedMsg = messages[idx]
        guard failedMsg.deliveryStatus == .failed else { return }

        // Media-carrying failed messages (image/video/audio/file) must
        // replay through the durable outbox: it alone still holds the real,
        // already-uploaded attachment ids (the displayed `Message.attachments`
        // carry the pre-upload LOCAL placeholder ids, never reconciled after
        // the fact). A direct `sendMessage(content:replyToId:)` below only
        // knows content + replyToId, so a captioned media resend would land
        // on the server as text-only, and an uncaptioned one would be
        // rejected outright by `sendMessage`'s empty-content guard — leaving
        // the bubble stuck mid-clock (state already flipped .failed →
        // .queued with nothing left to advance it). Resetting the existing
        // outbox row + an immediate drain mirrors the reaction retry pattern
        // above (`OutboxFlusher` otherwise only runs at boot / foreground).
        guard failedMsg.attachments.isEmpty else {
            do {
                try await offlineQueue.retryByClientMessageId(messageId)
                // Mirror the text-only path below: flip .failed → .queued so
                // the retry band disappears immediately instead of lingering
                // for the entire upload + dispatch duration (BubbleFailedRetryBar
                // only clears once the message leaves the .failed state).
                // Gated on the reset succeeding — if the outbox row couldn't be
                // found/reset, nothing is actually going to be resent, so the
                // message must stay visibly .failed.
                _ = try? await messagePersistence.applyEvent(localId: messageId, event: .retry)
            } catch {
                Logger.messages.error("retryMessage outbox reset failed: \(error.localizedDescription)")
            }
            await OutboxFlushTrigger.flushNow()
            return
        }

        // Resend IN PLACE — no delete + reinsert, so the bubble never flashes
        // "message supprimé". `.retry` transitions the EXISTING row .failed →
        // .queued (resets the retry budget) while preserving its content and
        // position: the orange retry band disappears and the bubble shows the
        // sending indicator immediately. `sendMessage` then re-drives the fast
        // (socket-first) send reusing the SAME clientMessageId — Phase 4 §6.2,
        // so the gateway dedup contract `(conversationId, clientMessageId)`
        // catches a prior attempt that DID reach the server (lost ACK). Its
        // optimistic insert harmlessly no-ops on the existing row (PK conflict,
        // swallowed by the insert's own catch), and the serverAck reconciles it
        // .queued → .sent. The local id of a Phase 4 optimistic message IS its
        // clientMessageId (no legacy temp_/offline_/retry_ prefix), so passing
        // `messageId` straight through as `existingTempId` is correct.
        let content = failedMsg.content
        let replyToId = failedMsg.replyToId
        // Preserve the message's ORIGINAL language identity across a retry —
        // omitting it here would let it fall through `sendMessage`'s
        // `originalLanguage ?? Self.composeLanguage(for:preferred:)` fallback
        // (re-detected from the resent content) and silently rewrite a
        // non-French message's language on every retry (Prisme violation).
        let originalLanguage = failedMsg.originalLanguage
        _ = try? await messagePersistence.applyEvent(localId: messageId, event: .retry)
        let succeeded = await sendMessage(content: content, replyToId: replyToId, originalLanguage: originalLanguage, existingTempId: messageId)
        // #4042 — un retry RÉUSSI doit faire disparaître la ligne outbox
        // D'ORIGINE (créée par le PREMIER échec) : `sendMessage` réutilise
        // le MÊME clientMessageId (Phase 4 §6.2), donc c'est la même ligne
        // que `SyncPillViewModel` continue de surfacer tant qu'elle reste
        // `.failed`/`.exhausted` en base — ce chemin texte-seul ne la
        // touchait jamais jusqu'ici (repro : retry réussi, entrée SyncPill
        // qui persiste indéfiniment).
        if succeeded {
            await offlineQueue.clearSendMessageRow(clientMessageId: messageId)
        }
    }

    func removeFailedMessage(messageId: String) {
        Task { [weak self] in
            guard let self else { return }
            try? await messagePersistence.markDeleted(localId: messageId, deletedAt: Date())
        }
    }

    // MARK: - Bulle optimiste média

    /// S7 — flip an optimistic media bubble to `.failed` so a stuck `.sending`
    /// spinner resolves into a retryable failed state when its upload/send
    /// fails (e.g. an offline visual attachment whose TUS upload threw). Without
    /// this the bubble stays a permanent ghost spinner. Thin passthrough; the
    /// store observation surfaces the new state.
    func markOptimisticMediaFailed(tempId: String, reason: String) async {
        try? await messagePersistence.markOptimisticFailed(localId: tempId, reason: reason)
    }

    /// Insère un MessageRecord optimiste GRDB pour un message média (image,
    /// vidéo, audio, fichier) AVANT que l'upload TUS ne soit terminé. Les
    /// attachments fournis pointent sur les fichiers locaux (file:// URLs)
    /// pour que la bulle affiche l'image / le player audio immédiatement —
    /// y compris hors-ligne. Le store observation surface la nouvelle ligne
    /// dans `messages` automatiquement, donc l'appelant n'a PAS besoin de
    /// faire `messages.append(...)` en parallèle (cela serait écrasé à la
    /// prochaine emission du publisher).
    ///
    /// `tempId` est la clé locale (= `MessageRecord.localId` dans GRDB).
    /// Préfixes attendus : `temp_<UUID>` (envoi en ligne), `offline_<UUID>`
    /// (queue offline), `retry_<UUID>` (queue retry).
    ///
    /// `originalLanguage` doit être la langue du composer (sélectionnée par
    /// l'utilisateur ou détectée). Hardcoder "fr" violerait le Prisme
    /// Linguistique pour les utilisateurs non-francophones — l'affichage
    /// optimiste afficherait le mauvais drapeau de langue jusqu'à la
    /// réconciliation serveur.
    func insertOptimisticMediaMessage(
        tempId: String,
        content: String,
        attachments: [MeeshyMessageAttachment],
        messageType: Message.MessageType,
        replyToId: String?,
        storyReplyToId: String? = nil,
        replyReference: ReplyReference? = nil,
        originalLanguage: String? = nil,
        sticker: MessageSticker? = nil,
        protection: MessageProtectionIntent
    ) {
        let now = Date()
        let attachmentsJson = attachments.isEmpty ? nil : try? JSONEncoder().encode(attachments)
        // Construit le ReplyReference riche AVANT l'insert : si `replyReference`
        // est fourni (story reply), on l'utilise ; sinon on resout via
        // `replyToId` depuis `self.messages`. Garantit que `replyToJson` est
        // non-nil des que `replyToId` ou `replyReference` n'est pas nil.
        let resolvedReplyRef = makeReplyReference(
            storyReplyReference: replyReference,
            replyToId: replyToId
        )
        let replyToJson = resolvedReplyRef.flatMap { try? JSONEncoder().encode($0) }
        let resolvedOriginalLanguage = originalLanguage ?? Self.composeLanguage(for: content, preferred: preferredLanguages)
        let record = MessageRecord(
            localId: tempId, serverId: nil,
            conversationId: conversationId, senderId: currentUserId,
            content: content.isEmpty ? nil : content,
            originalLanguage: resolvedOriginalLanguage,
            messageType: messageType.rawValue, messageSource: "user", contentType: messageType.rawValue,
            state: .sending, retryCount: 0, lastError: nil,
            isEncrypted: false, encryptionMode: nil, encryptedPayload: nil,
            replyToId: replyToId,
            storyReplyToId: storyReplyToId,
            forwardedFromId: nil, forwardedFromConversationId: nil,
            replyToJson: replyToJson, forwardedFromJson: nil,
            // La bulle optimiste PORTE la protection qu'on vient d'armer
            // (#7498). Elle valait `nil`/`0` en dur : l'expéditeur envoyait un
            // éphémère et voyait un message ordinaire — ni flamme, ni
            // décompte, ni voile — jusqu'à la réconciliation serveur. Le
            // défaut se lisait comme « la protection n'a pas été appliquée »,
            // ce qui était vrai à l'écran et faux sur le fil.
            expiresAt: protection.expiresAt(from: now),
            effectFlags: protection.lifecycleFlags.rawValue,
            maxViewOnceCount: protection.maxViewOnceCount, viewOnceCount: 0,
            isEdited: false, editedAt: nil, deletedAt: nil,
            pinnedAt: nil, pinnedBy: nil,
            senderName: authManager.currentUser?.displayName,
            senderUsername: authManager.currentUser?.username,
            senderColor: nil, senderAvatarURL: authManager.currentUser?.avatar,
            deliveredCount: 0, readCount: 0,
            deliveredToAllAt: nil, readByAllAt: nil,
            createdAt: now, sentAt: nil,
            deliveredAt: nil, readAt: nil, updatedAt: now,
            attachmentsJson: attachmentsJson, reactionsJson: nil,
            reactionCount: 0, currentUserReactionsJson: nil,
            mentionedUsersJson: nil,
            cachedBubbleWidth: nil, cachedBubbleHeight: nil,
            cachedLastLineWidth: nil, cachedLineCount: nil,
            cachedTimestampInline: nil,
            layoutVersion: 0, layoutMaxWidth: nil,
            changeVersion: 0,
            stickerJson: Self.stickerJson(sticker, id: tempId)
        )
        let persistence = messagePersistence
        let recordConversationId = record.conversationId
        let attachmentCount = attachments.count
        // Captured for the conversation-list optimistic update below (computed on
        // the MainActor before the detached insert).
        let listFacet = LastMessageFacet.sent(
            id: tempId,
            text: content,
            at: now,
            attachments: attachments,
            originalLanguage: resolvedOriginalLanguage
        )
        Task.detached(priority: .userInitiated) {
            do {
                try await persistence.insertOptimistic(record)
                Logger.messages.debug("SendFlow insertOptimisticMedia OK tempId=\(tempId, privacy: .public) convId=\(recordConversationId, privacy: .public) attachments=\(attachmentCount, privacy: .public)")
                // Local-first: surface the media message in the conversation list
                // immediately (preview + bump to top), before any server ACK —
                // the media path previously never updated the list optimistically.
                await ConversationSyncEngine.shared.updateConversationAfterSend(listFacet, conversationId: recordConversationId)
            } catch {
                Logger.messages.error("SendFlow insertOptimisticMedia FAILED tempId=\(tempId, privacy: .public) error=\(error.localizedDescription, privacy: .public)")
            }
        }
    }
}
