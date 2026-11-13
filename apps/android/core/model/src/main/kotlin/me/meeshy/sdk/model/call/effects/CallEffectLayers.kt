package me.meeshy.sdk.model.call.effects

import me.meeshy.sdk.model.call.CallFaceEffect
import me.meeshy.sdk.model.call.VideoFilterConfig
import me.meeshy.sdk.model.call.VideoFilterPreset
import me.meeshy.sdk.model.call.activeFaceEffect
import me.meeshy.sdk.model.call.activePreset
import me.meeshy.sdk.model.call.applyingPreset
import me.meeshy.sdk.model.call.selectingFaceEffect

/**
 * Les genres de la famille d'outils « Effets, filtres, cadres » (décision porteur du 2026-11-13 sur #16979) : une
 * couche porte UN genre à la fois. Paysage et voix n'ont pas encore de mode ; la loi les connaît pour que leur
 * arrivée ne change aucune règle. Miroir de `CallEffectKind` (iOS) et du `genre` de `call-effect-layers.ts` (web).
 */
enum class CallEffectKind { Frame, Color, Face, Landscape, Voice }

/** Une couche : un genre et son choix (l'identifiant du cadre, de l'ambiance, de l'effet de visage…). */
data class CallEffectLayer(val kind: CallEffectKind, val choice: String)

/**
 * **LA PILE DE TROIS COUCHES** (loi 14, #16979) — la même règle pure pour Effets et Montage, la même sur les trois
 * plateformes (iOS `CallEffectLayers`, web `call-effect-layers.ts`) : aucune vue, aucun singleton, une valeur immuable.
 *
 *  - une couche = un genre et son choix ; la pile ne garde JAMAIS deux couches d'un même genre ni plus de [MAX] ;
 *  - ajouter un genre déjà présent le remplace À SA PLACE ; un genre absent s'empile au-dessus ; pleine, l'ajout est
 *    refusé et la pile reste inchangée ;
 *  - retirer une couche ne touche qu'elle, les autres gardent leur ordre ;
 *  - lister va de la couche du dessus à celle du dessous (ce que montre l'appui long sur (+)).
 */
class CallEffectLayers private constructor(val bottomToTop: List<CallEffectLayer>) {
    val isFull: Boolean get() = bottomToTop.size >= MAX
    val isEmpty: Boolean get() = bottomToTop.isEmpty()

    /** De la couche du dessus à celle du dessous. */
    val listed: List<CallEffectLayer> get() = bottomToTop.reversed()

    val kinds: Set<CallEffectKind> get() = bottomToTop.mapTo(mutableSetOf()) { it.kind }

    fun choice(kind: CallEffectKind): String? = bottomToTop.firstOrNull { it.kind == kind }?.choice

    operator fun contains(kind: CallEffectKind): Boolean = bottomToTop.any { it.kind == kind }

    /** Un genre se pose s'il est déjà là (il sera remplacé) ou s'il reste de la place. */
    fun allows(kind: CallEffectKind): Boolean = kind in this || !isFull

    fun adding(layer: CallEffectLayer): CallEffectLayers {
        val index = bottomToTop.indexOfFirst { it.kind == layer.kind }
        return when {
            index >= 0 -> CallEffectLayers(bottomToTop.mapIndexed { at, kept -> if (at == index) layer else kept })
            isFull -> this
            else -> CallEffectLayers(bottomToTop + layer)
        }
    }

    fun removing(kind: CallEffectKind): CallEffectLayers =
        if (kind in this) CallEffectLayers(bottomToTop.filter { it.kind != kind }) else this

    /** « Aucun » ([choice] nul) retire la couche du genre ; un choix l'ajoute ou la remplace. */
    fun choosing(kind: CallEffectKind, choice: String?): CallEffectLayers =
        if (choice == null) removing(kind) else adding(CallEffectLayer(kind, choice))

    /**
     * (+) : le premier genre ABSENT de la pile, parmi [among], après [after] (depuis le début quand il est nul ou hors de
     * [among]) et en bouclant ; jamais [after] lui-même ; aucun quand la pile est pleine.
     */
    fun opening(after: CallEffectKind?, among: List<CallEffectKind>): CallEffectKind? {
        if (isFull) return null
        val start = among.indexOf(after) + 1
        val ordered = among.drop(start) + among.take(start)
        return ordered.firstOrNull { it != after && it !in this }
    }

    override fun equals(other: Any?): Boolean = other is CallEffectLayers && other.bottomToTop == bottomToTop

    override fun hashCode(): Int = bottomToTop.hashCode()

    override fun toString(): String = "CallEffectLayers($bottomToTop)"

    companion object {
        const val MAX: Int = 3

        val EMPTY: CallEffectLayers = CallEffectLayers(emptyList())

        /** La pile des [layers] données : un seul genre à la fois (le premier gagne), trois couches au plus. */
        fun of(layers: List<CallEffectLayer>): CallEffectLayers = CallEffectLayers(layers.distinctBy { it.kind }.take(MAX))
    }
}

/**
 * « Effets, filtres et cadres font partie d'une même famille d'outils » (décision porteur du 2026-11-13, #16979) : UNE
 * rangée de genres, la même en Effets et en Montage. Visage et Couleur se choisissent sur mon image (Effets), les cadres
 * au Montage ; un genre n'y figure que si l'appel offre le mode qui le montre. Miroir de `CallEffectsGenreRule` (iOS).
 */
object CallEffectsGenreRule {
    val effectsGenres: List<CallEffectKind> = CallEffectsCategory.entries.map { it.kind }
    val montageGenres: List<CallEffectKind> = listOf(CallEffectKind.Frame)

    fun row(offersEffects: Boolean, offersFrames: Boolean): List<CallEffectKind> =
        (if (offersEffects) effectsGenres else emptyList()) + (if (offersFrames) montageGenres else emptyList())

    /**
     * (+) : un genre ABSENT de la pile, d'abord dans le mode où l'on est, puis dans l'autre. Quand tout ce que la rangée
     * offre est déjà posé sans remplir la pile, (+) laisse feuilleter l'autre genre du mode, sinon le premier de l'autre
     * mode : rien de ce qu'il faisait ne se perd. Pile pleine, ou [from] hors de la rangée : rien.
     */
    fun adding(from: CallEffectKind, layers: CallEffectLayers, row: List<CallEffectKind>): CallEffectKind? {
        if (layers.isFull || from !in row) return null
        val isMontage = from in montageGenres
        val sameMode = row.filter { (it in montageGenres) == isMontage }
        val otherMode = row.filter { (it in montageGenres) != isMontage }
        return layers.opening(from, sameMode)
            ?: layers.opening(null, otherMode)
            ?: browsing(from, sameMode)
            ?: otherMode.firstOrNull()
    }

    private fun browsing(from: CallEffectKind, genres: List<CallEffectKind>): CallEffectKind? {
        val index = genres.indexOf(from)
        if (genres.size < 2 || index < 0) return null
        return genres[(index + 1) % genres.size]
    }
}

/**
 * Ce que la pile fait de la configuration de l'appel : la pile SUIT ce qui est réellement appliqué (un filtre ou un effet
 * de visage vit dans [VideoFilterConfig], un cadre dans le choix du Montage), et retirer une couche défait son réglage.
 * Miroir de `CallEffectsStackRule` (iOS) et de `syncLayers` (web).
 */
object CallEffectsStackRule {
    /** Le choix de la couche « filtre » : l'ambiance appliquée, `null` pour Naturel (aucun look). */
    fun colorChoice(config: VideoFilterConfig): String? =
        config.activePreset?.takeIf { it != VideoFilterPreset.Natural }?.id

    /** Le choix de la couche « visage » : l'effet appliqué, `null` pour Aucun. */
    fun faceChoice(config: VideoFilterConfig): String? =
        config.activeFaceEffect.takeIf { it != CallFaceEffect.None }?.id

    /**
     * La pile [base] mise en accord avec [frame] (le cadre choisi, `null` s'il n'y en a pas) et [config] : un look devenu
     * absent la quitte, un look changé reste À SA PLACE, un look nouveau s'empile au-dessus — cadre, puis filtre, puis
     * visage quand plusieurs arrivent ensemble. Les genres que ni la configuration ni le cadre ne portent (paysage, voix)
     * ne sont jamais touchés.
     */
    fun layers(base: CallEffectLayers, frame: String?, config: VideoFilterConfig): CallEffectLayers =
        base
            .choosing(CallEffectKind.Frame, frame)
            .choosing(CallEffectKind.Color, colorChoice(config))
            .choosing(CallEffectKind.Face, faceChoice(config))

    /**
     * La configuration sans le look de [kind] : le filtre part et l'effet de visage reste, et inversement. Le cadre ne vit
     * pas dans la configuration (le Montage le retire par son propre chemin) : elle est rendue telle quelle.
     */
    fun removing(kind: CallEffectKind, from: VideoFilterConfig): VideoFilterConfig = when (kind) {
        CallEffectKind.Color -> from.applyingPreset(null)
        CallEffectKind.Face -> from.selectingFaceEffect(CallFaceEffect.None)
        CallEffectKind.Frame, CallEffectKind.Landscape, CallEffectKind.Voice -> from
    }
}

/** Ce que montre la barre d'Effets sous la bande de looks : le menu de base, les réglages, ou la liste des effets appliqués. */
enum class CallEffectsBarMode { Base, Settings, Applied }

/**
 * La navigation de la barre `‹ · Réglages · (+)` (loi 14) : après le choix d'une fonction, elle REVIENT au menu de base.
 * Miroir de `CallEffectsBarRule` (iOS).
 */
object CallEffectsBarRule {
    /** Réglages bascule entre le menu de base et le panneau ; depuis la liste, il ouvre le panneau. */
    fun afterSettings(from: CallEffectsBarMode): CallEffectsBarMode =
        if (from == CallEffectsBarMode.Settings) CallEffectsBarMode.Base else CallEffectsBarMode.Settings

    /** (+) a choisi un genre : ce que la barre avait ouvert se referme. */
    @Suppress("UNUSED_PARAMETER")
    fun afterAddingLook(from: CallEffectsBarMode): CallEffectsBarMode = CallEffectsBarMode.Base

    /** Annuler un effet referme la liste et rend le menu de base. */
    val afterRemoval: CallEffectsBarMode = CallEffectsBarMode.Base

    /** Toute fonction choisie dans les réglages (« Chaque visage » au Montage) rend le menu de base. */
    val afterChoice: CallEffectsBarMode = CallEffectsBarMode.Base

    /** L'appui long sur (+) ouvre la liste, seulement s'il y a quelque chose à lister. */
    fun afterShowingApplied(from: CallEffectsBarMode, hasLayers: Boolean): CallEffectsBarMode =
        if (hasLayers) CallEffectsBarMode.Applied else from

    /** Une liste qui a perdu sa dernière couche se referme. */
    fun reconciled(mode: CallEffectsBarMode, hasLayers: Boolean): CallEffectsBarMode =
        if (mode == CallEffectsBarMode.Applied && !hasLayers) CallEffectsBarMode.Base else mode

    /** Les puces de tri et la bande de looks ne se montrent que sur le menu de base. */
    fun showsLooks(mode: CallEffectsBarMode): Boolean = mode == CallEffectsBarMode.Base
}
