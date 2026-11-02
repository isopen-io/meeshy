package me.meeshy.sdk.model.game.photo

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.game.GamePhotoCatchUpLaw

/*
 * L'INDEX DE LA CHRONIQUE (#9382, #10161, #13891) — miroir de `GamePhotoNotebook` (iOS) et de
 * `apps/web/src/lib/game-photo/notebook.ts`. Une entrée par MOMENT : garder une photo prend la place de l'attente du
 * même moment, une reprise remplace la précédente. « Plus tard » n'expire pas, et une étape de piste reportée ne s'y
 * écrit pas (elle se rattrape). Une photo GARDÉE ne s'efface jamais toute seule. La loi ne touche aucun disque : elle
 * dit quelle liste écrire et quels fichiers retirer, le carnet de l'appareil l'exécute.
 */

@Serializable
public enum class NotebookStatus {
    @SerialName("pending") Pending,
    @SerialName("kept") Kept,
}

/** LA RECETTE d'une photo (§ 5.13) : de quoi la recomposer. Chaque champ est facultatif. */
@Serializable
public data class NotebookRecipe(
    val frameId: String? = null,
    /** Selfie : oui ; galerie : non ; carte seule : rien. */
    val mirror: Boolean? = null,
)

@Serializable
public data class NotebookEntry(
    val moment: GamePhotoMoment,
    val status: NotebookStatus,
    /** Millisecondes depuis l'époque. */
    val createdAt: Long,
    val mode: PhotoMode? = null,
    /** L'image 9:16 composée. */
    val storyFile: String? = null,
    /** La photo d'origine réduite (1 440 px, JPEG q0,85) ; absente d'une carte seule. */
    val sourceFile: String? = null,
    val recipe: NotebookRecipe = NotebookRecipe(),
) {
    val momentId: String get() = moment.id

    /** Les fichiers que l'entrée occupe sur l'appareil. */
    val files: List<String> get() = listOfNotNull(storyFile, sourceFile)
}

/** `NoSpace` : le disque est plein, l'écran le dessine ; `Unavailable` : l'écriture est refusée. */
public enum class NotebookKeepOutcome { Kept, NoSpace, Unavailable }

/** Ce qu'une garde écrit : la liste nouvelle, et les fichiers de l'entrée remplacée qui ne servent plus. */
public data class NotebookKeepPlan(val entries: List<NotebookEntry>, val obsoleteFiles: List<String>)

public object GamePhotoNotebookIndex {

    /** La source gardée : bornée à 1 440 px de grand côté, JPEG q0,85 (§ 5.13). */
    public const val SOURCE_MAX_EDGE: Int = 1440
    public const val SOURCE_QUALITY: Int = 85

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = false }

    public fun decode(text: String): List<NotebookEntry> = json.decodeFromString(ListSerializer(NotebookEntry.serializer()), text)

    public fun encode(entries: List<NotebookEntry>): String = json.encodeToString(ListSerializer(NotebookEntry.serializer()), entries)

    /** Un nom de fichier sûr, tiré d'une identité de moment (`rank:voix:2` → `rank_voix_2`). */
    public fun sanitized(text: String): String = text.map { if (it.isLetterOrDigit() || it == '-') it else '_' }.joinToString("")

    public fun storyFile(momentId: String): String = "${sanitized(momentId)}-story.jpg"

    public fun sourceFile(momentId: String): String = "${sanitized(momentId)}-source.jpg"

    /** L'entrée d'une photo gardée. Une carte seule n'a pas de source. */
    public fun keptEntry(moment: GamePhotoMoment, mode: PhotoMode, hasSource: Boolean, recipe: NotebookRecipe, now: Long): NotebookEntry =
        NotebookEntry(
            moment = moment,
            status = NotebookStatus.Kept,
            createdAt = now,
            mode = mode,
            storyFile = storyFile(moment.id),
            sourceFile = if (hasSource) sourceFile(moment.id) else null,
            recipe = recipe,
        )

    /** Garder : l'entrée prend la place de toute entrée du même moment ; les fichiers qu'elle ne réécrit pas s'en vont. */
    public fun keep(entries: List<NotebookEntry>, entry: NotebookEntry): NotebookKeepPlan {
        val replaced = entries.filter { it.momentId == entry.momentId }
        val written = entry.files.toSet()
        return NotebookKeepPlan(
            entries = entries.filterNot { it.momentId == entry.momentId } + entry,
            obsoleteFiles = replaced.flatMap { it.files }.filterNot { it in written }.distinct(),
        )
    }

    /**
     * « Plus tard » : la liste à écrire, ou `null` quand rien ne change — une étape de piste se RATTRAPE (elle ne s'écrit
     * pas), une entrée déjà là (en attente ou gardée) ne se remplace pas par une attente.
     */
    public fun postpone(entries: List<NotebookEntry>, moment: GamePhotoMoment, now: Long): List<NotebookEntry>? {
        if (GamePhotoCatchUpLaw.track(moment.id) != null) return null
        if (entries.any { it.momentId == moment.id }) return null
        return entries + NotebookEntry(moment, NotebookStatus.Pending, now)
    }

    /** Retirer : la liste sans le moment, et ses fichiers ; `null` si le moment n'y est pas. */
    public fun remove(entries: List<NotebookEntry>, momentId: String): NotebookKeepPlan? {
        val target = entries.firstOrNull { it.momentId == momentId } ?: return null
        return NotebookKeepPlan(entries.filterNot { it.momentId == momentId }, target.files)
    }

    /** La plus récente d'abord. */
    public fun sorted(entries: List<NotebookEntry>): List<NotebookEntry> = entries.sortedByDescending { it.createdAt }

    /** Les identités des photos gardées : ce que le rattrapage retire. */
    public fun keptIds(entries: List<NotebookEntry>): Set<String> =
        entries.filter { it.status == NotebookStatus.Kept }.map { it.momentId }.toSet()

    /** « En attente » ne garde que les moments NON déductibles : une étape de piste n'apparaît que dans « À rattraper ». */
    public fun pending(entries: List<NotebookEntry>): List<NotebookEntry> =
        entries.filter { it.status == NotebookStatus.Pending && GamePhotoCatchUpLaw.track(it.momentId) == null }

    /** La taille réduite d'une source : le grand côté borné à [SOURCE_MAX_EDGE], jamais agrandie. */
    public fun reducedSize(width: Int, height: Int): Pair<Int, Int> {
        if (width <= 0 || height <= 0) return 0 to 0
        val ratio = minOf(1.0, SOURCE_MAX_EDGE.toDouble() / maxOf(width, height))
        return Math.round(width * ratio).toInt() to Math.round(height * ratio).toInt()
    }
}
