package me.meeshy.app.navigation

import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController

/**
 * Le point d'appel UNIQUE des destinations media (visionneuses, lecteur plein ecran, scene) dans le
 * `NavHost` racine. Vide a ce stade : les lots media suivants y branchent leurs destinations sans
 * rouvrir `MeeshyApp`.
 */
@Suppress("UNUSED_PARAMETER")
internal fun NavGraphBuilder.mediaRoutes(navController: NavHostController) = Unit
