package me.meeshy.sdk.model.call.montage

import me.meeshy.sdk.model.call.group.GroupCallStageTile

/**
 * **QUI EST QUI DANS UNE CAPTURE** — miroir de `CallCaptureIdentity` (iOS, #8743) : les personnes de l'appel,
 * moi compris, telles qu'un cadre les écrit : le nom déjà vu dans l'appel, le @pseudo quand il est connu, et
 * MOI marqué. Une caméra coupée garde sa case : seul `showsVideo` le dit.
 */
public object CallCaptureIdentity {
    public const val REMOTE_DUO_ID: String = "duo-remote"
    public const val LOCAL_DUO_ID: String = "duo-local"

    /** Un pseudo vide n'en est pas un : le cadre écrit alors le nom à sa place. */
    public fun handle(username: String?): String? = username?.trim()?.takeIf { it.isNotEmpty() }

    /** Mon nom sur une image qui PART : celui que les autres me connaissent, jamais « Vous ». */
    public fun myName(displayName: String?, username: String?, fallback: String): String =
        listOf(displayName, username).mapNotNull { it?.trim() }.firstOrNull { it.isNotEmpty() } ?: fallback

    public fun me(name: String, username: String?, isMirrored: Boolean, showsVideo: Boolean): CallCaptureSubject =
        CallCaptureSubject(LOCAL_DUO_ID, name, handle(username), isSelf = true, isMirrored = isMirrored, showsVideo = showsVideo)

    /** Le duo : l'autre et moi, dans l'ordre de l'écran (`meFirst` quand les flux sont permutés). */
    public fun duo(
        me: CallCaptureSubject,
        remoteName: String,
        remoteUsername: String?,
        remoteShowsVideo: Boolean,
        meFirst: Boolean,
    ): List<CallCaptureSubject> {
        val remote = CallCaptureSubject(REMOTE_DUO_ID, remoteName, handle(remoteUsername), isSelf = false, isMirrored = false, showsVideo = remoteShowsVideo)
        return if (meFirst) listOf(me, remote) else listOf(remote, me)
    }

    /** Le groupe : une personne par tuile de la scène, dans son ordre ; le pseudo des autres n'est pas connu. */
    public fun group(
        tiles: List<GroupCallStageTile>,
        myName: String,
        myUsername: String?,
        isMyCaptureMirrored: Boolean,
    ): List<CallCaptureSubject> = tiles.map { tile ->
        CallCaptureSubject(
            id = tile.id,
            name = if (tile.isLocal) myName else tile.displayName,
            handle = if (tile.isLocal) handle(myUsername) else null,
            isSelf = tile.isLocal,
            isMirrored = tile.isLocal && isMyCaptureMirrored,
            showsVideo = tile.showsVideo,
        )
    }
}
