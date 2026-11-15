package me.meeshy.core.e2ee

/**
 * Les constantes du protocole sur le fil (#14591), miroir de `E2EEWire` (`packages/MeeshySDK/.../E2EE/E2EERelayModels.swift`)
 * et de `packages/shared/types/e2ee-directory.ts`.
 */
public object E2eeWire {
    /** `encryptionProtocol` d'un envoi libsignal. */
    public const val LIBSIGNAL_PROTOCOL: String = "libsignal-v1"

    /** Le marqueur non vide posé dans `encryptedContent` : les gardes de la passerelle lisent la PRÉSENCE d'un chiffré. */
    public const val ENCRYPTED_CONTENT_MARKER: String = "libsignal-v1"

    /** Le littéral que la passerelle persiste dans `content` d'un message `e2ee`. */
    public const val CONTENT_PLACEHOLDER: String = "[Encrypted]"

    /** Le mode d'une conversation chiffrée de bout en bout. */
    public const val MODE: String = "e2ee"

    /** 3 = `PreKeySignalMessage` (premier message, PQXDH), 2 = `SignalMessage`. */
    public const val PRE_KEY_TYPE: Int = 3
    public const val WHISPER_TYPE: Int = 2
}
