package me.meeshy.ui.component.kit

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** K37 — la recette de la rangée verrouillée : trois formes, un pointillé, un cadenas, un geste. */
class MeeshyLockedRowTest {

    private fun resolve(
        form: MeeshyLockedRowForm = MeeshyLockedRowForm.Row,
        hasAction: Boolean = false,
        isPending: Boolean = false,
        isDone: Boolean = false,
        isOpen: Boolean = false,
        isPressable: Boolean = false,
        isPressed: Boolean = false,
        isEnabled: Boolean = true,
        isUnlocking: Boolean = false,
        reduceMotion: Boolean = false,
    ) = MeeshyLockedRowRecipe.resolve(form, hasAction, isPending, isDone, isOpen, isPressable, isPressed, isEnabled, isUnlocking, reduceMotion)

    @Test
    fun `trois formes - rayon 20 24 ou rien, rangee de 58 au moins`() {
        assertThat(resolve(form = MeeshyLockedRowForm.Row).cornerRadiusDp).isEqualTo(20f)
        assertThat(resolve(form = MeeshyLockedRowForm.Tile).cornerRadiusDp).isEqualTo(24f)
        assertThat(resolve(form = MeeshyLockedRowForm.Inline).cornerRadiusDp).isEqualTo(0f)
        assertThat(resolve(form = MeeshyLockedRowForm.Row).minimumHeightDp).isEqualTo(58f)
        assertThat(resolve(form = MeeshyLockedRowForm.Tile).minimumHeightDp).isEqualTo(0f)
    }

    @Test
    fun `seule la tuile montre le glyphe de la chose et le cadenas rapetisse en ligne`() {
        assertThat(resolve(form = MeeshyLockedRowForm.Tile).showsThingGlyph).isTrue()
        assertThat(resolve(form = MeeshyLockedRowForm.Row).showsThingGlyph).isFalse()
        assertThat(resolve(form = MeeshyLockedRowForm.Inline).lockSizeDp).isEqualTo(16f)
        assertThat(resolve(form = MeeshyLockedRowForm.Row).lockSizeDp).isEqualTo(22f)
    }

    @Test
    fun `fermee elle est en pointille avec son cadenas - ouverte elle n'a ni l'un ni l'autre`() {
        val closed = resolve()
        assertThat(closed.isDashed).isTrue()
        assertThat(closed.showsLock).isTrue()
        assertThat(closed.strokeWidthDp).isEqualTo(1.5f)
        assertThat(closed.dashDp).containsExactly(5f, 4.4f).inOrder()
        val open = resolve(isOpen = true)
        assertThat(open.isDashed).isFalse()
        assertThat(open.showsLock).isFalse()
    }

    @Test
    fun `le geste n'existe pas en ligne et reste actif tant qu'il n'est ni en cours ni fait`() {
        assertThat(resolve(hasAction = true).showsAction).isTrue()
        assertThat(resolve(hasAction = true, form = MeeshyLockedRowForm.Inline).showsAction).isFalse()
        assertThat(resolve(hasAction = false).showsAction).isFalse()
        assertThat(resolve(hasAction = true).actionIsActive).isTrue()
        assertThat(resolve(hasAction = true, isPending = true).actionIsActive).isFalse()
        assertThat(resolve(hasAction = true, isDone = true).actionIsActive).isFalse()
        assertThat(resolve(hasAction = true).actionHeightDp).isEqualTo(44f)
    }

    @Test
    fun `la rangee est un bouton si on peut la toucher et qu'elle est active - presse 0,98`() {
        assertThat(resolve(isPressable = true).isButton).isTrue()
        assertThat(resolve(isPressable = true, isEnabled = false).isButton).isFalse()
        assertThat(resolve(isPressable = false).isButton).isFalse()
        assertThat(resolve(isPressable = true, isPressed = true).pressedScale).isEqualTo(0.98f)
        assertThat(resolve(isPressable = false, isPressed = true).pressedScale).isEqualTo(1f)
    }

    @Test
    fun `l'ouverture fond en 280 ms et en 160 sous mouvement reduit sans tracer le pointille`() {
        assertThat(resolve().unlockFadeMillis).isEqualTo(280)
        assertThat(resolve(reduceMotion = true).unlockFadeMillis).isEqualTo(160)
        assertThat(resolve(isUnlocking = true).animatesDash).isTrue()
        assertThat(resolve(isUnlocking = true, reduceMotion = true).animatesDash).isFalse()
        assertThat(resolve().animatesDash).isFalse()
    }

    @Test
    fun `ouverte quand l'hote le dit ou pendant l'ouverture jouee, et elle se referme si l'acces est retire`() {
        assertThat(MeeshyLockedRowRecipe.shownOpen(isOpen = true, isUnlocking = false, hasPlayed = false)).isTrue()
        assertThat(MeeshyLockedRowRecipe.shownOpen(isOpen = false, isUnlocking = true, hasPlayed = true)).isTrue()
        assertThat(MeeshyLockedRowRecipe.shownOpen(isOpen = false, isUnlocking = true, hasPlayed = false)).isFalse()
        assertThat(MeeshyLockedRowRecipe.shownOpen(isOpen = false, isUnlocking = false, hasPlayed = true)).isFalse()
    }

    @Test
    fun `l'ouverture se joue une seule fois`() {
        assertThat(MeeshyLockedRowRecipe.unlockStep(isUnlocking = true, hasPlayed = false)).isEqualTo(MeeshyLockedRowUnlockStep.Play)
        assertThat(MeeshyLockedRowRecipe.unlockStep(isUnlocking = true, hasPlayed = true)).isEqualTo(MeeshyLockedRowUnlockStep.Rest)
        assertThat(MeeshyLockedRowRecipe.unlockStep(isUnlocking = false, hasPlayed = false)).isEqualTo(MeeshyLockedRowUnlockStep.Rest)
    }

    @Test
    fun `la voix dit l'etat fermé - le nom, verrouille, ce qu'il faut`() {
        val words = MeeshyLockedRowWords(locked = "verrouillé", unlocked = "déverrouillé")
        assertThat(words.spokenLabel("Présence", "dès Ami", isOpen = false)).isEqualTo("Présence, verrouillé, dès Ami")
        assertThat(words.spokenLabel("Présence", "dès Ami", isOpen = true)).isEqualTo("Présence, déverrouillé")
    }
}
