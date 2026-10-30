package me.meeshy.app.stories

import android.content.Context
import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import coil.compose.AsyncImage
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent
import java.time.Instant
import java.time.ZoneId
import java.util.Locale
import kotlinx.coroutines.launch
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.sticker.MeeStickerCatalog
import me.meeshy.sdk.model.sticker.StickerPackSummary
import me.meeshy.sdk.model.sticker.StickerUsageEntry
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.sticker.StickerLibraryStore
import me.meeshy.sdk.sticker.StickerPackStore
import me.meeshy.sdk.sticker.StickerUsageStore
import me.meeshy.sdk.sticker.SubjectLifting
import me.meeshy.ui.component.game.MeeFigure
import me.meeshy.ui.sticker.MeeStickerPackPage
import me.meeshy.ui.sticker.StickerCapabilities
import me.meeshy.ui.sticker.StickerCustomPage
import me.meeshy.ui.sticker.StickerEmojiCategory
import me.meeshy.ui.sticker.StickerLibraryShelf
import me.meeshy.ui.sticker.StickerLibraryThumb
import me.meeshy.ui.sticker.StickerPackItemsPage
import me.meeshy.ui.sticker.StickerPackShopPage
import me.meeshy.ui.sticker.StickerPlacementDestination
import me.meeshy.ui.sticker.StickerSheet
import me.meeshy.ui.sticker.StickerTemplateArtwork

@EntryPoint
@InstallIn(SingletonComponent::class)
interface StoryStickerSheetEntryPoint {
    fun stickerUsageStore(): StickerUsageStore
    fun sessionRepository(): SessionRepository
    fun stickerPackStore(): StickerPackStore
    fun stickerLibraryStore(): StickerLibraryStore
    fun subjectLifting(): SubjectLifting
}

/** Ce que la feuille du compositeur et le « Faire un sticker » d'un média partagent : les magasins et les octets. */
internal class StoryStickerKit(val entryPoint: StoryStickerSheetEntryPoint, val images: StoryStickerImages)

@Composable
internal fun rememberStoryStickerKit(): StoryStickerKit {
    val context: Context = LocalContext.current
    val kit = remember(context) {
        val entryPoint = EntryPointAccessors.fromApplication(context.applicationContext, StoryStickerSheetEntryPoint::class.java)
        StoryStickerKit(entryPoint, StoryStickerImages(context.applicationContext, entryPoint.stickerLibraryStore(), entryPoint.subjectLifting()))
    }
    val accountId = kit.entryPoint.sessionRepository().currentUserId
    LaunchedEffect(accountId) { kit.entryPoint.stickerLibraryStore().adopt(accountId) }
    return kit
}

/**
 * La feuille de stickers du compositeur, avec TOUTES ses capacités (#13847) : Smileys et Recherche, Mee, Meo, Mee & Meo,
 * les packs installés, Personnalisés (Mes stickers, cadres à mots, heure) et la Boutique. Un choix passe par
 * [StickerChoiceRoute] puis se pose sur la scène ; une capacité que l'appareil ne sert pas (détourage, presse-papiers
 * sans image) n'a pas de porte. Glue : rien ne se décide ici.
 */
@Composable
internal fun StoryStickerSheetPanel(viewModel: StoryComposerViewModel, onDismiss: () -> Unit) {
    val kit = rememberStoryStickerKit()
    val packStore = kit.entryPoint.stickerPackStore()
    val library = kit.entryPoint.stickerLibraryStore()
    val packs by packStore.packs.collectAsStateWithLifecycle()
    val catalogue by packStore.catalogue.collectAsStateWithLifecycle()
    val packState by packStore.state.collectAsStateWithLifecycle()
    val items by library.items.collectAsStateWithLifecycle()
    val liftServed by produceState(false, kit) { value = kit.images.isLiftServed() }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val locale = LocalConfiguration.current.locales[0] ?: Locale.getDefault()
    LaunchedEffect(packStore) {
        launch { packStore.refresh() }
        launch { packStore.loadCatalogue() }
    }
    val lift = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri: Uri? ->
        uri?.let { scope.launch { context.sayLift(kit.images.liftIntoLibrary(it)) } }
    }
    val openedAt = remember { Instant.now() }
    val imageModel: (String) -> Any? = { url -> url.takeIf { it.isNotBlank() }?.let { ComposerMediaAddress.of(it, viewModel.mediaBaseUrl) } }
    val canPaste by produceState(kit.images.clipboardHoldsImage(), kit) {
        val stop = kit.images.watchClipboard { value = kit.images.clipboardHoldsImage() }
        awaitDispose(stop)
    }
    val onPaste: (() -> Unit)? = if (!canPaste) null else ({
        scope.launch { if (kit.images.pasteIntoLibrary() == null) context.sayLift(StickerLiftOutcome.Unreadable) }
    })
    val onLift: (() -> Unit)? = if (!liftServed) null else ({
        lift.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
    })
    val shelf = StickerLibraryShelf(items = items.map { StickerLibraryThumb(it.id, it.file) }, onPaste = onPaste, onLift = onLift)
    val capabilities = StickerCapabilities(
        emojiCategories = StickerCategory.values().map { StickerEmojiCategory(it.name, it.label(), StickerCatalog.inCategory(it)) },
        emojiSearch = { query -> StickerCatalog.search(query) },
        installedPacks = packs,
        hasMee = true,
        packContent = { slug -> StickerPackContent(slug, packs, imageModel) },
        custom = { StickerCustomPage(library = shelf, openedAt = openedAt) },
        shop = {
            StickerPackShopPage(catalogue, packState, onToggle = { slug ->
                scope.launch { packStore.setInstalled(slug, !packStore.state.value.isInstalled(slug)) }
            }, imageModel = imageModel)
        },
        entryContent = { entry, modifier -> StickerEntryArt(entry, library, modifier) },
    )
    val destination = remember(viewModel, kit) {
        StickerPlacementDestination { choice ->
            val route = StickerChoiceRoute.of(choice, packStore.packs.value, Instant.now(), ZoneId.systemDefault(), locale)
            viewModel.onStickerRoute(route, kit.images, imageModel)
        }
    }
    StickerSheet(
        capabilities = capabilities,
        usage = kit.entryPoint.stickerUsageStore(),
        destination = destination,
        onDismiss = onDismiss,
        accountId = kit.entryPoint.sessionRepository().currentUserId,
    )
}

@Composable
private fun StickerPackContent(slug: String, packs: List<StickerPackSummary>?, imageModel: (String) -> Any?) {
    val cast = MeeStickerCatalog.cast(slug)
    if (cast != null) {
        MeeStickerPackPage(cast)
        return
    }
    packs?.firstOrNull { it.slug == slug }?.let { StickerPackItemsPage(it, imageModel) }
}

/** Le dessin d'une entrée non-emoji des Favoris et des Récents : un film de Mee, un gabarit, une vignette de Mes stickers. */
@Composable
private fun StickerEntryArt(entry: StickerUsageEntry, library: StickerLibraryStore, modifier: Modifier) {
    Box(modifier.size(ENTRY_SIDE), contentAlignment = Alignment.Center) {
        when (entry.kind) {
            StickerUsageEntry.Kind.MEE -> MeeFigure(filmId = entry.value, side = ENTRY_SIDE, animates = false)
            StickerUsageEntry.Kind.TEMPLATE -> StickerTemplateArtwork(entry.value, emptyMap(), body = 6.dp)
            StickerUsageEntry.Kind.LIBRARY -> library.file(entry.value)?.let { AsyncImage(model = it, contentDescription = null) }
            StickerUsageEntry.Kind.EMOJI -> Unit
        }
    }
}

private val ENTRY_SIDE = 40.dp

/** Pose sur la scène ce que la feuille a choisi ; les stickers image passent d'abord par leurs octets. */
internal fun StoryComposerViewModel.onStickerRoute(route: StickerChoiceRoute?, images: StoryStickerImages, imageModel: (String) -> Any?) {
    when (route) {
        null -> Unit
        is StickerChoiceRoute.Glyph -> onAddSticker(route.emoji)
        is StickerChoiceRoute.Template -> onAddTemplateSticker(route.templateId, route.slots)
        is StickerChoiceRoute.MeeImage -> viewModelScope.launch { images.meePose(route.stickerId, route.emoji)?.let(::onAddImageSticker) }
        is StickerChoiceRoute.PackImage -> (imageModel(route.fileUrl) as? String)?.let { onAddImageSticker(images.packPose(it, route.emoji)) }
        is StickerChoiceRoute.LibraryImage -> images.libraryPose(route.itemId)?.let(::onAddImageSticker)
    }
}

/** Dit l'issue d'un détourage, d'un mot : gardé dans Mes stickers, aucun sujet, image illisible. */
internal fun Context.sayLift(outcome: StickerLiftOutcome) {
    val message = when (outcome) {
        is StickerLiftOutcome.Saved -> R.string.story_sticker_lift_saved
        StickerLiftOutcome.NoSubject -> R.string.story_sticker_lift_no_subject
        StickerLiftOutcome.Unreadable -> R.string.story_sticker_lift_unreadable
    }
    Toast.makeText(this, getString(message), Toast.LENGTH_SHORT).show()
}
