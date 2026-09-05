package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

/**
 * #5085 — **le recadrage traversait la passerelle sans lecteur Android.**
 *
 * `canvas-v3.ts` déclare la charge d'un objet permissive PAR CONTRAT
 * (`z.record(z.string(), z.unknown())`) : les quatre bornes écrites par iOS
 * passaient la validation, arrivaient ici, et n'étaient décodées par personne.
 * **Une image recadrée par l'auteur se rendait ENTIÈRE sur Android**, et rien
 * ne pouvait rougir — un lecteur qui ignore un champ ne se distingue pas d'un
 * lecteur qui ne l'a jamais reçu.
 *
 * Ces témoins tiennent la loi ; sa PROJECTION au rendu est tenue par
 * `StoryBackgroundObjectTransformTest`.
 */
class StoryMediaCropTest {

    @Test
    fun `sans les quatre bornes, il n y a pas de recadrage`() {
        assertThat(StoryMediaCrop.fromPayloadBounds(null, null, null, null)).isNull()
    }

    /**
     * **Un recadrage amputé n'a pas de repli sensé.** Le compléter fabriquerait
     * un cadrage que personne n'a posé, et le rendrait indiscernable d'un vrai
     * — le pire des deux, puisqu'il aurait l'air d'une intention.
     */
    fun `un recadrage amputé est refusé, jamais complété`() {
        assertThat(StoryMediaCrop.fromPayloadBounds(0.0, 0.5, 1.0, null)).isNull()
    }

    @Test
    fun `un recadrage amputé ne se complète pas`() {
        assertThat(StoryMediaCrop.fromPayloadBounds(0.0, 0.5, 1.0, null)).isNull()
        assertThat(StoryMediaCrop.fromPayloadBounds(null, 0.5, 1.0, 0.5)).isNull()
    }

    @Test
    fun `une borne non finie est refusée`() {
        assertThat(StoryMediaCrop.fromPayloadBounds(Double.NaN, 0.0, 1.0, 1.0)).isNull()
        assertThat(StoryMediaCrop.fromPayloadBounds(0.0, 0.0, Double.POSITIVE_INFINITY, 1.0)).isNull()
    }

    /** Le recadrage PLEIN est l'absence de recadrage — l'émetteur omet les clés. */
    @Test
    fun `un recadrage plein vaut une absence`() {
        assertThat(StoryMediaCrop.fromPayloadBounds(0.0, 0.0, 1.0, 1.0)).isNull()
    }

    @Test
    fun `les quatre bornes ensemble donnent le rectangle`() {
        assertThat(StoryMediaCrop.fromPayloadBounds(0.0, 0.5, 1.0, 0.5))
            .isEqualTo(StoryMediaCrop(x = 0.0, y = 0.5, width = 1.0, height = 0.5))
    }

    /**
     * **Le plancher tient AUSSI quand l'ORIGINE déborde.** Écrit naïvement,
     * `clamped` borne l'origine à `1` puis la dimension à `1 - origine` : la
     * seconde borne DÉFAIT la première et rend `0`, c'est-à-dire le média
     * invisible que le plancher existe pour empêcher. Sur une origine INTERNE,
     * les deux écritures s'accordent — c'est pourquoi le défaut a vécu dans le
     * Swift d'origine jusqu'à son portage.
     */
    @Test
    fun `le plancher tient meme quand l origine deborde`() {
        val borne = StoryMediaCrop.clamped(StoryMediaCrop(x = 5.0, y = 5.0, width = 0.5, height = 0.5))
        assertThat(borne.width).isAtLeast(StoryMediaCrop.MINIMUM_SIDE)
        assertThat(borne.height).isAtLeast(StoryMediaCrop.MINIMUM_SIDE)
        assertThat(borne.x + borne.width).isAtMost(1.0)
        assertThat(borne.y + borne.height).isAtMost(1.0)
    }

    /**
     * Le rapport EFFECTIF, jamais celui du fichier : un média recadré n'a plus
     * les proportions de sa source. Le témoin se pose sur un rectangle NON
     * carré — un carré rendrait le rapport source, et passerait dans les deux
     * mondes.
     */
    @Test
    fun `le rapport effectif suit le rectangle`() {
        assertThat(StoryMediaCrop.effectiveRatio(1.0, null)).isEqualTo(1.0)
        assertThat(StoryMediaCrop.effectiveRatio(1.0, StoryMediaCrop.FULL)).isEqualTo(1.0)
        assertThat(StoryMediaCrop.effectiveRatio(1.0, StoryMediaCrop(0.0, 0.5, 1.0, 0.5)))
            .isWithin(1e-9).of(2.0)
    }

    // MARK: - Les DEUX formes de fil

    private val json = Json { ignoreUnknownKeys = true }

    /**
     * **La forme v1 est celle qu'iOS publie réellement** : `StoryEffects` porte
     * `crop` IMBRIQUÉ (`StoryModels.swift`), là où `CanvasV3Migration` l'aplatit
     * en quatre clés. Deux formes, un sens — et la v1 est le cas nominal des
     * stories aujourd'hui.
     *
     * Le décodage est automatique (kotlinx), donc « ça devrait marcher » : ce
     * témoin le MESURE. Une propriété ajoutée dont on suppose la
     * désérialisation est exactement le genre de champ qui arrive `null` en
     * production sans que rien ne le dise.
     */
    @Test
    fun `la forme v1 imbriquee se decode`() {
        val objet = json.decodeFromString<StoryMediaObject>(
            """{"id":"m1","crop":{"x":0.0,"y":0.5,"width":1.0,"height":0.5}}""",
        )
        assertThat(objet.crop).isEqualTo(StoryMediaCrop(x = 0.0, y = 0.5, width = 1.0, height = 0.5))
    }

    /** Un média sans recadrage se décode sans en fabriquer un. */
    @Test
    fun `un media v1 sans recadrage n en porte aucun`() {
        assertThat(json.decodeFromString<StoryMediaObject>("""{"id":"m1"}""").crop).isNull()
    }
}
