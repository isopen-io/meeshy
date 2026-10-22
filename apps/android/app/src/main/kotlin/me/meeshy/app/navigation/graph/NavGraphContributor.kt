package me.meeshy.app.navigation.graph

import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController

/**
 * Ajoute des destinations au `NavHost` racine depuis un fichier de domaine neuf, lie en
 * `@IntoSet` : ni `MeeshyApp` ni `Routes` ne s'editent pour accueillir un ecran. Les
 * contributeurs sont appeles apres les graphes integres ; une route deja declaree
 * n'est jamais redefinie.
 */
interface NavGraphContributor {
    fun contribute(builder: NavGraphBuilder, navController: NavHostController)
}
