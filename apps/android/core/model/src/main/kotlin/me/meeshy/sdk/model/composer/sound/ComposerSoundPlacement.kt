package me.meeshy.sdk.model.composer.sound

import me.meeshy.sdk.model.BorrowedSound
import me.meeshy.sdk.model.BorrowedSoundPost
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.composer.SceneObjectCaps
import me.meeshy.sdk.model.scene.toggledMute

sealed interface SoundPlacement {
    data class Placed(val audios: List<StoryAudioPlayerObject>) : SoundPlacement

    /** La scène porte déjà son plafond de pistes : rien ne se pose, l'UI le dit. */
    data object Refused : SoundPlacement
}

/** Un son de l'étagère tel que la piste empruntée le porte. */
fun ApiSound.toBorrowed(): BorrowedSound = BorrowedSound(
    id = id,
    title = title,
    fileUrl = fileUrl,
    durationMs = durationMs,
    waveform = waveform,
    uploaderUsername = uploader?.username,
    createdAt = createdAt,
)

/**
 * Où un son va quand l'auteur l'emprunte — miroir de `ComposerBackgroundSoundReplacement` et de
 * `ComposerSceneSoundTrace` (iOS). Une slide a UNE ambiance et N sons posés : emprunter pose le son EN FOND.
 *
 * - Un fond EMPRUNTÉ qui en remplace un autre ne perd rien : il se retrouve sur l'étagère (`soundId`).
 * - Un fond CAPTÉ (un enregistrement) n'a, lui, aucun autre foyer : il DESCEND au premier plan au lieu de
 *   disparaître — « deux vocaux en fond = 2 cartes » (#4695), un défaut qui perd des données en silence ne se
 *   corrige pas par un autre.
 */
object ComposerSoundPlacement {

    fun background(audios: List<StoryAudioPlayerObject>): StoryAudioPlayerObject? =
        audios.firstOrNull { it.isBackground == true }

    /**
     * L'identifiant de l'objet à retirer avant de poser un nouveau fond ; `null` sans fond, ou pour un fond LEGACY
     * synthétisé qu'aucun objet ne porte (le retirer passerait pour un retrait qui n'a pas eu lieu).
     */
    fun supersededId(background: StoryAudioPlayerObject?, audios: List<StoryAudioPlayerObject>): String? {
        if (background == null) return null
        return background.id.takeIf { id -> audios.any { it.id == id } }
    }

    fun borrow(audios: List<StoryAudioPlayerObject>, sound: ApiSound): SoundPlacement {
        val current = background(audios)
        if (current?.soundId == sound.id) return SoundPlacement.Placed(audios)
        val superseded = supersededId(current, audios)?.let { id -> audios.first { it.id == id } }
        val kept = audios.map { track ->
            when {
                track !== superseded -> track
                StoryAudioIdentity.isRecording(track) -> track.copy(isBackground = false)
                else -> null
            }
        }.filterNotNull().filterNot { it.soundId == sound.id }
        if (kept.size >= SceneObjectCaps.AUDIO) return SoundPlacement.Refused
        return SoundPlacement.Placed(kept + BorrowedSoundPost.audioObject(sound.toBorrowed(), isBackground = true))
    }

    fun remove(audios: List<StoryAudioPlayerObject>, id: String): List<StoryAudioPlayerObject> =
        audios.filterNot { it.id == id }

    /** Le muet LOCAL : volume 0 avec mémento, la piste reste posée (miroir de la bascule iOS). */
    fun toggleMute(audios: List<StoryAudioPlayerObject>, id: String): List<StoryAudioPlayerObject> =
        audios.map { if (it.id == id) it.toggledMute() else it }

    /**
     * La trace du fond sur la scène : un outil ouvert occupe la zone basse SEUL (même règle que
     * `ComposerObjectChips.isServed`), donc la trace s'efface — le MODE du rail, jamais la présence d'un panneau.
     */
    fun traceServed(background: StoryAudioPlayerObject?, toolIsOpen: Boolean): StoryAudioPlayerObject? =
        if (toolIsOpen) null else background
}
