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

    /** What a bubble renders once deletion, view-once consumption and the countdown combine. */
    enum class Kind {
        /** Normal content bubble. */
        Standard,

        /** Server-side deleted — renders the "Message deleted" tombstone. */
        Deleted,

        /**
         * A view-once message whose server view-count has been consumed: it renders
         * the persistent "Seen and deleted" burned tombstone (iOS `BubbleBurnedView`,
         * gated on `message.isViewOnce && message.viewOnceCount > 0`). Like deletion this
         * is server-authoritative, so it wins over the client-side ephemeral collapse.
         */
        Burned,

        /**
         * The ephemeral self-destruct countdown elapsed on a still-undeleted message:
         * the bubble collapses (iOS renders `EmptyView`; Android animates it away).
         */
        EphemeralExpired;

        /** True only for [EphemeralExpired] — the arm that hides the bubble. */
        val isEphemeralExpired: Boolean get() = this == EphemeralExpired

        /** True only for [Burned] — the arm that shows the "Seen and deleted" tombstone. */
        val isBurned: Boolean get() = this == Burned
    }

    /**
     * Combines the server deletion flag, the view-once consume count and the ephemeral
     * countdown [ephemeral] into a single render decision. Precedence — highest first:
     *
     * - a deleted message is [Kind.Deleted] regardless of anything else — server
     *   authority wins, mirroring iOS checking `.deleted` BEFORE the burned/ephemeral
     *   arms, so a deleted-and-expired message still shows the deletion tombstone.
     * - an un-deleted view-once message whose count has been consumed
     *   ([isViewOnce] && [viewOnceCount] > 0) is [Kind.Burned] — the persistent
     *   "Seen and deleted" tombstone, checked BEFORE the ephemeral arm so a consumed
     *   view-once message shows the tombstone instead of silently collapsing. A
     *   positive [viewOnceCount] on a non-view-once message never burns.
     * - otherwise, once the countdown reaches [EphemeralLifecycle.State.Expired] the
     *   bubble is [Kind.EphemeralExpired] (collapses).
     * - [EphemeralLifecycle.State.Running] / [EphemeralLifecycle.State.None] leave a
     *   [Kind.Standard] bubble.
     */
    fun resolve(
        isDeleted: Boolean,
        ephemeral: EphemeralLifecycle.State,
        isViewOnce: Boolean = false,
        viewOnceCount: Int = 0,
    ): Kind = when {
        isDeleted -> Kind.Deleted
        isViewOnce && viewOnceCount > 0 -> Kind.Burned
        ephemeral is EphemeralLifecycle.State.Expired -> Kind.EphemeralExpired
        else -> Kind.Standard
    }
}
