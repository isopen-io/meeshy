package me.meeshy.app.chat.export

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import java.text.DateFormat
import java.util.Date
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

internal enum class CardOutcome { GALLERY, SHARED, DENIED, FAILED }

/**
 * L'état de l'atelier : ce que l'utilisateur a choisi (format, langue, onglet, partie touchée) et ce
 * que la peinture en a fait. Le format voyage en chaîne ([CardFormat.serialized]) : un seul
 * champ d'état, une seule clé de peinture. L'aperçu précédent reste affiché pendant que le suivant
 * se peint.
 */
@Stable
internal class CardExportState(
    private val source: CardSource,
    val viewer: CardViewer,
    conversationTitle: String?,
    val store: CardPreferenceStore,
    private val dateFormat: DateFormat,
    private val timeFormat: DateFormat,
    initialFormat: CardFormat,
) {
    var anonymousLabel: String = "Anonyme"

    var format by mutableStateOf(initialFormat)
    var exportLanguage by mutableStateOf<String?>(null)
    var tab by mutableStateOf(CardTab.STYLES)
    var focus by mutableStateOf<CardPartId?>(null)
    var touched by mutableStateOf(false)
    var galleryOpen by mutableStateOf(false)
    var rendered by mutableStateOf<CardImage?>(null)
    var failed by mutableStateOf(false)
    var busy by mutableStateOf(false)
    var outcome by mutableStateOf<CardOutcome?>(null)
    var savedDefault by mutableStateOf(CardFormat.readDefault(store))
    var usage by mutableStateOf(CardUsage.read(store))
    private var renderedKey by mutableStateOf<String?>(null)

    /** L'image de chaque média de la carte, chargée une fois à l'ouverture ([CardPictureLoader]) ; vide tant qu'elle charge. */
    var pictures by mutableStateOf<Map<String, android.graphics.Bitmap>>(emptyMap())

    val title: String? = CardText.nonBlank(conversationTitle)
    val languages: List<CardLanguage> = source.languages
    val tabs: List<CardTab> = CardTab.offered(languages.size + 1)

    val subject: CardSubject? get() = source.subject(exportLanguage)

    val renderKey: String get() = "${format.serialized}|${exportLanguage.orEmpty()}|${pictures.keys.sorted().joinToString(",")}"
    val ready: Boolean get() = rendered != null && renderedKey == renderKey
    val isDefault: Boolean get() = savedDefault == format

    fun inputFor(next: CardFormat, from: CardSubject = checkNotNull(subject)): CardInput = CardInput.of(
        from, next, handle = viewer.username, conversationTitle = title, anonymousLabel = anonymousLabel,
        formatDate = { dateFormat.format(Date(it)) }, formatTime = { timeFormat.format(Date(it)) },
    )

    /** Peint l'aperçu hors du thread principal ; un résultat périmé par un nouveau choix est écarté. */
    suspend fun renderPreview() {
        val key = renderKey
        val input = inputFor(format)
        val shown = pictures
        failed = false
        val card = runCatching { withContext(Dispatchers.Default) { CardRenderer.render(input, PREVIEW_WIDTH, shown) } }.getOrNull()
        if (key != renderKey) return
        if (card == null) failed = true else {
            rendered = card
            renderedKey = key
        }
    }

    /** Toucher une partie de la carte ouvre l'onglet qui la règle. */
    fun pick(part: CardPartId) {
        touched = true
        focus = part
        tab = CardTab.of(part)
    }

    /** Choisir un onglet à la main désigne la partie qu'il règle. */
    fun openTab(next: CardTab) {
        tab = next
        focus = when (next) {
            CardTab.PALETTE -> CardPartId.BACKGROUND
            CardTab.LINK -> CardPartId.LINK.takeIf { subject?.quoted != null }
            CardTab.TYPEFACE -> if (focus == CardPartId.QUOTE || focus == CardPartId.REPLY) focus else CardPartId.REPLY
            CardTab.FRAME -> CardPartId.HEADER.takeIf { title != null || format.showDate }
            else -> null
        }
    }

    fun saveAsDefault() {
        CardFormat.writeDefault(format, store)
        savedDefault = format
    }

    fun recordUse() {
        CardUsage.record(format.template, store)
        usage = CardUsage.read(store)
    }

    /** La vitrine : l'état de la carte (sans son template) nomme la clé d'une vignette. */
    fun thumbSource(store: CardThumbnailStore, subject: CardSubject): CardThumbSource {
        val neutral = format.copy(template = CardTemplates.defaultId).serialized
        val shown = pictures
        return CardThumbSource(
            store = store,
            keyOf = { id -> "${id.rawValue}|$neutral|${exportLanguage.orEmpty()}|${shown.keys.sorted().joinToString(",")}" },
            inputOf = { id -> inputFor(format.copy(template = id), subject) },
            pictures = shown,
        )
    }

    companion object {
        const val PREVIEW_WIDTH = 720
    }
}

/** L'atelier tel qu'il s'ouvre : ce qu'on image tel qu'il était à l'ouverture, le format par défaut de l'appareil. */
@Composable
internal fun rememberCardExportState(source: CardSource, viewer: CardViewer, conversationTitle: String?): CardExportState {
    val context = LocalContext.current
    return remember(source.key) {
        val store = AndroidCardPreferenceStore(context)
        CardExportState(
            source, viewer, conversationTitle, store,
            android.text.format.DateFormat.getLongDateFormat(context), android.text.format.DateFormat.getTimeFormat(context),
            initialFormat = CardFormat.readDefault(store) ?: CardFormat.initial,
        )
    }
}
