package me.meeshy.sdk.model.scene

import me.meeshy.sdk.model.StoryDrawingStroke
import me.meeshy.sdk.model.StrokeTool

/**
 * Largeur effective d'un point de trait — miroir de `StrokeWidthMapping.swift`.
 * La largeur choisie est le PLAFOND (trait lent / forte pression) ; un trait rapide
 * l'affine jusqu'à 40 %. `captureVersion == 0` (legacy) = largeur de base constante.
 */
object StrokeWidthMapping {
    private const val MIN_PRESSURE_FACTOR = 0.4
    private const val MAX_PRESSURE_FACTOR = 1.0
    private const val HARD_CAP_FACTOR = 1.0
    private const val MIN_WIDTH = 1.0

    fun base(width: Double, tool: StrokeTool): Double =
        width * (if (tool == StrokeTool.MARKER) 2.0 else 1.0)

    fun effectiveWidth(stroke: StoryDrawingStroke, pressure: Double): Double {
        val base = base(stroke.width, stroke.tool)
        if (stroke.captureVersion < 1) return maxOf(MIN_WIDTH, base)
        val factor = MIN_PRESSURE_FACTOR + (MAX_PRESSURE_FACTOR - MIN_PRESSURE_FACTOR) * pressure
        return minOf(HARD_CAP_FACTOR * base, maxOf(MIN_WIDTH, base * factor))
    }
}
