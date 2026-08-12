package me.meeshy.sdk.model

import me.meeshy.sdk.lang.LanguageResolver

/**
 * Pure SSOT for the source language a new piece of content is composed in — port of iOS
 * `ComposerModels.swift`'s `DefaultComposerLanguage.resolve()` + `ComposerLanguageFlag.label(for:)`.
 *
 * iOS deliberately keeps [DEFAULT] a constant, never device-locale-driven (see the Prisme
 * Linguistique section of the root `CLAUDE.md`): a composer always starts in French, and only a
 * manual override (a language-picker affordance) or a composer wired for live-typing detection
 * (chat's `ComposeLanguageDetector`) changes it in flight. The Feed post composer does neither —
 * it only offers the manual picker, exactly mirroring iOS `FeedComposerSheet.composerLanguage`.
 */
public object ComposerLanguage {

    /** The language a composer starts in, absent any user choice. Reuses the same Prisme fallback. */
    public val DEFAULT: String = LanguageResolver.FALLBACK_LANGUAGE

    /**
     * The compact flag glyph for [code] — the catalogue's flag when [code] is known, else the
     * uppercased raw code (never blank input crashes; an empty [code] yields an empty string).
     */
    public fun flag(code: String): String = LanguageData.info(code)?.flag ?: code.uppercase()
}
