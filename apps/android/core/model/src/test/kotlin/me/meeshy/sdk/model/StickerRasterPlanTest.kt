package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StickerRasterPlanTest {
    private val always: (String) -> Boolean = { true }

    @Test
    fun `un emoji vide ne part pas`() {
        assertThat(StickerRasterPlan.emoji("  ")).isNull()
    }

    @Test
    fun `un emoji part avec son descripteur emoji`() {
        val plan = StickerRasterPlan.emoji("❤️")!!
        assertThat(plan.sticker).isEqualTo(MessageSticker(emoji = "❤️"))
    }

    @Test
    fun `un gabarit part avec son id ses slots son mouvement et son emoji de repli`() {
        val plan = StickerRasterPlan.template("love.heartFrame", mapOf("caption" to "Toi"), always) as StickerRasterPlan.Plan.Template
        assertThat(plan.sticker.templateId).isEqualTo("love.heartFrame")
        assertThat(plan.sticker.slots).containsExactly("caption", "Toi")
        assertThat(plan.sticker.animation).isEqualTo(StickerAnimation.HEARTBEAT)
        assertThat(plan.sticker.emoji).isEqualTo("❤️")
    }

    @Test
    fun `un gabarit non dessinable part comme son emoji de repli`() {
        val plan = StickerRasterPlan.template("love.heartFrame", emptyMap()) { false }
        assertThat(plan).isEqualTo(StickerRasterPlan.emoji("❤️"))
    }

    @Test
    fun `un gabarit inconnu du catalogue ne part pas`() {
        assertThat(StickerRasterPlan.template("inconnu.x", emptyMap(), always)).isNull()
    }

    @Test
    fun `un lieu sans nom prend son adresse puis le repli Ici`() {
        assertThat(StickerRasterPlan.locationSlots(null, "12 rue X", "Ici"))
            .containsExactly("placeName", "12 rue X", "placeDetail", "")
        assertThat(StickerRasterPlan.locationSlots(" ", null, "Ici")["placeName"]).isEqualTo("Ici")
        assertThat(StickerRasterPlan.locationSlots("Café", "12 rue X", "Ici"))
            .containsExactly("placeName", "Café", "placeDetail", "12 rue X")
    }

    @Test
    fun `un cartouche long ramene son corps sous le plafond`() {
        assertThat(StickerRasterPlan.templateSide(400f, 200f)).isEqualTo(512f)
        assertThat(StickerRasterPlan.templateSide(1024f, 200f)).isEqualTo(256f)
        assertThat(StickerRasterPlan.templateSide(0f, 10f)).isNull()
    }

    @Test
    fun `le plafond se garantit sur l image rendue sans jamais agrandir`() {
        assertThat(StickerRasterPlan.fitted(1024f, 512f)).isEqualTo(StickerBoxLaw.Size(512f, 256f))
        assertThat(StickerRasterPlan.fitted(100f, 50f)).isEqualTo(StickerBoxLaw.Size(100f, 50f))
    }

    @Test
    fun `un sticker anime garde son fichier d origine et son type`() {
        val sticker = MessageSticker(templateId = "pack.mee.coucou", emoji = "👋")
        val plan = StickerRasterPlan.original("image/webp", sticker)
        assertThat(plan.sticker).isEqualTo(sticker)
        assertThat(StickerRasterPlan.fileExtension(plan.mimeType)).isEqualTo("webp")
        assertThat(StickerRasterPlan.fileExtension("image/png")).isEqualTo("png")
    }
}
