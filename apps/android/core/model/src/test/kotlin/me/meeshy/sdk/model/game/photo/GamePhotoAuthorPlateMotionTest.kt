package me.meeshy.sdk.model.game.photo

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Test

class GamePhotoAuthorPlateMotionTest {

    private fun layerNames(finish: PlateFinish): List<String> =
        Json.parseToJsonElement(GamePhotoAuthorPlateMotion.json(finish)).jsonObject.getValue("layers").jsonArray
            .map { it.jsonObject.getValue("nm").jsonPrimitive.content }

    @Test
    fun `le film dure 1,2 s a 60 images par seconde dans la boite de la plaque`() {
        val root = Json.parseToJsonElement(GamePhotoAuthorPlateMotion.json(PlateFinish.Engrave)).jsonObject
        assertThat(root.getValue("fr").jsonPrimitive.content).isEqualTo("60")
        assertThat(root.getValue("op").jsonPrimitive.content).isEqualTo("72")
        assertThat(root.getValue("w").jsonPrimitive.content).isEqualTo("360")
        assertThat(root.getValue("h").jsonPrimitive.content).isEqualTo("100")
    }

    @Test
    fun `la gravure joue le burin puis le lustre`() {
        assertThat(layerNames(PlateFinish.Engrave)).containsExactly("burin", "lustre").inOrder()
    }

    @Test
    fun `l'estampage joue quatre eclats puis le lustre`() {
        assertThat(layerNames(PlateFinish.Emboss)).containsExactly("éclat 1", "éclat 2", "éclat 3", "éclat 4", "lustre").inOrder()
    }

    @Test
    fun `le grattage joue la piece, cinq paillettes puis le lustre`() {
        assertThat(layerNames(PlateFinish.Scratch)).containsExactly(
            "pièce", "paillette 1", "paillette 2", "paillette 3", "paillette 4", "paillette 5", "lustre",
        ).inOrder()
    }

    @Test
    fun `le film est stable et chaque fini a le sien`() {
        PlateFinish.entries.forEach { assertThat(GamePhotoAuthorPlateMotion.json(it)).isEqualTo(GamePhotoAuthorPlateMotion.json(it)) }
        assertThat(PlateFinish.entries.map { GamePhotoAuthorPlateMotion.json(it) }.toSet()).hasSize(3)
    }

    @Test
    fun `chaque couche indexe de un en un et reste dans la duree du film`() {
        PlateFinish.entries.forEach { finish ->
            val layers = Json.parseToJsonElement(GamePhotoAuthorPlateMotion.json(finish)).jsonObject.getValue("layers").jsonArray
            assertThat(layers.map { it.jsonObject.getValue("ind").jsonPrimitive.content.toInt() })
                .containsExactlyElementsIn((1..layers.size).toList()).inOrder()
            layers.forEach { assertThat((it as JsonObject).getValue("op").jsonPrimitive.content).isEqualTo("72") }
            assertThat(layers).isInstanceOf(JsonArray::class.java)
        }
    }
}
