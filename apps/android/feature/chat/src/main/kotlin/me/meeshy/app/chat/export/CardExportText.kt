package me.meeshy.app.chat.export

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.chat.R

/** Les onglets du plateau — un seul panneau à la fois. L'ordre est celui d'iOS. */
enum class CardTab { STYLES, FORMAT, FRAME, PALETTE, TYPEFACE, LINK, DETAILS, LANGUAGE;

    companion object {
        /** L'onglet qui règle la partie touchée sur l'aperçu. */
        fun of(part: CardPartId): CardTab = when (part) {
            CardPartId.BACKGROUND -> PALETTE
            CardPartId.HEADER -> FRAME
            CardPartId.QUOTE, CardPartId.REPLY -> TYPEFACE
            CardPartId.LINK -> LINK
        }

        /** « Langue » n'existe qu'avec une seconde langue. */
        fun offered(languageCount: Int): List<CardTab> = entries.filter { it != LANGUAGE || languageCount > 1 }
    }
}

internal object CardLabels {
    @Composable fun tab(tab: CardTab) = stringResource(
        when (tab) {
            CardTab.STYLES -> R.string.export_card_tab_styles
            CardTab.FORMAT -> R.string.export_card_tab_format
            CardTab.FRAME -> R.string.export_card_tab_frame
            CardTab.PALETTE -> R.string.export_card_tab_palette
            CardTab.TYPEFACE -> R.string.export_card_tab_typeface
            CardTab.LINK -> R.string.export_card_tab_link
            CardTab.DETAILS -> R.string.export_card_tab_details
            CardTab.LANGUAGE -> R.string.export_card_tab_language
        },
    )

    @Composable fun typeface(id: CardTypefaceId) = stringResource(
        when (id) {
            CardTypefaceId.ROND -> R.string.export_card_typeface_rond
            CardTypefaceId.DIDONE -> R.string.export_card_typeface_didone
            CardTypefaceId.PLUME -> R.string.export_card_typeface_plume
            CardTypefaceId.AFFICHE -> R.string.export_card_typeface_affiche
            CardTypefaceId.FUTUR -> R.string.export_card_typeface_futur
            CardTypefaceId.MACHINE -> R.string.export_card_typeface_machine
            CardTypefaceId.MARQUEUR -> R.string.export_card_typeface_marqueur
            CardTypefaceId.SYSTEME -> R.string.export_card_typeface_systeme
        },
    )

    @Composable fun link(id: CardLinkId) = stringResource(
        when (id) {
            CardLinkId.ORBITE -> R.string.export_card_link_orbite
            CardLinkId.FILET -> R.string.export_card_link_filet
            CardLinkId.GUILLEMETS -> R.string.export_card_link_guillemets
            CardLinkId.FLECHE -> R.string.export_card_link_fleche
            CardLinkId.BULLES -> R.string.export_card_link_bulles
            CardLinkId.FIL -> R.string.export_card_link_fil
            CardLinkId.SILENCE -> R.string.export_card_link_silence
        },
    )

    @Composable fun tone(tone: CardTone?) = stringResource(
        when (tone) {
            null -> R.string.export_card_tone_all
            CardTone.DARK -> R.string.export_card_tone_dark
            CardTone.LIGHT -> R.string.export_card_tone_light
        },
    )

    @Composable fun toggle(toggle: CardToggle) = stringResource(
        when (toggle) {
            CardToggle.SHOW_CONVERSATION_TITLE -> R.string.export_card_option_title
            CardToggle.SHOW_AUTHORS -> R.string.export_card_option_authors
            CardToggle.SHOW_DATE -> R.string.export_card_option_date
            CardToggle.ANONYMIZE_QUOTED -> R.string.export_card_option_anonymizeQuoted
            CardToggle.ANONYMIZE_REPLY -> R.string.export_card_option_anonymizeReply
            CardToggle.SHOW_TIMES -> R.string.export_card_option_times
            CardToggle.USE_HANDLES -> R.string.export_card_option_handles
        },
    )

    @Composable fun aspect(aspect: CardAspect) = stringResource(
        when (aspect) {
            CardAspect.AUTO -> R.string.export_card_aspect_auto
            CardAspect.STORY -> R.string.export_card_aspect_story
            CardAspect.PORTRAIT -> R.string.export_card_aspect_portrait
            CardAspect.SQUARE -> R.string.export_card_aspect_square
            CardAspect.LANDSCAPE -> R.string.export_card_aspect_landscape
        },
    )

    @Composable fun placement(placement: CardAuthorPlacement) = stringResource(
        when (placement) {
            CardAuthorPlacement.ABOVE -> R.string.export_card_names_above
            CardAuthorPlacement.AFTER -> R.string.export_card_names_after
        },
    )

    @Composable fun tilt(tilt: CardTilt) = stringResource(
        when (tilt) {
            CardTilt.NONE -> R.string.export_card_tilt_none
            CardTilt.LEFT -> R.string.export_card_tilt_left
            CardTilt.RIGHT -> R.string.export_card_tilt_right
        },
    )

    @Composable fun part(part: CardPartId) = stringResource(
        when (part) {
            CardPartId.HEADER -> R.string.export_card_part_header
            CardPartId.QUOTE -> R.string.export_card_part_quote
            CardPartId.LINK -> R.string.export_card_part_link
            CardPartId.REPLY -> R.string.export_card_part_reply
            CardPartId.BACKGROUND -> R.string.export_card_part_background
        },
    )

    /** Le vocabulaire de la recherche de la galerie, dans la langue de l'interface. */
    @Composable fun vocabulary() = CardVocabulary(
        typeface = CardTypefaceId.entries.associateWith { typeface(it) },
        link = CardLinkId.entries.associateWith { link(it) },
        tone = mapOf(CardTone.DARK to tone(CardTone.DARK), CardTone.LIGHT to tone(CardTone.LIGHT)),
    )
}
