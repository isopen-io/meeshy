package me.meeshy.core.crypto.primitives

/** Échec d'une primitive. Le message est une constante : jamais de clé, de texte clair ni d'octets. */
public class CryptoException(message: String) : Exception(message)
