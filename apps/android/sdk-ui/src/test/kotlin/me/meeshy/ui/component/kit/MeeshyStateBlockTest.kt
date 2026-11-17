package me.meeshy.ui.component.kit

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** K38 — le bloc d'état : une forme pour l'absence, jamais d'erreur sans « Réessayer ». */
class MeeshyStateBlockTest {

    @Test
    fun `une erreur sans action principale est refusee`() {
        val v = MeeshyStateBlockRecipe.resolve(kind = MeeshyStateBlockKind.Error, hasPrimary = false)
        assertThat(v.isResolvable).isFalse()
        assertThat(v.reason).isEqualTo(MeeshyStateBlockRefusal.ErrorNeedsPrimary)
    }

    @Test
    fun `un vide plein ecran sans issue est refuse, le compact est admis`() {
        val regular = MeeshyStateBlockRecipe.resolve(kind = MeeshyStateBlockKind.Empty, hasPrimary = false)
        assertThat(regular.reason).isEqualTo(MeeshyStateBlockRefusal.EmptyNeedsExit)
        assertThat(MeeshyStateBlockRecipe.resolve(kind = MeeshyStateBlockKind.Empty, hasPrimary = false, hasSecondary = true).isResolvable).isTrue()
        assertThat(
            MeeshyStateBlockRecipe.resolve(kind = MeeshyStateBlockKind.Empty, size = MeeshyStateBlockSize.Compact, hasPrimary = false).isResolvable,
        ).isTrue()
    }

    @Test
    fun `chaque genre a son ton et l erreur seule est une alerte`() {
        fun tone(k: MeeshyStateBlockKind) = MeeshyStateBlockRecipe.resolve(kind = k, hasPrimary = true).glyphTone
        assertThat(tone(MeeshyStateBlockKind.Empty)).isEqualTo(MeeshyStateBlockTone.Accent)
        assertThat(tone(MeeshyStateBlockKind.Error)).isEqualTo(MeeshyStateBlockTone.Err)
        assertThat(tone(MeeshyStateBlockKind.Denied)).isEqualTo(MeeshyStateBlockTone.Warn)
        assertThat(tone(MeeshyStateBlockKind.Offline)).isEqualTo(MeeshyStateBlockTone.Neutral)
        assertThat(tone(MeeshyStateBlockKind.Success)).isEqualTo(MeeshyStateBlockTone.Ok)
        assertThat(MeeshyStateBlockRecipe.resolve(kind = MeeshyStateBlockKind.Error, hasPrimary = true).isAlert).isTrue()
        assertThat(MeeshyStateBlockRecipe.resolve(kind = MeeshyStateBlockKind.Offline, hasPrimary = true).isAlert).isFalse()
    }

    @Test
    fun `le compact est une rangee de 60 au titre de 15, sans image`() {
        val v = MeeshyStateBlockRecipe.resolve(kind = MeeshyStateBlockKind.Offline, size = MeeshyStateBlockSize.Compact, hasPrimary = false)
        assertThat(v.rowHeightDp).isEqualTo(60f)
        assertThat(v.titleSp).isEqualTo(15f)
        assertThat(v.hasGhost).isFalse()
        assertThat(v.hasHalo).isFalse()
    }

    @Test
    fun `sur du contenu l image s efface, la reussite n a pas de fantome`() {
        assertThat(MeeshyStateBlockRecipe.resolve(kind = MeeshyStateBlockKind.Empty, hasPrimary = true, isOverContent = true).hasGhost).isFalse()
        assertThat(MeeshyStateBlockRecipe.resolve(kind = MeeshyStateBlockKind.Success, hasPrimary = true).hasGhost).isFalse()
        assertThat(MeeshyStateBlockRecipe.resolve(kind = MeeshyStateBlockKind.Empty, hasPrimary = true).hasGhost).isTrue()
        assertThat(MeeshyStateBlockRecipe.resolve(kind = MeeshyStateBlockKind.Empty, hasPrimary = true).titleSp).isEqualTo(22f)
    }

    @Test
    fun `l erreur secoue et vibre a l entree, sauf en mouvement reduit`() {
        val live = MeeshyStateBlockRecipe.resolve(kind = MeeshyStateBlockKind.Error, hasPrimary = true)
        assertThat(live.shakes).isTrue()
        assertThat(live.hapticOnEnter).isTrue()
        val calm = MeeshyStateBlockRecipe.resolve(kind = MeeshyStateBlockKind.Error, hasPrimary = true, reduceMotion = true)
        assertThat(calm.shakes).isFalse()
        assertThat(calm.breathes).isFalse()
        assertThat(calm.hasHalo).isFalse()
        assertThat(calm.hapticOnEnter).isTrue()
    }

    @Test
    fun `le fantome compte de 1 a 4, trois par defaut`() {
        assertThat(MeeshyStateBlockRecipe.ghostCount(null)).isEqualTo(3)
        assertThat(MeeshyStateBlockRecipe.ghostCount(0)).isEqualTo(1)
        assertThat(MeeshyStateBlockRecipe.ghostCount(9)).isEqualTo(4)
    }
}
