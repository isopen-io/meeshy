package me.meeshy.app.navigation

import androidx.annotation.StringRes
import me.meeshy.app.R

/** Le message d'un lien qui ne s'ouvre pas (iOS : 404 « Lien introuvable », 410 « Ce lien n'est plus actif », 403 « Accès refusé »). */
internal object ShareLinkErrorMessages {
    @StringRes
    fun resFor(httpStatus: Int?): Int = when (httpStatus) {
        404 -> R.string.deep_link_error_not_found
        410 -> R.string.deep_link_error_inactive
        403 -> R.string.deep_link_error_forbidden
        else -> R.string.deep_link_error_unresolved
    }
}
