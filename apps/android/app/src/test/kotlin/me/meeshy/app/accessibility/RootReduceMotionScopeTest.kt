package me.meeshy.app.accessibility

import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import org.junit.Test

/**
 * #18459 — `LocalReduceMotion` couvre TOUT l'arbre de [me.meeshy.app.MainActivity], pas seulement le `NavHost`.
 *
 * `ProvideAppLocals` n'enveloppe que la navigation : le disque flottant, l'écran de démarrage, les bandeaux et les
 * surcouches de la racine, montés à côté, lisaient la valeur par défaut (`false`) et ignoraient le réglage de l'app.
 * Le fournisseur d'accessibilité est donc posé au-dessus de `MeeshyApp`.
 */
class RootReduceMotionScopeTest {

    private val activity: String = File("src/main/kotlin/me/meeshy/app/MainActivity.kt").readText()
        .replace(Regex("""/\*.*?\*/""", RegexOption.DOT_MATCHES_ALL), "")
        .replace(Regex("""//[^\n]*"""), "")

    @Test
    fun `the whole MeeshyApp tree reads the app reduce motion setting`() {
        val field = Regex("""lateinit var (\w+): AccessibilityLocalsProvider""").find(activity)?.groupValues?.get(1)
        assertWithMessage("MainActivity injecte AccessibilityLocalsProvider").that(field).isNotNull()

        val provide = activity.indexOf("$field.Provide {")
        val app = activity.indexOf("MeeshyApp(")
        assertWithMessage("le fournisseur s'ouvre avant MeeshyApp").that(provide in 0 until app).isTrue()

        val between = activity.substring(provide, app)
        val depth = between.count { it == '{' } - between.count { it == '}' }
        assertWithMessage("MeeshyApp est DANS le bloc du fournisseur").that(depth).isGreaterThan(0)
    }
}
