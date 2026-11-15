package me.meeshy.sdk.audio

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.model.composer.sound.ApiSound
import me.meeshy.sdk.model.composer.sound.RenameSoundRequest
import me.meeshy.sdk.model.composer.sound.SoundRemoval
import me.meeshy.sdk.model.composer.sound.SoundShelfLaw
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.SoundLibraryApi
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.net.pagedApiCall
import javax.inject.Inject
import javax.inject.Singleton

data class SoundPage(val sounds: List<ApiSound>, val nextCursor: String?)

/** Ce que l'étagère demande à la bibliothèque — l'interface existe pour que l'écran s'éprouve sans réseau. */
interface SoundLibrary {
    suspend fun mine(query: String?, cursor: String?): NetworkResult<SoundPage>
    suspend fun trending(query: String?): NetworkResult<List<ApiSound>>
    suspend fun rename(id: String, title: String): NetworkResult<ApiSound>
    suspend fun remove(id: String): NetworkResult<SoundRemoval>
}

/**
 * La bibliothèque de sons — miroir de `SoundLibraryService` (iOS).
 *
 * « Mes sons » filtre CÔTÉ CLIENT (la route n'expose pas de recherche, et une bibliothèque personnelle tient dans
 * quelques pages) ; « Tendances » envoie la recherche au serveur (titre OU pseudo — un son capturé naît sans titre).
 */
@Singleton
class SoundLibraryRepository @Inject constructor(
    private val api: SoundLibraryApi,
) : SoundLibrary {

    override suspend fun mine(query: String?, cursor: String?): NetworkResult<SoundPage> =
        when (val result = pagedApiCall { api.mine(cursor, PAGE_SIZE) }) {
            is NetworkResult.Failure -> result
            is NetworkResult.Success -> {
                val page = result.data
                NetworkResult.Success(
                    SoundPage(
                        sounds = SoundShelfLaw.filter(page.data, query),
                        nextCursor = page.nextCursor.takeIf { page.pagination?.hasMore == true },
                    ),
                )
            }
        }

    override suspend fun trending(query: String?): NetworkResult<List<ApiSound>> =
        apiCall { api.trending(query?.trim()?.takeIf { it.isNotEmpty() }, PAGE_SIZE) }

    /** Une chaîne vide est ACCEPTÉE et signifie « retire le titre ». */
    override suspend fun rename(id: String, title: String): NetworkResult<ApiSound> =
        apiCall { api.rename(id, RenameSoundRequest(title)) }

    /** Retrait LOGIQUE et idempotent : les publications qui l'utilisent le jouent toujours (#9848). */
    override suspend fun remove(id: String): NetworkResult<SoundRemoval> = apiCall { api.remove(id) }

    private companion object {
        const val PAGE_SIZE = 30
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface SoundLibraryModule {
    @Binds
    fun bindsSoundLibrary(repository: SoundLibraryRepository): SoundLibrary
}
