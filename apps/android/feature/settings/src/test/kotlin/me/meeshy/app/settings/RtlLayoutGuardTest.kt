package me.meeshy.app.settings

import com.google.common.truth.Truth.assertWithMessage
import me.meeshy.app.settings.SettingsResourceTree as Tree
import org.junit.Test

class RtlLayoutGuardTest {

    private val forbidden = listOf(
        "Alignment.Left" to Regex("""Alignment\.(Left|Right)\b"""),
        "TextAlign.Left/Right" to Regex("""TextAlign\.(Left|Right)\b"""),
        "padding left/right en dur" to Regex("""(padding|PaddingValues)\([^)]*\b(left|right)\s*="""),
        "absolutePadding" to Regex("""absolutePadding|Absolute\.(Left|Right)"""),
        "icône directionnelle non miroitée" to Regex(
            """Icons\.(Filled|Default|Outlined|Rounded|Sharp|TwoTone)\.""" +
                """(ArrowBack|ArrowForward|ArrowLeft|ArrowRight|KeyboardArrow(Left|Right)|Chevron\w*|Navigate\w*|Send|ExitToApp|Logout)\b""",
        ),
    )

    @Test
    fun `settings screens use start and end, never left and right`() {
        val violations = Tree.kotlinSources().flatMap { file ->
            val text = file.readText()
            forbidden.filter { (_, pattern) -> pattern.containsMatchIn(text) }.map { (label, _) -> "${file.name} : $label" }
        }
        assertWithMessage("RTL (arabe) cassé").that(violations).isEmpty()
    }
}
