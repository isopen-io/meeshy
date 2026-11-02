package me.meeshy.sdk.model.net

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class DeviceModelNameTest {

    @Test
    fun `un identifiant connu rend son nom commercial`() {
        assertThat(DeviceModelName.readable(model = "SM-S918B", manufacturer = "samsung"))
            .isEqualTo("Samsung Galaxy S23 Ultra")
    }

    @Test
    fun `la table ignore la casse de l identifiant`() {
        assertThat(DeviceModelName.readable(model = "sm-s918b", manufacturer = "samsung"))
            .isEqualTo("Samsung Galaxy S23 Ultra")
    }

    @Test
    fun `un modele inconnu se replie sur fabricant et modele`() {
        assertThat(DeviceModelName.readable(model = "XT2345-1", manufacturer = "motorola"))
            .isEqualTo("Motorola XT2345-1")
    }

    @Test
    fun `le fabricant n est pas repete quand le modele le contient deja`() {
        assertThat(DeviceModelName.readable(model = "Pixel 8", manufacturer = "Google"))
            .isEqualTo("Google Pixel 8")
        assertThat(DeviceModelName.readable(model = "Xiaomi 13", manufacturer = "Xiaomi"))
            .isEqualTo("Xiaomi 13")
    }

    @Test
    fun `un modele vide rend le fabricant seul, un fabricant vide le modele seul`() {
        assertThat(DeviceModelName.readable(model = "", manufacturer = "acme")).isEqualTo("Acme")
        assertThat(DeviceModelName.readable(model = "Z1", manufacturer = "")).isEqualTo("Z1")
    }

    @Test
    fun `rien du tout rend unknown`() {
        assertThat(DeviceModelName.readable(model = "", manufacturer = " ")).isEqualTo("unknown")
    }
}
