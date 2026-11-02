package me.meeshy.sdk.model.net

/**
 * Les limites qu'un message tient côté CLIENT — miroir de `MAX_MESSAGE_LENGTH`
 * (`packages/shared/utils/languages.ts`) et de `MessageLimits` (iOS).
 *
 * Décision porteur 2026-10-01 : les frontends déclarent 2000 caractères ; la passerelle
 * en accepte 4000, mais seulement pour les envois API programmatiques. Au-delà de 2000,
 * un texte composé dans l'app part en pièce jointe `.txt`. La mesure est celle de
 * JavaScript (`content.length`) : des unités UTF-16, donc `String.length` en Kotlin.
 */
public object MessageLimits {
    public const val MAX_MESSAGE_LENGTH: Int = 2000
}
