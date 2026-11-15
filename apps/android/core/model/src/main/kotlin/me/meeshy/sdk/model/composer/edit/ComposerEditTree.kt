package me.meeshy.sdk.model.composer.edit

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * L'arbre UNIQUE des niveaux d'édition du compositeur (spec 2026-10-31 « grammaire d'édition », R6, #13973) : la valeur de
 * `packages/shared/design/composer-edit-tree.json`, recopiée ici et comparée au fichier par son témoin — iOS décode le même
 * fichier (`ComposerEditTree`). Un niveau « rail » se pose dans le rail des outils ou par-dessus, un niveau « sheet » est une
 * feuille basse ; chaque entrée dit son mot (clé du catalogue iOS), ses deux icônes, ce qui l'offre et ce qu'elle ouvre.
 */
@Serializable
data class ComposerEditTree(val schemaVersion: Int, val levels: List<Level>) {

    @Serializable
    data class Level(val id: String, val kind: Kind, val title: String, val entries: List<Entry>)

    @Serializable
    data class Entry(
        val id: String,
        val label: String,
        val sfSymbol: String,
        val material: String,
        val offer: Offer,
        val opens: Opens,
        val next: String? = null,
        val destructive: Boolean = false,
    )

    @Serializable
    enum class Kind {
        @SerialName("rail") RAIL,
        @SerialName("sheet") SHEET,
    }

    /** Ce qui rend l'entrée utile ici (loi 4 : une entrée sans effet n'est pas offerte). */
    @Serializable
    enum class Offer {
        @SerialName("always") ALWAYS,
        @SerialName("editor") EDITOR,
        @SerialName("media-source") MEDIA_SOURCE,
        @SerialName("camera") CAMERA,
        @SerialName("image") IMAGE,
        @SerialName("video") VIDEO,
        @SerialName("trimmable") TRIMMABLE,
        @SerialName("look") LOOK,
    }

    @Serializable
    enum class Opens {
        @SerialName("action") ACTION,
        @SerialName("level") LEVEL,
        @SerialName("sheet") SHEET,
        @SerialName("confirmation") CONFIRMATION,
        @SerialName("band") BAND,
        @SerialName("toggle") TOGGLE,
    }

    fun level(id: String): Level? = levels.firstOrNull { it.id == id }

    companion object {
        const val BACKGROUND_MEDIA = "background.media"
        const val BACKGROUND_MEDIA_REPLACE = "background.media.replace"
        const val BACKGROUND_MEDIA_EDIT = "background.media.edit"
        const val MEDIA_PLACED_EDIT = "media.placed.edit"
        const val MEDIA_SOUND = "media.sound"

        private val json = Json { ignoreUnknownKeys = true }

        /** Décode le contenu de `composer-edit-tree.json` (la clé `$doc` est de la prose, ignorée). */
        fun decode(text: String): ComposerEditTree = json.decodeFromString(serializer(), text)

        val shared: ComposerEditTree = ComposerEditTree(
            schemaVersion = 1,
            levels = listOf(
                Level(
                    id = BACKGROUND_MEDIA,
                    kind = Kind.RAIL,
                    title = "composer.rail.title.background",
                    entries = listOf(
                        Entry("edit", "composer.selection.modify", "slider.horizontal.3", "Edit", Offer.EDITOR, Opens.LEVEL, next = BACKGROUND_MEDIA_EDIT),
                        Entry(
                            "replace", "composer.edit.replace", "arrow.triangle.2.circlepath", "SwapHorizontal", Offer.MEDIA_SOURCE,
                            Opens.SHEET, next = BACKGROUND_MEDIA_REPLACE,
                        ),
                        Entry("put-on-scene", "composer.audio.promote.action", "square.on.square", "FlipToFront", Offer.ALWAYS, Opens.ACTION),
                        Entry("remove", "composer.selection.remove", "trash", "Delete", Offer.ALWAYS, Opens.CONFIRMATION, destructive = true),
                    ),
                ),
                Level(
                    id = BACKGROUND_MEDIA_REPLACE,
                    kind = Kind.SHEET,
                    title = "composer.edit.replace",
                    entries = listOf(
                        Entry("library", "composer.edit.source.library", "photo.on.rectangle", "PhotoLibrary", Offer.MEDIA_SOURCE, Opens.ACTION),
                        Entry("camera", "composer.rail.media.takePhoto", "camera", "Camera", Offer.CAMERA, Opens.ACTION),
                        Entry("files", "composer.rail.media.fromFiles", "folder", "Folder", Offer.MEDIA_SOURCE, Opens.ACTION),
                    ),
                ),
                Level(
                    id = BACKGROUND_MEDIA_EDIT,
                    kind = Kind.RAIL,
                    title = "composer.selection.modify",
                    entries = listOf(
                        Entry("framing", "composer.rail.title.backgroundFraming", "aspectratio", "Photo", Offer.ALWAYS, Opens.BAND),
                        Entry("crop", "composer.object.editor.crop", "crop", "Crop", Offer.IMAGE, Opens.BAND),
                        Entry("trim", "composer.capture.tool.trim", "scissors", "Cut", Offer.TRIMMABLE, Opens.BAND),
                        Entry("filters", "composer.object.editor.filter", "camera.filters", "PhotoFilter", Offer.ALWAYS, Opens.BAND),
                        Entry("frames", "composer.capture.rail.frames", "square.dashed", "CheckBoxBlank", Offer.LOOK, Opens.BAND),
                        Entry("adjust", "composer.object.editor.adjust", "slider.horizontal.3", "Tune", Offer.ALWAYS, Opens.BAND),
                        Entry("effects", "composer.object.editor.effects", "sparkles", "Sparkles", Offer.IMAGE, Opens.BAND),
                        Entry("sound", "composer.rail.title.sound", "speaker.wave.2", "VolumeUp", Offer.VIDEO, Opens.LEVEL, MEDIA_SOUND),
                        Entry("loop", "story.timeline.inspector.loop", "repeat", "Repeat", Offer.VIDEO, Opens.TOGGLE),
                        Entry("rotate", "composer.object.editor.rotate", "rotate.right", "RotateRight", Offer.ALWAYS, Opens.ACTION),
                        Entry("description", "composer.object.editor.altText", "text.below.photo", "TextFields", Offer.ALWAYS, Opens.SHEET),
                    ),
                ),
                Level(
                    id = MEDIA_PLACED_EDIT,
                    kind = Kind.RAIL,
                    title = "composer.selection.modify",
                    entries = listOf(
                        Entry("crop", "composer.object.editor.crop", "crop", "Crop", Offer.IMAGE, Opens.BAND),
                        Entry("trim", "composer.capture.tool.trim", "scissors", "Cut", Offer.TRIMMABLE, Opens.BAND),
                        Entry("filters", "composer.object.editor.filter", "camera.filters", "PhotoFilter", Offer.ALWAYS, Opens.BAND),
                        Entry("frames", "composer.capture.rail.frames", "square.dashed", "CheckBoxBlank", Offer.LOOK, Opens.BAND),
                        Entry("adjust", "composer.object.editor.adjust", "slider.horizontal.3", "Tune", Offer.ALWAYS, Opens.BAND),
                        Entry("effects", "composer.object.editor.effects", "sparkles", "Sparkles", Offer.IMAGE, Opens.BAND),
                        Entry("sound", "composer.rail.title.sound", "speaker.wave.2", "VolumeUp", Offer.VIDEO, Opens.LEVEL, MEDIA_SOUND),
                        Entry("rotate", "composer.object.editor.rotate", "rotate.right", "RotateRight", Offer.ALWAYS, Opens.ACTION),
                        Entry("description", "composer.object.editor.altText", "text.below.photo", "TextFields", Offer.ALWAYS, Opens.SHEET),
                        Entry("set-as-background", "story.canvas.action.setAsBackground", "photo.on.rectangle", "Wallpaper", Offer.ALWAYS, Opens.ACTION),
                        Entry(
                            "replace-background", "story.canvas.action.replaceBackground", "photo.on.rectangle.angled", "SwapHorizontal",
                            Offer.ALWAYS, Opens.ACTION,
                        ),
                        Entry("make-sticker", "composer.selection.makeSticker", "person.crop.square.badge.camera", "Emoji", Offer.IMAGE, Opens.ACTION),
                    ),
                ),
                Level(
                    id = MEDIA_SOUND,
                    kind = Kind.RAIL,
                    title = "composer.rail.title.sound",
                    entries = listOf(
                        Entry("volume", "composer.capture.sound.volume", "speaker.wave.3", "VolumeUp", Offer.ALWAYS, Opens.BAND),
                        Entry("mute", "composer.object.editor.mute", "speaker.slash", "VolumeOff", Offer.ALWAYS, Opens.TOGGLE),
                    ),
                ),
            ),
        )
    }
}
