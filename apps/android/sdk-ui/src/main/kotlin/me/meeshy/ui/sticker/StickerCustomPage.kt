package me.meeshy.ui.sticker

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyGridScope
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import java.time.Instant
import java.time.ZoneId
import java.util.Locale
import me.meeshy.sdk.model.sticker.StickerSheetChoice
import me.meeshy.sdk.model.sticker.StickerSlotFiller
import me.meeshy.sdk.model.sticker.StickerTemplate
import me.meeshy.sdk.model.sticker.StickerTemplateCatalog
import me.meeshy.sdk.model.sticker.StickerTemplateFamily
import me.meeshy.ui.R
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Une vignette de « Mes stickers » : son identifiant et ce que Coil sait charger (le fichier local). */
@Immutable
public data class StickerLibraryThumb(public val id: String, public val model: Any?)

/**
 * « Mes stickers » tels que l'hôte les sert. [onPaste] : coller l'image du presse-papiers ; [onLift] : détourer le sujet
 * d'une photo. Chacun n'est remis que s'il AGIT ici (presse-papiers sans image, détourage non servi ⇒ `null`, la porte
 * n'est pas dessinée).
 */
@Immutable
public class StickerLibraryShelf(
    public val items: List<StickerLibraryThumb>,
    public val onPaste: (() -> Unit)?,
    public val onLift: (() -> Unit)?,
)

/**
 * L'onglet Personnalisés : « Mes stickers » (si l'hôte sert une bibliothèque), puis les cadres à MOTS — un champ, dix
 * cadres qui montrent les mots tapés et ne se posent qu'avec eux —, puis les décorations d'HEURE, figées à
 * [openedAt] : ce qu'on voit est ce qui se pose.
 */
@Composable
public fun StickerCustomPage(
    library: StickerLibraryShelf?,
    openedAt: Instant,
    modifier: Modifier = Modifier,
    zone: ZoneId = ZoneId.systemDefault(),
) {
    val locale = LocalConfiguration.current.locales[0] ?: Locale.getDefault()
    var typed by rememberSaveable { mutableStateOf("") }
    val textTemplates = remember { StickerTemplateCatalog.templates(StickerTemplateFamily.TEXT) }
    val timeTemplates = remember { StickerTemplateCatalog.templates(StickerTemplateFamily.TIME) }
    val textTitle = stringResource(R.string.sticker_custom_text)
    val timeTitle = stringResource(R.string.sticker_custom_time)
    StickerArtGrid(modifier) {
        if (library != null) libraryShelf(library)
        header("custom:text", textTitle)
        item(key = "custom:field", span = { GridItemSpan(maxLineSpan) }, contentType = "field") {
            StickerWordsField(typed) { typed = it }
        }
        templateCells(textTemplates) { StickerSlotFiller.slotsFor(it, openedAt, zone, locale, typed) }
        header("custom:time", timeTitle)
        templateCells(timeTemplates) { StickerSlotFiller.slotsFor(it, openedAt, zone, locale, "") }
    }
}

private fun LazyGridScope.header(key: String, title: String) {
    item(key = "header:$key", span = { GridItemSpan(maxLineSpan) }, contentType = "header") { StickerPageHeader(title) }
}

private fun LazyGridScope.templateCells(templates: List<StickerTemplate>, slotsOf: (StickerTemplate) -> Map<String, String>?) {
    items(templates.size, key = { "template:${templates[it].id}" }, contentType = { "template" }) { index ->
        val template = templates[index]
        val slots = slotsOf(template)
        val name = stickerTemplateLabel(template, slots.orEmpty())
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
            StickerChoiceCell(
                choice = StickerSheetChoice.Template(template.id, slots.orEmpty()),
                label = name,
                side = StickerArtCellSize,
                enabled = slots != null,
            ) {
                Box(Modifier.padding(2.dp), contentAlignment = Alignment.Center) {
                    StickerTemplateArtwork(template.id, slots ?: emptyMap(), body = 9.dp)
                }
            }
        }
    }
}

private fun LazyGridScope.libraryShelf(library: StickerLibraryShelf) {
    item(key = "library:header", span = { GridItemSpan(maxLineSpan) }, contentType = "libraryHeader") {
        LibraryHeader(library)
    }
    if (library.items.isEmpty()) {
        item(key = "library:empty", span = { GridItemSpan(maxLineSpan) }, contentType = "empty") {
            Text(
                text = stringResource(R.string.sticker_library_empty),
                color = MeeshyTheme.tokens.textMuted,
                fontSize = 13.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(vertical = MeeshySpacing.md),
            )
        }
        return
    }
    items(library.items.size, key = { "library:${library.items[it].id}" }, contentType = { "library" }) { index ->
        val thumb = library.items[index]
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
            StickerChoiceCell(StickerSheetChoice.Library(thumb.id), stringResource(R.string.sticker_library_item_a11y), StickerArtCellSize) {
                AsyncImage(model = thumb.model, contentDescription = null, contentScale = ContentScale.Fit, modifier = Modifier.padding(4.dp))
            }
        }
    }
}

@Composable
private fun LibraryHeader(library: StickerLibraryShelf) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(top = MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        StickerPageHeader(stringResource(R.string.sticker_library_title), Modifier.weight(1f))
        library.onPaste?.let { paste ->
            val label = stringResource(R.string.sticker_library_paste)
            AssistChip(
                onClick = paste,
                label = { Text(label) },
                leadingIcon = { Icon(MeeshyIcons.AddPhoto, contentDescription = null) },
                modifier = Modifier.heightIn(min = 48.dp).semantics { contentDescription = label },
            )
        }
        library.onLift?.let { lift ->
            val label = stringResource(R.string.sticker_library_lift_a11y)
            AssistChip(
                onClick = lift,
                label = { Text(stringResource(R.string.sticker_library_lift)) },
                leadingIcon = { Icon(MeeshyIcons.Cut, contentDescription = null) },
                modifier = Modifier.heightIn(min = 48.dp).semantics { contentDescription = label },
            )
        }
    }
}

@Composable
private fun StickerWordsField(typed: String, onChange: (String) -> Unit) {
    val prompt = stringResource(R.string.sticker_text_placeholder)
    val label = stringResource(R.string.sticker_text_field_a11y)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.pill))
            .background(MeeshyTheme.tokens.inputBackground)
            .heightIn(min = 48.dp)
            .padding(horizontal = MeeshySpacing.md),
        contentAlignment = Alignment.CenterStart,
    ) {
        BasicTextField(
            value = typed,
            onValueChange = { onChange(it.take(MAX_WORDS)) },
            singleLine = true,
            textStyle = TextStyle(color = MeeshyTheme.tokens.textPrimary, fontSize = 15.sp),
            cursorBrush = SolidColor(MeeshyPalette.Indigo500),
            modifier = Modifier.fillMaxWidth().semantics { contentDescription = label },
            decorationBox = { inner ->
                if (typed.isEmpty()) Text(prompt, color = MeeshyTheme.tokens.textMuted, fontSize = 15.sp)
                inner()
            },
        )
    }
}

private const val MAX_WORDS = 80

/** Les aiguilles lisent l'heure en nombres : ce ne sont pas des mots à dire. */
private val MACHINE_SLOTS = setOf(StickerSlotFiller.HOUR, StickerSlotFiller.MINUTE)

/** Ce que TalkBack dit d'un gabarit : son nom, puis les valeurs qu'il montre (« Néon — Salut », « Heure numérique — 14:07 »). */
@Composable
internal fun stickerTemplateLabel(template: StickerTemplate, slots: Map<String, String>): String {
    val name = stickerTemplateName(template.id) ?: template.fallbackEmoji
    val shown = template.slots.filterNot { it.name in MACHINE_SLOTS }.mapNotNull { slots[it.name]?.takeIf(String::isNotBlank) }
    return if (shown.isEmpty()) name else "$name — ${shown.joinToString(", ")}"
}

/** Le nom d'un gabarit tel que TalkBack le dit ; `null` pour un gabarit hors du catalogue dessiné. */
@Composable
public fun stickerTemplateName(templateId: String): String? = when (templateId) {
    "text.speechBubble" -> R.string.sticker_template_text_speech_bubble
    "text.thoughtBubble" -> R.string.sticker_template_text_thought_bubble
    "text.stickyNote" -> R.string.sticker_template_text_sticky_note
    "text.ribbon" -> R.string.sticker_template_text_ribbon
    "text.badge" -> R.string.sticker_template_text_badge
    "text.neon" -> R.string.sticker_template_text_neon
    "text.tag" -> R.string.sticker_template_text_tag
    "text.signboard" -> R.string.sticker_template_text_signboard
    "text.tape" -> R.string.sticker_template_text_tape
    "text.stamp" -> R.string.sticker_template_text_stamp
    "time.digital" -> R.string.sticker_template_time_digital
    "time.analog" -> R.string.sticker_template_time_analog
    "time.ribbon" -> R.string.sticker_template_time_ribbon
    "time.calendarDay" -> R.string.sticker_template_time_calendar_day
    else -> null
}?.let { stringResource(it) }
