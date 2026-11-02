package me.meeshy.app.onboarding

import android.content.Context
import android.os.Build
import dagger.hilt.android.qualifiers.ApplicationContext
import java.util.Locale
import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.feature.auth.R

/** Les gabarits du salut vivent aux ressources (`onboarding_greeting_1…8`, sept langues), lus dans la langue de l'interface. */
@Singleton
class AndroidOnboardingTexts @Inject constructor(
    @ApplicationContext private val context: Context,
) : OnboardingTexts {

    override val locale: Locale
        get() = context.resources.configuration.locales[0]

    override fun greetingTemplate(index: Int): String = context.getString(
        when (index) {
            0 -> R.string.onboarding_greeting_1
            1 -> R.string.onboarding_greeting_2
            2 -> R.string.onboarding_greeting_3
            3 -> R.string.onboarding_greeting_4
            4 -> R.string.onboarding_greeting_5
            5 -> R.string.onboarding_greeting_6
            6 -> R.string.onboarding_greeting_7
            else -> R.string.onboarding_greeting_8
        },
    )

    /** Le nom d'une langue, dans la langue de l'interface (« espagnol », « Spanish », « الإسبانية »). */
    override fun languageName(code: String): String =
        Locale.forLanguageTag(code).getDisplayLanguage(locale).takeIf { it.isNotEmpty() } ?: code

    override fun join(names: List<String>): String =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            android.icu.text.ListFormatter.getInstance(locale).format(names)
        } else {
            names.joinToString(", ")
        }
}
