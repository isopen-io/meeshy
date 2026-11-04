package me.meeshy.sdk.model.voice

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class VoiceSampleRulesTest {

    private val bytes = byteArrayOf(1, 2, 3)

    @Test
    fun `dix secondes sont le plancher inclusif d'un echantillon`() {
        assertThat(VoiceSampleRules.isLongEnough(10.0)).isTrue()
        assertThat(VoiceSampleRules.isLongEnough(9.99)).isFalse()
    }

    @Test
    fun `trois echantillons sont necessaires pour creer le profil`() {
        assertThat(VoiceSampleRules.canCreateProfile(2)).isFalse()
        assertThat(VoiceSampleRules.canCreateProfile(3)).isTrue()
    }

    @Test
    fun `le temps restant s'arrondit a la seconde superieure et s'arrete a zero`() {
        assertThat(VoiceSampleRules.remainingSeconds(0.0)).isEqualTo(10)
        assertThat(VoiceSampleRules.remainingSeconds(7.2)).isEqualTo(3)
        assertThat(VoiceSampleRules.remainingSeconds(12.0)).isEqualTo(0)
    }

    @Test
    fun `chaque texte du catalogue se lit en plus de sept secondes, loin des cinq d'une phrase unique`() {
        VoiceProfilePrompts.supportedLanguageCodes.forEach { code ->
            VoiceProfilePrompts.prompts(code).forEach {
                assertThat(VoiceSampleRules.estimatedReadingSeconds(it.text)).isAtLeast(7.0)
            }
        }
    }

    @Test
    fun `un echantillon trop court est rejete`() {
        assertThat(VoiceSampleSet.empty.add(bytes, 4.0)).isEqualTo(VoiceSampleSet.Added.TooShort)
    }

    @Test
    fun `un echantillon assez long est ajoute avec son octets et sa duree`() {
        val set = (VoiceSampleSet.empty.add(bytes, 11.5) as VoiceSampleSet.Added.Accepted).set

        assertThat(set.count).isEqualTo(1)
        assertThat(set.samples.single().durationSeconds).isEqualTo(11.5)
        assertThat(set.samples.single().bytes).isEqualTo(bytes)
    }

    @Test
    fun `la suppression vise l'identite et non l'indice`() {
        var set = VoiceSampleSet.empty
        repeat(3) { set = (set.add(bytes, 10.0) as VoiceSampleSet.Added.Accepted).set }
        val middle = set.samples[1].id

        val after = set.remove(middle).remove(middle)

        assertThat(after.samples.map { it.id }).containsExactly(set.samples[0].id, set.samples[2].id).inOrder()
    }

    @Test
    fun `un identifiant supprime n'est jamais reattribue`() {
        val one = (VoiceSampleSet.empty.add(bytes, 10.0) as VoiceSampleSet.Added.Accepted).set
        val removed = one.remove(one.samples.single().id)
        val again = (removed.add(bytes, 10.0) as VoiceSampleSet.Added.Accepted).set

        assertThat(again.samples.single().id).isNotEqualTo(one.samples.single().id)
    }
}
