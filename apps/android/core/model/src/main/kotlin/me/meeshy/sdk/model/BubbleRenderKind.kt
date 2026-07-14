package me.meeshy.sdk.model

/**
 * Resolves what a chat bubble should actually render, composing the server-
 * authoritative deletion state with the client-side ephemeral (self-destruct)
 * countdown. Port of the `content.kind` dispatch in iOS `ThemedMessageBubble.body`
 * (the `.deleted` arm and the ephemeral-expired default arm).
 *
 * The decision is pure so it can be fully unit-tested off the clock; the collapse
 * animation and the tombstone composables are the coverage-exempt Compose glue that
 * ticks [EphemeralLifecycle] and feeds its [EphemeralLifecycle.State] here.
 */
object BubbleRenderKind {

    /** What a bubble renders once deletion and the ephemeral countdown are combined. */
    enum class Kind {
        /** Normal content bubble. */
        Standard,

        /** Server-side deleted — renders the "Message deleted" tombstone. */
        Deleted,

        /**
         * The ephemeral self-destruct countdown elapsed on a still-undeleted message:
         * the bubble collapses (iOS renders `EmptyView`; Android animates it away).
         */
        EphemeralExpired;

        /** True only for [EphemeralExpired] — the arm that hides the bubble. */
        val isEphemeralExpired: Boolean get() = this == EphemeralExpired
    }

    /**
     * Combines the server deletion flag with the ephemeral countdown [ephemeral]:
     *
     * - a deleted message is [Kind.Deleted] regardless of any expiry — server
     *   authority wins, mirroring iOS checking `.deleted` BEFORE the ephemeral arm,
     *   so a deleted-and-expired message still shows the deletion tombstone.
     * - otherwise, once the countdown reaches [EphemeralLifecycle.State.Expired] the
     *   bubble is [Kind.EphemeralExpired] (collapses).
     * - [EphemeralLifecycle.State.Running] / [EphemeralLifecycle.State.None] leave a
     *   [Kind.Standard] bubble.
     */
    fun resolve(isDeleted: Boolean, ephemeral: EphemeralLifecycle.State): Kind = when {
        isDeleted -> Kind.Deleted
        ephemeral is EphemeralLifecycle.State.Expired -> Kind.EphemeralExpired
        else -> Kind.Standard
    }
}
