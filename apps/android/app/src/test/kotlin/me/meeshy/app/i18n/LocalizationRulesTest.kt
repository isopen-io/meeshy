package me.meeshy.app.i18n

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import org.junit.Assert.assertThrows
import org.junit.Test

// Proves each localization rule on SYNTHETIC resource fragments, independently of the real
// files: the guard (LocalizationGuardTest) is only as good as the detection proven here.
class LocalizationRulesTest {

    private val shipped = listOf("en", "fr", "es", "pt")

    private fun resources(body: String) =
        "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<resources>\n$body\n</resources>"

    private fun file(folder: String, body: String, fileName: String = "strings.xml") =
        ResourceFile(folder, fileName, resources(body))

    private fun moduleOf(vararg files: ResourceFile, name: String = ":feature:demo") =
        ModuleResources(name, files.toList())

    private fun findings(module: ModuleResources, locales: List<String> = emptyList()) =
        LocalizationRules.check(module, locales)

    private fun List<Finding>.of(rule: Rule) = filter { it.rule == rule }

    @Test
    fun `an exempted locale may omit the keys of legal xml and no others`() {
        val module = moduleOf(
            file("values", """<string name="legal_title">Terms</string>""", fileName = "legal.xml"),
            file("values", """<string name="hello">Hello</string>"""),
            file("values-de", """<string name="other">Anderes</string>"""),
        )

        val missing = LocalizationRules.check(module, emptyList(), setOf("de")).of(Rule.MISSING_KEY)

        assertThat(missing.map { it.key }).containsExactly("hello")
    }

    @Test
    fun `a locale that is not exempted still needs the legal keys`() {
        val module = moduleOf(
            file("values", """<string name="legal_title">Terms</string>""", fileName = "legal.xml"),
            file("values-de", """<string name="other">Anderes</string>"""),
        )

        val missing = LocalizationRules.check(module, emptyList(), setOf("it")).of(Rule.MISSING_KEY)

        assertThat(missing.map { it.key }).contains("legal_title")
    }

    @Test
    fun `an exemption can only target legal xml`() {
        assertThat(LocalizationRules.parseLegalExemptions(listOf("de legal.xml", "ar legal.xml")))
            .containsExactly("de", "ar")
        assertThrows(IllegalArgumentException::class.java) {
            LocalizationRules.parseLegalExemptions(listOf("de strings.xml"))
        }
    }

    @Test
    fun `a key missing from a present locale names the module, the key and the locale`() {
        val module = moduleOf(
            file("values", """<string name="hello">Hello</string><string name="bye">Bye</string>"""),
            file("values-fr", """<string name="hello">Bonjour</string>"""),
        )

        val missing = findings(module).of(Rule.MISSING_KEY)

        assertThat(missing).hasSize(1)
        assertThat(missing.single().toString()).contains(":feature:demo")
        assertThat(missing.single().toString()).contains("bye")
        assertThat(missing.single().toString()).contains("locale=fr")
    }

    @Test
    fun `a complete locale has no missing key`() {
        val module = moduleOf(
            file("values", """<string name="hello">Hello</string>"""),
            file("values-fr", """<string name="hello">Bonjour</string>"""),
        )

        assertThat(findings(module).of(Rule.MISSING_KEY)).isEmpty()
    }

    @Test
    fun `a string marked translatable false needs no translation`() {
        val module = moduleOf(
            file("values", """<string name="plus" translatable="false">+%1${'$'}d</string>"""),
            file("values-fr", """<string name="other">Autre</string>"""),
        )

        assertThat(findings(module).of(Rule.MISSING_KEY).map { it.key }).doesNotContain("plus")
    }

    @Test
    fun `a missing plural is a missing key as well`() {
        val module = moduleOf(
            file("values", """<plurals name="replies"><item quantity="one">%1${'$'}d</item><item quantity="other">%1${'$'}d</item></plurals>"""),
            file("values-fr", """<string name="x">x</string>"""),
        )

        assertThat(findings(module).of(Rule.MISSING_KEY).map { it.key }).contains("replies")
    }

    @Test
    fun `keys are pooled across every file of a folder`() {
        val module = moduleOf(
            file("values", """<string name="a">A</string>"""),
            file("values", """<string name="b">B</string>""", fileName = "strings_extra.xml"),
            file("values-fr", """<string name="a">A</string>"""),
            file("values-fr", """<string name="b">B</string>""", fileName = "strings_generated.xml"),
        )

        assertThat(findings(module).of(Rule.MISSING_KEY)).isEmpty()
    }

    @Test
    fun `a folder of a language outside the shipped list is accepted only when complete`() {
        val partial = moduleOf(
            file("values", """<string name="a">A</string><string name="b">B</string>"""),
            file("values-de", """<string name="a">A</string>"""),
        )
        val complete = moduleOf(
            file("values", """<string name="a">A</string><string name="b">B</string>"""),
            file("values-de", """<string name="a">A</string><string name="b">B</string>"""),
        )

        assertThat(findings(partial).of(Rule.MISSING_KEY).map { it.locale to it.key })
            .containsExactly("de" to "b")
        assertThat(findings(complete)).isEmpty()
    }

    @Test
    fun `a regional folder is completed by the folder of its language`() {
        val module = moduleOf(
            file("values", """<string name="a">A</string><string name="b">B</string>"""),
            file("values-pt", """<string name="a">A</string><string name="b">B</string>"""),
            file("values-pt-rBR", """<string name="a">Ah</string>"""),
        )

        assertThat(findings(module).of(Rule.MISSING_KEY)).isEmpty()
    }

    @Test
    fun `a regional folder without its language folder must be complete by itself`() {
        val module = moduleOf(
            file("values", """<string name="a">A</string><string name="b">B</string>"""),
            file("values-pt-rBR", """<string name="a">Ah</string>"""),
        )

        assertThat(findings(module).of(Rule.MISSING_KEY).map { it.locale to it.key })
            .containsExactly("pt-BR" to "b")
    }

    @Test
    fun `a derived specifier is reported with what was expected and what was found`() {
        val module = moduleOf(
            file("values", """<string name="count">%1${'$'}d members</string>"""),
            file("values-fr", """<string name="count">%1${'$'}s membres</string>"""),
        )

        val mismatch = findings(module).of(Rule.SPECIFIER_MISMATCH).single()

        assertThat(mismatch.locale).isEqualTo("fr")
        assertThat(mismatch.key).isEqualTo("count")
        assertThat(mismatch.detail).contains("%1${'$'}d")
        assertThat(mismatch.detail).contains("%1${'$'}s")
    }

    @Test
    fun `a dropped or an added specifier is reported`() {
        val module = moduleOf(
            file("values", """<string name="a">%1${'$'}s and %2${'$'}s</string><string name="b">%1${'$'}s</string>"""),
            file("values-fr", """<string name="a">%1${'$'}s et rien</string><string name="b">%1${'$'}s %2${'$'}s</string>"""),
        )

        assertThat(findings(module).of(Rule.SPECIFIER_MISMATCH).map { it.key })
            .containsExactly("a", "b")
    }

    @Test
    fun `positional specifiers may be reordered by a translation`() {
        val module = moduleOf(
            file("values", """<string name="sent">%1${'$'}s sent %2${'$'}d photos</string>"""),
            file("values-ar", """<string name="sent">أرسل %2${'$'}d صور %1${'$'}s</string>"""),
        )

        assertThat(findings(module).of(Rule.SPECIFIER_MISMATCH)).isEmpty()
    }

    @Test
    fun `an escaped percent is not a specifier`() {
        val module = moduleOf(
            file("values", """<string name="done">%1${'$'}d%% complete</string>"""),
            file("values-fr", """<string name="done">%1${'$'}d %% terminé</string>"""),
        )

        assertThat(findings(module).of(Rule.SPECIFIER_MISMATCH)).isEmpty()
    }

    @Test
    fun `a string with formatted false is exempt from the specifier rules`() {
        val module = moduleOf(
            file("values", """<string name="raw" formatted="false">100% %s</string>"""),
            file("values-fr", """<string name="raw" formatted="false">100 %</string>"""),
        )

        assertThat(findings(module).of(Rule.SPECIFIER_MISMATCH)).isEmpty()
        assertThat(findings(module).of(Rule.BARE_SPECIFIER)).isEmpty()
    }

    @Test
    fun `plural specifiers are compared on the other item`() {
        val module = moduleOf(
            file(
                "values",
                """<plurals name="r"><item quantity="one">One reply</item><item quantity="other">%1${'$'}d replies</item></plurals>""",
            ),
            file(
                "values-fr",
                """<plurals name="r"><item quantity="one">Une réponse</item><item quantity="many">%1${'$'}d de réponses</item><item quantity="other">%1${'$'}s réponses</item></plurals>""",
            ),
        )

        assertThat(findings(module).of(Rule.SPECIFIER_MISMATCH).map { it.key }).containsExactly("r")
    }

    @Test
    fun `several specifiers that are not all positional fail`() {
        val module = moduleOf(
            file("values", """<string name="mixed">%s sent %d</string>"""),
        )

        val finding = findings(module).of(Rule.NON_POSITIONAL).single()

        assertThat(finding.key).isEqualTo("mixed")
        assertThat(finding.locale).isEqualTo("en")
    }

    @Test
    fun `a partly positional string fails too`() {
        val module = moduleOf(
            file("values", """<string name="partly">%1${'$'}s sent %d</string>"""),
        )

        assertThat(findings(module).of(Rule.NON_POSITIONAL).map { it.key }).containsExactly("partly")
    }

    @Test
    fun `non positional specifiers are caught in a translation as well`() {
        val module = moduleOf(
            file("values", """<string name="sent">%1${'$'}s sent %2${'$'}d</string>"""),
            file("values-fr", """<string name="sent">%s a envoyé %d</string>"""),
        )

        val finding = findings(module).of(Rule.NON_POSITIONAL).single()

        assertThat(finding.locale).isEqualTo("fr")
    }

    @Test
    fun `fully positional strings pass`() {
        val module = moduleOf(
            file("values", """<string name="sent">%1${'$'}s sent %2${'$'}d</string><string name="one">%1${'$'}d</string>"""),
        )

        assertThat(findings(module).of(Rule.NON_POSITIONAL)).isEmpty()
        assertThat(findings(module).of(Rule.BARE_SPECIFIER)).isEmpty()
    }

    @Test
    fun `a single bare specifier in the base is flagged`() {
        val module = moduleOf(
            file("values", """<string name="forward_members">%d members</string>"""),
            file("values-fr", """<string name="forward_members">%d membres</string>"""),
        )

        val bare = findings(module).of(Rule.BARE_SPECIFIER)

        assertThat(bare.map { it.key to it.locale }).containsExactly("forward_members" to "en")
        assertThat(findings(module).of(Rule.NON_POSITIONAL)).isEmpty()
    }

    @Test
    fun `a missing quantity is reported for the language of the folder`() {
        val module = moduleOf(
            file("values", """<plurals name="r"><item quantity="one">%1${'$'}d</item></plurals>"""),
            file(
                "values-fr",
                """<plurals name="r"><item quantity="one">%1${'$'}d</item><item quantity="other">%1${'$'}d</item></plurals>""",
            ),
        )

        val missing = findings(module).of(Rule.MISSING_QUANTITY)

        assertThat(missing.map { it.locale to it.detail.substringBefore(" (CLDR") })
            .containsExactly(
                "en" to "<plurals> sans la quantité other",
                "fr" to "<plurals> sans la quantité many",
            )
    }

    @Test
    fun `french spanish and portuguese need many while english german and italian do not`() {
        val onePlusOther = """<plurals name="r"><item quantity="one">%1${'$'}d</item><item quantity="other">%1${'$'}d</item></plurals>"""
        val module = moduleOf(
            file("values", onePlusOther),
            file("values-de", onePlusOther),
            file("values-it", onePlusOther),
            file("values-fr", onePlusOther),
            file("values-es", onePlusOther),
            file("values-pt", onePlusOther),
        )

        assertThat(findings(module).of(Rule.MISSING_QUANTITY).map { it.locale })
            .containsExactly("fr", "es", "pt")
    }

    @Test
    fun `arabic needs all six quantities`() {
        val module = moduleOf(
            file("values", """<plurals name="r"><item quantity="one">%1${'$'}d</item><item quantity="other">%1${'$'}d</item></plurals>"""),
            file(
                "values-ar",
                """<plurals name="r"><item quantity="zero">%1${'$'}d</item><item quantity="one">%1${'$'}d</item><item quantity="two">%1${'$'}d</item><item quantity="other">%1${'$'}d</item></plurals>""",
            ),
        )

        val missing = findings(module).of(Rule.MISSING_QUANTITY).single()

        assertThat(missing.locale).isEqualTo("ar")
        assertThat(missing.detail).contains("few, many")
    }

    @Test
    fun `a plural carrying every quantity of its language is complete`() {
        val module = moduleOf(
            file("values", """<plurals name="r"><item quantity="one">%1${'$'}d</item><item quantity="other">%1${'$'}d</item></plurals>"""),
            file(
                "values-fr",
                """<plurals name="r"><item quantity="one">%1${'$'}d</item><item quantity="many">%1${'$'}d de</item><item quantity="other">%1${'$'}d</item></plurals>""",
            ),
            file("values-zh", """<plurals name="r"><item quantity="other">%1${'$'}d</item></plurals>"""),
        )

        assertThat(findings(module)).isEmpty()
    }

    @Test
    fun `a name defined in both the hand written and the generated file of a folder fails`() {
        val module = moduleOf(
            file("values", """<string name="hello">Hello</string>"""),
            file("values", """<string name="hello">Hello</string>""", fileName = "strings_generated.xml"),
        )

        val duplicate = findings(module).of(Rule.DUPLICATE_DEFINITION).single()

        assertThat(duplicate.key).isEqualTo("hello")
        assertThat(duplicate.detail).contains("généré ET écrit à la main")
    }

    @Test
    fun `a name defined twice in hand written files of the same folder fails`() {
        val module = moduleOf(
            file("values", """<string name="hello">Hello</string>"""),
            file("values", """<string name="hello">Hi</string>""", fileName = "strings_lot.xml"),
        )

        val duplicate = findings(module).of(Rule.DUPLICATE_DEFINITION).single()

        assertThat(duplicate.detail).doesNotContain("généré")
    }

    @Test
    fun `the same name in two folders or in two resource types is not a duplicate`() {
        val module = moduleOf(
            file("values", """<string name="items">Items</string><plurals name="items"><item quantity="one">1</item><item quantity="other">%1${'$'}d</item></plurals>"""),
            file("values-fr", """<string name="items">Éléments</string><plurals name="items"><item quantity="one">1</item><item quantity="many">%1${'$'}d d</item><item quantity="other">%1${'$'}d</item></plurals>"""),
        )

        assertThat(findings(module).of(Rule.DUPLICATE_DEFINITION)).isEmpty()
    }

    @Test
    fun `a shipped locale needs its folder in every module`() {
        val module = moduleOf(
            file("values", """<string name="a">A</string>"""),
            file("values-fr", """<string name="a">A</string>"""),
        )

        val missing = findings(module, shipped).of(Rule.SHIPPED_LOCALE_MISSING)

        assertThat(missing.map { it.locale }).containsExactly("es", "pt")
        assertThat(missing.first().detail).contains("res/values-es")
    }

    @Test
    fun `english is the values folder`() {
        val module = moduleOf(file("values-fr", """<string name="a">A</string>"""))

        val missing = findings(module, listOf("en", "fr")).of(Rule.SHIPPED_LOCALE_MISSING)

        assertThat(missing.map { it.locale }).containsExactly("en")
    }

    @Test
    fun `a language the app declares without resources is reported once with the modules that lack it`() {
        val withArabic = moduleOf(
            file("values", """<string name="a">A</string>"""),
            file("values-ar", """<string name="a">ا</string>"""),
            name = ":feature:one",
        )
        val withoutArabic = moduleOf(file("values", """<string name="a">A</string>"""), name = ":feature:two")

        val findings = LocalizationRules.declaredLocalesWithoutResources(
            modules = listOf(withArabic, withoutArabic),
            declaredCodes = listOf("fr", "en", "ar"),
        )

        assertThat(findings.map { it.locale }).containsExactly("fr", "ar")
        assertThat(findings.first { it.locale == "ar" }.detail).contains(":feature:two")
        assertThat(findings.first { it.locale == "ar" }.detail).doesNotContain(":feature:one")
    }

    @Test
    fun `a declared language present in every module is not reported`() {
        val module = moduleOf(
            file("values", """<string name="a">A</string>"""),
            file("values-fr", """<string name="a">A</string>"""),
        )

        assertThat(
            LocalizationRules.declaredLocalesWithoutResources(listOf(module), listOf("fr", "en", "FR")),
        ).isEmpty()
    }

    @Test
    fun `a malformed resource file fails with its module and path`() {
        val module = moduleOf(ResourceFile("values", "strings.xml", "<resources><string name=\"a\">A</resources>"))

        val failure = assertThrows(IllegalStateException::class.java) { findings(module) }

        assertThat(failure).hasMessageThat().contains(":feature:demo values/strings.xml")
    }

    @Test
    fun `the parser reads strings, plurals and arrays and honours their attributes`() {
        val entries = ResourceParser.parse(
            resources(
                """
                <!-- <string name="commented">no</string> -->
                <string name="plain">Hello</string>
                <string name="cdata"><![CDATA[Tom & <b>Jerry</b> %1${'$'}s]]></string>
                <string name="skip" translatable="false" formatted="false">x%</string>
                <plurals name="p"><item quantity="one">1</item><item quantity="other">n</item></plurals>
                <string-array name="arr"><item>a</item><item>b</item></string-array>
                <color name="ignored">#fff</color>
                """.trimIndent(),
            ),
        )

        assertThat(entries.map { it.name }).containsExactly("plain", "cdata", "skip", "p", "arr").inOrder()
        assertThat((entries[1] as StringEntry).value).isEqualTo("Tom & <b>Jerry</b> %1${'$'}s")
        assertThat((entries[2] as StringEntry).translatable).isFalse()
        assertThat((entries[2] as StringEntry).formatted).isFalse()
        assertThat((entries[3] as PluralsEntry).items.keys).containsExactly("one", "other")
        assertThat((entries[4] as ArrayEntry).items).containsExactly("a", "b").inOrder()
    }

    @Test
    fun `format specifiers distinguish positional from bare ones and skip percent and newline`() {
        val specifiers = FormatSpecifiers.of("%1${'$'}s %d %1${'$'}.1f 100%% done%n %2${'$'}08d")

        assertThat(specifiers.map { it.token }).containsExactly("%1${'$'}s", "%d", "%1${'$'}.1f", "%2${'$'}08d").inOrder()
        assertThat(specifiers.map { it.positional }).containsExactly(true, false, true, true).inOrder()
    }

    @Test
    fun `locale folders resolve languages and ignore other qualifiers`() {
        assertThat(LocaleFolders.parse("values")?.tag).isEqualTo("en")
        assertThat(LocaleFolders.parse("values-fr")?.tag).isEqualTo("fr")
        assertThat(LocaleFolders.parse("values-fil")?.tag).isEqualTo("fil")
        assertThat(LocaleFolders.parse("values-pt-rBR")?.tag).isEqualTo("pt-BR")
        listOf("values-night", "values-v31", "values-sw600dp", "values-land", "values-car", "values-ldrtl")
            .forEach { assertWithMessage(it).that(LocaleFolders.parse(it)).isNull() }
    }

    @Test
    fun `locale tags map back to their folder`() {
        assertThat(LocaleFolders.folderOf("en")).isEqualTo("values")
        assertThat(LocaleFolders.folderOf("FR")).isEqualTo("values-fr")
        assertThat(LocaleFolders.folderOf("pt_br")).isEqualTo("values-pt-rBR")
        assertThat(LocaleFolders.folderOf("pt-BR")).isEqualTo("values-pt-rBR")
    }

    @Test
    fun `the ratchet reports what is new and what is stale`() {
        val verdict = Ratchet.diff(
            actual = listOf("a", "b", "b"),
            recorded = listOf("b", "c"),
            keyOf = { it },
        )

        assertThat(verdict.unexpected).containsExactly("a", "b").inOrder()
        assertThat(verdict.stale).containsExactly("c")
    }

    @Test
    fun `the ratchet is clean when the record matches exactly`() {
        val verdict = Ratchet.diff(listOf("a", "b"), listOf("b", "a")) { it }

        assertThat(verdict.unexpected).isEmpty()
        assertThat(verdict.stale).isEmpty()
    }

    @Test
    fun `recorded lines ignore comments and blank lines`() {
        val text = """
            # header
            missing-key :feature:demo fr hello   # trailing comment

            declared-locale-without-resources - ar -
        """.trimIndent()

        assertThat(Ratchet.parseGapSignatures(text)).containsExactly(
            "missing-key :feature:demo fr hello",
            "declared-locale-without-resources - ar -",
        ).inOrder()
    }

    @Test
    fun `a recorded gap line must carry rule, module, locale and key`() {
        val failure = assertThrows(IllegalArgumentException::class.java) {
            Ratchet.parseGapSignatures("missing-key :feature:demo fr")
        }

        assertThat(failure).hasMessageThat().contains("règle module locale clé")
    }

    @Test
    fun `a finding signature is the line recorded in the known gaps file`() {
        val finding = Finding(Rule.MISSING_QUANTITY, ":feature:chat", "fr", "chat_reply_count", "detail")

        assertThat(finding.signature).isEqualTo("missing-quantity :feature:chat fr chat_reply_count")
    }
}
