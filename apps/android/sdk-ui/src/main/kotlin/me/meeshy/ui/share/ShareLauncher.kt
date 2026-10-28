package me.meeshy.ui.share

import androidx.compose.runtime.staticCompositionLocalOf
import me.meeshy.sdk.model.share.ShareSubject

/**
 * La porte vers **la feuille de partage unique** (#13474) : une story, un post, un réel, un profil, un lien
 * posent leur [ShareSubject] ici et l'application ouvre LA feuille. Aucun écran ne garde son propre
 * sélecteur de destinataires. Fournie à la racine de l'application ; absente (aperçus, tests), elle est nulle
 * et la porte ne fait rien.
 */
public fun interface ShareLauncher {
    /** [onDismissed] : la feuille est refermée (envoi fait ou non) — une story reprend alors sa lecture. */
    public fun open(subject: ShareSubject, onDismissed: () -> Unit)
}

public fun ShareLauncher.open(subject: ShareSubject): Unit = open(subject) {}

public val LocalShareLauncher = staticCompositionLocalOf<ShareLauncher?> { null }
