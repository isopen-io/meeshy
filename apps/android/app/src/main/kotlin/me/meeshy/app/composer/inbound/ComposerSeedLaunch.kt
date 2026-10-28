package me.meeshy.app.composer.inbound

import android.content.Context
import android.content.Intent
import me.meeshy.app.MainActivity

/** L'intent interne qui ouvre l'hôte du composeur sur une graine déposée par [ComposerSeedStore] (partage entrant). */
object ComposerSeedLaunch {
    const val EXTRA_SEED = "me.meeshy.app.extra.COMPOSER_SEED"

    fun intent(context: Context, token: String): Intent =
        Intent(context, MainActivity::class.java).putExtra(EXTRA_SEED, token).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
}
