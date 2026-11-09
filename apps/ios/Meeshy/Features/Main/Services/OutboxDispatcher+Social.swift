import Foundation
import Combine
import MeeshySDK
import os

extension OutboxDispatcher {

    // MARK: - Social mutations

    /// 4xx responses from the gateway are NOT transient — replaying the
    /// same request will produce the same error. We rethrow as-is so the
    /// flusher escalates to `.exhausted` once `maxAttempts` is reached.
    /// 5xx and network errors are also rethrown but those are inherently
    /// transient and the flusher's exponential backoff will retry.
    func dispatchBlockUser(_ record: OutboxRecord) async throws {
        let payload = try decodePayload(record, as: BlockUserPayload.self)
        // `PUT /directory/blocks/{id}` (#4164) — et c'est CE chemin-ci qui rend
        // la migration urgente : le rejeu hors ligne rejoue des mutations
        // enregistrées avant une mise à jour, et l'ancienne route rendait `409`
        // sur un blocage DÉJÀ appliqué. Le dispatcher traitait donc un succès
        // comme un échec 4xx non transitoire, et l'enregistrement mourait en
        // `.exhausted` alors que le serveur avait écrit ce qu'il fallait.
        let _: APIResponse<BlockActionResponse> = try await APIClient.shared.requestWithHeaders(
            DirectoryEndpoint.blocksByUserId(userId: payload.targetUserId),
            method: "PUT",
            body: try JSONEncoder().encode([String: String]()),
            queryItems: nil,
            headers: ["X-Client-Mutation-Id": payload.clientMutationId]
        )
        logger.info("blockUser dispatched for \(payload.targetUserId, privacy: .public) cmid=\(payload.clientMutationId, privacy: .public)")
    }

    /// `BlockActionResponse`, comme son jumeau `dispatchBlockUser` — et
    /// **c'est tout le correctif** du rapport (« impossible
    /// de débloquer les contacts bloqués »).
    ///
    /// Ce site attendait `[String: Bool]`. Le gateway répond
    /// `{ "message": "User unblocked" }`, ce que son propre schéma déclare :
    /// décoder cette charge en dictionnaire de `Bool` LÈVE. Le dispatcher
    /// jetait donc TOUJOURS, l'enregistrement d'outbox n'était jamais acquitté,
    /// et l'écran affichait « Impossible de débloquer » — sur un serveur qui
    /// avait pourtant écrit le déblocage.
    ///
    /// Un type de réponse trop STRICT transforme un succès serveur en échec
    /// client : ni erreur réseau, ni refus explicite, juste une divergence
    /// entre ce qui EST et ce qui se voit. Les deux jumeaux frappent la même
    /// route sous deux verbes et rendent la même forme — leur asymétrie était
    /// le défaut, et `OutboxDispatcherUnblockDecodingTests` interdit son retour.
    func dispatchUnblockUser(_ record: OutboxRecord) async throws {
        let payload = try decodePayload(record, as: UnblockUserPayload.self)
        do {
            let _: APIResponse<BlockActionResponse> = try await APIClient.shared.requestWithHeaders(
                DirectoryEndpoint.blocksByUserId(userId: payload.targetUserId),
                method: "DELETE",
                body: nil,
                queryItems: nil,
                headers: ["X-Client-Mutation-Id": payload.clientMutationId]
            )
            logger.info("unblockUser dispatched for \(payload.targetUserId, privacy: .public) cmid=\(payload.clientMutationId, privacy: .public)")
        } catch where UnblockReplay.isAlreadyApplied(error) {
            logger.info("unblockUser replay for \(payload.targetUserId, privacy: .public) — already unblocked, accepting as success")
        }
    }

    /// POST /friend-requests — gateway expects `{ receiverId, message?, targetLevel? }`.
    /// The iOS payload uses `targetUserId` to match the consumer-facing
    /// naming ; we translate at the wire boundary.
    func dispatchSendFriendRequest(_ record: OutboxRecord) async throws {
        let payload = try decodePayload(record, as: SendFriendRequestPayload.self)
        struct SendFriendRequestBody: Encodable {
            let receiverId: String
            /// Le cran visé (#13938) : omis quand `nil`, donc une ligne gravée avant ce champ part comme avant.
            let targetLevel: String?
        }
        let body = SendFriendRequestBody(receiverId: payload.targetUserId, targetLevel: payload.targetLevel)
        let _: APIResponse<FriendRequest> = try await APIClient.shared.requestWithHeaders(
            // `/directory/friend-requests` (#4162) — et c'est CE chemin-ci qui
            // rend la migration urgente : le rejeu hors ligne rejoue des
            // mutations enregistrées AVANT la mise à jour, et une bascule
            // partielle les enverrait sur une famille éteinte.
            DirectoryEndpoint.friendRequests,
            method: "POST",
            body: try JSONEncoder().encode(body),
            queryItems: nil,
            headers: ["X-Client-Mutation-Id": payload.clientMutationId]
        )
        logger.info("sendFriendRequest dispatched for \(payload.targetUserId, privacy: .public) cmid=\(payload.clientMutationId, privacy: .public)")
    }

    /// `PATCH /directory/friend-requests/:id` — le corps porte une ACTION,
    /// jamais un statut (#4162).
    ///
    /// L'ADRESSE et le CORPS changent ENSEMBLE. Migrer l'une sans l'autre
    /// enverrait `{ status }` à une route qui déclare `action` en `required` :
    /// AJV refuserait en 400, un code que le dispatcher traite en 4xx NON
    /// transitoire — l'enregistrement mourrait en `.exhausted`, et la réponse
    /// à une demande d'amitié faite hors ligne serait perdue en silence.
    func dispatchRespondFriendRequest(_ record: OutboxRecord) async throws {
        let payload = try decodePayload(record, as: RespondFriendRequestPayload.self)
        struct RespondBody: Encodable {
            let action: String
        }
        let status = payload.action == .accept ? "accept" : "reject"
        let body = RespondBody(action: status)
        let _: APIResponse<FriendRequest> = try await APIClient.shared.requestWithHeaders(
            DirectoryEndpoint.friendRequestsById(id: payload.friendRequestId),
            method: "PATCH",
            body: try JSONEncoder().encode(body),
            queryItems: nil,
            headers: ["X-Client-Mutation-Id": payload.clientMutationId]
        )
        logger.info("respondFriendRequest dispatched for \(payload.friendRequestId, privacy: .public) status=\(status, privacy: .public) cmid=\(payload.clientMutationId, privacy: .public)")
    }

    /// PATCH /users/me — only sends fields that are non-nil. The gateway's
    /// `updateUserProfileSchema` (packages/shared/utils/validation.ts) is
    /// `.strict()` and has no `avatar` (nor `avatarUrl`) property, so an
    /// `avatar` key in this body 400s the WHOLE request every single time —
    /// silently blocking displayName/bio right alongside it. Avatar changes
    /// are dispatched separately through the dedicated `PATCH /users/me/avatar`
    /// endpoint (`updateAvatarSchema`, `{ avatar: string }`), matching the
    /// online path (`UserService.updateAvatar`).
    func dispatchUpdateProfile(_ record: OutboxRecord) async throws {
        let payload = try decodePayload(record, as: UpdateProfilePayload.self)

        if let avatarUrl = payload.avatarUrl {
            let _: APIResponse<[String: AnyCodable]> = try await APIClient.shared.requestWithHeaders(
                UsersEndpoint.meAvatar,
                method: "PATCH",
                body: try JSONEncoder().encode(UpdateProfileAvatarBody(avatar: avatarUrl)),
                queryItems: nil,
                headers: ["X-Client-Mutation-Id": payload.clientMutationId]
            )
            logger.info("updateProfile avatar dispatched cmid=\(payload.clientMutationId, privacy: .public)")
        }

        guard payload.displayName != nil || payload.bio != nil else {
            logger.info("updateProfile dispatched (avatar-only) cmid=\(payload.clientMutationId, privacy: .public)")
            return
        }

        let body = UpdateProfileFieldsBody(
            displayName: payload.displayName,
            bio: payload.bio
        )
        // The /users/me response wraps the updated user under `data.user`,
        // which doesn't match `APIResponse<MeeshyUser>`. We don't need the
        // result (caller refreshes via AuthManager.checkExistingSession()
        // after enqueue), so decode the envelope shape loosely as a dictionary.
        let _: APIResponse<[String: AnyCodable]> = try await APIClient.shared.requestWithHeaders(
            UsersEndpoint.me,
            method: "PATCH",
            body: try JSONEncoder().encode(body),
            queryItems: nil,
            headers: ["X-Client-Mutation-Id": payload.clientMutationId]
        )
        logger.info("updateProfile dispatched cmid=\(payload.clientMutationId, privacy: .public)")
    }
}

/// **Le rejeu d'un déblocage**, hors du dispatcher : une règle pure sur le refus servi.
nonisolated enum UnblockReplay {
    /// Le refus que la passerelle rend quand la personne n'est PAS (ou plus)
    /// dans la liste — `routes/directory/blocks.ts`, `debloquer`.
    static let notInBlockedListMessage = "User is not in your blocked list"

    /// **Rejouer un déblocage déjà appliqué aboutit** (#16008). La réponse du
    /// premier envoi s'est perdue, le serveur a débloqué, et le rejeu reçoit ce
    /// 404 : l'état voulu (« pas bloqué ») est celui du serveur, c'est donc une
    /// réussite et non un retour arrière. Seul CE refus est accepté : un autre
    /// 404 (adresse retirée, ressource inconnue) reste un refus définitif.
    static func isAlreadyApplied(_ error: Error) -> Bool {
        guard case let MeeshyError.server(statusCode, message) = error else { return false }
        return statusCode == 404 && message == notInBlockedListMessage
    }
}
