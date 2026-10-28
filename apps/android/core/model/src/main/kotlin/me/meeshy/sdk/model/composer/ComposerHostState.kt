package me.meeshy.sdk.model.composer

import me.meeshy.sdk.model.MosaicLayoutMode
import me.meeshy.sdk.model.PostType
import me.meeshy.sdk.model.ReelComposition
import me.meeshy.sdk.model.ReelOffer
import me.meeshy.sdk.model.StoryVisibility

/**
 * The ONE composer's document, as the host sees it — port of the host-side state of iOS
 * `MeeshyComposerHost` (+Resolution, +Socle). The format is a FIELD of the document, never a door:
 * what the author composed (text, media, scene, audience) survives every format switch, and the
 * offer BREATHES with the composition (reel only while it qualifies, mood only while it is text).
 */
data class ComposerHostState(
    val intent: ComposerIntent,
    val text: String = "",
    val media: List<ReelComposition.MediaKind> = emptyList(),
    val hasScene: Boolean = false,
    val moodEmoji: String? = null,
    val audience: String? = null,
    val chosen: ComposerFormat? = null,
    /** Les médias téléversés du post (ids serveur) et ceux de la scène, tels que chaque surface les rapporte. */
    val postMedia: List<CarriedMedia> = emptyList(),
    val sceneMedia: List<CarriedMedia> = emptyList(),
    /** Les médias de la scène encore en file hors-ligne : sans id serveur, ils ne peuvent pas suivre. */
    val scenePending: Int = 0,
    /** Les places libres sur la slide qui reçoit. */
    val sceneRoom: Int = SCENE_ROOM,
    val postVisibility: StoryVisibility = StoryVisibility.PUBLIC,
    val storyVisibility: StoryVisibility = StoryVisibility.PUBLIC,
    /** Les ids présents des DEUX côtés depuis la dernière bascule : ce qu'on peut retirer d'un côté sans toucher à l'autre. */
    val synced: Set<String> = emptySet(),
    val holder: ComposerCarry.Side? = null,
    val carry: ComposerCarry? = null,
    /** The layout of the scenes the author armed (iOS `ComposerPublishChoice.layout`); `null` until chosen. */
    val layout: MosaicLayoutMode? = null,
    private val carrySeq: Int = 0,
    /** L'audience que la dernière bascule a POSÉE sur un côté : intacte au retour, elle ne revient pas écraser l'autre. */
    private val audienceSeed: Pair<ComposerCarry.Side, StoryVisibility>? = null,
    private val audienceSeedBefore: Pair<ComposerCarry.Side, StoryVisibility>? = null,
) {
    val reelGate: Boolean get() = ReelComposition.qualifiesAsReel(media)

    val moodGate: Boolean
        get() = ComposerMoodGate.qualifies(text, hasMedia = media.isNotEmpty(), hasScene = hasScene, moodEmoji = moodEmoji)

    val carriesMoreThanText: Boolean get() = media.isNotEmpty() || hasScene

    val hasContent: Boolean get() = text.isNotBlank() || carriesMoreThanText || !moodEmoji.isNullOrEmpty()

    private fun profile(reel: Boolean) =
        ComposerProfile.of(intent.origin, compositionQualifiesAsReel = reel, compositionQualifiesAsMood = moodGate)

    val profile: ComposerProfile get() = profile(reelGate)

    val offeredFormats: List<ComposerFormat> get() = profile.offeredFormats

    /** The format that GOVERNS — the surface mounted and the type published — never one the offer withdrew. */
    val selectedFormat: ComposerFormat
        get() = ComposerFormatFanPolicy.resolvedSelection(
            current = chosen ?: intent.openingFormat(compositionQualifiesAsReel = reelGate),
            offered = offeredFormats,
        )

    /** The menu: the door's formats with the reel kept open, so a reel not yet qualified is greyed with its reason. */
    val verdicts: List<FormatVerdict>
        get() = ComposerFormatAvailability.verdicts(profile(reel = true).offeredFormats, offeredFormats, carriesMoreThanText)

    /**
     * The layouts the menu offers for what is composed now — empty (no section) unless the post publishes a document of
     * several scenes: [PostPhotoScenes] gives one scene per photo, and nothing for any other media (#13612). The control
     * exists exactly where the publication carries its choice.
     */
    val layoutChoices: List<MosaicLayoutMode>
        get() = ComposerMosaicChoice.offered(PostPhotoScenes.sceneCount(postMedia.map { it.media.mimeType }, selectedFormat), selectedFormat)

    /** Only an offered layout can be armed; anything else leaves the state untouched. */
    fun chooseLayout(mode: MosaicLayoutMode): ComposerHostState = if (mode in layoutChoices) copy(layout = mode) else this

    /** A single entry is an affordance without choice: no chevron. */
    val hasFormatMenu: Boolean get() = verdicts.size > 1

    val working: ComposerWorkingState
        get() = ComposerWorkingState(selectedFormat, text, emptyList(), emptyList(), audience)

    /** One qualifying video composed as a plain post: offer the reel until the author states a format. */
    val offersReelForPost: Boolean
        get() {
            if (selectedFormat != ComposerFormat.POST) return false
            val reelIsChoosable = verdicts.any { it.format == ComposerFormat.REEL && it.isChoosable }
            return reelIsChoosable && ReelOffer.offersReelForPost(
                type = PostType.POST,
                media = media,
                isRepost = intent.origin.repostedPostId != null,
                isEdit = intent.origin is ComposerOrigin.Edit,
                formatChosenByAuthor = chosen != null,
            )
        }

    /**
     * Only a choosable format can be chosen; anything else leaves the state untouched. The media (and the
     * audience) of the surface being left are PLANNED onto the one being entered — [carry] — so the document
     * survives the switch; whatever cannot follow is counted, never silent.
     */
    fun choose(format: ComposerFormat): ComposerHostState {
        if (format !in offeredFormats) return this
        val chosenNow = copy(chosen = format)
        val target = ComposerCarry.Side.of(format) ?: return chosenNow
        val source = ComposerCarry.Side.of(selectedFormat) ?: holder
        if (source == null || source == target) return chosenNow
        val unapplied = carry?.takeIf { it.target == source }
        if (unapplied != null) {
            return chosenNow.copy(carry = null, synced = unapplied.ledgerBefore, audienceSeed = audienceSeedBefore)
        }
        return chosenNow.carrying(source, target)
    }

    private fun carrying(source: ComposerCarry.Side, target: ComposerCarry.Side): ComposerHostState {
        val toScene = target == ComposerCarry.Side.SCENE
        val plan = ComposerMediaTransfer.plan(
            source = if (toScene) postMedia else sceneMedia,
            targetIds = (if (toScene) sceneMedia else postMedia).map { it.media.id },
            ledger = synced,
            room = if (toScene) sceneRoom else (POST_ROOM - postMedia.size).coerceAtLeast(0),
            sourceLeftBehind = if (toScene) 0 else scenePending,
        )
        val sourceAudience = if (toScene) postVisibility else storyVisibility
        val targetAudience = if (toScene) storyVisibility else postVisibility
        val arrival = ComposerAudienceCarry.arrival(sourceAudience, toScene)
            .takeUnless { audienceSeed == (source to sourceAudience) }
        val audience = arrival?.takeIf { it != targetAudience }
        val next = ComposerCarry(target, plan, audience, token = carrySeq + 1, ledgerBefore = synced)
        return copy(
            synced = plan.synced,
            carrySeq = carrySeq + 1,
            carry = next.takeIf { !plan.isEmpty || plan.leftBehind > 0 || audience != null },
            audienceSeed = arrival?.let { target to it } ?: audienceSeed,
            audienceSeedBefore = audienceSeed,
        )
    }

    /** The target surface applied [token]'s carry: it is never applied twice. */
    fun carryApplied(token: Int): ComposerHostState = if (carry?.token == token) copy(carry = null) else this

    fun withPostDocument(media: List<CarriedMedia>, visibility: StoryVisibility) =
        copy(postMedia = media, postVisibility = visibility, holder = holderAfter(ComposerCarry.Side.POST, media))

    fun withSceneDocument(media: List<CarriedMedia>, pending: Int, room: Int, visibility: StoryVisibility) =
        copy(
            sceneMedia = media, scenePending = pending, sceneRoom = room, storyVisibility = visibility,
            holder = holderAfter(ComposerCarry.Side.SCENE, media),
        )

    private fun holderAfter(side: ComposerCarry.Side, media: List<CarriedMedia>) =
        if (media.isNotEmpty()) side else holder

    fun withText(value: String) = copy(text = value)
    fun withMedia(value: List<ReelComposition.MediaKind>) = copy(media = value)
    fun withScene(value: Boolean) = copy(hasScene = value)
    fun withMoodEmoji(value: String?) = copy(moodEmoji = value)
    fun withAudience(value: String?) = copy(audience = value)

    companion object {
        const val POST_ROOM: Int = 10
        const val SCENE_ROOM: Int = 10

        fun open(intent: ComposerIntent) = ComposerHostState(intent)
    }
}
