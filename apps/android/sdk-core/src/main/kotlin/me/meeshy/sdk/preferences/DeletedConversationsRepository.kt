package me.meeshy.sdk.preferences

import me.meeshy.sdk.model.preferences.DeletedConversationEntry
import me.meeshy.sdk.model.preferences.deletedConversationsFromJson
import me.meeshy.sdk.model.preferences.deletedSince
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.DeletedConversationsApi
import me.meeshy.sdk.net.apiCall
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Les conversations que l'utilisateur a retirées de sa vue depuis un autre appareil
 * (`GET /user/deleted-conversations`) : le rattrapage de la synchronisation les retire de la liste
 * locale. La passerelle rend la corbeille entière, sans pagination : le filtre « depuis » est appliqué ici.
 */
@Singleton
public class DeletedConversationsRepository @Inject constructor(
    private val api: DeletedConversationsApi,
) {
    /** Les suppressions datées de [sinceMillis] ou après (`null` = toutes) ; une panne est rendue, jamais avalée. */
    public suspend fun fetchSince(sinceMillis: Long?): NetworkResult<List<DeletedConversationEntry>> =
        apiCall { api.deletedConversations() }
            .map { deletedConversationsFromJson(it).deletedSince(sinceMillis) }
}
