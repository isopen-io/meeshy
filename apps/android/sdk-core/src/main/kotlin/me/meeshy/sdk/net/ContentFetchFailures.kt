package me.meeshy.sdk.net

import me.meeshy.sdk.model.ContentFetchFailure
import java.io.IOException

/**
 * Classe un [ApiError] (tel que [apiCall] le produit) en cause d'echec de contenu.
 * `NETWORK` (IOException) -> reseau ; statut HTTP -> table de [ContentFetchFailure.fromHttpStatus] ;
 * tout le reste (PARSE, enveloppe refusee sans statut) -> serveur, jamais reseau.
 */
fun ApiError.toContentFetchFailure(): ContentFetchFailure {
    val status = httpStatus
    return when {
        status != null -> ContentFetchFailure.fromHttpStatus(status)
        code == "NETWORK" -> ContentFetchFailure.NETWORK
        else -> ContentFetchFailure.SERVER
    }
}

/** Exception brute : IOException -> reseau ; le reste -> serveur (les HttpException sont deja repliees en [ApiError] par [apiCall]). */
fun Throwable.toContentFetchFailure(): ContentFetchFailure = when (this) {
    is IOException -> ContentFetchFailure.NETWORK
    else -> ContentFetchFailure.SERVER
}
