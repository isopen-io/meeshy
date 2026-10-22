package me.meeshy.ui.profile

import android.content.Context
import me.meeshy.ui.R

/** Les libellés TalkBack de la bannière et de la photo d'un profil : un seul texte par geste (miroir de `ProfileImageCopy` iOS). */
public object ProfileImageCopy {
    public fun bannerLabel(context: Context): String = context.getString(R.string.profile_banner_label)

    public fun openFullscreenHint(context: Context): String =
        context.getString(R.string.profile_avatar_view_fullscreen_hint)

    /** L'action d'accessibilité équivalente au tap porte le même texte que l'indice. */
    public fun openFullscreenActionLabel(context: Context): String = openFullscreenHint(context)
}
