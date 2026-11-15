package me.meeshy.sdk.call.frames

import android.graphics.Paint
import android.graphics.Typeface
import android.os.Build
import me.meeshy.sdk.model.call.frames.CallFrameFont
import me.meeshy.sdk.model.call.frames.CallFrameFontFace
import me.meeshy.sdk.model.call.frames.CallFrameTextMeasure
import kotlin.math.max

/**
 * Les polices d'un rendu de cadre, résolues une fois chacune (miroir de iOS `CallFrameFontBook`) : la face
 * de chacun des dix-huit styles ([CallFrameFontFace]) et la police de la marque. Elle MESURE aussi les
 * textes, avec la même peinture que celle qui les écrit : ce que le plan ajuste est ce que le canevas trace.
 */
internal class CallFrameFontBook : CallFrameTextMeasure {
    private val faces = HashMap<CallFrameFont?, Typeface>()
    private val probe = Paint(Paint.ANTI_ALIAS_FLAG)

    fun typeface(font: CallFrameFont?): Typeface = faces.getOrPut(font) { resolve(CallFrameFontFace.of(font)) }

    /** Une peinture de texte prête : sa face, sa taille, sa couleur. */
    fun paint(font: CallFrameFont?, size: Double, color: Int): Paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = typeface(font)
        textSize = max(1.0, size).toFloat()
        this.color = color
    }

    override fun width(text: String, font: CallFrameFont?, size: Double): Double {
        if (text.isEmpty() || size <= 0) return 0.0
        probe.typeface = typeface(font)
        probe.textSize = max(1.0, size).toFloat()
        return probe.measureText(text).toDouble()
    }

    private fun resolve(face: CallFrameFontFace): Typeface {
        val family = Typeface.create(face.family, Typeface.NORMAL)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) return Typeface.create(family, face.weight, face.italic)
        val style = when {
            face.isBold && face.italic -> Typeface.BOLD_ITALIC
            face.isBold -> Typeface.BOLD
            face.italic -> Typeface.ITALIC
            else -> Typeface.NORMAL
        }
        return Typeface.create(family, style)
    }
}
