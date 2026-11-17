package me.meeshy.ui.component.kit

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Les vecteurs de parité des neuf assemblages du profil (K29, K36, K38, K47, K48, K49, K50, K52, K54), recopiés des fichiers
 * `docs/product/kit/K*.vectors.json` du jumeau iOS : la même entrée rend la même sortie sur les deux plateformes.
 */
class MeeshyKitAssemblagesBParityTest {

    private fun p(x: Float, y: Float) = MeeshyMapTracePoint(x, y)

    @Test
    fun `K36 - la legende coupee ne garde pas d espace avant les points de suspension, une legende blanche se tait`() {
        assertThat(MeeshyMapPinRecipe.caption("une légende bien trop longue")).isEqualTo("une légende bien…")
        assertThat(MeeshyMapPinRecipe.caption("il y a 12 min")).isEqualTo("il y a 12 min")
        assertThat(MeeshyMapPinRecipe.caption("   ")).isNull()
        assertThat(MeeshyMapPinRecipe.caption("  quartier ")).isEqualTo("quartier")
    }

    @Test
    fun `K36 - une grappe montre trois contenus au plus et aucun sous deux`() {
        assertThat(listOf(0, 1, 2, 3, 12, 99, 100).map { MeeshyMapPinRecipe.clusterContentCount(it) })
            .containsExactly(0, 0, 2, 3, 3, 3, 3).inOrder()
    }

    @Test
    fun `K38 - seuls l erreur et le hors ligne s annoncent, et un changement de genre s annonce une fois`() {
        val announced = MeeshyStateBlockKind.entries.associateWith {
            MeeshyStateBlockRecipe.resolve(it, hasPrimary = true).announcesOnAppear
        }
        assertThat(announced).containsExactly(
            MeeshyStateBlockKind.Empty, false,
            MeeshyStateBlockKind.Error, true,
            MeeshyStateBlockKind.Denied, false,
            MeeshyStateBlockKind.Offline, true,
            MeeshyStateBlockKind.Success, false,
        )
        assertThat(MeeshyStateBlockRecipe.announcesTransition(MeeshyStateBlockKind.Empty, MeeshyStateBlockKind.Offline)).isTrue()
        assertThat(MeeshyStateBlockRecipe.announcesTransition(MeeshyStateBlockKind.Error, MeeshyStateBlockKind.Error)).isFalse()
        assertThat(MeeshyStateBlockRecipe.announcesTransition(MeeshyStateBlockKind.Error, MeeshyStateBlockKind.Empty)).isFalse()
    }

    @Test
    fun `K38 - le halo n existe qu en theme sombre, jamais en compact ni sur du contenu`() {
        assertThat(MeeshyStateBlockRecipe.resolve(MeeshyStateBlockKind.Empty, hasPrimary = true, isDark = true).hasHalo).isTrue()
        assertThat(MeeshyStateBlockRecipe.resolve(MeeshyStateBlockKind.Empty, hasPrimary = true, isDark = false).hasHalo).isFalse()
        assertThat(
            MeeshyStateBlockRecipe.resolve(MeeshyStateBlockKind.Error, hasPrimary = true, isOverContent = true, isDark = true).hasHalo,
        ).isFalse()
        assertThat(
            MeeshyStateBlockRecipe.resolve(MeeshyStateBlockKind.Empty, MeeshyStateBlockSize.Compact, hasPrimary = false, isDark = true).hasHalo,
        ).isFalse()
    }

    private fun item(id: String, state: MeeshyChoiceItemState = MeeshyChoiceItemState.Enabled) = MeeshyChoiceItem(id, id, state = state)

    @Test
    fun `K47 - selection simple - toucher le choix courant ne fait rien, sauf si le vide est permis`() {
        val single = MeeshyChoiceSelection.Single("a")
        assertThat(MeeshyChoiceTilesRecipe.outcome(MeeshyChoiceSelection.Single(null), item("a"), allowsEmpty = false, maxSelected = null))
            .isEqualTo(MeeshyChoiceOutcome.Select("a"))
        assertThat(MeeshyChoiceTilesRecipe.outcome(single, item("b"), allowsEmpty = false, maxSelected = null))
            .isEqualTo(MeeshyChoiceOutcome.Select("b"))
        assertThat(MeeshyChoiceTilesRecipe.outcome(single, item("a"), allowsEmpty = false, maxSelected = null))
            .isEqualTo(MeeshyChoiceOutcome.Ignored)
        assertThat(MeeshyChoiceTilesRecipe.outcome(single, item("a"), allowsEmpty = true, maxSelected = null))
            .isEqualTo(MeeshyChoiceOutcome.Deselect("a"))
    }

    @Test
    fun `K47 - selection multiple - au plafond, les tuiles libres s eteignent et ne repondent plus`() {
        val two = MeeshyChoiceSelection.Multiple(setOf("a", "b"))
        assertThat(MeeshyChoiceTilesRecipe.outcome(MeeshyChoiceSelection.Multiple(emptySet()), item("a"), false, 2))
            .isEqualTo(MeeshyChoiceOutcome.Select("a"))
        assertThat(MeeshyChoiceTilesRecipe.outcome(MeeshyChoiceSelection.Multiple(setOf("a")), item("b"), false, 2))
            .isEqualTo(MeeshyChoiceOutcome.Select("b"))
        assertThat(MeeshyChoiceTilesRecipe.outcome(two, item("c"), false, 2)).isEqualTo(MeeshyChoiceOutcome.Ignored)
        assertThat(MeeshyChoiceTilesRecipe.outcome(two, item("a"), false, 2)).isEqualTo(MeeshyChoiceOutcome.Deselect("a"))
        assertThat(MeeshyChoiceTilesRecipe.isDisabled(item("c"), two, 2)).isTrue()
        assertThat(MeeshyChoiceTilesRecipe.isDisabled(item("a"), two, 2)).isFalse()
        assertThat(MeeshyChoiceTilesRecipe.isDisabled(item("c"), two, null)).isFalse()
    }

    @Test
    fun `K47 - une tuile verrouillee rend sa raison, une tuile eteinte ne repond pas`() {
        val locked = item("x", MeeshyChoiceItemState.Locked("Réservé aux proches"))
        assertThat(MeeshyChoiceTilesRecipe.outcome(MeeshyChoiceSelection.Single(null), locked, false, null))
            .isEqualTo(MeeshyChoiceOutcome.Locked("x"))
        assertThat(MeeshyChoiceTilesRecipe.outcome(MeeshyChoiceSelection.Single(null), item("y", MeeshyChoiceItemState.Disabled), false, null))
            .isEqualTo(MeeshyChoiceOutcome.Ignored)
    }

    @Test
    fun `K48 - la grille montre tout le monde tant que tout tient, et reserve une case au compte au-dela`() {
        fun grid(columns: Int, count: Int, max: Int) =
            MeeshyAvatarGroupRecipe.resolve(layout = MeeshyAvatarGroupLayout.Grid(columns), count = count, max = max)
        assertThat(grid(2, 4, 7).let { it.visible to it.overflow }).isEqualTo(4 to 0)
        assertThat(grid(4, 12, 7).let { it.visible to it.overflow }).isEqualTo(7 to 5)
        assertThat(grid(4, 8, 7).let { it.visible to it.overflow }).isEqualTo(8 to 0)
        assertThat(grid(9, 20, 99).let { it.visible to it.overflow }).isEqualTo(7 to 13)
    }

    @Test
    fun `K48 - la pile suit les vecteurs, et un duo qui n a pas deux visages devient une pile`() {
        fun stack(count: Int, max: Int) = MeeshyAvatarGroupRecipe.resolve(count = count, max = max).let { Triple(it.visible, it.overflow, it.overflowLabel) }
        assertThat(stack(12, 1)).isEqualTo(Triple(2, 10, "+10"))
        assertThat(stack(200, 4)).isEqualTo(Triple(4, 196, "99+"))
        val three = MeeshyAvatarGroupRecipe.resolve(layout = MeeshyAvatarGroupLayout.Duo, count = 3)
        assertThat(three.isRenderable).isTrue()
        assertThat(three.effectiveLayout).isEqualTo(MeeshyAvatarGroupLayout.Stack)
        assertThat(three.breathes).isFalse()
        assertThat(MeeshyAvatarGroupRecipe.resolve(layout = MeeshyAvatarGroupLayout.Duo, count = 2).effectiveLayout)
            .isEqualTo(MeeshyAvatarGroupLayout.Duo)
    }

    @Test
    fun `K49 - ecart de 6 ou 8, 14 au-dela de 700 de large`() {
        assertThat(MeeshyMediaGridRecipe.spacing(MeeshyMediaGridSpacing.Tight, 350f)).isEqualTo(6f)
        assertThat(MeeshyMediaGridRecipe.spacing(MeeshyMediaGridSpacing.Regular, 350f)).isEqualTo(8f)
        assertThat(MeeshyMediaGridRecipe.spacing(MeeshyMediaGridSpacing.Regular, 701f)).isEqualTo(14f)
        assertThat(MeeshyMediaGridRecipe.spacing(MeeshyMediaGridSpacing.Tight, 900f)).isEqualTo(14f)
        assertThat(MeeshyMediaGridRecipe.spacing(MeeshyMediaGridSpacing.Regular, 700f)).isEqualTo(8f)
    }

    @Test
    fun `K49 - une tuile haute est en 2 sur 3, une tuile libre est bornee de 0,5 a 2`() {
        assertThat(MeeshyMediaGridRecipe.resolve(shape = MeeshyMediaTileShape.Tall).aspect!!).isWithin(1e-4f).of(0.6667f)
        assertThat(MeeshyMediaGridRecipe.aspectRatio(MeeshyMediaTileShape.Square, null)).isEqualTo(1f)
        assertThat(MeeshyMediaGridRecipe.aspectRatio(MeeshyMediaTileShape.Free, 1.5f)).isEqualTo(1.5f)
        assertThat(MeeshyMediaGridRecipe.aspectRatio(MeeshyMediaTileShape.Free, null)).isEqualTo(1f)
        assertThat(MeeshyMediaGridRecipe.aspectRatio(MeeshyMediaTileShape.Free, 9f)).isEqualTo(2f)
        assertThat(MeeshyMediaGridRecipe.aspectRatio(MeeshyMediaTileShape.Free, 0.1f)).isEqualTo(0.5f)
    }

    @Test
    fun `K49 - la rangee est une seule ligne de colonnes, jamais plus`() {
        assertThat(MeeshyMediaGridRecipe.visibleCount(9, MeeshyMediaGridLayout.Row, 3)).isEqualTo(3)
        assertThat(MeeshyMediaGridRecipe.visibleCount(2, MeeshyMediaGridLayout.Row, 3)).isEqualTo(2)
        assertThat(MeeshyMediaGridRecipe.visibleCount(9, MeeshyMediaGridLayout.Regular, 3)).isEqualTo(9)
    }

    @Test
    fun `K49 - la maconnerie borne le rapport d une tuile libre avant de la ranger`() {
        val flat = MeeshyMediaGridRecipe.placement(listOf(9f, 1f, 1f), columns = 2, spacingDp = 0f, widthDp = 200f)
        assertThat(flat.heights[0]).isWithin(1e-3f).of(50f + 100f)
    }

    @Test
    fun `K50 - le pic est le premier maximum strictement positif`() {
        assertThat(MeeshyChartScale.peak(emptyList())).isNull()
        assertThat(MeeshyChartScale.peak(listOf(0.0, 0.0))).isNull()
        assertThat(MeeshyChartScale.peak(listOf(1.0, 9.0, 3.0, 9.0))?.index).isEqualTo(1)
        assertThat(MeeshyChartScale.peak(listOf(-2.0, -1.0))).isNull()
        assertThat(MeeshyChartScale.peak(listOf(Double.NaN, 2.0))?.index).isEqualTo(1)
    }

    @Test
    fun `K50 - les graduations suivent les vecteurs du jumeau`() {
        assertThat(MeeshyChartScale.niceTicks(0.0, 3)).containsExactly(0.0)
        assertThat(MeeshyChartScale.niceTicks(214.0, 4)).containsExactly(0.0, 100.0, 200.0, 300.0).inOrder()
        assertThat(MeeshyChartScale.niceTicks(9.0, 4)).containsExactly(0.0, 5.0, 10.0).inOrder()
        assertThat(MeeshyChartScale.niceTicks(1.0, 3)).containsExactly(0.0, 0.5, 1.0).inOrder()
        assertThat(MeeshyChartScale.niceTicks(37.0, 4)).containsExactly(0.0, 20.0, 40.0).inOrder()
        assertThat(MeeshyChartScale.niceTicks(Double.NaN, 4)).containsExactly(0.0)
    }

    @Test
    fun `K50 - une valeur illisible vaut zero dans les parts et la normalisation`() {
        assertThat(MeeshyChartScale.segments(listOf(Double.NaN, 1.0, 1.0)).map { it.share }).containsExactly(0f, 0.5f, 0.5f).inOrder()
        assertThat(MeeshyChartScale.normalized(listOf(Double.POSITIVE_INFINITY, 2.0, 4.0))).containsExactly(0f, 0.5f, 1f).inOrder()
    }

    @Test
    fun `K52 - la pastille suit la position - pleine au premier, 34 pour cent au deuxieme, 16 ensuite`() {
        assertThat(listOf(0, 1, 2, 7).map { MeeshyReorderListRecipe.rankOpacity(it) }).containsExactly(1f, 0.34f, 0.16f, 0.16f).inOrder()
    }

    @Test
    fun `K54 - la longueur et les arrets se mesurent sur les points recus, jamais sur la courbe`() {
        val corner = MeeshyMapTracePath.of(listOf(p(0f, 0f), p(3f, 0f), p(3f, 4f)), MeeshyMapTraceKind.Route)
        assertThat(corner.length).isWithin(1e-4f).of(7f)
        assertThat(corner.fraction(0)).isEqualTo(0f)
        assertThat(corner.fraction(1)!!).isWithin(1e-5f).of(0.428571f)
        assertThat(corner.fraction(2)).isEqualTo(1f)
        assertThat(MeeshyMapTracePath.of(listOf(p(0f, 0f), p(3f, 4f)), MeeshyMapTraceKind.Route).length).isWithin(1e-4f).of(5f)
        assertThat(MeeshyMapTracePath.of(listOf(p(0f, 0f)), MeeshyMapTraceKind.Route).isDrawable).isFalse()
    }

    @Test
    fun `K54 - un lien ne lit que le premier et le dernier point recus`() {
        val link = MeeshyMapTracePath.of(listOf(p(0f, 0f), p(100f, 100f), p(3f, 4f)), MeeshyMapTraceKind.Link)
        assertThat(link.length).isWithin(1e-4f).of(5f)
        assertThat(link.fraction(1)).isNull()
        assertThat(link.fraction(2)).isEqualTo(1f)
        val tail = MeeshyMapTracePath.of(listOf(p(0f, 0f), p(30f, 40f), p(Float.NaN, 4f)), MeeshyMapTraceKind.Link)
        assertThat(tail.length).isWithin(1e-4f).of(50f)
    }

    @Test
    fun `K54 - la tete se pose a la fraction, bornee aux deux bouts`() {
        val line = MeeshyMapTracePath.of(listOf(p(0f, 0f), p(10f, 0f)), MeeshyMapTraceKind.Route)
        assertThat(line.at(0.5f)).isEqualTo(p(5f, 0f))
        assertThat(line.at(2f)).isEqualTo(p(10f, 0f))
        assertThat(line.at(-1f)).isEqualTo(p(0f, 0f))
    }

    @Test
    fun `K54 - le lisere suit le genre et un lien defile comme un trajet`() {
        fun casing(kind: MeeshyMapTraceKind, weight: MeeshyMapTraceWeight = MeeshyMapTraceWeight.Regular) =
            MeeshyMapTraceRecipe.resolve(kind, weight).let { it.strokeDp to it.casingDp }
        assertThat(casing(MeeshyMapTraceKind.Route)).isEqualTo(4f to 7f)
        assertThat(casing(MeeshyMapTraceKind.Route, MeeshyMapTraceWeight.Large)).isEqualTo(4.5f to 8f)
        assertThat(casing(MeeshyMapTraceKind.Link)).isEqualTo(2.5f to 5f)
        assertThat(casing(MeeshyMapTraceKind.History)).isEqualTo(7f to 16f)
        assertThat(MeeshyMapTraceRecipe.resolve(MeeshyMapTraceKind.Link).flows).isTrue()
        assertThat(MeeshyMapTraceRecipe.resolve(MeeshyMapTraceKind.History).flows).isFalse()
    }

    @Test
    fun `K54 - une progression illisible pose la tete au depart`() {
        val v = MeeshyMapTraceRecipe.resolve(MeeshyMapTraceKind.Route, progress = Float.NaN)
        assertThat(v.progress).isEqualTo(0f)
        assertThat(v.hasHead).isTrue()
    }

    @Test
    fun `K29 - avec une portee, l avatar voyage, sans demander de capacite en plus`() {
        assertThat(MeeshyAvatarMorphRecipe.resolve(from = 44, to = 112, hasScope = true).mode).isEqualTo(MeeshyAvatarMorphMode.Shared)
        assertThat(MeeshyAvatarMorphRecipe.resolve(from = 44, to = 112, hasScope = true, progress = 0.4f, reduceMotion = true).mode)
            .isEqualTo(MeeshyAvatarMorphMode.Crossfade)
    }

    @Test
    fun `K29 - le trajet automatique est un arc des que l ecart est assez diagonal, quelle que soit la taille`() {
        fun auto(dx: Float, dy: Float) = MeeshyAvatarMorphRecipe.autoPath(dx, dy)
        assertThat(auto(0f, 300f)).isEqualTo(MeeshyAvatarMorphPath.Straight)
        assertThat(auto(200f, 200f)).isEqualTo(MeeshyAvatarMorphPath.Arc)
        assertThat(auto(10f, 300f)).isEqualTo(MeeshyAvatarMorphPath.Straight)
        assertThat(auto(60f, 300f)).isEqualTo(MeeshyAvatarMorphPath.Straight)
        assertThat(auto(75f, 300f)).isEqualTo(MeeshyAvatarMorphPath.Arc)
        assertThat(auto(0f, 0f)).isEqualTo(MeeshyAvatarMorphPath.Straight)
        assertThat(MeeshyAvatarMorphRecipe.resolve(44, 112, hasScope = true, requestedPath = MeeshyAvatarMorphPath.Arc, reduceMotion = true).path)
            .isEqualTo(MeeshyAvatarMorphPath.Straight)
    }

    @Test
    fun `K29 - la pastille s efface en vol, sauf si elle voyage`() {
        assertThat(MeeshyAvatarMorphRecipe.badgeOpacity(-0.1f, travels = false)).isEqualTo(1f)
        assertThat(MeeshyAvatarMorphRecipe.badgeOpacity(0.5f, travels = false)).isEqualTo(0f)
        assertThat(MeeshyAvatarMorphRecipe.badgeOpacity(0.5f, travels = true)).isEqualTo(1f)
        assertThat(MeeshyAvatarMorphRecipe.badgeOpacity(1.1f, travels = false)).isEqualTo(1f)
    }
}
