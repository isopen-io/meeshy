package me.meeshy.sdk.model.call.group

/** Les mots du nom d'un appel de groupe, dans la langue d'interface du moment (#13768). */
data class GroupCallTitleWording(
    val unknownMember: String,
    val everyone: String,
    val more: (shown: String, count: Int) -> String,
)

/**
 * Le nom d'un appel de groupe dont le principal est parti — iOS `GroupCallRoster.callTitle` : le titre du groupe ;
 * sinon deux membres puis « +N », un membre encore inconnu dit « Participant » ; personne, « Participants à l'appel ».
 * Une seule fonction pour l'écran, la pilule et la notification d'appel en cours (iOS `remoteUsername`).
 */
fun GroupCallTitle.text(wording: GroupCallTitleWording): String = when (this) {
    is GroupCallTitle.Group -> title
    GroupCallTitle.Everyone -> wording.everyone
    is GroupCallTitle.Members -> {
        val shown = names.joinToString(", ") { it.trim().ifEmpty { wording.unknownMember } }
        if (more > 0) wording.more(shown, more) else shown
    }
}
