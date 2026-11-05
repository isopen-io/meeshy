package me.meeshy.app.packs

import android.content.Context
import androidx.annotation.StringRes
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton
import me.meeshy.sdk.model.game.FrameUsage
import me.meeshy.sdk.model.pack.FrameUsageLabelKey
import me.meeshy.sdk.model.pack.FrameUsageText
import me.meeshy.sdk.pack.FrameUsageCopy
import me.meeshy.feature.game.R as GameR
import me.meeshy.ui.R as UiR

/**
 * **Le libellé d'usage d'un cadre, nommé par le jeu** (miroir de `FrameUsageCopy`, iOS) : « Rang Ambassadeur IV
 * uniquement ». Le format vient de `:sdk-ui`, les noms du rang et de la rareté de `:feature:game`, celui de la famille de
 * moment de `:sdk-ui` — jamais la valeur brute de la loi quand un nom existe.
 */
internal class AndroidFrameUsageCopy(private val context: Context) : FrameUsageCopy {

    override fun text(usage: FrameUsage): String = FrameUsageText.text(usage, ::name, ::format)

    private fun format(key: String): String = formatRes(key)?.let(context::getString) ?: key

    private fun name(parameter: String, value: String): String {
        val res = when (parameter) {
            "rank" -> rankRes(value)
            "rarity" -> rarityRes(value)
            "family" -> familyRes(value)
            else -> null
        }
        return res?.let(context::getString) ?: value
    }

    internal companion object {
        @StringRes
        fun formatRes(key: String): Int? = when (key) {
            FrameUsageLabelKey.CALL_AND_CAPTURE -> UiR.string.frame_usage_callAndCapture
            FrameUsageLabelKey.CAPTURE_ONLY -> UiR.string.frame_usage_captureOnly
            FrameUsageLabelKey.PHOTO_ONLY -> UiR.string.frame_usage_photoOnly
            FrameUsageLabelKey.VIDEO_ONLY -> UiR.string.frame_usage_videoOnly
            FrameUsageLabelKey.RANK_ONLY -> UiR.string.frame_usage_rankOnly
            FrameUsageLabelKey.RANK_DIVISION_ONLY -> UiR.string.frame_usage_rankDivisionOnly
            FrameUsageLabelKey.PRESTIGE_ONLY -> UiR.string.frame_usage_prestigeOnly
            FrameUsageLabelKey.ACHIEVEMENT_ONLY -> UiR.string.frame_usage_achievementOnly
            FrameUsageLabelKey.ACHIEVEMENT_RARITY_ONLY -> UiR.string.frame_usage_achievementRarityOnly
            FrameUsageLabelKey.MOMENT_ONLY -> UiR.string.frame_usage_momentOnly
            FrameUsageLabelKey.AVATAR_ONLY -> UiR.string.frame_usage_avatarOnly
            FrameUsageLabelKey.BANNER_FRAME_ONLY -> UiR.string.frame_usage_bannerFrameOnly
            else -> null
        }

        @StringRes
        fun rankRes(value: String): Int? = when (value) {
            "murmure" -> GameR.string.game_rank_murmure
            "echo" -> GameR.string.game_rank_echo
            "voix" -> GameR.string.game_rank_voix
            "conteur" -> GameR.string.game_rank_conteur
            "passeur" -> GameR.string.game_rank_passeur
            "polyglotte" -> GameR.string.game_rank_polyglotte
            "ambassadeur" -> GameR.string.game_rank_ambassadeur
            "orateur" -> GameR.string.game_rank_orateur
            "oracle" -> GameR.string.game_rank_oracle
            "legende" -> GameR.string.game_rank_legende
            "mythe" -> GameR.string.game_rank_mythe
            else -> null
        }

        @StringRes
        fun rarityRes(value: String): Int? = when (value) {
            "common" -> GameR.string.game2_rarity_common
            "rare" -> GameR.string.game2_rarity_rare
            "epic" -> GameR.string.game2_rarity_epic
            "legendary" -> GameR.string.game2_rarity_legendary
            "mythic" -> GameR.string.game2_rarity_mythic
            else -> null
        }

        @StringRes
        fun familyRes(value: String): Int? = when (value) {
            "tier" -> UiR.string.game_frame_family_tier
            "meesh" -> UiR.string.game_frame_family_meesh
            "treasury" -> UiR.string.game_frame_family_treasury
            "flame" -> UiR.string.game_frame_family_flame
            "day" -> UiR.string.game_frame_family_day
            "level-100" -> UiR.string.game_frame_family_level_100
            else -> null
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal object FrameUsageCopyModule {
    @Provides
    @Singleton
    fun provideFrameUsageCopy(@ApplicationContext context: Context): FrameUsageCopy = AndroidFrameUsageCopy(context)
}
