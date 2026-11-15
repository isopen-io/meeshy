package me.meeshy.sdk.model.sticker

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MeeStickerCatalogTest {
    private val catalog = MeeStickerCatalog

    @Test
    fun `le catalogue compte 164 films`() {
        assertThat(catalog.all).hasSize(164)
    }

    @Test
    fun `chaque personnage a sa distribution`() {
        assertThat(catalog.stickers(MeeCharacter.MEE)).hasSize(50)
        assertThat(catalog.stickers(MeeCharacter.MEO)).hasSize(50)
        assertThat(catalog.stickers(MeeCharacter.DUO)).hasSize(64)
    }

    @Test
    fun `les identifiants sont uniques`() {
        assertThat(catalog.all.map { it.id }).containsNoDuplicates()
    }

    @Test
    fun `les intentions suivent l'ordre de la feuille iOS`() {
        assertThat(catalog.intentOrder.map { it.raw }).containsExactly(
            "bonjour", "amour", "fete", "soutien", "rale", "coup-de-mou", "surprise", "quotidien", "humour-noir",
        ).inOrder()
    }

    @Test
    fun `chaque intention de l'ordre porte au moins un film et aucun film n'a d'intention hors ordre`() {
        assertThat(catalog.sections.map { it.intent }).containsExactlyElementsIn(catalog.intentOrder).inOrder()
        assertThat(catalog.all.map { it.intent }.toSet()).isEqualTo(catalog.intentOrder.toSet())
    }

    @Test
    fun `dans une section Mee passe avant Meo puis les duos`() {
        catalog.sections.forEach { section ->
            assertThat(section.stickers.map { it.character.ordinal }).isInOrder()
        }
    }

    @Test
    fun `chaque film a un emoji de repli et un titre non vides`() {
        catalog.all.forEach {
            assertThat(it.emoji).isNotEmpty()
            assertThat(it.title).isNotEmpty()
        }
    }

    @Test
    fun `l'aller-retour id templateId id est l'identite`() {
        catalog.all.forEach { assertThat(catalog.sticker(it.templateId)).isEqualTo(it) }
        assertThat(catalog.all.first().templateId).isEqualTo("mee.${catalog.all.first().id}")
    }

    @Test
    fun `un templateId inconnu ou absent retombe sur rien sans erreur`() {
        assertThat(catalog.sticker("mee.n-existe-pas")).isNull()
        assertThat(catalog.sticker("autre.mee-coucou")).isNull()
        assertThat(catalog.sticker(null)).isNull()
        assertThat(catalog.sticker("")).isNull()
    }

    @Test
    fun `le fichier d'un film est mee point id point lottie sous mee_stickers`() {
        assertThat(catalog.assetPath("mee-coucou")).isEqualTo("mee_stickers/mee.mee-coucou.lottie")
    }

    @Test
    fun `la planche d'un pack se reduit a sa distribution`() {
        val meo = catalog.sections(MeeCharacter.MEO)
        assertThat(meo.flatMap { it.stickers }).hasSize(50)
        assertThat(meo.flatMap { it.stickers }.map { it.character }.toSet()).containsExactly(MeeCharacter.MEO)
    }
}
