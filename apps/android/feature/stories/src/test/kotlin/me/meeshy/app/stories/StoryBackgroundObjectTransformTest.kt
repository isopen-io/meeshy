package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryMediaCrop
import me.meeshy.sdk.model.StoryMediaObject
import org.junit.Test

class StoryBackgroundObjectTransformTest {

    private fun bgObject(
        x: Double = 0.5,
        y: Double = 0.5,
        scale: Double = 1.0,
        rotation: Double = 0.0,
    ) = StoryMediaObject(id = "bg", isBackground = true, x = x, y = y, scale = scale, rotation = rotation)

    @Test
    fun `a centred unscaled background projects to identity`() {
        assertThat(StoryBackgroundObjectTransform.from(bgObject()))
            .isEqualTo(StoryBackgroundObjectTransform.IDENTITY)
    }

    @Test
    fun `a position right of centre projects to a positive x offset fraction`() {
        val t = StoryBackgroundObjectTransform.from(bgObject(x = 0.75))
        assertThat(t.offsetXFraction).isWithin(1e-6f).of(0.25f)
        assertThat(t.offsetYFraction).isEqualTo(0f)
    }

    @Test
    fun `a position left and above centre projects to negative offset fractions`() {
        val t = StoryBackgroundObjectTransform.from(bgObject(x = 0.25, y = 0.3))
        assertThat(t.offsetXFraction).isWithin(1e-6f).of(-0.25f)
        assertThat(t.offsetYFraction).isWithin(1e-6f).of(-0.2f)
    }

    @Test
    fun `scale passes through unchanged`() {
        assertThat(StoryBackgroundObjectTransform.from(bgObject(scale = 1.5)).scaleX)
            .isWithin(1e-6f).of(1.5f)
    }

    @Test
    fun `rotation passes through unchanged`() {
        assertThat(StoryBackgroundObjectTransform.from(bgObject(rotation = 30.0)).rotationDegrees)
            .isWithin(1e-6f).of(30f)
    }

    @Test
    fun `a non-positive scale decays to the neutral 1x`() {
        assertThat(StoryBackgroundObjectTransform.from(bgObject(scale = 0.0)).scaleX).isEqualTo(1f)
        assertThat(StoryBackgroundObjectTransform.from(bgObject(scale = -2.0)).scaleX).isEqualTo(1f)
    }

    @Test
    fun `a non-finite scale decays to the neutral 1x`() {
        assertThat(StoryBackgroundObjectTransform.from(bgObject(scale = Double.NaN)).scaleX).isEqualTo(1f)
        assertThat(StoryBackgroundObjectTransform.from(bgObject(scale = Double.POSITIVE_INFINITY)).scaleX)
            .isEqualTo(1f)
    }

    @Test
    fun `a non-finite position decays to a zero offset`() {
        val t = StoryBackgroundObjectTransform.from(bgObject(x = Double.NaN, y = Double.POSITIVE_INFINITY))
        assertThat(t.offsetXFraction).isEqualTo(0f)
        assertThat(t.offsetYFraction).isEqualTo(0f)
    }

    @Test
    fun `a non-finite rotation decays to zero`() {
        assertThat(StoryBackgroundObjectTransform.from(bgObject(rotation = Double.NaN)).rotationDegrees)
            .isEqualTo(0f)
    }

    @Test
    fun `isIdentity is true only when every component is neutral`() {
        assertThat(StoryBackgroundObjectTransform.IDENTITY.isIdentity).isTrue()
        assertThat(StoryBackgroundObjectTransform(scaleX = 1f, scaleY = 1f, offsetXFraction = 0.1f, offsetYFraction = 0f, rotationDegrees = 0f).isIdentity)
            .isFalse()
        assertThat(StoryBackgroundObjectTransform(scaleX = 1.2f, scaleY = 1.2f, offsetXFraction = 0f, offsetYFraction = 0f, rotationDegrees = 0f).isIdentity)
            .isFalse()
        assertThat(StoryBackgroundObjectTransform(scaleX = 1f, scaleY = 1f, offsetXFraction = 0f, offsetYFraction = 0.05f, rotationDegrees = 0f).isIdentity)
            .isFalse()
        assertThat(StoryBackgroundObjectTransform(scaleX = 1f, scaleY = 1f, offsetXFraction = 0f, offsetYFraction = 0f, rotationDegrees = 5f).isIdentity)
            .isFalse()
    }

    // MARK: - Le recadrage (#5085)

    /**
     * **Montrer une FRACTION sans ré-encoder** : agrandir à l'inverse de la
     * bande. Une moitié basse pleine largeur double la hauteur et laisse la
     * largeur intacte — deux facteurs différents, ce qui est la raison pour
     * laquelle la projection porte DEUX axes depuis ce lot.
     */
    @Test
    fun `un recadrage agrandit a l inverse de la bande`() {
        val t = StoryBackgroundObjectTransform.from(
            bgObject().copy(crop = StoryMediaCrop(x = 0.0, y = 0.5, width = 1.0, height = 0.5)),
        )
        assertThat(t.scaleX.toDouble()).isWithin(1e-6).of(1.0)
        assertThat(t.scaleY.toDouble()).isWithin(1e-6).of(2.0)
    }

    /**
     * **Le CENTRE de la bande vient au centre du cadre.** Le décalage se
     * calcule APRÈS l'agrandissement — c'est l'ordre dans lequel
     * `graphicsLayer` applique les deux, et l'inverser donnerait un cadrage
     * plausible mais faux, donc invisible en revue.
     *
     * Moitié basse : son centre est à 0,75 de la source, soit 0,25 sous le
     * centre ; ramené à l'échelle agrandie (÷ 0,5), il faut remonter d'une
     * demi-hauteur de cadre.
     */
    @Test
    fun `le centre de la bande vient au centre du cadre`() {
        val t = StoryBackgroundObjectTransform.from(
            bgObject().copy(crop = StoryMediaCrop(x = 0.0, y = 0.5, width = 1.0, height = 0.5)),
        )
        assertThat(t.offsetXFraction.toDouble()).isWithin(1e-6).of(0.0)
        assertThat(t.offsetYFraction.toDouble()).isWithin(1e-6).of(-0.5)
    }

    /**
     * **Le déplacement de l'auteur s'AJOUTE au recadrage.** Ce sont deux
     * intentions distinctes — cadrer la source, puis la déplacer dans le
     * cadre — et les fondre en une seule perdrait la seconde au premier
     * recadrage posé. Le témoin l'attrape parce qu'il pose les DEUX.
     */
    @Test
    fun `le deplacement de l auteur survit au recadrage`() {
        val t = StoryBackgroundObjectTransform.from(
            bgObject(x = 0.6, scale = 2.0)
                .copy(crop = StoryMediaCrop(x = 0.0, y = 0.5, width = 1.0, height = 0.5)),
        )
        assertThat(t.scaleX.toDouble()).isWithin(1e-6).of(2.0)
        assertThat(t.scaleY.toDouble()).isWithin(1e-6).of(4.0)
        assertThat(t.offsetXFraction.toDouble()).isWithin(1e-6).of(0.1)
    }

    /** Un recadrage plein n'ajoute rien — c'est l'absence de recadrage. */
    @Test
    fun `un recadrage plein laisse la projection intacte`() {
        assertThat(
            StoryBackgroundObjectTransform.from(bgObject().copy(crop = StoryMediaCrop.FULL)),
        ).isEqualTo(StoryBackgroundObjectTransform.IDENTITY)
    }

    /** Aucun recadrage au fil : la projection est celle d'avant ce lot. */
    @Test
    fun `sans recadrage la projection ne change pas`() {
        assertThat(StoryBackgroundObjectTransform.from(bgObject()))
            .isEqualTo(StoryBackgroundObjectTransform.IDENTITY)
    }
}
