package me.meeshy.sdk.model.licenses

/** Une famille d'apparat des cadres de gloire, créditée sur l'écran des licences (SIL OFL 1.1). */
public data class FontCredit(
    val family: String,
    val copyright: String,
    val url: String,
)

/**
 * Les cinq familles embarquées intactes pour les cadres de gloire, avec les mentions de copyright
 * du texte OFL (`apps/android/licenses/OFL-GloryFrameFonts.txt`). Miroir de la liste fermée iOS
 * `GloryFrameFontFamily` ; une famille de plus demande une version d'app.
 */
public object GloryFrameFontCredits {

    public const val LICENSE_NAME: String = "SIL Open Font License 1.1"
    public const val LICENSE_URL: String = "https://openfontlicense.org"

    public val CREDITS: List<FontCredit> = listOf(
        FontCredit(
            family = "Cinzel",
            copyright = "Copyright 2020 The Cinzel Project Authors",
            url = "https://github.com/NDISCOVER/Cinzel",
        ),
        FontCredit(
            family = "Cinzel Decorative",
            copyright = "Copyright (c) 2012 Natanael Gama, Reserved Font Name 'Cinzel'",
            url = "https://github.com/NDISCOVER/Cinzel",
        ),
        FontCredit(
            family = "Cormorant Garamond",
            copyright = "Copyright 2015 the Cormorant Project Authors",
            url = "https://github.com/CatharsisFonts/Cormorant",
        ),
        FontCredit(
            family = "Fraunces",
            copyright = "Copyright 2018 The Fraunces Project Authors",
            url = "https://github.com/undercasetype/Fraunces",
        ),
        FontCredit(
            family = "Manrope",
            copyright = "Copyright 2018 The Manrope Project Authors",
            url = "https://github.com/googlefonts/manrope",
        ),
    )
}
