package me.meeshy.sdk.model.syncpill

import me.meeshy.sdk.model.connection.ConnectionPill
import me.meeshy.sdk.model.connection.SyncPillEntry
import me.meeshy.sdk.model.sync.OutboxNavigationSource
import me.meeshy.sdk.model.sync.OutboxUiIcon

/** La teinte du point d'état (miroir d'iOS `SyncPillDotStyle`) : marque = en cours, ambre = dégradé, vert = « En ligne », rouge = échec. */
enum class SyncPillDotStyle { BRAND, WARNING, SUCCESS, ERROR }

/** Le pictogramme de tête d'une rangée ; [NONE] laisse le point pulsant seul (le texte courant reste discret). */
enum class SyncPillGlyph { NONE, WIFI_OFF, WIFI, MIC, PHOTO, PLAY, ATTACH, MOOD }

/** La taille de la capsule : compacte au repos, grande tant qu'un ami écrit. */
enum class SyncPillSize { COMPACT, TYPING }

/** Ce qu'un doigt sur la rangée déclenche : relancer, aller à la source, sinon avancer la rotation (miroir d'iOS `TapOutcome`). */
sealed interface SyncPillTapOutcome {
    data class Retry(val outboxId: String) : SyncPillTapOutcome
    data class Navigate(val source: OutboxNavigationSource) : SyncPillTapOutcome
    data object Advance : SyncPillTapOutcome
}

/**
 * Une rangée prête à peindre. [labelKey] est la clé iOS du libellé (`connection.*`, `sync.pill.*`), résolue en chaîne
 * localisée par la couche écran ; [literalLabel] porte « @pseudo » d'une frappe. [showsActivityDots] n'est vrai que pour
 * un travail réellement en vol : une opération finie ou un état statique ne se lit jamais comme en cours.
 */
data class SyncPillRow(
    val id: String,
    val labelKey: String?,
    val literalLabel: String?,
    val glyph: SyncPillGlyph,
    val dotStyle: SyncPillDotStyle,
    val showsActivityDots: Boolean,
    val target: OutboxNavigationSource?,
    val retryOutboxId: String?,
    val isTyping: Boolean = false,
) {
    val tapOutcome: SyncPillTapOutcome
        get() = when {
            retryOutboxId != null -> SyncPillTapOutcome.Retry(retryOutboxId)
            target != null && target != OutboxNavigationSource.Unknown -> SyncPillTapOutcome.Navigate(target)
            else -> SyncPillTapOutcome.Advance
        }
}

/** Les mesures de la capsule, en dp / sp (miroir d'iOS `SyncPillMetrics`). */
data class SyncPillMetrics(
    val heightDp: Float,
    val labelSp: Float,
    val counterSp: Float,
    val glyphSp: Float,
    val dotDp: Float,
    val verticalPaddingDp: Float,
    val horizontalPaddingDp: Float,
    val itemSpacingDp: Float,
    val maxTextDp: Float,
) {
    companion object {
        private val compact = SyncPillMetrics(22f, 11f, 10f, 11f, 6f, 4f, 10f, 6f, 160f)
        private val typing = SyncPillMetrics(35f, 15f, 14f, 16f, 10f, 8f, 20f, 8f, 220f)

        fun of(size: SyncPillSize): SyncPillMetrics = if (size == SyncPillSize.TYPING) typing else compact
    }
}

/**
 * La composition pure de la pastille globale (miroir d'iOS `ConnectionBanner.entries`) : l'état de connexion d'abord,
 * puis les opérations de la file, puis qui écrit. Aucune horloge, aucune ressource : le test tourne sans écran.
 */
object SyncPillPresenter {
    /** La largeur réservée aux points d'activité : la capsule ne respire pas à chaque tic. */
    const val RESERVED_DOTS: String = "..."

    fun rows(pill: ConnectionPill, entries: List<SyncPillEntry>): List<SyncPillRow> {
        val connection = connectionRow(pill, hasOperations = entries.any { !it.isTyping })
        return listOfNotNull(connection) + entries.map(::entryRow)
    }

    fun size(rows: List<SyncPillRow>): SyncPillSize =
        if (rows.any { it.isTyping }) SyncPillSize.TYPING else SyncPillSize.COMPACT

    /** Hors ligne et échec restent affichés : seul l'état PERSISTANT échappe au silence de 6 s. */
    fun isPersistent(rows: List<SyncPillRow>): Boolean =
        rows.any { it.dotStyle == SyncPillDotStyle.WARNING || it.dotStyle == SyncPillDotStyle.ERROR }

    fun activityDots(phase: Int): String = ".".repeat((Math.abs(phase) % RESERVED_DOTS.length) + 1)

    /** Une frappe neuve parmi les rangées arrivées enfle la capsule. */
    fun announcesTyping(rows: List<SyncPillRow>, newIds: Set<String>): Boolean =
        rows.any { it.isTyping && it.id in newIds }

    /** La rangée à l'index, bornée : une liste qui rétrécit entre deux rendus ne fait jamais déborder l'accès. */
    fun visibleRow(rows: List<SyncPillRow>, index: Int): SyncPillRow? =
        if (rows.isEmpty()) null else rows[index.coerceIn(0, rows.lastIndex)]

    private fun connectionRow(pill: ConnectionPill, hasOperations: Boolean): SyncPillRow? = when (pill) {
        ConnectionPill.HIDDEN -> null
        ConnectionPill.OFFLINE -> status("status.offline", "connection.offline", SyncPillGlyph.WIFI_OFF, SyncPillDotStyle.WARNING, dots = false)
        ConnectionPill.BACK_ONLINE -> status("status.online", "connection.online", SyncPillGlyph.WIFI, SyncPillDotStyle.SUCCESS, dots = false)
        ConnectionPill.CONNECTING -> status("status.connecting", "connection.connecting", SyncPillGlyph.NONE, SyncPillDotStyle.WARNING, dots = true)
        ConnectionPill.RECONNECTING -> status("status.reconnecting", "connection.reconnecting", SyncPillGlyph.NONE, SyncPillDotStyle.WARNING, dots = true)
        ConnectionPill.SYNCING ->
            if (hasOperations) null else status("status.syncing", "connection.syncing", SyncPillGlyph.NONE, SyncPillDotStyle.BRAND, dots = true)
    }

    private fun status(id: String, key: String, glyph: SyncPillGlyph, style: SyncPillDotStyle, dots: Boolean) =
        SyncPillRow(id, key, null, glyph, style, dots, target = null, retryOutboxId = null)

    private fun entryRow(entry: SyncPillEntry): SyncPillRow = SyncPillRow(
        id = entry.id,
        labelKey = entry.labelKey,
        literalLabel = entry.literalLabel,
        glyph = glyphFor(entry.icon),
        dotStyle = if (entry.isError) SyncPillDotStyle.ERROR else SyncPillDotStyle.BRAND,
        showsActivityDots = !entry.isError,
        target = entry.target,
        retryOutboxId = entry.retryOutboxId,
        isTyping = entry.isTyping,
    )

    private fun glyphFor(icon: OutboxUiIcon): SyncPillGlyph = when (icon) {
        OutboxUiIcon.AUDIO -> SyncPillGlyph.MIC
        OutboxUiIcon.IMAGE -> SyncPillGlyph.PHOTO
        OutboxUiIcon.VIDEO -> SyncPillGlyph.PLAY
        OutboxUiIcon.FILE -> SyncPillGlyph.ATTACH
        OutboxUiIcon.REACTION, OutboxUiIcon.STICKER -> SyncPillGlyph.MOOD
        OutboxUiIcon.TEXT, OutboxUiIcon.NONE -> SyncPillGlyph.NONE
    }
}
