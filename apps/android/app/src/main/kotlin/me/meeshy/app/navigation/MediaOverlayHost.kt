package me.meeshy.app.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController

/**
 * Le point d'appel UNIQUE des calques media poses par-dessus la navigation (mini-lecteur, lecteur
 * plein ecran persistant). Vide a ce stade : les lots media suivants s'y branchent.
 */
@Suppress("UNUSED_PARAMETER")
@Composable
internal fun MediaOverlayHost(navController: NavHostController) = Unit
