package me.meeshy.sdk.model.game

/*
 * LA LOI DE PROPOSITION DES CADRES DE GLOIRE (#10156, L4) — miroir de `packages/shared/utils/game/glory-frames.ts`
 * (`gloryFramesFor`) et de `GameGloryFrames` (SDK Swift), rejoué sur `packages/shared/design/packs/frame-offer-vectors.json`.
 * Sur divergence, le TypeScript a raison.
 *
 * Pour chaque étape du jeu : quels cadres proposer d'abord, selon l'atmosphère choisie, le dernier cadre gardé pour la
 * même famille et l'ensemble des packs installés OU embarqués. Moteur de règles SANS ÉTAT : ni horloge, ni réseau, ni
 * stockage. La loi d'usage (#10146) borne tout ce qui sort : chaque cadre proposé passe [FrameUsageLaw.canUseFrame].
 */

/** Les familles de moments du jeu qu'un cadre de moment peut servir. */
public enum class FrameMomentFamily(public val wire: String) {
    Tier("tier"), Meesh("meesh"), Treasury("treasury"), Flame("flame"), Day("day"), Level100("level-100"),
}

/** Les surfaces d'un cadre LIBRE. */
public enum class FreeFrameSurface(public val wire: String) {
    Call("call"), Photo("photo"), Video("video"), Avatar("avatar"), Banner("banner"),
}

/** Le média d'une capture caméra hors appel. */
public enum class FrameCaptureMedia { Photo, Video }

/** L'usage DÉCLARÉ d'un cadre. */
public sealed interface FrameUsage {
    public data class Free(val surfaces: List<FreeFrameSurface>) : FrameUsage
    public data class Rank(val rank: GloryRank, val division: Int?) : FrameUsage
    public data object Prestige : FrameUsage
    public data class Achievement(val rarity: GloryLaws.AchievementRarity?) : FrameUsage
    public data class Moment(val family: FrameMomentFamily) : FrameUsage
}

/** Le contexte qui demande un cadre : l'appel, une capture, une étape du jeu. */
public sealed interface FrameUseContext {
    public data object Call : FrameUseContext
    public data object Avatar : FrameUseContext
    public data object Banner : FrameUseContext
    public data class Capture(val media: FrameCaptureMedia) : FrameUseContext
    public data class Rank(val rank: GloryRank, val division: Int?) : FrameUseContext
    public data object Prestige : FrameUseContext
    public data class Achievement(val rarity: GloryLaws.AchievementRarity?) : FrameUseContext
    public data class Moment(val family: FrameMomentFamily) : FrameUseContext
}

public object FrameUsageLaw {

    /** `describeFrameUsage` : le libellé de puce d'un usage (« Rang Or II », « Appels vidéo »…), clé du catalogue + paramètres. */
    public fun describeFrameUsage(usage: FrameUsage): me.meeshy.sdk.model.pack.FrameUsageLabel =
        me.meeshy.sdk.model.pack.FrameUsageWire.describe(usage)

    /** LA règle : ce cadre peut-il servir ce contexte ? Un cadre libre ne sert jamais le jeu, un cadre du jeu ne sert que SON contexte. */
    public fun canUseFrame(usage: FrameUsage, context: FrameUseContext): Boolean = when (usage) {
        is FrameUsage.Free -> freeServes(usage.surfaces, context)
        is FrameUsage.Rank -> context is FrameUseContext.Rank && context.rank == usage.rank &&
            (usage.division == null || usage.division == context.division)
        FrameUsage.Prestige -> context == FrameUseContext.Prestige
        is FrameUsage.Achievement -> context is FrameUseContext.Achievement &&
            (usage.rarity == null || usage.rarity == context.rarity)
        is FrameUsage.Moment -> context is FrameUseContext.Moment && context.family == usage.family
    }

    /** Un cadre d'appel sert aussi la capture hors appel ; un cadre de capture seule ne sert JAMAIS l'appel. */
    private fun freeServes(surfaces: List<FreeFrameSurface>, context: FrameUseContext): Boolean = when (context) {
        FrameUseContext.Call -> FreeFrameSurface.Call in surfaces
        FrameUseContext.Avatar -> FreeFrameSurface.Avatar in surfaces
        FrameUseContext.Banner -> FreeFrameSurface.Banner in surfaces
        is FrameUseContext.Capture -> FreeFrameSurface.Call in surfaces ||
            (if (context.media == FrameCaptureMedia.Photo) FreeFrameSurface.Photo else FreeFrameSurface.Video) in surfaces
        is FrameUseContext.Rank, FrameUseContext.Prestige, is FrameUseContext.Achievement, is FrameUseContext.Moment -> false
    }
}

/** La Meesh n° 1, puis l'édition de la pièce (argent, or à chaque centième, prisme à chaque millième). */
public enum class MeeshFrameEdition(public val wire: String) { First("first"), Silver("silver"), Gold("gold"), Prism("prism") }

/** La cible d'un cadre ; `division` `null` : toutes les divisions (et le Mythe) ; `rarity` `null` : le cadre neutre. */
public sealed interface GloryFrameAppliesTo {
    public data class Rank(val rank: GloryRank, val division: Int?) : GloryFrameAppliesTo
    public data class Tier(val tier: LevelTierKey) : GloryFrameAppliesTo
    public data class Meesh(val edition: MeeshFrameEdition) : GloryFrameAppliesTo
    public data class Treasury(val tier: TreasuryTierKey) : GloryFrameAppliesTo
    public data class Flame(val days: Int) : GloryFrameAppliesTo
    public data object Day : GloryFrameAppliesTo
    public data class Achievement(val rarity: GloryLaws.AchievementRarity?) : GloryFrameAppliesTo
}

/** Où un cadre se range : sa collection, sa cible, sa décoration, ses motifs, et s'il est masqué des suggestions. */
public data class GloryFramePlacement(
    val collection: String,
    val appliesTo: GloryFrameAppliesTo,
    val option: String? = null,
    val motifs: List<String> = emptyList(),
    val hidden: Boolean = false,
)

/** Un cadre tel que la loi le lit : son identité, son usage et son placement. */
public data class GloryFrameOfferFrame(val id: String, val usage: FrameUsage, val placement: GloryFramePlacement)

/** Un pack du catalogue, dans l'ordre éditorial du registre ; `atmosphere` est la clé (`afrique`, `olympe`…) ou `null`. */
public data class GloryFrameOfferPack(
    val slug: String,
    val atmosphere: String?,
    val collections: List<String>,
    val frames: List<GloryFrameOfferFrame>,
)

public data class GloryFrameRef(val pack: String, val frameId: String)

public data class GloryFrameOtherPack(val pack: String, val atmosphere: String?, val installed: Boolean, val frames: List<GloryFrameRef>)

public data class GloryFramesOffer(
    val needsAtmosphere: Boolean = false,
    val suggested: List<GloryFrameRef> = emptyList(),
    val others: List<GloryFrameOtherPack> = emptyList(),
    val reinstall: String? = null,
    val preselected: GloryFrameRef? = null,
)

public object GameGloryFrames {

    /** L'atmosphère de « Choisir plus tard », installée par défaut et non retirable. */
    public const val DEFAULT_ATMOSPHERE: String = "afrique"

    private val atmosphereRanks = setOf(GloryRank.Ambassadeur, GloryRank.Orateur, GloryRank.Oracle, GloryRank.Legende, GloryRank.Mythe)

    /** `GLORY_FRAME_OFFER_EXEMPT_FAMILIES` : les familles d'étapes sans cadre à proposer aujourd'hui. */
    public val exemptFamilies: List<String> = listOf(
        "rank:murmure", "rank:echo", "rank:voix", "rank:conteur", "rank:passeur", "rank:polyglotte",
        "start", "level-100", "prestige", "trophy",
    )

    private sealed interface StepTarget {
        data class Rank(val rank: GloryRank, val division: Int?) : StepTarget
        data class Tier(val tier: LevelTierKey) : StepTarget
        data class Meesh(val edition: MeeshFrameEdition) : StepTarget
        data class Treasury(val key: String) : StepTarget
        data class Flame(val days: Int) : StepTarget
        data object Day : StepTarget
        data object Achievement : StepTarget
        data object Level100 : StepTarget
        data object Prestige : StepTarget
        data object None : StepTarget
    }

    private val positive = Regex("^[1-9]\\d*$")

    private fun stepTarget(stepId: String): StepTarget {
        val parts = stepId.split(":")
        val first = parts.getOrNull(1)
        val second = parts.getOrNull(2)
        return when (parts[0]) {
            "rank" -> rankTarget(first, second)
            "tier" -> LevelTierKey.entries.firstOrNull { GamePhotoCatchUpLaw.wire(it) == first }?.let(StepTarget::Tier) ?: StepTarget.None
            "meesh" -> meeshTarget(first)
            "treasury" -> first?.let(StepTarget::Treasury) ?: StepTarget.None
            "flame" -> first?.takeIf { positive.matches(it) }?.toIntOrNull()?.let(StepTarget::Flame) ?: StepTarget.None
            "day" -> StepTarget.Day
            "achievement" -> StepTarget.Achievement
            "level-100" -> StepTarget.Level100
            "prestige" -> StepTarget.Prestige
            else -> StepTarget.None
        }
    }

    private fun rankTarget(key: String?, division: String?): StepTarget {
        val rank = GloryRank.entries.firstOrNull { GamePhotoCatchUpLaw.wire(it) == key } ?: return StepTarget.None
        if (rank == GloryRank.Mythe) return if (division == "0") StepTarget.Rank(rank, null) else StepTarget.None
        val value = division?.takeIf { it.length == 1 }?.toIntOrNull()?.takeIf { it in 1..5 } ?: return StepTarget.None
        return StepTarget.Rank(rank, value)
    }

    private fun meeshTarget(first: String?): StepTarget {
        val number = first?.takeIf { positive.matches(it) }?.toIntOrNull() ?: return StepTarget.None
        val edition = when {
            number == 1 -> MeeshFrameEdition.First
            else -> when (GameMint.edition(number)) {
                MeeshEdition.Silver -> MeeshFrameEdition.Silver
                MeeshEdition.Gold -> MeeshFrameEdition.Gold
                MeeshEdition.Prism -> MeeshFrameEdition.Prism
            }
        }
        return StepTarget.Meesh(edition)
    }

    /** `frameUseContextOf` : le contexte de la loi d'usage pour une étape ; `null` : aucun cadre ne la sert. */
    public fun useContext(stepId: String, rarity: GloryLaws.AchievementRarity?): FrameUseContext? = when (val target = stepTarget(stepId)) {
        is StepTarget.Rank -> FrameUseContext.Rank(target.rank, target.division)
        is StepTarget.Tier -> FrameUseContext.Moment(FrameMomentFamily.Tier)
        is StepTarget.Meesh -> FrameUseContext.Moment(FrameMomentFamily.Meesh)
        is StepTarget.Treasury -> FrameUseContext.Moment(FrameMomentFamily.Treasury)
        is StepTarget.Flame -> FrameUseContext.Moment(FrameMomentFamily.Flame)
        StepTarget.Day -> FrameUseContext.Moment(FrameMomentFamily.Day)
        StepTarget.Level100 -> FrameUseContext.Moment(FrameMomentFamily.Level100)
        StepTarget.Prestige -> FrameUseContext.Prestige
        StepTarget.Achievement -> FrameUseContext.Achievement(rarity)
        StepTarget.None -> null
    }

    private fun ref(pack: GloryFrameOfferPack, frame: GloryFrameOfferFrame) = GloryFrameRef(pack.slug, frame.id)

    private fun byCollection(pack: GloryFrameOfferPack, frames: List<GloryFrameOfferFrame>, lastChosen: String?): List<GloryFrameOfferFrame> {
        val chosen = pack.frames.firstOrNull { it.id == lastChosen }?.placement?.collection
        val order = if (chosen == null) pack.collections else listOf(chosen) + pack.collections.filter { it != chosen }
        return order.flatMap { collection -> frames.filter { it.placement.collection == collection } }
    }

    private fun rankFrames(pack: GloryFrameOfferPack, rank: GloryRank, division: Int?, lastChosen: String?): List<GloryFrameOfferFrame> {
        val ofRank = byCollection(
            pack,
            pack.frames.filter { (it.placement.appliesTo as? GloryFrameAppliesTo.Rank)?.rank == rank },
            lastChosen,
        )
        val sameDivision = { frame: GloryFrameOfferFrame ->
            val frameDivision = (frame.placement.appliesTo as? GloryFrameAppliesTo.Rank)?.division
            frameDivision != null && frameDivision == division
        }
        return ofRank.filter(sameDivision) + ofRank.filterNot(sameDivision)
    }

    private fun matches(target: StepTarget, rarity: GloryLaws.AchievementRarity?): (GloryFrameOfferFrame) -> Boolean = { frame ->
        val applies = frame.placement.appliesTo
        when (target) {
            is StepTarget.Tier -> applies is GloryFrameAppliesTo.Tier && applies.tier == target.tier
            is StepTarget.Meesh -> applies is GloryFrameAppliesTo.Meesh && applies.edition == target.edition
            is StepTarget.Treasury -> applies is GloryFrameAppliesTo.Treasury && GamePhotoCatchUpLaw.wire(applies.tier) == target.key
            is StepTarget.Flame -> applies is GloryFrameAppliesTo.Flame && applies.days == target.days
            StepTarget.Day -> applies == GloryFrameAppliesTo.Day
            StepTarget.Achievement -> applies is GloryFrameAppliesTo.Achievement && applies.rarity == rarity
            else -> false
        }
    }

    /** D4 : un palier sans cadre dessiné prend celui du palier dessiné le plus proche EN DESSOUS. */
    private fun drawnTier(target: StepTarget.Tier, frames: List<GloryFrameOfferFrame>): StepTarget {
        val drawn = LevelTierKey.entries.take(target.tier.ordinal + 1).reversed().firstOrNull { candidate ->
            frames.any { (it.placement.appliesTo as? GloryFrameAppliesTo.Tier)?.tier == candidate }
        }
        return if (drawn == null) target else StepTarget.Tier(drawn)
    }

    private fun preselect(suggested: List<GloryFrameRef>, lastChosen: String?): GloryFrameRef? =
        suggested.firstOrNull { it.frameId == lastChosen } ?: suggested.firstOrNull()

    /** LA loi : les cadres proposés pour une étape. */
    public fun framesFor(
        stepId: String,
        atmosphere: String?,
        lastChosen: String?,
        catalog: List<GloryFrameOfferPack>,
        installed: Set<String>,
        rarity: GloryLaws.AchievementRarity? = null,
    ): GloryFramesOffer {
        val context = useContext(stepId, rarity) ?: return GloryFramesOffer()
        val packs = catalog.map { pack ->
            pack.copy(frames = pack.frames.filter { !it.placement.hidden && FrameUsageLaw.canUseFrame(it.usage, context) })
        }
        val ready = packs.filter { it.slug in installed }
        val target = stepTarget(stepId)
        if (target is StepTarget.Rank) {
            if (target.rank in atmosphereRanks) return atmosphereOffer(target, atmosphere, lastChosen, packs, installed)
            val suggested = ready.filter { it.atmosphere == null }.flatMap { pack ->
                rankFrames(pack, target.rank, target.division, lastChosen).map { ref(pack, it) }
            }
            return GloryFramesOffer(suggested = suggested, preselected = preselect(suggested, lastChosen))
        }
        val effective = if (target is StepTarget.Tier) drawnTier(target, ready.flatMap { it.frames }) else target
        fun matching(wanted: GloryLaws.AchievementRarity?): List<GloryFrameRef> = ready.flatMap { pack ->
            byCollection(pack, pack.frames.filter(matches(effective, wanted)), lastChosen).map { ref(pack, it) }
        }
        val own = matching(rarity)
        val suggested = if (own.isEmpty() && target == StepTarget.Achievement && rarity != null) matching(null) else own
        return GloryFramesOffer(suggested = suggested, preselected = preselect(suggested, lastChosen))
    }

    private fun atmosphereOffer(
        target: StepTarget.Rank,
        atmosphere: String?,
        lastChosen: String?,
        packs: List<GloryFrameOfferPack>,
        installed: Set<String>,
    ): GloryFramesOffer {
        val atmospheric = packs.filter { it.atmosphere != null }
        val chosen = atmosphere?.let { wanted -> atmospheric.firstOrNull { it.atmosphere == wanted } }
        val chosenReady = chosen != null && chosen.slug in installed
        val reinstall = if (chosen != null && !chosenReady) chosen.slug else null
        val base = if (chosenReady) chosen else atmospheric.firstOrNull { it.atmosphere == DEFAULT_ATMOSPHERE }
        fun framesOf(pack: GloryFrameOfferPack): List<GloryFrameRef> =
            rankFrames(pack, target.rank, target.division, lastChosen).map { ref(pack, it) }
        val suggested = if (base != null && base.slug in installed) framesOf(base) else emptyList()
        val others = atmospheric.filter { it.slug != base?.slug }
            .map { GloryFrameOtherPack(it.slug, it.atmosphere, it.slug in installed, framesOf(it)) }
            .filter { it.frames.isNotEmpty() }
        return GloryFramesOffer(atmosphere == null, suggested, others, reinstall, preselect(suggested, lastChosen))
    }
}
