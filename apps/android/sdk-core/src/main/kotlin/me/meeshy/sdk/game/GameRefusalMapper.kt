package me.meeshy.sdk.game

import me.meeshy.sdk.model.game.GameRefusal
import retrofit2.HttpException
import retrofit2.Response

/**
 * Lit un refus d'état du jeu (409) depuis le corps BRUT d'une réponse Retrofit : `code` ET les extras posés à la racine
 * (`sparksDebt`, `priceChanged`, `treasuryLocked`), que l'enveloppe générique d'`apiCall` ne garde pas. Rien n'est
 * modifié dans `ApiCall.kt` : le jeu lit lui-même ce qu'il est seul à devoir lire.
 *
 * `null` pour tout ce qui n'est pas un refus du contrat : un autre statut (un 500 n'est pas un refus), un corps illisible,
 * un code inconnu d'une version plus récente du serveur. Ne lève jamais.
 */
internal object GameRefusalMapper {

    private const val CONFLICT = 409

    fun refusal(response: Response<*>): GameRefusal? =
        if (response.code() == CONFLICT) fromBody(runCatching { response.errorBody()?.string() }.getOrNull()) else null

    fun refusal(error: Throwable): GameRefusal? =
        (error as? HttpException)?.takeIf { it.code() == CONFLICT }?.let { http ->
            fromBody(runCatching { http.response()?.errorBody()?.string() }.getOrNull())
        }

    fun fromBody(body: String?): GameRefusal? = GameRefusal.parse(body)?.takeIf { it.code != null }
}
