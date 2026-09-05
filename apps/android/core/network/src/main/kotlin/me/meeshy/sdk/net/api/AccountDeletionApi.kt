package me.meeshy.sdk.net.api

import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.apiCall
import javax.inject.Inject

/**
 * Thin, mockable wrapper around [UserApi.openAccountDeletion] — the modern
 * `POST /me/account/deletion` deletion-request route, which requires the caller's
 * CURRENT password on top of the typed confirmation phrase (#4183, #4799).
 *
 * Exists so a feature-module caller (`AccountDeletionViewModel`, `feature/settings`)
 * can depend on a [NetworkResult]-returning boundary — the same shape `UserRepository`
 * (`sdk-core`) exposes for every other endpoint — without adding a `sdk-core`
 * dependency: this lot's perimeter is `feature/settings` + `core/network` only (#4799).
 * Folding this call into `UserRepository` for consistency with the rest of the app is
 * a natural, low-risk follow-up outside that boundary.
 */
class AccountDeletionApi @Inject constructor(
    private val userApi: UserApi,
) {
    suspend fun open(
        confirmationPhrase: String,
        currentPassword: String,
    ): NetworkResult<AccountDeletionOpenedResponse> = apiCall {
        userApi.openAccountDeletion(
            OpenAccountDeletionRequest(
                confirmationPhrase = confirmationPhrase,
                currentPassword = currentPassword,
            ),
        )
    }
}
