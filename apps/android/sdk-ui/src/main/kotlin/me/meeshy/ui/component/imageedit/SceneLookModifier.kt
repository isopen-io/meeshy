package me.meeshy.ui.component.imageedit

import android.os.Build
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Paint
import androidx.compose.ui.graphics.asComposeRenderEffect
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.graphicsLayer
import me.meeshy.sdk.model.scene.SceneLookRecipe
import me.meeshy.ui.story.canvas.SceneLookChain

/**
 * Applique un look EN DIRECT au contenu : AGSL (RenderEffect) dès l'API 33, filtre de matrice de
 * couleur accéléré en dessous. Une recette neutre ne pose RIEN (aucun coût par image). La
 * cuisson d'une image fixe passe par `SceneLookBaker`, jamais par ce modificateur.
 */
public fun Modifier.sceneLook(recipe: SceneLookRecipe): Modifier {
    if (recipe.isNeutral) return this
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        return graphicsLayer {
            renderEffect = AgslImageShaders.effect(recipe, size.width, size.height)?.asComposeRenderEffect()
        }
    }
    val filter = SceneLookChain.colorFilter(recipe) ?: return this
    return drawWithContent {
        drawIntoCanvas { canvas ->
            val paint = Paint().apply { colorFilter = filter }
            canvas.saveLayer(Rect(0f, 0f, size.width, size.height), paint)
            drawContent()
            canvas.restore()
        }
    }
}
