package me.meeshy.app.stories

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertWithMessage
import me.meeshy.sdk.model.composer.ComposerFormatLabel
import me.meeshy.sdk.model.composer.ComposerMediaSource
import me.meeshy.sdk.model.composer.ComposerMoreEntry
import me.meeshy.sdk.model.composer.ComposerSceneNoun
import me.meeshy.sdk.model.composer.ComposerSceneTool
import me.meeshy.sdk.model.composer.ComposerSelectionAction
import me.meeshy.sdk.model.composer.StoryPublishTitle
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File

/**
 * Une même action du compositeur porte le même nom sur Android et sur iOS (#15599) : chaque contrôle lit la ressource que le
 * manifeste ADOPTE de la clé iOS attendue, donc le texte d'iOS dans les sept langues (le générateur le garantit).
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ComposerSameNamesAsIosTest {

    private val context: Context = ApplicationProvider.getApplicationContext()

    private val column = listOf(
        "colonne Texte" to ComposerSceneTool.TEXT.labelRes() to "composer.rail.text",
        "colonne Média" to ComposerSceneTool.MEDIA.labelRes() to "composer.rail.media",
        "colonne Sticker" to ComposerSceneTool.STICKER.labelRes() to "composer.rail.sticker",
        "colonne Son" to ComposerSceneTool.SOUND.labelRes() to "composer.rail.sound",
        "colonne Dessin" to ComposerSceneTool.DRAWING.labelRes() to "composer.rail.drawing",
        "colonne Fond" to ComposerSceneTool.BACKGROUND.labelRes() to "composer.rail.background",
        "colonne Mention" to ComposerSceneTool.MENTION.labelRes() to "composer.rail.mention",
        "colonne Lieu" to ComposerSceneTool.PLACE.labelRes() to "composer.rail.place",
        "colonne Texte du post" to ComposerFormatLabel.POST_TEXT.res(ComposerSceneNoun.POST) to "composer.socle.postText",
        "colonne ⋯" to ComposerSceneTool.MORE.labelRes() to "composer.a11y.moreOptions",
    )

    private val railTitles = listOf(
        "rail Texte" to ComposerSceneTool.TEXT.railTitleRes() to "composer.rail.title.text",
        "rail Média" to ComposerSceneTool.MEDIA.railTitleRes() to "composer.rail.title.media",
        "rail Sticker" to ComposerSceneTool.STICKER.railTitleRes() to "composer.rail.title.sticker",
        "rail Son" to ComposerSceneTool.SOUND.railTitleRes() to "composer.rail.title.sound",
        "rail Dessin" to ComposerSceneTool.DRAWING.railTitleRes() to "composer.rail.title.drawing",
        "rail Fond" to ComposerSceneTool.BACKGROUND.railTitleRes() to "composer.rail.title.background",
        "rail Mention" to ComposerSceneTool.MENTION.railTitleRes() to "composer.rail.title.mention",
        "rail Lieu" to ComposerSceneTool.PLACE.railTitleRes() to "composer.rail.title.place",
    )

    private val chrome = listOf(
        "✕" to SceneChromeName.CLOSE.label to "common.close",
        "↶" to SceneChromeName.UNDO.label to "composer.history.undo",
        "↷" to SceneChromeName.REDO.label to "composer.history.redo",
        "rail « Plus »" to SceneChromeName.RAIL_MORE.label to "composer.rail.plus",
        "rail « SÉLECTION »" to SceneChromeName.RAIL_SELECTION.label to "composer.rail.selection",
    )

    private val more = listOf(
        ComposerMoreEntry.PREVIEW to "composer.a11y.preview",
        ComposerMoreEntry.ADD_SLIDE to "composer.more.addSlide",
        ComposerMoreEntry.PICK_BACKGROUND to "composer.more.pickBackground",
        ComposerMoreEntry.REMOVE_BACKGROUND to "composer.more.removeBackground",
        ComposerMoreEntry.SLIDE_DURATION to "composer.more.slideDuration",
        ComposerMoreEntry.ANIMATION to "composer.more.animation",
        ComposerMoreEntry.TIMING to "composer.selection.time",
        ComposerMoreEntry.OPENING_EFFECT to "composer.more.transitions",
        ComposerMoreEntry.VISUAL_EFFECT to "composer.more.visualEffect",
        ComposerMoreEntry.CAPTION to "composer.more.legend",
        ComposerMoreEntry.HASHTAGS to "composer.rail.hashtag",
        ComposerMoreEntry.SHARE to "composer.more.share",
        ComposerMoreEntry.CLEAR_ALL to "composer.overflow.clearAll",
    ).map { (entry, key) -> "⋯ $entry" to entry.labelRes() to key }

    private val selection = listOf(
        ComposerSelectionAction.EDIT to "composer.selection.modify",
        ComposerSelectionAction.DUPLICATE to "composer.selection.duplicate",
        ComposerSelectionAction.TIME to "composer.selection.time",
        ComposerSelectionAction.REMOVE to "composer.selection.remove",
    ).map { (action, key) -> "sélection $action" to action.labelRes() to key }

    private val mediaSources = listOf(
        ComposerMediaSource.CAMERA to "composer.rail.media.takePhoto",
        ComposerMediaSource.PHOTO_LIBRARY to "composer.edit.source.library",
        ComposerMediaSource.FILES to "composer.rail.media.fromFiles",
    ).map { (source, key) -> "appui long Média $source" to source.labelRes() to key }

    private val publish = listOf(
        StoryPublishTitle.Single to "composer.publish.as.story",
        StoryPublishTitle.Post to "composer.publish.as.post",
        StoryPublishTitle.Reel to "composer.publish.as.reel",
        StoryPublishTitle.StoryAndPost to "composer.publish.as.storyAndPost",
        StoryPublishTitle.StoryAndReel to "composer.publish.as.storyAndReel",
        StoryPublishTitle.PostAndReel to "composer.publish.as.postAndReel",
        StoryPublishTitle.StoryPostAndReel to "composer.publish.as.storyPostAndReel",
    ).map { (title, key) -> "Publier $title" to publishLabelRes(title) to key }

    private val announcements = listOf(
        SceneObjectFamily.TEXT to "composer.selection.selected.text",
        SceneObjectFamily.IMAGE to "composer.selection.selected.image",
        SceneObjectFamily.VIDEO to "composer.selection.selected.video",
        SceneObjectFamily.SOUND to "composer.selection.selected.audio",
        SceneObjectFamily.STICKER to "composer.selection.selected.sticker",
        SceneObjectFamily.PLACE to "composer.selection.selected.place",
    ).map { (family, key) -> "annonce $family sélectionné" to family.selectedAnnouncementRes() to key } + listOf(
        "annonce fond sélectionné" to BACKGROUND_SELECTED_ANNOUNCEMENT to "composer.selection.selected.background",
        "annonce sélection retirée" to SELECTION_CLEARED_ANNOUNCEMENT to "composer.selection.deselected",
        "conteneur de la colonne" to SCENE_TOOL_COLUMN_LABEL to "composer.rest.column",
    )

    @Test
    fun `la colonne du compositeur nomme chaque outil comme iOS`() = assertAdopted(column)

    @Test
    fun `TalkBack annonce la sélection et nomme la colonne comme VoiceOver`() = assertAdopted(announcements)

    @Test
    fun `les rails libellés affichent le mot court d'iOS`() = assertAdopted(railTitles)

    @Test
    fun `fermer, défaire, rétablir et les titres des rails portent les noms d'iOS`() = assertAdopted(chrome)

    @Test
    fun `chaque entrée du menu ⋯ porte le nom d'iOS`() = assertAdopted(more)

    @Test
    fun `les options d'un objet sélectionné portent les noms d'iOS`() = assertAdopted(selection)

    @Test
    fun `les sources de l'appui long sur Média portent les noms d'iOS`() = assertAdopted(mediaSources)

    @Test
    fun `Publier nomme chaque format coché comme iOS`() = assertAdopted(publish)

    private fun assertAdopted(controls: List<Pair<Pair<String, Int?>, String>>) {
        controls.forEach { (control, iosKey) ->
            val (name, res) = control
            assertWithMessage("$name n'a pas de nom").that(res).isNotNull()
            val entry = res?.let { context.resources.getResourceEntryName(it) }
            assertWithMessage("$name doit lire la clé iOS « $iosKey »").that(adoptedNames(iosKey)).contains(entry)
        }
    }

    private fun adoptedNames(iosKey: String): List<String> = adoptions[iosKey].orEmpty()

    private companion object {
        val adoptions: Map<String, List<String>> by lazy { readStoriesAdoptions() }

        fun readStoriesAdoptions(): Map<String, List<String>> =
            manifestDirectory().walkTopDown()
                .filter { it.isFile && it.extension == "json" }
                .flatMap { file -> storiesEntries(JSONObject(file.readText())) }
                .filter { it.optString("status") == "adopted" }
                .groupBy({ it.getString("iosKey") }, { it.optString("androidName").ifEmpty { defaultName(it.getString("iosKey")) } })

        fun storiesEntries(document: JSONObject): Sequence<JSONObject> {
            val module = document.optJSONObject("modules")?.optJSONObject(":feature:stories") ?: return emptySequence()
            val entries = module.getJSONArray("entries")
            return (0 until entries.length()).asSequence().map { entries.getJSONObject(it) }
        }

        fun defaultName(iosKey: String) = iosKey.replace('.', '_').replace('-', '_')

        fun manifestDirectory(): File =
            generateSequence(File("").absoluteFile) { it.parentFile }
                .map { File(it, "i18n/manifest") }
                .firstOrNull { it.isDirectory }
                ?: error("i18n/manifest introuvable depuis ${File("").absolutePath}")
    }
}
