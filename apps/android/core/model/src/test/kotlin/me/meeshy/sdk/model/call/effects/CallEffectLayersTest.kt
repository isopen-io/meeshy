package me.meeshy.sdk.model.call.effects

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallFaceEffect
import me.meeshy.sdk.model.call.VideoFilterConfig
import me.meeshy.sdk.model.call.VideoFilterPreset
import me.meeshy.sdk.model.call.activeFaceEffect
import me.meeshy.sdk.model.call.activePreset
import me.meeshy.sdk.model.call.selectingFaceEffect
import org.junit.Test

/**
 * #17902 · #16979 — la pile de trois couches, loi pure partagée par Effets et Montage (miroir de `CallEffectLayers.swift`
 * et de `call-effect-layers.ts`) : les six vecteurs communs, puis ce que la barre et la pile font de la configuration.
 */
class CallEffectLayersTest {
    private fun layer(kind: CallEffectKind, choice: String) = CallEffectLayer(kind, choice)
    private fun stack(vararg layers: CallEffectLayer) = CallEffectLayers.of(layers.toList())

    private val frame = layer(CallEffectKind.Frame, "frame-1")
    private val filterA = layer(CallEffectKind.Color, "golden")
    private val filterB = layer(CallEffectKind.Color, "film")
    private val face = layer(CallEffectKind.Face, "toad")

    private fun config(color: VideoFilterPreset? = null, face: CallFaceEffect = CallFaceEffect.None): VideoFilterConfig {
        val withFace = VideoFilterConfig().selectingFaceEffect(face)
        return color?.let { CallEffectsModeRule.applying(it, withFace) } ?: withFace
    }

    // region Les six vecteurs communs

    @Test
    fun `vide + cadre donne un cadre`() {
        assertThat(CallEffectLayers.EMPTY.adding(frame)).isEqualTo(stack(frame))
    }

    @Test
    fun `cadre + filtre + visage donne trois couches, la pile est pleine`() {
        val result = stack(frame).adding(filterA).adding(face)
        assertThat(result.bottomToTop).containsExactly(frame, filterA, face).inOrder()
        assertThat(result.isFull).isTrue()
    }

    @Test
    fun `pleine + paysage reste inchangee et pleine`() {
        val full = stack(frame, filterA, face)
        val result = full.adding(layer(CallEffectKind.Landscape, "beach"))
        assertThat(result).isEqualTo(full)
        assertThat(result.isFull).isTrue()
    }

    @Test
    fun `un autre filtre remplace le filtre A SA PLACE`() {
        assertThat(stack(frame, filterA).adding(filterB).bottomToTop).containsExactly(frame, filterB).inOrder()
    }

    @Test
    fun `retirer le milieu garde les autres dans leur ordre`() {
        assertThat(stack(frame, filterA, face).removing(CallEffectKind.Color).bottomToTop).containsExactly(frame, face).inOrder()
    }

    @Test
    fun `retirer une couche absente ne change rien`() {
        val before = stack(frame, face)
        assertThat(before.removing(CallEffectKind.Color)).isEqualTo(before)
    }

    // endregion

    // region Au-dela des vecteurs

    @Test
    fun `un genre deja present dans une pile pleine se remplace encore`() {
        val result = stack(frame, filterA, face).adding(filterB)
        assertThat(result.bottomToTop).containsExactly(frame, filterB, face).inOrder()
        assertThat(result.isFull).isTrue()
    }

    @Test
    fun `la liste va de la couche du dessus a celle du dessous`() {
        assertThat(stack(frame, filterA, face).listed).containsExactly(face, filterA, frame).inOrder()
        assertThat(CallEffectLayers.EMPTY.listed).isEmpty()
    }

    @Test
    fun `Aucun dans un genre retire la couche de ce genre`() {
        assertThat(stack(frame, filterA).choosing(CallEffectKind.Color, null)).isEqualTo(stack(frame))
        assertThat(stack(frame).choosing(CallEffectKind.Face, null)).isEqualTo(stack(frame))
    }

    @Test
    fun `un choix s'empile au-dessus quand le genre est absent`() {
        assertThat(stack(frame).choosing(CallEffectKind.Face, "toad").bottomToTop).containsExactly(frame, face).inOrder()
    }

    @Test
    fun `la construction garde un seul genre a la fois et jamais plus de trois couches`() {
        val crowded = CallEffectLayers.of(listOf(frame, filterA, filterB, face, layer(CallEffectKind.Landscape, "beach")))
        assertThat(crowded.bottomToTop).containsExactly(frame, filterA, face).inOrder()
    }

    @Test
    fun `un genre se pose s'il est present ou s'il reste de la place`() {
        val full = stack(frame, filterA, face)
        assertThat(full.allows(CallEffectKind.Color)).isTrue()
        assertThat(full.allows(CallEffectKind.Voice)).isFalse()
        assertThat(stack(frame).allows(CallEffectKind.Voice)).isTrue()
    }

    @Test
    fun `la pile n'est jamais mutee`() {
        val before = stack(frame, filterA)
        before.adding(face)
        before.removing(CallEffectKind.Frame)
        assertThat(before.bottomToTop).containsExactly(frame, filterA).inOrder()
    }

    // endregion

    // region (+) ouvre un genre absent

    @Test
    fun `(+) prend le premier genre absent apres le genre courant`() {
        val among = listOf(CallEffectKind.Face, CallEffectKind.Color)
        assertThat(CallEffectLayers.EMPTY.opening(CallEffectKind.Face, among)).isEqualTo(CallEffectKind.Color)
        assertThat(stack(face).opening(CallEffectKind.Color, among)).isNull()
    }

    @Test
    fun `(+) saute les genres deja dans la pile et reboucle`() {
        val layers = stack(filterA)
        val among = listOf(CallEffectKind.Face, CallEffectKind.Color, CallEffectKind.Frame)
        assertThat(layers.opening(CallEffectKind.Face, among)).isEqualTo(CallEffectKind.Frame)
        assertThat(layers.opening(CallEffectKind.Frame, among)).isEqualTo(CallEffectKind.Face)
    }

    @Test
    fun `(+) n'ouvre rien quand la pile est pleine`() {
        assertThat(stack(frame, filterA, face).opening(CallEffectKind.Face, CallEffectKind.entries)).isNull()
    }

    @Test
    fun `(+) ne rend jamais le genre sur lequel on est`() {
        assertThat(CallEffectLayers.EMPTY.opening(CallEffectKind.Face, listOf(CallEffectKind.Face))).isNull()
    }

    // endregion

    // region La pile et la configuration de l'appel

    @Test
    fun `un look nouvellement choisi s'empile au-dessus, les autres gardent leur ordre`() {
        val base = stack(filterA, face)
        val result = CallEffectsStackRule.layers(base, frame = "frame-1", config = config(VideoFilterPreset.Golden, CallFaceEffect.Toad))
        assertThat(result.bottomToTop).containsExactly(filterA, face, frame).inOrder()
    }

    @Test
    fun `un look qui ne tient plus dans la configuration quitte la pile`() {
        val result = CallEffectsStackRule.layers(stack(frame, filterA, face), frame = null, config = config(face = CallFaceEffect.Toad))
        assertThat(result.bottomToTop).containsExactly(face)
    }

    @Test
    fun `un filtre remplace reste A SA PLACE`() {
        val result = CallEffectsStackRule.layers(stack(filterA, face), frame = null, config = config(VideoFilterPreset.Film, CallFaceEffect.Toad))
        assertThat(result.bottomToTop).containsExactly(filterB, face).inOrder()
    }

    @Test
    fun `paysage et voix ne sont jamais touches par la configuration`() {
        val landscape = layer(CallEffectKind.Landscape, "beach")
        val result = CallEffectsStackRule.layers(stack(landscape), frame = null, config = config())
        assertThat(result.bottomToTop).containsExactly(landscape)
    }

    @Test
    fun `Naturel n'est pas une couche`() {
        val natural = CallEffectsModeRule.applying(VideoFilterPreset.Natural, VideoFilterConfig())
        assertThat(CallEffectsStackRule.colorChoice(natural)).isNull()
        assertThat(CallEffectsStackRule.faceChoice(VideoFilterConfig())).isNull()
    }

    @Test
    fun `retirer la couche filtre efface le filtre et garde le visage`() {
        val result = CallEffectsStackRule.removing(CallEffectKind.Color, config(VideoFilterPreset.Golden, CallFaceEffect.Toad))
        assertThat(result.activePreset).isNull()
        assertThat(result.activeFaceEffect).isEqualTo(CallFaceEffect.Toad)
    }

    @Test
    fun `retirer la couche visage efface le visage et garde le filtre`() {
        val result = CallEffectsStackRule.removing(CallEffectKind.Face, config(VideoFilterPreset.Golden, CallFaceEffect.Toad))
        assertThat(result.activeFaceEffect).isEqualTo(CallFaceEffect.None)
        assertThat(result.activePreset).isEqualTo(VideoFilterPreset.Golden)
    }

    @Test
    fun `retirer la couche cadre laisse la configuration telle quelle`() {
        val toad = config(face = CallFaceEffect.Toad)
        assertThat(CallEffectsStackRule.removing(CallEffectKind.Frame, toad)).isEqualTo(toad)
    }

    // endregion

    // region UNE rangee de genres pour Effets et Montage (#16979), memes vecteurs que `CallEffectLayersTests` (iOS)

    private val family = listOf(CallEffectKind.Face, CallEffectKind.Color, CallEffectKind.Frame)
    private val effectsOnly = listOf(CallEffectKind.Face, CallEffectKind.Color)

    @Test
    fun `la rangee de genres est une seule famille, quel que soit le mode`() {
        assertThat(CallEffectsGenreRule.row(offersEffects = true, offersFrames = true)).isEqualTo(family)
    }

    @Test
    fun `sans Montage la rangee garde les genres d'Effets`() {
        assertThat(CallEffectsGenreRule.row(offersEffects = true, offersFrames = false)).isEqualTo(effectsOnly)
    }

    @Test
    fun `sans Effets la rangee garde les cadres`() {
        assertThat(CallEffectsGenreRule.row(offersEffects = false, offersFrames = true)).isEqualTo(listOf(CallEffectKind.Frame))
    }

    @Test
    fun `(+) depuis Visage ouvre Couleur et depuis Couleur ouvre Visage`() {
        assertThat(CallEffectsGenreRule.adding(CallEffectKind.Face, stack(face), family)).isEqualTo(CallEffectKind.Color)
        assertThat(CallEffectsGenreRule.adding(CallEffectKind.Color, stack(filterA), family)).isEqualTo(CallEffectKind.Face)
    }

    @Test
    fun `(+) ouvre les cadres quand les deux genres d'Effets sont poses`() {
        assertThat(CallEffectsGenreRule.adding(CallEffectKind.Face, stack(filterA, face), family)).isEqualTo(CallEffectKind.Frame)
    }

    @Test
    fun `sans Montage, les deux genres poses, (+) laisse parcourir l'autre genre`() {
        assertThat(CallEffectsGenreRule.adding(CallEffectKind.Face, stack(filterA, face), effectsOnly)).isEqualTo(CallEffectKind.Color)
        assertThat(CallEffectsGenreRule.adding(CallEffectKind.Color, stack(filterA, face), effectsOnly)).isEqualTo(CallEffectKind.Face)
    }

    @Test
    fun `(+) depuis les cadres ouvre le premier genre d'Effets absent`() {
        assertThat(CallEffectsGenreRule.adding(CallEffectKind.Frame, stack(frame), family)).isEqualTo(CallEffectKind.Face)
        assertThat(CallEffectsGenreRule.adding(CallEffectKind.Frame, stack(frame, face), family)).isEqualTo(CallEffectKind.Color)
    }

    @Test
    fun `(+) depuis les cadres, les deux effets poses, ouvre encore Effets`() {
        assertThat(CallEffectsGenreRule.adding(CallEffectKind.Frame, stack(filterA, face), family)).isEqualTo(CallEffectKind.Face)
    }

    @Test
    fun `(+) depuis les cadres n'ouvre rien quand Effets n'est pas offert`() {
        assertThat(CallEffectsGenreRule.adding(CallEffectKind.Frame, stack(frame), listOf(CallEffectKind.Frame))).isNull()
    }

    @Test
    fun `(+) depuis un genre hors de la rangee n'ouvre rien`() {
        assertThat(CallEffectsGenreRule.adding(CallEffectKind.Frame, CallEffectLayers.EMPTY, effectsOnly)).isNull()
    }

    @Test
    fun `(+) n'ajoute rien avec trois couches`() {
        assertThat(CallEffectsGenreRule.adding(CallEffectKind.Face, stack(frame, filterA, face), family)).isNull()
        assertThat(CallEffectsGenreRule.adding(CallEffectKind.Frame, stack(frame, filterA, face), family)).isNull()
    }

    @Test
    fun `(+) sans genre courant part du debut de la rangee`() {
        assertThat(stack(face).opening(null, family)).isEqualTo(CallEffectKind.Color)
        assertThat(CallEffectLayers.EMPTY.opening(null, family)).isEqualTo(CallEffectKind.Face)
    }

    @Test
    fun `Effets s'ouvre sur le premier genre qui manque a la pile`() {
        assertThat(CallEffectsModeRule.startingCategory(stack(face))).isEqualTo(CallEffectsCategory.Color)
        assertThat(CallEffectsModeRule.startingCategory(CallEffectLayers.EMPTY)).isEqualTo(CallEffectsCategory.Face)
        assertThat(CallEffectsModeRule.startingCategory(stack(frame, filterA, face))).isEqualTo(CallEffectsCategory.Face)
    }

    // endregion

    // region La barre revient au menu de base

    @Test
    fun `Reglages bascule entre le menu de base et le panneau`() {
        assertThat(CallEffectsBarRule.afterSettings(CallEffectsBarMode.Base)).isEqualTo(CallEffectsBarMode.Settings)
        assertThat(CallEffectsBarRule.afterSettings(CallEffectsBarMode.Settings)).isEqualTo(CallEffectsBarMode.Base)
        assertThat(CallEffectsBarRule.afterSettings(CallEffectsBarMode.Applied)).isEqualTo(CallEffectsBarMode.Settings)
    }

    @Test
    fun `tout choix ramene la barre au menu de base`() {
        assertThat(CallEffectsBarRule.afterAddingLook(CallEffectsBarMode.Settings)).isEqualTo(CallEffectsBarMode.Base)
        assertThat(CallEffectsBarRule.afterAddingLook(CallEffectsBarMode.Applied)).isEqualTo(CallEffectsBarMode.Base)
        assertThat(CallEffectsBarRule.afterRemoval).isEqualTo(CallEffectsBarMode.Base)
        assertThat(CallEffectsBarRule.afterChoice).isEqualTo(CallEffectsBarMode.Base)
    }

    @Test
    fun `l'appui long sur (+) ouvre la liste seulement s'il y a quelque chose a lister`() {
        assertThat(CallEffectsBarRule.afterShowingApplied(CallEffectsBarMode.Base, hasLayers = true)).isEqualTo(CallEffectsBarMode.Applied)
        assertThat(CallEffectsBarRule.afterShowingApplied(CallEffectsBarMode.Settings, hasLayers = true)).isEqualTo(CallEffectsBarMode.Applied)
        assertThat(CallEffectsBarRule.afterShowingApplied(CallEffectsBarMode.Base, hasLayers = false)).isEqualTo(CallEffectsBarMode.Base)
    }

    @Test
    fun `une liste qui a perdu sa derniere couche se referme`() {
        assertThat(CallEffectsBarRule.reconciled(CallEffectsBarMode.Applied, hasLayers = false)).isEqualTo(CallEffectsBarMode.Base)
        assertThat(CallEffectsBarRule.reconciled(CallEffectsBarMode.Applied, hasLayers = true)).isEqualTo(CallEffectsBarMode.Applied)
        assertThat(CallEffectsBarRule.reconciled(CallEffectsBarMode.Settings, hasLayers = false)).isEqualTo(CallEffectsBarMode.Settings)
    }

    @Test
    fun `les looks ne se montrent que sur le menu de base`() {
        assertThat(CallEffectsBarRule.showsLooks(CallEffectsBarMode.Base)).isTrue()
        assertThat(CallEffectsBarRule.showsLooks(CallEffectsBarMode.Settings)).isFalse()
        assertThat(CallEffectsBarRule.showsLooks(CallEffectsBarMode.Applied)).isFalse()
    }

    // endregion

    // region L'etat du mode

    @Test
    fun `choisir un effet de visage le pose dans la pile, annuler le retire et rend le menu de base`() {
        val state = CallEffectsModeState.opening(VideoFilterConfig()).selecting(CallFaceEffect.Toad).showingApplied()
        assertThat(state.layers.listed).containsExactly(face)
        assertThat(state.showsApplied).isTrue()

        val undone = state.removing(CallEffectKind.Face)
        assertThat(undone.layers.isEmpty).isTrue()
        assertThat(undone.face).isEqualTo(CallFaceEffect.None)
        assertThat(undone.bar).isEqualTo(CallEffectsBarMode.Base)
    }

    @Test
    fun `annuler le filtre garde le visage`() {
        val state = CallEffectsModeState.opening(VideoFilterConfig()).selecting(CallFaceEffect.Toad).selecting(VideoFilterPreset.Golden)
        val undone = state.showingApplied().removing(CallEffectKind.Color)
        assertThat(undone.layers.bottomToTop).containsExactly(face)
        assertThat(undone.face).isEqualTo(CallFaceEffect.Toad)
        assertThat(undone.current.activePreset).isNull()
    }

    @Test
    fun `avec trois couches un effet de visage absent de la pile est refuse`() {
        val full = CallEffectLayers.of(listOf(frame, layer(CallEffectKind.Landscape, "beach"), layer(CallEffectKind.Voice, "deep")))
        val state = CallEffectsModeState.opening(VideoFilterConfig(), full)
        assertThat(state.selecting(CallFaceEffect.Angel)).isEqualTo(state)
        assertThat(state.selecting(VideoFilterPreset.Golden)).isEqualTo(state)
        assertThat(state.addedGenre(listOf(CallEffectKind.Face, CallEffectKind.Color, CallEffectKind.Frame))).isNull()
    }

    @Test
    fun `(+) en Effets montre le genre ouvert et rend le menu de base, un genre du Montage ne change rien ici`() {
        val open = CallEffectsModeState.opening(VideoFilterConfig()).selecting(CallFaceEffect.Toad).togglingSettings()
        val row = listOf(CallEffectKind.Face, CallEffectKind.Color, CallEffectKind.Frame)
        assertThat(open.addedGenre(row)).isEqualTo(CallEffectKind.Color)
        val shown = open.showingAdded(CallEffectKind.Color)
        assertThat(shown.category).isEqualTo(CallEffectsCategory.Color)
        assertThat(shown.bar).isEqualTo(CallEffectsBarMode.Base)
        assertThat(open.showingAdded(CallEffectKind.Frame)).isEqualTo(open)
    }

    @Test
    fun `Aucun et Naturel se posent toujours, meme pile pleine`() {
        val full = CallEffectLayers.of(listOf(frame, filterA, face))
        val state = CallEffectsModeState.opening(config(VideoFilterPreset.Golden, CallFaceEffect.Toad), full)
        assertThat(state.selecting(CallFaceEffect.None).layers.bottomToTop).containsExactly(frame, filterA).inOrder()
        assertThat(state.selecting(VideoFilterPreset.Natural).layers.bottomToTop).containsExactly(frame, face).inOrder()
    }

    @Test
    fun `le mode garde le cadre du Montage dans la pile quand il change un look`() {
        val state = CallEffectsModeState.opening(VideoFilterConfig(), stack(frame)).selecting(CallFaceEffect.Angel)
        assertThat(state.layers.bottomToTop).containsExactly(frame, layer(CallEffectKind.Face, "angel")).inOrder()
    }

    @Test
    fun `le mode s'ouvre sur le genre qui manque, ou sur celui qu'on lui demande`() {
        assertThat(CallEffectsModeState.opening(config(face = CallFaceEffect.Toad)).category).isEqualTo(CallEffectsCategory.Color)
        assertThat(CallEffectsModeState.opening(VideoFilterConfig(), category = CallEffectsCategory.Color).category).isEqualTo(CallEffectsCategory.Color)
    }

    // endregion
}
