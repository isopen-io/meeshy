package me.meeshy.sdk.model.game

import java.time.Instant
import java.time.ZoneId
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/*
 * LA FILE DES INVITATIONS À IMMORTALISER (#20655, tranche Android de #20643) — miroir de `createPhotoAlerts`
 * (`apps/web/src/lib/game-photo/alerts.ts`, #10174) et de `GamePhotoAlertQueue` (SDK Swift, #20653), réduit à sa LOI :
 * la mémoire appareil d'un compte entre, la mémoire suivante et la décision sortent. Ranger la mémoire, tenir la file de
 * un, construire les moments et accuser restent à l'hôte de l'app : ce module ne lit ni stockage ni réseau.
 *
 * La mémoire garde la DERNIÈRE SITUATION ANNONCÉE : c'est elle qui rattrape l'étape franchie app fermée, par différence
 * des étapes photographiables. La ligne de base SERVIE (`game.photo.baseline`) l'emporte quand elle existe ; sinon la
 * première lecture d'un compte sur l'appareil pose la situation SANS alerte.
 */

/**
 * La mémoire appareil d'un compte : dernière situation annoncée, invitations montrées (le rythme), étapes nouvelles
 * depuis la dernière visite du carnet (la pastille). Elle voyage dans la forme du web (`meeshy.game.photo-alerts.<id>`).
 */
public data class PhotoAlertMemory(
    val standing: PhotoCatchUpStanding?,
    val shown: List<PhotoAlertPacing.Shown>,
    val noticed: List<String>,
) {
    /** La pastille du carnet. */
    val hasNotice: Boolean get() = noticed.isNotEmpty()

    internal fun with(standing: PhotoCatchUpStanding): PhotoAlertMemory = copy(standing = standing)

    /** La mémoire rangée, relue à l'identique par [read]. */
    public fun encoded(): String = buildJsonObject {
        put("standing", standing?.let { Json.encodeToJsonElement(GamePhotoBaseline.serializer(), it.baseline) } ?: JsonNull)
        put(
            "shown",
            buildJsonArray {
                shown.forEach { entry ->
                    add(
                        buildJsonObject {
                            put("at", entry.at)
                            put("dayKey", entry.dayKey)
                        },
                    )
                }
            },
        )
        put("noticed", JsonArray(noticed.map { JsonPrimitive(it) }))
    }.toString()

    public companion object {
        public val Empty: PhotoAlertMemory = PhotoAlertMemory(standing = null, shown = emptyList(), noticed = emptyList())

        /** Relue depuis le stockage ; absente ou illisible, elle vaut « vide ». */
        public fun read(text: String?): PhotoAlertMemory = readGamePayload(text, ::parseMemory) ?: Empty

        private fun parseMemory(obj: JsonObject): PhotoAlertMemory = PhotoAlertMemory(
            standing = obj["standing"]?.takeUnless { it is JsonNull }?.let { element ->
                parsePhotoBaseline(element as? JsonObject ?: throw GameParseException("standing")).standing
            },
            shown = obj.optionalArray("shown").map { element ->
                val entry = element as? JsonObject ?: throw GameParseException("shown")
                PhotoAlertPacing.Shown(at = entry.reqLong("at"), dayKey = entry.reqString("dayKey"))
            },
            noticed = obj.optionalArray("noticed").map { element ->
                (element as? JsonPrimitive)?.takeIf { it.isString }?.content ?: throw GameParseException("noticed")
            },
        )

        private fun JsonObject.optionalArray(key: String): JsonArray =
            this[key]?.takeUnless { it is JsonNull }?.let { it as? JsonArray ?: throw GameParseException(key) } ?: JsonArray(emptyList())
    }
}

private val PhotoCatchUpStanding.baseline: GamePhotoBaseline
    get() = GamePhotoBaseline(rank, division, levelRecord, prestige, minted, treasuryTier, flameRecord, pastCycleRecords)

public object GamePhotoAlertQueue {

    /** Le rythme ne garde que les dernières invitations montrées. */
    public const val SHOWN_KEPT: Int = 12

    /** Ce qu'une lecture fraîche du jeu fait de la mémoire. */
    public sealed interface Observation {
        /** Première lecture du compte sur l'appareil : la situation se pose, sans alerte. */
        public data class Baseline(val memory: PhotoAlertMemory) : Observation

        /** Aucune étape neuve ; la mémoire à réécrire si la situation a bougé, `null` sinon. */
        public data class Unchanged(val memory: PhotoAlertMemory?) : Observation

        /** Les étapes franchies depuis la dernière situation annoncée, à décider ([decide]). */
        public data class Reached(val stepIds: List<String>) : Observation
    }

    public sealed interface Decision {
        /** La mémoire à ranger ; `null` : rien à réécrire. */
        public val memory: PhotoAlertMemory?

        /** Une étape passive attend la fin du délai de grâce : la mémoire n'avance pas. */
        public data object Wait : Decision {
            override val memory: PhotoAlertMemory? get() = null
        }

        public data class None(override val memory: PhotoAlertMemory) : Decision

        public data class Alert(val alert: PhotoAlert, override val memory: PhotoAlertMemory) : Decision
    }

    /** L'invitation montrée : la mémoire suivante et les étapes à accuser (`POST …/photo-moments/presented`). */
    public data class Displayed(val memory: PhotoAlertMemory, val acknowledge: List<String>)

    public fun observe(memory: PhotoAlertMemory, standing: PhotoCatchUpStanding, photo: GamePhotoBlock?): Observation {
        val previous = memory.standing ?: return Observation.Baseline(memory.with(standing))
        val policy = photo?.policy ?: PhotoAlertPolicy.Standard
        val before = stepIds(previous, policy).toSet()
        val reached = stepIds(standing, policy).filterNot { it in before }
        if (reached.isNotEmpty()) return Observation.Reached(reached)
        return Observation.Unchanged(if (standing == previous) null else memory.with(standing))
    }

    /**
     * [notebookKept] / [notebookKnown] : ce que le carnet de l'APPAREIL a gardé, et tout ce qu'il connaît (en attente
     * comprises). La situation avance dès qu'une décision est prise, alerte ou non.
     */
    public fun decide(
        memory: PhotoAlertMemory,
        reached: List<String>,
        standing: PhotoCatchUpStanding,
        photo: GamePhotoBlock?,
        notebookKept: List<String>,
        notebookKnown: List<String>,
        pacing: PhotoAlertPacing,
    ): Decision {
        val policy = photo?.policy ?: PhotoAlertPolicy.Standard
        if (GamePhotoAlerts.pacing(pacing, policy) == PhotoAlertPace.Wait) return Decision.Wait
        val next = memory.with(standing)
        val alert = GamePhotoAlerts.alert(
            reached = reached,
            standing = standing,
            kept = notebookKept + photo?.keptStepIds.orEmpty(),
            presented = photo?.presentedStepIds.orEmpty(),
            baseline = photo?.baselineStanding ?: memory.standing,
            policy = policy,
            treasuryPeak = photo?.treasuryPeakTier,
            pacing = pacing,
        )
        if (alert == null || alert.propose in notebookKnown) return Decision.None(next)
        return Decision.Alert(alert, next)
    }

    /** L'invitation est à l'écran : le rythme, la pastille, et les étapes à accuser. */
    public fun displayed(memory: PhotoAlertMemory, alert: PhotoAlert, at: Long, dayKey: String): Displayed = Displayed(
        memory = PhotoAlertMemory(
            standing = memory.standing,
            shown = (memory.shown + PhotoAlertPacing.Shown(at = at, dayKey = dayKey)).takeLast(SHOWN_KEPT),
            noticed = (memory.noticed + alert.announce + alert.propose).distinct(),
        ),
        acknowledge = (alert.reached + alert.propose).distinct(),
    )

    /** La visite du carnet éteint la pastille. */
    public fun carnetVisited(memory: PhotoAlertMemory): PhotoAlertMemory = memory.copy(noticed = emptyList())

    /** Les moments qu'une célébration remet (D6) : la réalisation du jour cède toujours à une étape de piste. */
    public fun admitted(momentIds: List<String>): List<String> {
        val tracked = momentIds.any { GamePhotoCatchUpLaw.track(it) != null }
        return momentIds.filter { !tracked || GamePhotoAlerts.dayOf(it) == null }
    }

    /** La journée locale `AAAA-MM-JJ` d'un instant en millisecondes. */
    public fun dayKey(atMillis: Long, zone: ZoneId = ZoneId.systemDefault()): String =
        Instant.ofEpochMilli(atMillis).atZone(zone).toLocalDate().toString()

    private fun stepIds(standing: PhotoCatchUpStanding, policy: PhotoAlertPolicy): List<String> =
        GamePhotoCatchUpLaw.stepsReached(standing, policy).map { it.id }
}
