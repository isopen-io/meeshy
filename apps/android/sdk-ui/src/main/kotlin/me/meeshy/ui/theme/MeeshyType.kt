@file:OptIn(ExperimentalTextApi::class)

package me.meeshy.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import me.meeshy.ui.R

/**
 * Brand typography — Nunito, the rounded substitute for iOS SF Pro Rounded.
 *
 * iOS reserves the rounded design for big titles (`MeeshyFont.relative(..., design:
 * .rounded)`); we adopt Nunito as the single brand family so the whole app carries
 * the rounded signature cohesively (the gap is recorded in `decisions.md`, ADR-025).
 * Sizes map 1:1 to the iOS type scale (`DesignTokens.swift` → `MeeshyFont`, parity
 * plan §3.5) through [MeeshyFontSize]: caption 10, footnote 11, subhead 13, body 15,
 * headline 17, title 22, largeTitle 34, screen title 46. Every size is in `sp`, so the
 * text follows the system font size; [meeshyText] builds a one-off style the same way.
 *
 * Nunito ships as a single variable font (`res/font/nunito.ttf`, `wght` axis
 * ExtraLight→Black); each weight is a [FontVariation] on that one file — supported
 * from API 26 (our minSdk). Licence: OFL, see `apps/android/licenses/OFL-Nunito.txt`.
 */
private fun nunito(weight: Int): Font = Font(
    resId = R.font.nunito,
    weight = FontWeight(weight),
    variationSettings = FontVariation.Settings(FontVariation.weight(weight)),
)

val NunitoFontFamily: FontFamily = FontFamily(
    nunito(300),
    nunito(400),
    nunito(500),
    nunito(600),
    nunito(700),
    nunito(800),
    nunito(900),
)

val MeeshyTypography: Typography = Typography(
    // Display — screen titles ("Meeshy Chats" 46) + largeTitle (34). Rounded, bold, tight.
    displayLarge = TextStyle(
        fontFamily = NunitoFontFamily, fontWeight = FontWeight.Bold,
        fontSize = 46.sp, lineHeight = 52.sp, letterSpacing = (-0.5).sp,
    ),
    displayMedium = TextStyle(
        fontFamily = NunitoFontFamily, fontWeight = FontWeight.Bold,
        fontSize = MeeshyFontSize.largeTitle, lineHeight = 40.sp, letterSpacing = (-0.5).sp,
    ),
    displaySmall = TextStyle(
        fontFamily = NunitoFontFamily, fontWeight = FontWeight.Bold,
        fontSize = MeeshyFontSize.display, lineHeight = 34.sp, letterSpacing = (-0.25).sp,
    ),
    // Headline
    headlineLarge = TextStyle(
        fontFamily = NunitoFontFamily, fontWeight = FontWeight.Bold,
        fontSize = 26.sp, lineHeight = 32.sp, letterSpacing = (-0.25).sp,
    ),
    headlineMedium = TextStyle(
        fontFamily = NunitoFontFamily, fontWeight = FontWeight.SemiBold,
        fontSize = 24.sp, lineHeight = 30.sp,
    ),
    headlineSmall = TextStyle(
        fontFamily = NunitoFontFamily, fontWeight = FontWeight.SemiBold,
        fontSize = MeeshyFontSize.title, lineHeight = 28.sp, // iOS title
    ),
    // Title
    titleLarge = TextStyle(
        fontFamily = NunitoFontFamily, fontWeight = FontWeight.SemiBold,
        fontSize = MeeshyFontSize.title, lineHeight = 28.sp, // iOS title
    ),
    titleMedium = TextStyle(
        fontFamily = NunitoFontFamily, fontWeight = FontWeight.SemiBold,
        fontSize = MeeshyFontSize.headline, lineHeight = 24.sp, letterSpacing = 0.1.sp, // iOS headline
    ),
    titleSmall = TextStyle(
        fontFamily = NunitoFontFamily, fontWeight = FontWeight.SemiBold,
        fontSize = MeeshyFontSize.body, lineHeight = 22.sp,
    ),
    // Body
    bodyLarge = TextStyle(
        fontFamily = NunitoFontFamily, fontWeight = FontWeight.Normal,
        fontSize = MeeshyFontSize.headline, lineHeight = 24.sp, // iOS headline as body
    ),
    bodyMedium = TextStyle(
        fontFamily = NunitoFontFamily, fontWeight = FontWeight.Normal,
        fontSize = MeeshyFontSize.body, lineHeight = 22.sp, // iOS body
    ),
    bodySmall = TextStyle(
        fontFamily = NunitoFontFamily, fontWeight = FontWeight.Normal,
        fontSize = MeeshyFontSize.subhead, lineHeight = 18.sp, // iOS subhead
    ),
    // Label
    labelLarge = TextStyle(
        fontFamily = NunitoFontFamily, fontWeight = FontWeight.Medium,
        fontSize = MeeshyFontSize.body, lineHeight = 20.sp,
    ),
    labelMedium = TextStyle(
        fontFamily = NunitoFontFamily, fontWeight = FontWeight.Medium,
        fontSize = MeeshyFontSize.subhead, lineHeight = 18.sp, letterSpacing = 0.1.sp,
    ),
    labelSmall = TextStyle(
        fontFamily = NunitoFontFamily, fontWeight = FontWeight.Medium,
        fontSize = MeeshyFontSize.footnote, lineHeight = 16.sp, letterSpacing = 0.1.sp, // iOS footnote
    ),
)
