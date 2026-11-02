package me.meeshy.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes

/**
 * Les formes Material de Meeshy. `extraSmall` porte les champs de saisie (`OutlinedTextField`,
 * `TextField`), les menus et les bulles d'aide : 14 dp, le rayon des champs d'authentification
 * (`AuthTextField`), au lieu des 4 dp de Material 3 qui rendaient chaque champ austère (#13988).
 */
internal val MeeshyShapes: Shapes = Shapes(extraSmall = RoundedCornerShape(MeeshyRadius.md))
