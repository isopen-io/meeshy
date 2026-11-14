package me.meeshy.app.chat

import me.meeshy.feature.chat.R

/**
 * Les notices de bas de menu d'un message dans une conversation chiffrée de bout en bout (#17697) :
 * « chiffrée de bout en bout » se dit UNE fois. Quand la notice des fonctions serveur manque (message
 * à vue unique ou disparu), celle des gestes signaux porte seule la raison.
 */
internal fun endToEndMenuNotices(serverFeaturesAbsent: Boolean, signalsRefused: Boolean): List<Int> = buildList {
    if (serverFeaturesAbsent) add(R.string.chat_menu_e2ee_notice)
    if (signalsRefused) add(if (serverFeaturesAbsent) R.string.chat_menu_e2ee_signals_notice else R.string.chat_menu_e2ee_signals_notice_alone)
}
