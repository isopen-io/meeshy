package me.meeshy.ui.component.game

import android.graphics.RenderEffect
import android.graphics.RuntimeShader
import android.os.Build
import androidx.annotation.RequiresApi
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.graphics.asComposeRenderEffect
import androidx.compose.ui.graphics.graphicsLayer
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.game.GameShaderPath
import me.meeshy.sdk.model.game.GameShaderPolicy

/**
 * Les shaders du jeu côté Android (miroir de `GameShaders`). Le chemin AGSL n'existe qu'à partir de l'API 33 ;
 * dessous (et sous « Réduire les animations ») les modificateurs de `GameEffects.kt` posent le dégradé du
 * socle. Un `RuntimeShader` est créé UNE fois par modificateur ; chaque image ne met à jour que ses uniforms.
 */
public object GameShaders {

    public val functionNames: List<String> get() = GameShaderSources.functionNames

    public fun usesAgsl(sdkInt: Int = Build.VERSION.SDK_INT, reduceMotion: Boolean = false): Boolean =
        GameShaderPolicy.path(sdkInt, reduceMotion) == GameShaderPath.AGSL

    /** Compile les trois sources avant la célébration ; sans effet sous l'API 33, jamais bloquant. */
    public fun precompile(sdkInt: Int = Build.VERSION.SDK_INT) {
        if (!usesAgsl(sdkInt)) return
        GameShaderSources.sources.values.forEach { source -> runCatching { compile(source) } }
    }

    @RequiresApi(33)
    private fun compile(source: String): RuntimeShader = RuntimeShader(source)
}

/** À poser au démarrage de l'écran Progression ou de l'aperçu de frappe : compile hors du fil principal. */
@Composable
public fun PrecompileGameShaders() {
    LaunchedEffect(Unit) { withContext(Dispatchers.Default) { GameShaders.precompile() } }
}

/** Les modificateurs AGSL : le calque devient l'uniform `content` d'un `RenderEffect`. API 33+ seulement. */
@RequiresApi(33)
internal object GameAgslEffects {

    fun sheen(progress: Double, intensity: Double): Modifier = Modifier.composed {
        val shader = remember { RuntimeShader(GameShaderSources.SPECULAR_SHEEN) }
        Modifier.graphicsLayer {
            shader.setFloatUniform("size", size.width, size.height)
            shader.setFloatUniform("progress", progress.toFloat())
            shader.setFloatUniform("intensity", intensity.toFloat())
            renderEffect = RenderEffect.createRuntimeShaderEffect(shader, "content").asComposeRenderEffect()
        }
    }

    fun wave(progress: Double, centerX: Float, centerY: Float, amplitude: Float, wavelength: Float): Modifier =
        Modifier.composed {
            val shader = remember { RuntimeShader(GameShaderSources.STRIKE_WAVE) }
            Modifier.graphicsLayer {
                shader.setFloatUniform("size", size.width, size.height)
                shader.setFloatUniform("center", centerX * size.width, centerY * size.height)
                shader.setFloatUniform("progress", progress.toFloat())
                shader.setFloatUniform("amplitude", amplitude * density)
                shader.setFloatUniform("wavelength", wavelength * density)
                renderEffect = RenderEffect.createRuntimeShaderEffect(shader, "content").asComposeRenderEffect()
            }
        }

    fun iridescence(tilt: Double, intensity: Double): Modifier = Modifier.composed {
        val shader = remember { RuntimeShader(GameShaderSources.PRISM_IRIDESCENCE) }
        Modifier.graphicsLayer {
            shader.setFloatUniform("size", size.width, size.height)
            shader.setFloatUniform("tilt", tilt.toFloat())
            shader.setFloatUniform("intensity", intensity.toFloat())
            renderEffect = RenderEffect.createRuntimeShaderEffect(shader, "content").asComposeRenderEffect()
        }
    }
}
