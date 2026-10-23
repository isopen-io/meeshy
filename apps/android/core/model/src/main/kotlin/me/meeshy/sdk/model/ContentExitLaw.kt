package me.meeshy.sdk.model

/**
 * **La loi de sortie** (#9572, #9573) — « un contenu qui disparaît ne sort pas de Meeshy ».
 *
 * Un message a une NATURE de disparition, lue sur le message ET sur chacune de ses
 * pièces jointes — la plus restrictive gagne — et cette nature rend trois verdicts :
 *
 * | nature | transférer | enregistrer, imager, partager, publier | capture |
 * |---|---|---|---|
 * | [Nature.ORDINARY] | oui | oui | libre |
 * | [Nature.TIMED_FLAME] | oui, durée ≤ source | non | annoncée |
 * | [Nature.AFTER_READ_FLAME] | non | non | annoncée |
 * | [Nature.VIEW_ONCE] | non | non | bloquée |
 *
 * FERMÉ PAR DÉFAUT : un contenu DÉCLARÉ éphémère dont la durée ne se lit pas (bit
 * `EPHEMERAL` nu, `expiresAt` sans `ephemeralDuration`) reçoit les verdicts de la flamme
 * après lecture. `expiresAt` n'est jamais une durée : c'est l'heure interne de destruction.
 *
 * Le FLOU et le CHIFFREMENT ne sont pas des natures : ils gardent leurs propres
 * restrictions, composées par [MessageExitOffer].
 *
 * Miroirs : `contentExitLaw` (`packages/shared/utils/content-exit-law.ts`, qui fait foi) et
 * `ContentExitLaw.swift` (iOS). Toute évolution touche les trois.
 */
data class ContentExitLaw(
    val nature: Nature,
    val forward: ForwardVerdict,
    /** Enregistrer, imager, partager hors de Meeshy, publier en post, réel ou story. */
    val exportable: Boolean,
    val capture: CaptureVerdict,
) {

    enum class Nature { ORDINARY, TIMED_FLAME, AFTER_READ_FLAME, VIEW_ONCE }

    enum class ForwardRefusal { VIEW_ONCE, AFTER_READ }

    sealed interface ForwardVerdict {
        /** `maxDurationSeconds` nul ⇒ aucune borne ; sinon la copie dure AU PLUS autant. */
        data class Allowed(override val maxDurationSeconds: Int?) : ForwardVerdict
        data class Refused(val reason: ForwardRefusal) : ForwardVerdict

        val isAllowed: Boolean get() = this is Allowed
        val maxDurationSeconds: Int? get() = null
    }

    /** `FREE` : rien. `ANNOUNCED` : capture permise, annoncée. `BLOCKED` : noire, et la tentative annoncée. */
    enum class CaptureVerdict {
        FREE,
        ANNOUNCED,
        BLOCKED;

        /** Une capture de ce contenu se DÉCLARE à la passerelle (#9617). */
        val isDeclared: Boolean get() = this != FREE

        /**
         * Un contenu qui disparaît est soit ANNONCÉ, soit NOIR — jamais capturé en silence.
         * Une flamme ne quitte la couche sécurisée QUE sur une surface qui annonce sa
         * capture ; fermé par défaut.
         */
        fun shieldsCapture(surfaceAnnounces: Boolean = false): Boolean = when (this) {
            FREE -> false
            ANNOUNCED -> !surfaceAnnounces
            BLOCKED -> true
        }
    }

    /** Ce que la loi lit d'une pièce jointe — ses propres drapeaux, indépendants du message. */
    data class Piece(
        val isViewOnce: Boolean? = null,
        val isBlurred: Boolean? = null,
        val effectFlags: Long? = null,
    )

    /** Ce que la loi lit d'un message. Tout est facultatif : un champ absent ne déclare rien. */
    data class Subject(
        val isViewOnce: Boolean? = null,
        val isBlurred: Boolean? = null,
        val effectFlags: Long? = null,
        val ephemeralDuration: Double? = null,
        /** Sa seule PRÉSENCE déclare un éphémère ; elle ne donne jamais la durée. */
        val hasExpiry: Boolean = false,
        val attachments: List<Piece?>? = null,
    )

    /** Ce qu'une requête de transfert demande pour sa copie. */
    data class CopyRequest(
        val effectFlags: Long? = null,
        val isBlurred: Boolean? = null,
        val ephemeralDuration: Double? = null,
    )

    /** Les colonnes de protection que porte la copie transférée. */
    data class CopyProtection(
        val effectFlags: Long,
        val isBlurred: Boolean,
        val ephemeralDuration: Int?,
    ) {
        /** La copie relue comme un sujet — ce que le transfert SUIVANT jugera. */
        val subject: Subject
            get() = Subject(
                isBlurred = isBlurred,
                effectFlags = effectFlags,
                ephemeralDuration = ephemeralDuration?.toDouble(),
            )
    }

    companion object {
        val Ordinary = ContentExitLaw(
            Nature.ORDINARY, ForwardVerdict.Allowed(null), exportable = true, capture = CaptureVerdict.FREE,
        )

        val AfterReadFlame = ContentExitLaw(
            Nature.AFTER_READ_FLAME, ForwardVerdict.Refused(ForwardRefusal.AFTER_READ),
            exportable = false, capture = CaptureVerdict.ANNOUNCED,
        )

        val ViewOnce = ContentExitLaw(
            Nature.VIEW_ONCE, ForwardVerdict.Refused(ForwardRefusal.VIEW_ONCE),
            exportable = false, capture = CaptureVerdict.BLOCKED,
        )

        fun timedFlame(seconds: Int): ContentExitLaw = ContentExitLaw(
            Nature.TIMED_FLAME, ForwardVerdict.Allowed(seconds),
            exportable = false, capture = CaptureVerdict.ANNOUNCED,
        )

        private const val EPHEMERAL_BITS: Long =
            MessageEffectFlags.EPHEMERAL or MessageEffectFlags.EPHEMERAL_AFTER_READ

        /** Une durée en secondes ENTIÈRES strictement positives, ou rien. */
        internal fun wholeSeconds(value: Double?): Int? {
            if (value == null || !value.isFinite()) return null
            val seconds = Math.floor(value)
            if (seconds <= 0.0) return null
            return if (seconds >= Int.MAX_VALUE.toDouble()) Int.MAX_VALUE else seconds.toInt()
        }

        private fun blurred(column: Boolean?, flags: Long?): Boolean =
            column == true || ((flags ?: 0L) and MessageEffectFlags.BLURRED) != 0L

        fun of(subject: Subject?): ContentExitLaw {
            if (subject == null) return Ordinary
            val pieces = subject.attachments.orEmpty().filterNotNull()
            val flags = pieces.fold(subject.effectFlags ?: 0L) { acc, piece -> acc or (piece.effectFlags ?: 0L) }

            val viewOnce = subject.isViewOnce == true ||
                pieces.any { it.isViewOnce == true } ||
                (flags and MessageEffectFlags.VIEW_ONCE) != 0L
            if (viewOnce) return ViewOnce

            if ((flags and MessageEffectFlags.EPHEMERAL_AFTER_READ) != 0L) return AfterReadFlame

            val declaredEphemeral = (flags and MessageEffectFlags.EPHEMERAL) != 0L || subject.hasExpiry
            val duration = wholeSeconds(subject.ephemeralDuration)
                ?: return if (declaredEphemeral) AfterReadFlame else Ordinary
            return timedFlame(duration)
        }

        /**
         * Les colonnes de protection de la COPIE qu'un transfert crée — `null` quand la
         * source ne se transfère pas. Flamme à durée ⇒ `min(demandée, source)` avec les bits
         * éphémères ; le flou de la source (message OU pièce) est imposé sur toute nature.
         */
        fun forwardedCopyProtection(source: Subject?, requested: CopyRequest?): CopyProtection? {
            val verdict = of(source).forward as? ForwardVerdict.Allowed ?: return null
            val requestedFlags = requested?.effectFlags ?: 0L
            val pieces = source?.attachments.orEmpty().filterNotNull()
            val isBlurred = blurred(source?.isBlurred, source?.effectFlags) ||
                pieces.any { blurred(it.isBlurred, it.effectFlags) } ||
                blurred(requested?.isBlurred, requested?.effectFlags)
            val blurBit = if (isBlurred) MessageEffectFlags.BLURRED else 0L
            val requestedDuration = wholeSeconds(requested?.ephemeralDuration)
            val max = verdict.maxDurationSeconds
                ?: return CopyProtection(requestedFlags or blurBit, isBlurred, requestedDuration)
            return CopyProtection(
                effectFlags = (requestedFlags and EPHEMERAL_BITS.inv()) or EPHEMERAL_BITS or blurBit,
                isBlurred = isBlurred,
                ephemeralDuration = minOf(requestedDuration ?: max, max),
            )
        }
    }
}

/** Une durée offerte par la feuille de transfert d'une flamme à durée. */
data class ForwardDurationChoice(val seconds: Int) {

    /** Libellé compact, sans mot à traduire : « 30s », « 1min 30s », « 2h ». */
    val label: String
        get() {
            val hours = seconds / 3600
            val minutes = (seconds % 3600) / 60
            val rest = seconds % 60
            val parts = listOfNotNull(
                if (hours > 0) "${hours}h" else null,
                if (minutes > 0) "${minutes}min" else null,
                if (rest > 0) "${rest}s" else null,
            )
            return if (parts.isEmpty()) "0s" else parts.joinToString(" ")
        }
}

/** Les durées que la feuille offre : paliers ≤ source ; une durée hors palier s'affiche EN TÊTE. */
val ContentExitLaw.ForwardVerdict.durationChoices: List<ForwardDurationChoice>
    get() {
        val max = maxDurationSeconds ?: return emptyList()
        val tiers = EphemeralDuration.entries.map { it.seconds }.filter { it <= max }
        val head = if (max in tiers) emptyList() else listOf(max)
        return (head + tiers).map(::ForwardDurationChoice)
    }

/** La durée qui part dans `ephemeralDuration` : le choix, ramené à la source ; `null` sans borne. */
fun ContentExitLaw.ForwardVerdict.requestedDuration(chosen: Int?): Int? {
    val max = maxDurationSeconds ?: return null
    if (chosen == null || chosen <= 0) return max
    return minOf(chosen, max)
}

/** Le verdict d'un LOT transféré ensemble : refusé dès qu'un message l'est, sinon borné par la plus longue flamme. */
fun List<ContentExitLaw.ForwardVerdict>.batch(): ContentExitLaw.ForwardVerdict =
    firstOrNull { !it.isAllowed } ?: ContentExitLaw.ForwardVerdict.Allowed(mapNotNull { it.maxDurationSeconds }.maxOrNull())
