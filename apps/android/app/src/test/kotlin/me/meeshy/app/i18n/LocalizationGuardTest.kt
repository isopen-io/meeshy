package me.meeshy.app.i18n

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import me.meeshy.sdk.model.AppLanguage
import org.junit.Test

// Transverse localization gate, applied to the REAL resource tree of every module that
// carries strings. The Android lint is not part of android.yml, so this JUnit test is the
// gate: a key forgotten in a locale, a drifted format specifier, a plural without its CLDR
// quantities, a name defined both by hand and generated, or a declared language without
// resources all fail the CI with the module, the key and the locale in the message.
//
// Known debts are recorded in app/src/test/resources/i18n/known-gaps.txt as a RATCHET: a
// finding that is not recorded fails, and a recorded line that is no longer true fails too,
// so the file can only shrink. The detection itself is proven in LocalizationRulesTest.
class LocalizationGuardTest {

    private val tree: Tree get() = Tree.instance

    @Test
    fun `the guard sees the thirteen modules that carry strings`() {
        assertThat(tree.modules.map { it.module }).containsAtLeast(
            ":app",
            ":sdk-ui",
            ":feature:auth",
            ":feature:calls",
            ":feature:chat",
            ":feature:contacts",
            ":feature:conversations",
            ":feature:feed",
            ":feature:notifications",
            ":feature:profile",
            ":feature:reels",
            ":feature:settings",
            ":feature:stories",
        )
    }

    @Test
    fun `the shipped locales are English, French, Spanish and Portuguese`() {
        assertThat(tree.shippedLocales).containsAtLeast("en", "fr", "es", "pt")
    }

    @Test
    fun `every module has the folder of every shipped locale`() {
        assertNoNewViolation(Rule.SHIPPED_LOCALE_MISSING)
    }

    @Test
    fun `no translatable string is missing from a present locale`() {
        assertNoNewViolation(Rule.MISSING_KEY)
    }

    @Test
    fun `every plural carries the quantities its language requires`() {
        assertNoNewViolation(Rule.MISSING_QUANTITY)
    }

    @Test
    fun `a translation keeps the format specifiers of the English string`() {
        assertNoNewViolation(Rule.SPECIFIER_MISMATCH)
    }

    @Test
    fun `strings with format specifiers are positional`() {
        assertNoNewViolation(Rule.NON_POSITIONAL, Rule.BARE_SPECIFIER)
    }

    @Test
    fun `no name is defined twice in a folder, by hand and generated included`() {
        assertNoNewViolation(Rule.DUPLICATE_DEFINITION)
    }

    @Test
    fun `every language the app declares has resources, apart from the recorded gap`() {
        assertNoNewViolation(Rule.DECLARED_LOCALE_WITHOUT_RESOURCES)
    }

    @Test
    fun `every recorded gap is still true`() {
        assertWithMessage(
            "Lignes de known-gaps.txt devenues fausses (l'écart est comblé : retirer la ligne) :\n" +
                tree.verdict.stale.joinToString("\n") { "  $it" },
        ).that(tree.verdict.stale).isEmpty()
    }

    private fun assertNoNewViolation(vararg rules: Rule) {
        val unexpected = tree.verdict.unexpected.filter { it.rule in rules }
        assertWithMessage(
            "Écarts de localisation non consignés — corriger la ressource ou, pour une dette assumée, " +
                "ajouter la ligne indiquée à app/src/test/resources/i18n/known-gaps.txt :\n" +
                unexpected.joinToString("\n") { "  $it\n      ligne : ${it.signature}" },
        ).that(unexpected).isEmpty()
    }

    private class Tree private constructor() {
        val modules: List<ModuleResources> = ResourceTree.stringModules()
        val shippedLocales: List<String> = Ratchet.parseLines(ResourceTree.testData("shipped-locales.txt"))
        private val recorded: List<String> = Ratchet.parseGapSignatures(ResourceTree.testData("known-gaps.txt"))
        val findings: List<Finding> =
            modules.flatMap { LocalizationRules.check(it, shippedLocales) } +
                LocalizationRules.declaredLocalesWithoutResources(modules, AppLanguage.supportedCodes)
        val verdict: RatchetVerdict<Finding> = Ratchet.diff(findings, recorded) { it.signature }

        companion object {
            val instance: Tree by lazy { Tree() }
        }
    }
}
