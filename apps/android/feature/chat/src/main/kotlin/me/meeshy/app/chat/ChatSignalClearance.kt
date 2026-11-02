package me.meeshy.app.chat

import androidx.compose.runtime.compositionLocalOf
import me.meeshy.sdk.model.ConversationClearance

/**
 * Ce que l'appareil sait du mode de la conversation ouverte, le fil compris (#13790) : réagir, épingler et supprimer pour
 * tous n'y sont offerts que si elle est CONNUE claire (`PlainSignalAdmission`). FERMÉE (inconnue) tant qu'aucun hôte ne la fournit.
 */
internal val LocalChatSignalClearance = compositionLocalOf { ConversationClearance.UNKNOWN }
