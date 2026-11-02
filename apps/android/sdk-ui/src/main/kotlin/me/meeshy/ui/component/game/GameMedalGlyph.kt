package me.meeshy.ui.component.game

import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import me.meeshy.sdk.model.game.engagement.EngagementAxisKey

/**
 * Le pictogramme d'axe, au trait : UN PAR AXE, vingt glyphes, jamais une bulle ni celui de la famille
 * (miroir de `GameMedalGlyph`). [webName] est le nom du même glyphe sur le web (`MedalPictogram`).
 */
public enum class GameMedalGlyph(public val webName: String) {
    TEXT_MESSAGE("text"),
    AUDIO_MESSAGE("voice"),
    POST("post"),
    STORY("story"),
    REEL("reel"),
    AUDIO_COMMENT("voice-comment"),
    TEXT_COMMENT("comment"),
    PRIVATE_CONVERSATION("private"),
    PUBLIC_CONVERSATION("public"),
    COMMUNITY_CONVERSATION("community"),
    GROUP_CREATED("group"),
    STICKER("sticker"),
    IN_APP_EDIT("edit"),
    DIRECT_PUBLISH("direct-publish"),
    REACTION("reaction"),
    ATTACHMENT("attachment"),
    TRACKED_LINK("link"),
    SHARE("share"),
    INVITE_JOINED("invite"),
    FRIENDSHIP("friendship"),
    ;

    public companion object {
        /** Le glyphe de chaque axe du catalogue ; le `when` est exhaustif, un axe sans pictogramme ne compile plus. */
        public fun of(axis: EngagementAxisKey): GameMedalGlyph = when (axis) {
            EngagementAxisKey.TEXT_MESSAGE -> TEXT_MESSAGE
            EngagementAxisKey.AUDIO_MESSAGE -> AUDIO_MESSAGE
            EngagementAxisKey.POST -> POST
            EngagementAxisKey.STORY -> STORY
            EngagementAxisKey.REEL -> REEL
            EngagementAxisKey.AUDIO_COMMENT -> AUDIO_COMMENT
            EngagementAxisKey.TEXT_COMMENT -> TEXT_COMMENT
            EngagementAxisKey.PRIVATE_CONVERSATION -> PRIVATE_CONVERSATION
            EngagementAxisKey.PUBLIC_CONVERSATION -> PUBLIC_CONVERSATION
            EngagementAxisKey.COMMUNITY_CONVERSATION -> COMMUNITY_CONVERSATION
            EngagementAxisKey.GROUP_CREATED -> GROUP_CREATED
            EngagementAxisKey.STICKER -> STICKER
            EngagementAxisKey.IN_APP_EDIT -> IN_APP_EDIT
            EngagementAxisKey.DIRECT_PUBLISH -> DIRECT_PUBLISH
            EngagementAxisKey.REACTION -> REACTION
            EngagementAxisKey.ATTACHMENT -> ATTACHMENT
            EngagementAxisKey.TRACKED_LINK -> TRACKED_LINK
            EngagementAxisKey.SHARE -> SHARE
            EngagementAxisKey.INVITE_JOINED -> INVITE_JOINED
            EngagementAxisKey.FRIENDSHIP -> FRIENDSHIP
        }
    }
}

private fun roundStroke(width: Float) = Stroke(width = width, cap = StrokeCap.Round, join = StrokeJoin.Round)

private fun roundedRect(x: Float, y: Float, w: Float, h: Float, r: Float): Path =
    Path().apply { addRoundRect(RoundRect(Rect(Offset(x, y), Size(w, h)), CornerRadius(r, r))) }

/** Le glyphe, au trait, centré en (50, 50) de la boîte de la médaille — les mêmes tracés que le web. */
internal fun DrawScope.drawGameMedalGlyph(glyph: GameMedalGlyph, color: Color, measurer: TextMeasurer) {
    translate(left = 50f, top = 50f) {
        fun stroke(d: String, width: Float = 2.4f) = drawPath(cachedGamePath(d), color, style = roundStroke(width))
        fun fill(d: String) = drawPath(cachedGamePath(d), color)
        fun dot(x: Float, y: Float, r: Float) = drawCircle(color, radius = r, center = Offset(x, y))
        fun ring(cx: Float, cy: Float, r: Float, width: Float, dashed: Boolean = false) = drawCircle(
            color, radius = r, center = Offset(cx, cy),
            style = Stroke(width = width, pathEffect = if (dashed) PathEffect.dashPathEffect(floatArrayOf(4f, 3f)) else null),
        )
        when (glyph) {
            GameMedalGlyph.TEXT_MESSAGE ->
                drawGameText(measurer, "Aa", Offset.Zero, 15f, color, FontWeight.ExtraBold, FontFamily.SansSerif)
            GameMedalGlyph.AUDIO_MESSAGE -> {
                drawPath(roundedRect(-4f, -10f, 8f, 13f, 4f), color)
                stroke("M-8 0 A8 8 0 0 0 8 0 M0 8 L0 13", 2.2f)
            }
            GameMedalGlyph.STORY -> {
                ring(0f, 0f, 9f, 2.4f, dashed = true)
                dot(0f, 0f, 3.5f)
            }
            GameMedalGlyph.POST -> {
                drawPath(roundedRect(-8f, -8f, 16f, 16f, 3f), color, style = roundStroke(2.4f))
                stroke("M-4 -2h8M-4 3h5", 2f)
            }
            GameMedalGlyph.REEL -> fill("M-5 -8 L9 0 L-5 8 Z")
            GameMedalGlyph.AUDIO_COMMENT -> stroke("M-8 -3v6M-4 -7v14M0 -10v20M4 -6v12M8 -2v4")
            GameMedalGlyph.TEXT_COMMENT -> fill("M-9 -6h6v6l-3 6h-3l2-6h-2zM2 -6h6v6l-3 6h-3l2-6h-2z")
            GameMedalGlyph.PRIVATE_CONVERSATION -> {
                dot(-6f, 0f, 4f)
                dot(7f, 0f, 4f)
                drawPath(cachedGamePath("M-2 0h5"), color, style = Stroke(width = 2.6f, cap = StrokeCap.Butt))
            }
            GameMedalGlyph.PUBLIC_CONVERSATION ->
                stroke("M-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0M0 -9a4 9 0 0 0 0 18a4 9 0 0 0 0 -18M-9 0h18", 2f)
            GameMedalGlyph.COMMUNITY_CONVERSATION -> {
                stroke("M0 -7L-7 5L7 5Z", 2f)
                dot(0f, -7f, 3.2f)
                dot(-7f, 5f, 3.2f)
                dot(7f, 5f, 3.2f)
            }
            GameMedalGlyph.GROUP_CREATED -> {
                dot(-6f, -3f, 3.5f)
                dot(3f, -3f, 3.5f)
                stroke("M7 4v8M3 8h8")
            }
            GameMedalGlyph.STICKER -> {
                stroke("M-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0", 2.2f)
                dot(-3.2f, -2.5f, 1.4f)
                dot(3.2f, -2.5f, 1.4f)
                stroke("M-4.5 2.5a5 5 0 0 0 9 0", 2.2f)
            }
            GameMedalGlyph.IN_APP_EDIT -> {
                stroke("M-8 8L3 -3", 2.6f)
                fill("M6 -12L7.4 -7.4L12 -6L7.4 -4.6L6 0L4.6 -4.6L0 -6L4.6 -7.4Z")
            }
            GameMedalGlyph.DIRECT_PUBLISH -> fill("M-10 -1L10 -9L3 9L0 2Z")
            GameMedalGlyph.REACTION -> fill("M0 9C-13 0 -9 -11 0 -4C9 -11 13 0 0 9Z")
            GameMedalGlyph.ATTACHMENT -> stroke("M4 -5v10a4 4 0 0 1 -8 0v-12a2.5 2.5 0 0 1 5 0v11", 2.2f)
            GameMedalGlyph.TRACKED_LINK -> {
                drawPath(roundedRect(-11f, -4f, 12f, 8f, 4f), color, style = roundStroke(2.4f))
                drawPath(roundedRect(-1f, -4f, 12f, 8f, 4f), color, style = roundStroke(2.4f))
            }
            GameMedalGlyph.SHARE -> stroke("M0 -11v12M-5 -6l5 -5l5 5M-8 -1v9h16v-9")
            GameMedalGlyph.INVITE_JOINED -> {
                dot(-3f, -5f, 4f)
                stroke("M-11 10a8 7 0 0 1 16 0M8 -4v8M4 0h8")
            }
            GameMedalGlyph.FRIENDSHIP -> {
                dot(-5f, -5f, 3.5f)
                dot(5f, -5f, 3.5f)
                stroke("M-11 9a6 5 0 0 1 12 0M-1 9a6 5 0 0 1 12 0")
            }
        }
    }
}
