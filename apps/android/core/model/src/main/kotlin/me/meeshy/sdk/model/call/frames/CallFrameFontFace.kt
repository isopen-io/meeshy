package me.meeshy.sdk.model.call.frames

/**
 * La police d'un texte de cadre sur Android (#13694) : la famille système la plus proche de la police iOS
 * (`StoryTextStyle.fontName`), sa graisse (100…900) et sa pente. iOS embarque dix-huit faces nommées ;
 * Android n'a que ses familles génériques, alors chaque style garde au moins son CARACTÈRE — machine à
 * écrire, manuscrite, condensée, ronde, à empattements — pour que deux cadres ne se confondent pas.
 */
public data class CallFrameFontFace(val family: String, val weight: Int, val italic: Boolean = false) {
    public val isBold: Boolean get() = weight >= 600

    public companion object {
        public const val SANS: String = "sans-serif"
        public const val SERIF: String = "serif"
        public const val MONOSPACE: String = "monospace"
        public const val SERIF_MONOSPACE: String = "serif-monospace"
        public const val CURSIVE: String = "cursive"
        public const val CASUAL: String = "casual"
        public const val CONDENSED: String = "sans-serif-condensed"

        /** `null` ⇒ la police de la marque (SF Rounded semi-grasse sur iOS). */
        public fun of(font: CallFrameFont?): CallFrameFontFace = when (font) {
            null, CallFrameFont.NEON -> CallFrameFontFace(SANS, 600)
            CallFrameFont.BOLD -> CallFrameFontFace(SANS, 900)
            CallFrameFont.TYPEWRITER -> CallFrameFontFace(MONOSPACE, 400)
            CallFrameFont.HANDWRITING -> CallFrameFontFace(CURSIVE, 400)
            CallFrameFont.CLASSIC -> CallFrameFontFace(SERIF, 400)
            CallFrameFont.CALLIGRAPHY -> CallFrameFontFace(CURSIVE, 400, italic = true)
            CallFrameFont.CARTOON -> CallFrameFontFace(CASUAL, 700)
            CallFrameFont.FUTURISTIC -> CallFrameFontFace(CONDENSED, 800)
            CallFrameFont.FANTASY -> CallFrameFontFace(SERIF, 400, italic = true)
            CallFrameFont.CURVE -> CallFrameFontFace(CURSIVE, 400)
            CallFrameFont.TAG -> CallFrameFontFace(CASUAL, 700)
            CallFrameFont.ITALIC -> CallFrameFontFace(SERIF, 400, italic = true)
            CallFrameFont.RETRO -> CallFrameFontFace(SERIF_MONOSPACE, 400)
            CallFrameFont.ELEGANT -> CallFrameFontFace(SERIF, 300)
            CallFrameFont.POSTER -> CallFrameFontFace(CONDENSED, 900)
            CallFrameFont.BUBBLE -> CallFrameFontFace(SANS, 700)
            CallFrameFont.NOTE -> CallFrameFontFace(CASUAL, 700)
            CallFrameFont.BRUSH -> CallFrameFontFace(CURSIVE, 700)
        }
    }
}
