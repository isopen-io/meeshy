package me.meeshy.ui.component.game

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import me.meeshy.sdk.model.game.GameReferralQrSquare

// QR : sombre sur clair quel que soit le thème de celui qui le montre, et la carte est une IMAGE partagée
// hors de l'application — ces deux couleurs sont FIXES (miroir de QR_LIGHT / QR_DARK du web).
private val QrLight = Color(0xFFFFFFFF)
private val QrDark = Color(0xFF000000)

/**
 * Le carré QR peint : un fond clair sur toute sa place (la marge de silence en fait partie), puis les
 * modules sombres, tous en pixels ENTIERS. Fait [GameReferralQrSquare.side] pixels de côté — un pixel par
 * pixel de l'image exportée — et ne se miroite jamais (arabe compris).
 */
@Composable
public fun GameReferralQrSquareView(
    square: GameReferralQrSquare,
    modifier: Modifier = Modifier,
    contentDescription: String? = null,
) {
    val density = LocalDensity.current
    val side = remember(square, density) { with(density) { square.side.toDp() } }
    val semantics = if (contentDescription == null) {
        Modifier
    } else {
        Modifier.semantics {
            this.contentDescription = contentDescription
            role = Role.Image
        }
    }
    Canvas(modifier.size(side).then(semantics)) {
        drawRect(QrLight, Offset.Zero, Size(square.side.toFloat(), square.side.toFloat()))
        square.runs.forEach { run ->
            drawRect(
                QrDark,
                Offset(run.x.toFloat(), run.y.toFloat()),
                Size(run.width.toFloat(), run.height.toFloat()),
            )
        }
    }
}
