package me.meeshy.ui.component.game

import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role

/**
 * Décoratif masqué, libellé porté par l'hôte (miroir de `gameAccessibility`). Une brique du jeu DESSINE ;
 * elle ne sait pas ce qu'elle veut dire dans l'écran qui la pose (« niveau 34 », « rang Voix II »). Sans
 * libellé, TalkBack la saute ; avec, elle devient UN élément image, ses dessins internes restant ignorés.
 */
public fun Modifier.gameAccessibility(label: String?): Modifier =
    if (label == null) {
        clearAndSetSemantics { }
    } else {
        clearAndSetSemantics {
            contentDescription = label
            role = Role.Image
        }
    }
