package me.meeshy.app.stories

import io.mockk.coEvery
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.net.NetworkResult

/**
 * Les témoins écrits avant #13959 décrivent l'envoi d'un choix par UN résultat (`upload`) ; le composeur demande désormais
 * un résultat PAR média (`uploadEach`). Ce relais rejoue le premier sous la forme du second, média par média (le dernier
 * reçoit ce qui reste, comme l'ancien envoi aplati), pour que ces témoins gardent leur sens ; les témoins neufs stubbent `uploadEach` directement.
 */
internal fun StoryMediaUploader.answersEachFromWhole() {
    coEvery { uploadEach(any(), any()) } coAnswers {
        val items = firstArg<List<MediaUploadItem>>()
        val progress = secondArg<(Int, Long, Long) -> Unit>()
        when (val whole = upload(items, progress)) {
            is NetworkResult.Success -> items.indices.map { index ->
                val last = index == items.lastIndex
                NetworkResult.Success(if (last) whole.data.drop(index) else listOfNotNull(whole.data.getOrNull(index)))
            }
            is NetworkResult.Failure -> items.map { whole }
        }
    }
}
