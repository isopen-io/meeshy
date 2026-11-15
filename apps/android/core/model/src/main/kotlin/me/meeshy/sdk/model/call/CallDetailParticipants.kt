package me.meeshy.sdk.model.call

/** One row of the « Participants » section: a name and a face, never a presence. */
data class CallDetailParticipantRow(
    val name: String,
    val avatarUrl: String?,
)

/**
 * The « Participants » section of the call detail — port of iOS
 * `CallDetailSheet.participantsSection` (#8066). The gateway serves who joined a
 * group call, reader excluded, in join order; the section lists them as served.
 * A blank name falls back to the username, then to the screen's localised
 * [fallbackName]; an empty list means no section at all.
 */
object CallDetailParticipants {
    fun of(record: CallRecord, fallbackName: String): List<CallDetailParticipantRow> =
        record.participants.map { participant ->
            CallDetailParticipantRow(
                name = participant.displayName.ifBlank { participant.username.orEmpty() }.ifBlank { fallbackName },
                avatarUrl = participant.avatar?.takeIf { it.isNotBlank() },
            )
        }
}
