import Foundation
import Combine
import GRDB
import os

// MARK: - Test Seam

/// Subset of `OfflineQueue`'s public surface that consumers
/// (EditProfileViewModel + other Phase 4 VMs) depend on. Lets tests
/// inject a mock without faking the full actor.
public protocol OfflineQueueing: Sendable {
    @discardableResult
    func enqueue<P: Codable & Sendable>(
        _ kind: OutboxKind,
        payload: P,
        conversationId: String?
    ) async throws -> String

    /// **La SEULE entrée d'un commentaire dans la file** (#9743). La file
    /// réelle n'écrit la ligne que dans la base PROUVÉE de son auteur
    /// (`OfflineQueue.enqueueComment`) ; aucun site n'enfile un commentaire
    /// par l'entrée générique ci-dessus.
    @discardableResult
    func enqueueComment(_ comment: CreateCommentPayload, ownerId: String?) async throws -> String

    func outcomeStream(for cmid: String) async -> AsyncStream<OutboxOutcome>

    /// **Une ligne de ce `kind`, rangée sous cette `anchor`, est-elle encore en
    /// ROUTE ?** — la question qu'un appelant doit pouvoir poser à la file
    /// AVANT d'enfiler, quand une seconde ligne visant la même chose ne serait
    /// pas une mutation de plus mais un DOUBLON.
    ///
    /// La file répond ; elle ne DÉCIDE pas. Quels kinds se dédupliquent par
    /// ancre est une règle de PRODUIT (« deux taps sur la même carte ne font
    /// qu'une republication »), et elle vit chez l'écrivain qui la porte —
    /// `RepostPublisher`, côté app — jamais ici : ce protocole ne sait pas ce
    /// qu'un repost, un like ou un signalement veulent dire.
    ///
    /// **« En route » = `.pending`, `.inflight` ou `.failed`.** Une ligne qui a
    /// ABOUTI quitte la table : elle ne peut donc pas retenir un geste neuf, et
    /// republier-supprimer-republier reste faisable. Une ligne `.exhausted` ne
    /// compte PAS non plus — le flusher a renoncé, elle n'ira nulle part sans
    /// une reprise manuelle, et la faire compter rendrait le bouton INERTE
    /// jusqu'à ce que l'auteur vide sa pastille de synchro.
    ///
    /// Rend `false` quand aucun pool n'est câblé : sans magasin il n'y a aucune
    /// ligne, donc rien à retenir.
    func hasUnsentRow(kind: OutboxKind, anchor: String) async -> Bool

    /// U1b — durable write-ahead enqueue for an OFFLINE media post. Relocates the
    /// source files + inserts the `.createPost` row referencing them; the
    /// dispatcher replays the TUS upload on reconnect. On the protocol so
    /// ViewModels can route offline media posts through an injected (mockable)
    /// queue, like the generic `enqueue`.
    @discardableResult
    /// `location` fait partie de l'exigence : une valeur par défaut sur
    /// l'implémentation concrète ne satisfait PAS une exigence de protocole en
    /// Swift, et les appelants (`FeedViewModel.createOfflineMediaPost`) passent
    /// la position à travers ce protocole.
    /// `mentions` fait partie de la REQUIREMENT et non d'un défaut concret :
    /// `location` avait été ajoutée à l'implémentation seule, et le protocole
    /// muet la jetait avant le mock — un test vert prouvait l'inverse de ce
    /// qu'il croyait.
    func enqueuePostMedia(
        sourceMediaURLs: [URL],
        /// Le MIME **DÉCLARÉ** de chaque fichier, aligné par INDEX sur
        /// `sourceMediaURLs`. `nil` ⇒ le dispatcher le re-dérive de
        /// l'extension, comme avant ce champ.
        ///
        /// Sur la REQUIREMENT, et SANS défaut : le site d'envoi d'un vocal
        /// CONNAÎT le MIME (il l'a servi à `ReelComposition` pour élire le
        /// type) et ne l'emportait pas. Ce que le dispatcher re-dérivait alors
        /// pouvait valoir `application/octet-stream` — et le gateway ne
        /// reconnaît un média audio qu'à `mimeType.startsWith('audio/')`.
        sourceMediaMimeTypes: [String]?,
        clientMutationId: String,
        content: String?,
        visibility: String,
        /// Destinataires nommés d'une audience EXCEPT/ONLY. Le payload
        /// persisté les portait déjà (`CreatePostPayload.visibilityUserIds`,
        /// relu au flush) — rien ne les y METTAIT : un post hors-ligne à
        /// audience nommée partait donc sans sa liste, et le gateway le
        /// refusait (`CreatePostSchema`).
        visibilityUserIds: [String]?,
        originalLanguage: String?,
        type: String?,
        location: SharedPlace?,
        mentions: [PostMentionInput]?,
        /// Le SECOND opt-in de position (spec du 2026-08-02 §2). Il fait le
        /// MÊME trajet que `location`, et pour la même raison : `location`
        /// survivait déjà au flush pendant que le consentement se perdait
        /// entre le composer et la file, si bien qu'un média posté hors ligne
        /// avec « trouvable à proximité » coché arrivait non trouvable.
        /// Sur la REQUIREMENT et non en défaut concret : un défaut sur
        /// l'implémentation ne satisfait pas une exigence de protocole, et le
        /// mock l'aurait jeté en silence.
        discoverabilityPrecision: DiscoverabilityPrecision?,
        /// Ce qui QUALIFIE un enregistrement vocal : le texte transcrit SUR
        /// L'APPAREIL. Le gateway le persiste sur le premier `PostMedia` audio
        /// et évite la re-transcription Whisper ; sans lui, la transcription
        /// que l'auteur a relue avant d'envoyer est jetée en silence et refaite
        /// côté serveur, avec un résultat qui peut différer.
        ///
        /// Sur la REQUIREMENT, et SANS défaut nulle part — ni ici ni sur
        /// l'implémentation concrète. C'est le filet compile-time : un défaut
        /// ferait disparaître ce champ d'un site d'appel sans casser la moindre
        /// compilation, ce qui est exactement le mécanisme par lequel
        /// `CreatePostPayload` avait perdu trois champs sur la branche hors
        /// ligne de `setStatus`.
        mobileTranscription: MobileTranscriptionPayload?,
        /// Le canvas composé sur la scène (#4756) — sans défaut, comme
        /// `mobileTranscription` : chaque appelant DÉCLARE s'il en a un.
        storyEffects: StoryEffects?,
        /// Les légendes par fichier, alignées par INDEX sur `sourceMediaURLs`
        /// (#4756). Sans défaut, même raison.
        mediaCaptions: [String?]?,
        /// Les alternatives textuelles, même alignement et même discipline —
        /// un défaut les ferait disparaître d'un site d'appel sans casser la
        /// moindre compilation, et un média resterait muet pour un lecteur
        /// d'écran sans que personne ne l'apprenne.
        mediaAlts: [String?]?,
        /// L'identifiant d'objet de canvas de chaque fichier, même alignement.
        /// Sans défaut, même discipline : il ne sert à rien de le porter à
        /// moitié.
        mediaObjectIds: [String?]?,
        /// L'autorisation d'extraction du son (#3996), même clé top-level
        /// `allowSoundExtraction` que le chemin direct (`CreatePostRequest`,
        /// `PostService.create`). Sur la REQUIREMENT et SANS défaut, même
        /// discipline que `mobileTranscription` : Swift n'autorise pas les
        /// défauts sur une exigence de protocole, et un défaut posé
        /// seulement sur l'implémentation concrète serait ignoré par tout
        /// appelant typé sur le protocole (les mocks des tests) — chaque
        /// appelant DÉCLARE donc explicitement `nil` ou sa vraie valeur.
        allowSoundExtraction: Bool?
    ) async throws -> OfflineQueue.EnqueueMediaResult

    /// Draft recovery — returns the most recent unsent `.createPost` row whose
    /// type is in `matchingTypes` and that has been stuck for more than
    /// `olderThan` seconds (the "not sent within the minute → offline" rule), so
    /// the matching composer can pre-fill it as a draft. `nil` when nothing
    /// qualifies. Resolves the row's `localMediaPaths` back to existing file
    /// URLs so the composer can restore media too.
    func recoverLastUnsentPost(
        matchingTypes: Set<String>,
        olderThan: TimeInterval
    ) async -> RecoveredOfflinePost?

    /// Supersedes a recovered offline post/status/reel: deletes its `.createPost`
    /// outbox row (id `ofqm_<cmid>`) and reclaims its pending-media files. Called
    /// when the user re-sends the recovered draft so the resend replaces the
    /// stuck row instead of racing it to the server (no duplicate on reconnect).
    func cancelCreatePost(clientMutationId: String) async

    /// #10321 — « Supprimer » sur une publication encore en file : retirée si
    /// elle attend, marquée si elle est en vol. Voir `OfflineQueue+PublicationCancel`.
    func cancelPendingPublication(clientMutationId: String) async -> PublicationCancellation
}

extension OfflineQueue: OfflineQueueing {}


/// Test seam for the message-centric `enqueue(_:)` path used by
/// `ConversationViewModel.sendMessage`. Naming avoids collision with
/// `OfflineQueueProviding` (story-specific) and `OfflineQueueing` (generic
/// non-message payload). Conforming types own the `OfflineQueueItem`
/// coalescing semantics so callers can `await` the persistence write before
/// reporting success to the user.
public protocol OfflineMessageQueueing: Sendable {
    func enqueue(_ item: OfflineQueueItem) async throws
    /// Durable offline message EDIT (T11). Coalesces with a pending send/edit
    /// for the same `clientMessageId` (see `enqueueEdit` impl).
    func enqueueEdit(_ payload: OfflineEditPayload) async throws
    /// Durable offline message DELETE (T11). Cancels a pending send / supersedes
    /// a pending edit for the same `clientMessageId` (see `enqueueDelete` impl).
    func enqueueDelete(_ payload: OfflineDeletePayload) async throws
    /// Resets an exhausted/failed outbox row for `cmid` back to `.pending` so
    /// the flusher replays it with its ORIGINAL payload (attachments, reply,
    /// etc. all preserved) — used by the manual "retry" affordance on a
    /// `.failed` bubble that carries attachments (see
    /// `ConversationViewModel.retryMessage`, which cannot reconstruct real
    /// uploaded attachment ids from the displayed `Message` alone).
    func retryByClientMessageId(_ cmid: String) async throws
    /// Cancels a still-`.pending` `.sendMessage` outbox row for `cmid`, if
    /// one exists — used when the user deletes a `.failed` message that a
    /// prior `retryByClientMessageId` reset back to pending, so the reset
    /// send can never dispatch after the local delete (see
    /// `ConversationViewModel.deleteMessage`'s `.failed` short-circuit).
    /// Deliberately narrower than `enqueueDelete`: it MUST NEVER insert a new
    /// `.deleteMessage` row when no pending send exists — that would
    /// eventually hit the REST delete endpoint with the bogus local id the
    /// `.failed` short-circuit exists specifically to avoid. No-op (not an
    /// error) when there is nothing pending to cancel.
    func cancelPendingSend(clientMessageId: String) async
    /// Deletes the `.sendMessage` outbox row for `cmid` in ANY status
    /// EXCEPT `.inflight` (never race a dispatch actually in progress) —
    /// broader than `cancelPendingSend`, which only ever touches `.pending`.
    /// Two callers: (1) a manual retry that just SUCCEEDED — the original
    /// row (same `clientMessageId`, Phase 4 §6.2) must stop being surfaced
    /// by the SyncPill, which otherwise keeps showing a `.failed`/
    /// `.exhausted` row forever even after the message actually sent
    /// (`ConversationViewModel.retryMessage`, #4042); (2) deleting a
    /// `.failed` message — `cancelPendingSend` alone left `.failed`/
    /// `.exhausted` rows behind because they are never `.pending`
    /// (`ConversationViewModel.deleteMessage`'s `.failed` short-circuit,
    /// #4043). No-op (not an error) when nothing matches.
    func clearSendMessageRow(clientMessageId: String) async
    /// Enfilage durable d'un message média (photo/vidéo/document) hors ligne,
    /// ou repris d'un partage. Sur le PROTOCOLE, et non seulement sur
    /// l'implémentation : `SharePendingSendConsumer` appelle à travers ce
    /// protocole et ne pourrait ni l'appeler ni le bouchonner en test s'il
    /// restait muet.
    ///
    /// TOUS les paramètres sont dans l'exigence — un paramètre présent sur la
    /// seule implémentation concrète est JETÉ avant le mock, et un test vert
    /// prouve alors l'inverse de ce qu'il croit (précédent vécu : `location`
    /// sur `enqueuePostMedia`).
    ///
    /// `deletesSourceFiles: false` pour un dossier média PARTAGÉ entre
    /// plusieurs cibles ; `createdAt` non nil pour préserver l'horodatage d'un
    /// partage repris.
    @discardableResult
    func enqueueMedia(
        sourceMediaURLs: [URL],
        kinds: [String],
        conversationId: String,
        content: String?,
        clientMessageId: String,
        originalLanguage: String?,
        replyToId: String?,
        forwardedFromId: String?,
        forwardedFromConversationId: String?,
        copyAttachmentsFromClientMessageId: String?,
        /// Sticker du message (#4823) — sur l'EXIGENCE, comme `location` :
        /// un PNG de sticker enfilé hors ligne doit repartir avec ce qu'il
        /// représente, sinon le destinataire reçoit une image muette.
        sticker: MessageSticker?,
        deletesSourceFiles: Bool,
        createdAt: Date?,
        /// La protection armée à l'envoi (#8350) — sur l'EXIGENCE, pour la
        /// même raison que `sticker` : un mock doit la voir passer.
        protection: MessageProtectionIntent
    ) async throws -> OfflineQueue.EnqueueMediaResult
}

extension OfflineQueue: OfflineMessageQueueing {}
