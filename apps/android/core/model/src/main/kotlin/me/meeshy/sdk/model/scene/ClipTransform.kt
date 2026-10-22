package me.meeshy.sdk.model.scene

import kotlinx.serialization.Serializable

/**
 * Place d'une piste dans le PLAN : position (normalisée, peut déborder de 0..1), taille, rotation en
 * DEGRÉS et rang de superposition. Miroir de `ClipTransform.swift`. Valeur pure, bornée : `applying(Field)` ne sort jamais des bornes.
 */
@Serializable
data class ClipTransform(
    val x: Double = 0.5,
    val y: Double = 0.5,
    val scale: Double = 1.0,
    val rotation: Double = 0.0,
    val zIndex: Int = 0,
) {
    /** Champ édité, pour n'écrire qu'une valeur à la fois sans perdre les autres. */
    sealed interface Field {
        data class X(val value: Double) : Field
        data class Y(val value: Double) : Field
        data class Scale(val value: Double) : Field
        data class Rotation(val value: Double) : Field
        data class ZIndex(val value: Int) : Field
    }

    /** Applique une édition en la bornant ; une valeur non finie laisse la transformation intacte. */
    fun applying(field: Field): ClipTransform = when (field) {
        is Field.X -> if (field.value.isFinite()) copy(x = field.value.coerceIn(POSITION_RANGE)) else this
        is Field.Y -> if (field.value.isFinite()) copy(y = field.value.coerceIn(POSITION_RANGE)) else this
        is Field.Scale -> if (field.value.isFinite()) copy(scale = field.value.coerceIn(SCALE_RANGE)) else this
        is Field.Rotation -> if (field.value.isFinite()) copy(rotation = field.value.coerceIn(ROTATION_RANGE)) else this
        is Field.ZIndex -> copy(zIndex = field.value.coerceIn(Z_INDEX_RANGE))
    }

    companion object {
        val IDENTITY = ClipTransform()
        val POSITION_RANGE = -0.5..1.5
        val SCALE_RANGE = 0.05..8.0
        val ROTATION_RANGE = -180.0..180.0
        val Z_INDEX_RANGE = -100..100
    }
}
