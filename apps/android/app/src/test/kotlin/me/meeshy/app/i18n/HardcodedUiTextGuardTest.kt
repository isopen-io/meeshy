package me.meeshy.app.i18n

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import org.junit.Assert.assertThrows
import org.junit.Test

// Ratchet on user-visible text written as a Kotlin literal. The detection is proven on
// synthetic sources; the same scan then runs over every module's src/main and is compared
// to app/src/test/resources/i18n/hardcoded-ui-baseline.txt: a NEW literal fails, and so does
// a baseline line that no longer matches a literal (so the baseline can only shrink).
class HardcodedUiTextGuardTest {

    private fun scan(source: String, path: String = "demo/Screen.kt") = HardcodedUiText.scan(path, source)

    private fun List<HardcodedLiteral>.pairs() = map { it.kind to it.literal }

    @Test
    fun `Text with a literal is found, positional or named, on one line or several`() {
        val found = scan(
            """
            Text("Hello")
            Text(text = "Named")
            Text(
                text = "Multi",
                color = Red,
            )
            """.trimIndent(),
        )

        assertThat(found.pairs()).containsExactly(
            HardcodedKind.TEXT to "Hello",
            HardcodedKind.TEXT to "Named",
            HardcodedKind.TEXT to "Multi",
        ).inOrder()
        assertThat(found.map { it.line }).containsExactly(1, 2, 3).inOrder()
    }

    @Test
    fun `Text made of interpolations, symbols or digits carries no wording`() {
        val found = scan(
            """
            Text("${'$'}{lang.flag} ${'$'}{lang.name}")
            Text("@${'$'}name")
            Text("${'$'}label  ${'$'}count")
            Text("${'$'}{formatRate(rate)}×")
            Text("· ${'$'}{it.name}")
            Text("+12")
            Text("")
            """.trimIndent(),
        )

        assertThat(found).isEmpty()
    }

    @Test
    fun `wording around an interpolation is still wording`() {
        val found = scan("""Text("Hello ${'$'}name")""")

        assertThat(found.pairs()).containsExactly(HardcodedKind.TEXT to "Hello ${'$'}name")
    }

    @Test
    fun `Text from a resource or an expression is fine`() {
        val found = scan(
            """
            Text(stringResource(R.string.hello))
            Text(text = title)
            Text(context.getString(R.string.hello))
            """.trimIndent(),
        )

        assertThat(found).isEmpty()
    }

    @Test
    fun `a contentDescription literal is found, a resource or null is not`() {
        val found = scan(
            """
            Icon(contentDescription = "Close")
            Icon(contentDescription = null)
            Icon(contentDescription = stringResource(R.string.close))
            Modifier.semantics { contentDescription = "Meeshy" }
            val same = contentDescription == "x"
            """.trimIndent(),
        )

        assertThat(found.pairs()).containsExactly(
            HardcodedKind.CONTENT_DESCRIPTION to "Close",
            HardcodedKind.CONTENT_DESCRIPTION to "Meeshy",
        ).inOrder()
    }

    @Test
    fun `a notification channel name literal is found across lines`() {
        val found = scan(
            """
            NotificationChannel(
                NotificationChannelIds.CHANNEL_MESSAGES,
                "Messages",
                NotificationManager.IMPORTANCE_HIGH,
            )
            NotificationChannel(id, getString(R.string.channel), IMPORTANCE_LOW)
            NotificationChannel(channelId, "Calls", IMPORTANCE_HIGH)
            """.trimIndent(),
        )

        assertThat(found.pairs()).containsExactly(
            HardcodedKind.NOTIFICATION_CHANNEL to "Messages",
            HardcodedKind.NOTIFICATION_CHANNEL to "Calls",
        ).inOrder()
    }

    @Test
    fun `a notification title literal is found, a variable is not`() {
        val found = scan(
            """
            builder.setContentTitle("New message")
            builder.setContentTitle(push.title ?: push.displayName)
            """.trimIndent(),
        )

        assertThat(found.pairs()).containsExactly(HardcodedKind.CONTENT_TITLE to "New message")
    }

    @Test
    fun `a toast literal is found, a resource or a message variable is not`() {
        val found = scan(
            """
            Toast.makeText(context, "Saved", Toast.LENGTH_SHORT).show()
            Toast.makeText(context, R.string.saved, Toast.LENGTH_SHORT).show()
            Toast.makeText(context, context.getString(R.string.saved), Toast.LENGTH_SHORT).show()
            Toast.makeText(
                galleryContext,
                message,
                Toast.LENGTH_SHORT,
            ).show()
            """.trimIndent(),
        )

        assertThat(found.pairs()).containsExactly(HardcodedKind.TOAST to "Saved")
    }

    @Test
    fun `commented code is not a literal`() {
        val found = scan(
            """
            // Text("line comment")
            /* Text("block comment") */
            /**
             * Shows Text("kdoc") then contentDescription = "kdoc".
             */
            /* outer /* nested Text("nested") */ still comment Text("outer") */
            Text("real")
            """.trimIndent(),
        )

        assertThat(found.pairs()).containsExactly(HardcodedKind.TEXT to "real")
        assertThat(found.single().line).isEqualTo(7)
    }

    @Test
    fun `a url or a quote character does not hide the code that follows`() {
        val found = scan(
            """
            val url = "https://meeshy.me/path"; Text("After url")
            val quote = '"'
            val escaped = '\''
            Text("After char")
            """.trimIndent(),
        )

        assertThat(found.pairs()).containsExactly(
            HardcodedKind.TEXT to "After url",
            HardcodedKind.TEXT to "After char",
        ).inOrder()
    }

    @Test
    fun `a file without any trigger is not scanned`() {
        assertThat(scan("fun answer() = 42")).isEmpty()
    }

    @Test
    fun `the baseline line names the form, the file and the literal but never the line number`() {
        val literal = scan("\n\nText(\"Hello\")", path = "sdk-ui/A.kt").single()

        assertThat(literal.line).isEqualTo(3)
        assertThat(literal.baselineLine).isEqualTo("Text | sdk-ui/A.kt | Hello")
    }

    @Test
    fun `a new literal outside the baseline is unexpected`() {
        val found = scan("Text(\"Hello\")\nText(\"New\")")

        val verdict = Ratchet.diff(found, listOf("Text | demo/Screen.kt | Hello")) { it.baselineLine }

        assertThat(verdict.unexpected.map { it.literal }).containsExactly("New")
        assertThat(verdict.stale).isEmpty()
    }

    @Test
    fun `a baseline line with no matching literal is stale`() {
        val found = scan("Text(\"Hello\")")

        val verdict = Ratchet.diff(
            found,
            listOf("Text | demo/Screen.kt | Hello", "Text | demo/Gone.kt | Removed"),
        ) { it.baselineLine }

        assertThat(verdict.unexpected).isEmpty()
        assertThat(verdict.stale).containsExactly("Text | demo/Gone.kt | Removed")
    }

    @Test
    fun `a literal moved to another line still matches its baseline line`() {
        val before = scan("Text(\"Hello\")")
        val after = scan("\n\n\nText(\"Hello\")")

        assertThat(after.single().baselineLine).isEqualTo(before.single().baselineLine)
    }

    @Test
    fun `the same literal twice in a file needs two baseline lines`() {
        val found = scan("Text(\"Hello\")\nText(\"Hello\")")

        val verdict = Ratchet.diff(found, listOf("Text | demo/Screen.kt | Hello")) { it.baselineLine }

        assertThat(verdict.unexpected).hasSize(1)
    }

    @Test
    fun `the baseline ignores comments and blank lines and keeps a pipe inside a literal`() {
        val lines = HardcodedUiText.parseBaseline(
            """
            # why these exist

            Text | sdk-ui/A.kt | M
            contentDescription|sdk-ui/A.kt|a | b
            """.trimIndent(),
        )

        assertThat(lines).containsExactly("Text | sdk-ui/A.kt | M", "contentDescription | sdk-ui/A.kt | a | b").inOrder()
    }

    @Test
    fun `a malformed baseline line fails loudly`() {
        val failure = assertThrows(IllegalArgumentException::class.java) {
            HardcodedUiText.parseBaseline("Label | sdk-ui/A.kt | M")
        }

        assertThat(failure).hasMessageThat().contains("forme | chemin | littéral")
    }

    @Test
    fun `no new hardcoded user-visible literal in the main sources`() {
        val unexpected = realTree.verdict.unexpected

        assertWithMessage(
            "Texte visible écrit en dur dans le code — le déclarer en ressource (strings_<lot>.xml, ou la clé iOS " +
                "adoptée par ./apps/android/meeshy.sh i18n) et l'afficher par stringResource. Littéraux nouveaux :\n" +
                unexpected.joinToString("\n") { "  $it\n      baseline : ${it.baselineLine}" },
        ).that(unexpected).isEmpty()
    }

    @Test
    fun `every baseline line still matches a literal`() {
        assertWithMessage(
            "Lignes de hardcoded-ui-baseline.txt devenues fausses (le littéral a été traduit ou supprimé : " +
                "retirer la ligne) :\n" + realTree.verdict.stale.joinToString("\n") { "  $it" },
        ).that(realTree.verdict.stale).isEmpty()
    }

    @Test
    fun `the scan reads the sources of the modules`() {
        assertThat(realTree.sourceCount).isGreaterThan(300)
    }

    private val realTree: RealTree get() = RealTree.instance

    private class RealTree private constructor() {
        private val sources = ResourceTree.kotlinSources()
        val sourceCount: Int = sources.size
        val verdict: RatchetVerdict<HardcodedLiteral> = Ratchet.diff(
            actual = sources.flatMap { HardcodedUiText.scan(it.path, it.text) },
            recorded = HardcodedUiText.parseBaseline(ResourceTree.testData("hardcoded-ui-baseline.txt")),
        ) { it.baselineLine }

        companion object {
            val instance: RealTree by lazy { RealTree() }
        }
    }
}
