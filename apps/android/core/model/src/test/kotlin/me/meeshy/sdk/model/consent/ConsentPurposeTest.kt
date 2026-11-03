package me.meeshy.sdk.model.consent

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import java.io.File

class ConsentPurposeTest {
    @Test
    fun `les parents reproduisent CONSENT_PARENT`() {
        assertThat(ConsentPurpose.DATA_PROCESSING.parent).isNull()
        assertThat(ConsentPurpose.ANALYTICS.parent).isEqualTo(ConsentPurpose.DATA_PROCESSING)
        assertThat(ConsentPurpose.VOICE_DATA.parent).isEqualTo(ConsentPurpose.DATA_PROCESSING)
        assertThat(ConsentPurpose.VOICE_PROFILE.parent).isEqualTo(ConsentPurpose.VOICE_DATA)
        assertThat(ConsentPurpose.VOICE_CLONING.parent).isEqualTo(ConsentPurpose.VOICE_PROFILE)
    }

    @Test
    fun `les ancetres remontent l'arbre racine d'abord sans la finalite`() {
        assertThat(ConsentPurpose.VOICE_CLONING.ancestors).containsExactly(
            ConsentPurpose.DATA_PROCESSING, ConsentPurpose.VOICE_DATA, ConsentPurpose.VOICE_PROFILE,
        ).inOrder()
        assertThat(ConsentPurpose.ANALYTICS.ancestors).containsExactly(ConsentPurpose.DATA_PROCESSING)
        assertThat(ConsentPurpose.DATA_PROCESSING.ancestors).isEmpty()
    }

    @Test
    fun `analytics n'est pas un ancetre de la chaine vocale`() {
        assertThat(ConsentPurpose.VOICE_CLONING.lineage).doesNotContain(ConsentPurpose.ANALYTICS)
        assertThat(ConsentPurpose.ANALYTICS.descendants).isEmpty()
    }

    @Test
    fun `les descendants vont des plus profonds aux plus proches`() {
        assertThat(ConsentPurpose.VOICE_DATA.descendants).containsExactly(
            ConsentPurpose.VOICE_CLONING, ConsentPurpose.VOICE_PROFILE,
        ).inOrder()
        assertThat(ConsentPurpose.DATA_PROCESSING.descendants).hasSize(4)
    }

    @Test
    fun `les valeurs filaires et la version par defaut suivent le fichier TypeScript`() {
        val source = generateSequence(File("").absoluteFile) { it.parentFile }
            .map { File(it, "packages/shared/types/consents.ts") }.firstOrNull { it.exists() } ?: return
        val text = source.readText()
        ConsentPurpose.entries.forEach { assertThat(text).contains("'${it.wire}'") }
        assertThat(text).contains("CONSENT_POLICY_VERSION_DEFAULT = '${ConsentPolicy.DEFAULT_VERSION}'")
        ConsentPurpose.entries.forEach { p ->
            val line = Regex("""\s'?${Regex.escape(p.wire)}'?: ('[a-z-]+'|null),""").find(text)?.groupValues?.get(1)
            assertThat(line).isEqualTo(p.parent?.let { "'${it.wire}'" } ?: "null")
        }
    }

    @Test
    fun `le consentement est refuse tant qu'un ancetre manque`() {
        val snap = ConsentSnapshot(setOf(ConsentPurpose.VOICE_CLONING, ConsentPurpose.VOICE_PROFILE))
        assertThat(snap.allows(ConsentPurpose.VOICE_CLONING)).isFalse()
        assertThat(ConsentSnapshot().allows(ConsentPurpose.ANALYTICS)).isFalse()
        val full = ConsentSnapshot(ConsentPurpose.VOICE_CLONING.lineage.toSet())
        assertThat(full.allows(ConsentPurpose.VOICE_CLONING)).isTrue()
    }

    @Test
    fun `octroyer voice-cloning ecrit les parents manquants racine d'abord`() {
        val plan = ConsentCascade.plan(ConsentPurpose.VOICE_CLONING, true, ConsentSnapshot(setOf(ConsentPurpose.DATA_PROCESSING)))
        assertThat(plan.writes).containsExactly(
            ConsentPurpose.VOICE_DATA, ConsentPurpose.VOICE_PROFILE, ConsentPurpose.VOICE_CLONING,
        ).inOrder()
        assertThat(plan.alsoChanged).containsExactly(ConsentPurpose.VOICE_DATA, ConsentPurpose.VOICE_PROFILE).inOrder()
        assertThat(plan.isCascading).isTrue()
    }

    @Test
    fun `retirer un parent retire ses enfants accordes, les plus profonds d'abord`() {
        val snap = ConsentSnapshot(
            setOf(ConsentPurpose.DATA_PROCESSING, ConsentPurpose.VOICE_DATA, ConsentPurpose.VOICE_PROFILE, ConsentPurpose.ANALYTICS),
        )
        val plan = ConsentCascade.plan(ConsentPurpose.VOICE_DATA, false, snap)
        assertThat(plan.writes).containsExactly(ConsentPurpose.VOICE_PROFILE, ConsentPurpose.VOICE_DATA).inOrder()
        assertThat(plan.alsoChanged).containsExactly(ConsentPurpose.VOICE_PROFILE)
    }

    @Test
    fun `retirer une feuille ne cascade pas`() {
        val plan = ConsentCascade.plan(ConsentPurpose.ANALYTICS, false, ConsentSnapshot(setOf(ConsentPurpose.ANALYTICS)))
        assertThat(plan.isCascading).isFalse()
        assertThat(plan.writes).containsExactly(ConsentPurpose.ANALYTICS)
    }
}
