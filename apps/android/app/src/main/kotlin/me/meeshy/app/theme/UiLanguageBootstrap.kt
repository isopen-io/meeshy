package me.meeshy.app.theme

import android.app.LocaleManager
import android.content.Context
import android.content.res.Configuration
import android.os.Build
import android.os.LocaleList
import me.meeshy.sdk.model.AppLanguage
import java.util.Locale

/**
 * La langue d'interface appliquee au PROCESS avant le premier ecran (parite `UILanguageOverride`
 * d'iOS, #10804). Le contexte Compose ne localise que les chaines de l'arbre ; les dialogues
 * systeme, selecteurs et dates lisent la locale du process, qu'on pose donc ici, dans
 * `Application.attachBaseContext`, depuis un miroir synchrone (SharedPreferences) du choix
 * explicite et de la langue du profil — le DataStore est asynchrone, il ne peut pas servir
 * avant le premier rendu.
 *
 * La decision reste dans `AppLanguage.resolveEffectiveTag` : choix explicite > `systemLanguage`
 * du profil > appareil (`null` : rien n'est force, la resolution de ressources Android retombe
 * sur la source pour une locale non traduite).
 */
object UiLanguageBootstrap {

    private const val PREFS = "meeshy_ui_language"
    private const val KEY_EXPLICIT = "explicit"
    private const val KEY_PROFILE = "profile"
    private const val KEY_PLATFORM_APPLIED = "platform_applied"

    /** La langue a poser maintenant, lue du miroir ; `null` = suivre l'appareil. */
    fun savedTag(context: Context): String? {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        return AppLanguage.resolveEffectiveTag(prefs.getString(KEY_EXPLICIT, null), prefs.getString(KEY_PROFILE, null))
    }

    /** Le dernier choix explicite memorise (`null` = suivre le profil puis l'appareil). */
    fun savedExplicit(context: Context): String? =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_EXPLICIT, null)

    /** La derniere langue de profil memorisee. */
    fun savedProfile(context: Context): String? =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_PROFILE, null)

    /** Memorise les deux sources et rend la langue effective qui en resulte. */
    fun remember(context: Context, explicit: String?, profileLanguage: String?): String? {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(KEY_EXPLICIT, explicit)
            .putString(KEY_PROFILE, profileLanguage)
            .apply()
        return AppLanguage.resolveEffectiveTag(explicit, profileLanguage)
    }

    /** Le contexte de base de l'Application : sa locale est la langue effective, avant tout Activity. */
    fun wrap(base: Context): Context {
        val tag = savedTag(base) ?: return base
        val locale = Locale.forLanguageTag(tag)
        Locale.setDefault(locale)
        val configuration = Configuration(base.resources.configuration).apply { setLocale(locale) }
        return base.createConfigurationContext(configuration)
    }

    /** Un contexte dans [tag] pour les libelles ecrits hors Activity (canaux, notifications). */
    fun localized(base: Context, tag: String?): Context {
        if (tag == null) return base
        val configuration = Configuration(base.resources.configuration).apply { setLocale(Locale.forLanguageTag(tag)) }
        return base.createConfigurationContext(configuration)
    }

    /**
     * Android 13+ : la langue par application du systeme (vues systeme, selecteur de photos) suit
     * [tag] sans redemarrage. « Systeme » ne touche a rien, sauf pour rendre la main si c'est cette
     * app qui avait pose la locale.
     */
    fun applyToPlatform(context: Context, tag: String?) {
        Locale.setDefault(tag?.let(Locale::forLanguageTag) ?: Locale.getDefault())
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        val manager = context.getSystemService(LocaleManager::class.java) ?: return
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (tag == null) {
            if (prefs.getBoolean(KEY_PLATFORM_APPLIED, false)) {
                manager.applicationLocales = LocaleList.getEmptyLocaleList()
                prefs.edit().putBoolean(KEY_PLATFORM_APPLIED, false).apply()
            }
            return
        }
        val wanted = LocaleList.forLanguageTags(tag)
        if (manager.applicationLocales.toLanguageTags() != wanted.toLanguageTags()) manager.applicationLocales = wanted
        prefs.edit().putBoolean(KEY_PLATFORM_APPLIED, true).apply()
    }
}
