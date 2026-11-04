package me.meeshy.sdk.model.composer

/**
 * Le compte ET l'environnement sous lesquels un brouillon est rangé (iOS `ComposerAutosaveAccount`) : un brouillon
 * n'est jamais servi hors du couple qui l'a écrit. [directoryName] est l'empreinte stable du couple, jamais l'identifiant.
 */
public data class ComposerAutosaveAccount(val directoryName: String) {
    public companion object {
        /** `null` quand l'un des deux manque : sans compte résolu, rien ne s'écrit. */
        public fun of(userId: String?, serverOrigin: String?): ComposerAutosaveAccount? {
            val user = userId?.trim().orEmpty()
            val origin = serverOrigin?.trim().orEmpty()
            if (user.isEmpty() || origin.isEmpty()) return null
            return ComposerAutosaveAccount(ComposerAutosaveFileName.fnv1a("$user@$origin"))
        }
    }
}

/** Le tiroir du brouillon sous un compte (iOS `ComposerAutosaveSlot`) : la création, ou une publication acceptée par la file. */
public data class ComposerAutosaveSlot(val directoryName: String) {
    /** L'identifiant de la mutation dont ce tiroir attend la confirmation ; `null` pour la création. */
    val publicationId: String?
        get() = if (directoryName.startsWith(PUBLICATION_PREFIX)) directoryName.removePrefix(PUBLICATION_PREFIX) else null

    public companion object {
        public const val PUBLICATION_PREFIX: String = "publication-"
        public val CREATION: ComposerAutosaveSlot = ComposerAutosaveSlot("creation")
        public fun publication(clientMutationId: String): ComposerAutosaveSlot =
            ComposerAutosaveSlot(PUBLICATION_PREFIX + clientMutationId)
    }
}

/** Ce que l'OUVERTURE permet au brouillon — décision pure, lue une fois (iOS `ComposerAutosaveOpening`). */
public enum class ComposerAutosaveOpening {
    /** Porte vierge : on reprend la création en cours. */
    RESTORES,

    /** Porte qui arrive avec sa matière (graine, partage) : on ne reprend rien, on n'écrit que si le tiroir est libre. */
    PRESERVES_STORED_DRAFT,

    /** Une édition ou une reprise tient son propre brouillon : rien ne s'écrit ici. */
    DISABLED;

    public companion object {
        public fun decide(opensEdition: Boolean, isSeeded: Boolean): ComposerAutosaveOpening = when {
            opensEdition -> DISABLED
            isSeeded -> PRESERVES_STORED_DRAFT
            else -> RESTORES
        }
    }
}

/** Ce que la capture d'une session devient sur disque. */
public enum class ComposerAutosaveAction { WRITE, DELETE, SKIP }

/**
 * Les trois règles d'écriture, en valeur (iOS `ComposerAutosaveController`), chacune fermant une perte :
 * - une session n'écrase JAMAIS un brouillon qu'elle n'a pas fait sien ([mayWrite]) ;
 * - vider la création n'efface que le brouillon que la session possède ([ownsStoredDraft]) ;
 * - après une publication acceptée ([discarded]), plus rien ne s'écrit.
 */
public data class ComposerAutosaveGate(
    val mayWrite: Boolean = false,
    val ownsStoredDraft: Boolean = false,
    val discarded: Boolean = false,
) {
    /** Le brouillon survivra-t-il à la fermeture ? */
    val keepsDraft: Boolean get() = mayWrite && !discarded

    /** La décision de capture : [hasContent] dit si la création porte quelque chose. */
    public fun actionFor(hasContent: Boolean): ComposerAutosaveAction = when {
        !mayWrite || discarded -> ComposerAutosaveAction.SKIP
        hasContent -> ComposerAutosaveAction.WRITE
        ownsStoredDraft -> ComposerAutosaveAction.DELETE
        else -> ComposerAutosaveAction.SKIP
    }

    /** L'écriture a eu lieu : la session possède désormais le tiroir. */
    public fun wrote(): ComposerAutosaveGate = copy(ownsStoredDraft = true)

    /** L'effacement a eu lieu : le tiroir n'est plus à elle. */
    public fun deleted(): ComposerAutosaveGate = copy(ownsStoredDraft = false)

    /** Publication acceptée : plus rien n'écrit, et le tiroir qu'elle possédait s'efface. */
    public fun discard(): ComposerAutosaveGate = copy(discarded = true, ownsStoredDraft = false)

    public companion object {
        /**
         * Rattache la session à son tiroir. Une porte qui reprend et trouve un brouillon le fait sien ; sans lui elle peut
         * écrire ; une porte semée n'écrit que si le tiroir est libre ; une porte désactivée n'écrit jamais.
         */
        public fun bind(opening: ComposerAutosaveOpening, hasAccount: Boolean, storedDraftExists: Boolean): ComposerAutosaveGate {
            if (!hasAccount || opening == ComposerAutosaveOpening.DISABLED) return ComposerAutosaveGate()
            return when (opening) {
                ComposerAutosaveOpening.RESTORES ->
                    ComposerAutosaveGate(mayWrite = true, ownsStoredDraft = storedDraftExists)
                else -> ComposerAutosaveGate(mayWrite = !storedDraftExists)
            }
        }
    }
}

/** Le calendrier d'écriture : débounce de 1,2 s, l'écriture elle-même hors du fil principal. */
public object ComposerAutosaveTiming {
    public const val DEBOUNCE_MS: Long = 1_200L
}
