package me.meeshy.sdk.search

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.search.PostSearch
import me.meeshy.sdk.model.search.SearchPane
import me.meeshy.sdk.model.search.SearchPaneFailure
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.PostApi
import me.meeshy.sdk.net.apiCall
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Les publications (posts, réels, stories) dont le texte correspond, selon la visibilité que la
 * passerelle tranche (`GET /posts/search`, #14620). Aucune copie locale : hors ligne, le volet
 * est vide sans être en panne. Un serveur antérieur à la route (`404`) rend un volet vide, jamais
 * une panne : l'onglet se tait au lieu d'afficher une erreur pendant la transition.
 */
public interface PostSearchSource {
    public suspend fun search(query: String): SearchPane<ApiPost>
}

internal object NoPostSearch : PostSearchSource {
    override suspend fun search(query: String): SearchPane<ApiPost> = SearchPane()
}

@Singleton
public class RemotePostSearchSource @Inject constructor(
    private val postApi: PostApi,
) : PostSearchSource {
    override suspend fun search(query: String): SearchPane<ApiPost> =
        when (val result = apiCall { postApi.search(query, limit = PostSearch.LIMIT) }) {
            is NetworkResult.Success -> SearchPane(result.data)
            is NetworkResult.Failure ->
                if (result.error.httpStatus == HTTP_NOT_FOUND) SearchPane() else SearchPane(failure = SearchPaneFailure.Unreachable)
        }

    private companion object {
        const val HTTP_NOT_FOUND = 404
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal abstract class PostSearchSourceModule {
    @Binds
    abstract fun bindPostSearchSource(source: RemotePostSearchSource): PostSearchSource
}
