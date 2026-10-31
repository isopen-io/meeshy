package me.meeshy.sdk.model.composer

import me.meeshy.sdk.model.MosaicLayoutMode
import me.meeshy.sdk.model.PostType
import me.meeshy.sdk.model.ReelComposition
import me.meeshy.sdk.model.ReelOffer

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
    /** Les scènes publiables que la scène rapporte : ce que la disposition range (#13863). */
    val sceneCount: Int = 0,
    /** The layout of the scenes the author armed (iOS `ComposerPublishChoice.layout`); `null` until chosen. */
    val layout: MosaicLayoutMode? = null,
    /**
     * Les formats que l'auteur a COCHÉS au chevron (#13919, décision porteur du 2026-10-31) : un ensemble ordonné comme le
     * menu, jamais vide une fois posé ; vide, le seul format qui gouverne part. L'offre filtre à la lecture : un format
     * qu'elle retire cesse de partir, et revient coché si la composition le qualifie de nouveau.
     */
    val checked: List<ComposerFormat> = emptyList(),
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

    /** The single format the door or the author's last exclusive choice resolves to, never one the offer withdrew. */
    private val soleFormat: ComposerFormat
        get() = ComposerFormatFanPolicy.resolvedSelection(
            current = chosen ?: intent.openingFormat(compositionQualifiesAsReel = reelGate),
            offered = offeredFormats,
        )

    /**
     * Ce qui PART d'un seul geste (#13919) : les formats cochés que l'offre sert encore, dans l'ordre du menu, sinon le seul
     * format qui gouverne. Jamais vide. L'humeur ne se cumule pas : elle a sa feuille.
     */
    val publishedFormats: List<ComposerFormat>
        get() = checked.filter { it in offeredFormats && it.cumulates }.ifEmpty { listOf(soleFormat) }

    /** The format that GOVERNS — the surface mounted — is the FIRST published one: checking another never moves the scene. */
    val selectedFormat: ComposerFormat get() = publishedFormats.first()

    private val menuOrder: List<ComposerFormat> get() = profile(reel = true).offeredFormats

    /** Une publication rouverte se modifie dans SON format : rien ne s'y cumule. */
    private val cumulates: Boolean get() = intent.origin !is ComposerOrigin.Edit

    /**
     * Coche ou décoche [format] (#13919) : un format refusé ne se coche pas, le dernier coché ne se décoche pas, et
     * l'humeur — ou une modification — reste un choix exclusif ([choose]).
     */
    fun toggle(format: ComposerFormat): ComposerHostState {
        if (format !in offeredFormats) return this
        val current = publishedFormats
        if (!cumulates || !format.cumulates || current.any { !it.cumulates }) return choose(format)
        val next = if (format in current) current - format else current + format
        if (next.isEmpty()) return this
        val ordered = menuOrder.filter { it in next }
        return copy(chosen = ordered.first(), checked = ordered)
    }

    /** Un brouillon rouvert rend ses formats cochés ; ceux que la porte n'offre jamais sont oubliés. */
    fun restore(formats: List<ComposerFormat>): ComposerHostState {
        val ordered = menuOrder.filter { it in formats && it.cumulates }
        if (ordered.isEmpty()) return formats.firstOrNull()?.let(::choose) ?: this
        if (!cumulates) return choose(ordered.first())
        return copy(chosen = ordered.first(), checked = ordered)
    }

    /** The menu: the door's formats with the reel kept open, so a reel not yet qualified is greyed with its reason. */
    val verdicts: List<FormatVerdict>
        get() = ComposerFormatAvailability.verdicts(profile(reel = true).offeredFormats, offeredFormats, carriesMoreThanText)

    /**
     * The layouts the menu offers for what is composed now — empty (no section) unless the post publishes a document of
     * several scenes (#13863 R2): the control exists exactly where the publication carries its choice.
     */
    val layoutChoices: List<MosaicLayoutMode>
        get() = ComposerFormatVariant.of(selectedFormat).layouts(sceneCount)

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
     * Only a choosable format can be chosen; anything else leaves the state untouched. Story, post and reel compose on the
     * SAME scene (#13863 R1): switching changes the format and nothing else — nothing to carry, nothing left behind.
     */
    fun choose(format: ComposerFormat): ComposerHostState =
        if (format in offeredFormats) copy(chosen = format, checked = emptyList()) else this

    fun withText(value: String) = copy(text = value)
    fun withMedia(value: List<ReelComposition.MediaKind>) = copy(media = value)
    fun withScene(value: Boolean) = copy(hasScene = value)
    fun withMoodEmoji(value: String?) = copy(moodEmoji = value)
    fun withAudience(value: String?) = copy(audience = value)
    fun withSceneCount(value: Int) = copy(sceneCount = value)

    companion object {
        fun open(intent: ComposerIntent) = ComposerHostState(intent)
    }
}

/** Story, post et réel se cumulent ; l'humeur, qui n'a pas de scène, part seule. */
private val ComposerFormat.cumulates: Boolean get() = this != ComposerFormat.STATUS
