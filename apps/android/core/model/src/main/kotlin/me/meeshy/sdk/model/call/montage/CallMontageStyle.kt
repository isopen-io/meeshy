package me.meeshy.sdk.model.call.montage

import me.meeshy.sdk.model.call.frames.CallFrameRect

/**
 * LES TREIZE MONTAGES CLASSIQUES — miroir de `CallMontageStyle` (`apps/ios/.../Models/CallMontageLayout.swift`),
 * dans le même ordre : c'est l'ordre du carrousel « Classiques » et celui du design partagé.
 */
public enum class CallMontageStyle(public val raw: String) {
    SCREEN("screen"),
    COVER("cover"),
    GOLD("gold"),
    REDCARPET("redcarpet"),
    GRID("grid"),
    STRIP("strip"),
    POLAROID("polaroid"),
    MAGAZINE("magazine"),
    FILM("film"),
    NEON("neon"),
    NOIR("noir"),
    COMIC("comic"),
    HEART("heart");

    public companion object {
        public fun fromRaw(raw: String?): CallMontageStyle? = entries.firstOrNull { it.raw == raw }
    }
}

public enum class CallMontageShape { RECTANGLE, ROUNDED_RECTANGLE, CIRCLE, HEART }

/** Une case d'un montage : son rectangle (avant rotation), sa forme, son rayon de coin et son inclinaison en degrés. */
public data class CallMontageSlot(
    val frame: CallFrameRect,
    val shape: CallMontageShape,
    val cornerRadius: Double = 0.0,
    val rotation: Double = 0.0,
)

/** Un point de la toile, origine en haut à gauche, y vers le bas. */
public data class CallMontagePoint(val x: Double, val y: Double)

/** Une taille de toile. */
public data class CallMontageCanvas(val width: Double, val height: Double) {
    val bounds: CallFrameRect get() = CallFrameRect(0.0, 0.0, width, height)
}

internal fun CallFrameRect.insetBy(dx: Double, dy: Double): CallFrameRect =
    CallFrameRect(x + dx, y + dy, width - dx * 2, height - dy * 2)

internal fun CallFrameRect.contains(other: CallFrameRect): Boolean =
    other.minX >= minX && other.minY >= minY && other.maxX <= maxX && other.maxY <= maxY

internal fun CallFrameRect.contains(point: CallMontagePoint): Boolean =
    point.x in minX..maxX && point.y in minY..maxY

internal fun CallFrameRect.intersects(other: CallFrameRect): Boolean =
    minX < other.maxX && other.minX < maxX && minY < other.maxY && other.minY < maxY
