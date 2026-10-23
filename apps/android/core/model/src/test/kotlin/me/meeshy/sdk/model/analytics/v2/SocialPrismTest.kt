package me.meeshy.sdk.model.analytics.v2

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SocialPrismTest {

    @Test
    fun `une traduction servie decrit la langue affichee et l'originale`() {
        val prism = SocialPrism.served(translationLanguage = "fr", originalLanguage = "en")!!
        assertThat(prism.displayedLanguage).isEqualTo("fr")
        assertThat(prism.originalLanguage).isEqualTo("en")
        assertThat(prism.translated).isTrue()
        assertThat(prism.translationSource).isEqualTo(SocialPrism.TranslationSource.SERVER)
    }

    @Test
    fun `la source appareil est conservee pour un contenu traduit`() {
        val prism = SocialPrism.served("es", "en", SocialPrism.TranslationSource.DEVICE)!!
        assertThat(prism.translationSource).isEqualTo(SocialPrism.TranslationSource.DEVICE)
    }

    @Test
    fun `l'original servi n'est pas traduit et n'a pas de source`() {
        val prism = SocialPrism.served(translationLanguage = null, originalLanguage = "de")!!
        assertThat(prism.displayedLanguage).isEqualTo("de")
        assertThat(prism.translated).isFalse()
        assertThat(prism.translationSource).isNull()
    }

    @Test
    fun `une source donnee a un contenu non traduit est ignoree`() {
        val prism = SocialPrism("fr", "fr", translated = false, translationSource = SocialPrism.TranslationSource.DEVICE)
        assertThat(prism.translationSource).isNull()
    }

    @Test
    fun `sans traduction ni langue d'origine il n'y a rien a decrire`() {
        assertThat(SocialPrism.served(null, null)).isNull()
    }

    @Test
    fun `traduction sans langue d'origine reste decrite`() {
        val prism = SocialPrism.served("fr", null)!!
        assertThat(prism.originalLanguage).isNull()
        assertThat(prism.translated).isTrue()
    }
}
