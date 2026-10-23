package me.meeshy.app.theme

import android.content.Context
import android.content.ContextWrapper
import android.content.res.AssetManager
import android.content.res.Configuration
import android.content.res.Resources
import java.util.Locale

/**
 * Le contexte que l'arbre Compose lit quand une langue d'interface est forcée.
 *
 * Il garde l'Activity comme base : `startActivity`, les permissions et toute recherche de
 * l'Activity (`findActivity`) passent par elle. Seules les ressources viennent du contexte
 * relocalisé. Un `createConfigurationContext` nu rendait un `ContextImpl` : tout lien externe,
 * tout partage levait « Calling startActivity() from outside of an Activity context ».
 */
class LocalizedActivityContext private constructor(
    base: Context,
    private val localized: Context,
) : ContextWrapper(base) {

    override fun getResources(): Resources = localized.resources

    override fun getAssets(): AssetManager = localized.assets

    companion object {
        fun wrap(base: Context, locale: Locale): Context {
            val configuration = Configuration(base.resources.configuration).apply { setLocale(locale) }
            return LocalizedActivityContext(base, base.createConfigurationContext(configuration))
        }
    }
}
