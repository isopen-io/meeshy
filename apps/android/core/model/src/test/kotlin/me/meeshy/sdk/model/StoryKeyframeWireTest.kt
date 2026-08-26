package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

/**
 * Le fil n'envoie PAS d'identifiant sur les keyframes — il n'en a jamais
 * envoyé. iOS en synthétise un à la lecture
 * (`StoryModels.swift:4137` : `decodeIfPresent(.id) ?? UUID().uuidString`) ;
 * Android l'exigeait.
 *
 * Deuxième occurrence de la même classe de défaut que la tolérance des
 * transitions : **le modèle Android est plus strict que le fil**, et kotlinx
 * échoue sur le DOCUMENT entier. Un champ manquant sur un keyframe emportait
 * donc le post complet — un texte animé rendait tout le post invisible.
 */
class StoryKeyframeWireTest {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    private fun decode(raw: String): StoryEffects =
        json.decodeFromString(StoryEffects.serializer(), raw)

    @Test
    fun `un keyframe sans identifiant ne fait pas echouer le document`() {
        val effects = decode(
            """
            { "background": "color:#000",
              "textObjects": [ { "id": "t1", "text": "Salut",
                "keyframes": [ { "time": 1, "opacity": 0 }, { "time": 2, "opacity": 1 } ] } ] }
            """.trimIndent(),
        )

        assertThat(effects.background).isEqualTo("color:#000")
        assertThat(effects.textObjects.first().keyframes).hasSize(2)
    }

    @Test
    fun `les canaux du keyframe traversent la lecture`() {
        val effects = decode(
            """
            { "textObjects": [ { "id": "t1", "text": "Salut",
                "keyframes": [ { "time": 2, "opacity": 1, "scale": 1.5 } ] } ] }
            """.trimIndent(),
        )
        val frame = effects.textObjects.first().keyframes!!.single()

        assertThat(frame.time).isEqualTo(2f)
        assertThat(frame.opacity).isEqualTo(1.0)
        assertThat(frame.scale).isEqualTo(1.5)
    }

    /** Un identifiant synthétisé reste UNIQUE : il sert de clé de liste. */
    @Test
    fun `les identifiants synthetises ne se collisionnent pas`() {
        val effects = decode(
            """
            { "textObjects": [ { "id": "t1", "text": "Salut",
                "keyframes": [ { "time": 1 }, { "time": 2 }, { "time": 3 } ] } ] }
            """.trimIndent(),
        )
        val ids = effects.textObjects.first().keyframes!!.map { it.id }

        assertThat(ids.toSet()).hasSize(3)
        assertThat(ids.none { it.isBlank() }).isTrue()
    }

    @Test
    fun `un identifiant present sur le fil est conserve`() {
        val effects = decode(
            """
            { "textObjects": [ { "id": "t1", "text": "Salut",
                "keyframes": [ { "id": "kf-grave", "time": 1 } ] } ] }
            """.trimIndent(),
        )

        assertThat(effects.textObjects.first().keyframes!!.single().id).isEqualTo("kf-grave")
    }
}
