package me.meeshy.app.stories

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.sp
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.sticker.StickerSheetChoice
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.sticker.StickerUsageStore
import me.meeshy.ui.sticker.StickerCapabilities
import me.meeshy.ui.sticker.StickerEmojiCategory
import me.meeshy.ui.sticker.StickerPlacementDestination
import me.meeshy.ui.sticker.StickerSheetHost

@EntryPoint
@InstallIn(SingletonComponent::class)
interface StickerSheetEntryPoint {
    fun stickerUsageStore(): StickerUsageStore
    fun sessionRepository(): SessionRepository
}

/**
 * The composer's sticker sheet: the single tabbed sheet of `:sdk-ui` (Search, Favorites, Recents, Smileys)
 * hosted for the story scene. The composer's *destination* turns an emoji choice into a canvas sticker;
 * the emoji catalogue and its keyword search ([StickerCatalog]) are injected as capabilities. Pure glue.
 */
@Composable
internal fun StickerPickerDialog(
    onPick: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    val context: Context = LocalContext.current
    val entryPoint = remember(context) {
        EntryPointAccessors.fromApplication(context.applicationContext, StickerSheetEntryPoint::class.java)
    }
    val categories = StickerCategory.values().map { category ->
        StickerEmojiCategory(category.name, category.label(), StickerCatalog.inCategory(category))
    }
    val capabilities = remember(categories) {
        StickerCapabilities(
            emojiCategories = categories,
            emojiSearch = { query -> StickerCatalog.search(query) },
        )
    }
    val destination = remember(onPick) {
        StickerPlacementDestination { choice -> if (choice is StickerSheetChoice.Emoji) onPick(choice.glyph) }
    }
    StickerSheetHost(
        capabilities = capabilities,
        usage = entryPoint.stickerUsageStore(),
        destination = destination,
        onDismiss = onDismiss,
        accountId = entryPoint.sessionRepository().currentUserId,
    )
}

@Composable
internal fun StickerCategory.label(): String = stringResource(
    when (this) {
        StickerCategory.SMILEYS -> R.string.stories_composer_sticker_cat_smileys
        StickerCategory.ANIMALS -> R.string.stories_composer_sticker_cat_animals
        StickerCategory.FOOD -> R.string.stories_composer_sticker_cat_food
        StickerCategory.ACTIVITIES -> R.string.stories_composer_sticker_cat_activities
        StickerCategory.TRAVEL -> R.string.stories_composer_sticker_cat_travel
        StickerCategory.OBJECTS -> R.string.stories_composer_sticker_cat_objects
        StickerCategory.SYMBOLS -> R.string.stories_composer_sticker_cat_symbols
        StickerCategory.FLAGS -> R.string.stories_composer_sticker_cat_flags
    },
)

internal const val STICKER_PICKER_COLUMNS = 6

internal val STICKER_PICKER_FONT_SIZE = 28.sp
