package me.meeshy.sdk.model.waveform

import java.io.File
import java.io.RandomAccessFile
import java.net.URI
import java.net.URISyntaxException

/**
 * Où vit l'audio à mesurer : un fichier local (cache disque, enregistrement, `file://`) ou une
 * adresse (réseau, `content://`). Une adresse n'est jamais lue pour être clée.
 */
sealed interface WaveformLocation {
    data class Local(val path: String) : WaveformLocation

    data class Remote(val address: String) : WaveformLocation

    companion object {
        private val addressScheme = Regex("^[A-Za-z][A-Za-z0-9+.-]*://")

        /**
         * `file://…` et les chemins nus sont locaux ; tout autre schéma (`https://`, `content://`)
         * est une adresse.
         */
        fun parse(location: String): WaveformLocation {
            val trimmed = location.trim()
            if (trimmed.startsWith("file:", ignoreCase = true)) return Local(filePath(trimmed))
            if (addressScheme.containsMatchIn(trimmed)) return Remote(trimmed)
            return Local(trimmed)
        }

        private fun filePath(uri: String): String {
            val raw = uri.substringAfter(":").removePrefix("//")
            return try {
                URI(uri).path ?: raw
            } catch (_: URISyntaxException) {
                raw
            }
        }
    }
}

/**
 * **La clé d'un relevé est l'empreinte du CONTENU, pas son nom.** Miroir de
 * `WaveformContentKey.swift` (iOS), octet pour octet : un relevé calculé sur un téléphone se
 * reconnaît sur l'autre.
 *
 * Le nom de fichier confondait deux `recording.m4a` et recalculait une copie sous un autre nom.
 * L'empreinte (FNV-1a 64 bits) couvre la TAILLE, les premiers et les derniers 64 Kio : assez pour
 * distinguer deux sons, sans relire un fichier de dix minutes. La voie octets et la voie fichier
 * lisent les mêmes octets et rendent donc la même clé.
 *
 * Une adresse distante n'est pas lue : elle est clée par son adresse.
 */
object WaveformContentKey {

    const val WINDOW: Int = 65_536

    private const val OFFSET_BASIS: ULong = 14_695_981_039_346_656_037UL
    private const val PRIME: ULong = 1_099_511_628_211UL

    fun ofBytes(data: ByteArray): String {
        val head = data.copyOfRange(0, minOf(data.size, WINDOW))
        val tail = data.copyOfRange(maxOf(0, data.size - WINDOW), data.size)
        return digest(head, tail, data.size.toLong())
    }

    /** L'empreinte du contenu du fichier ; son chemin si le fichier est vide ou illisible. */
    fun ofFile(file: File): String = fileDigest(file) ?: ofAddress(file.path)

    fun ofAddress(address: String): String = "u-" + hex(fnv(address.toByteArray(Charsets.UTF_8), OFFSET_BASIS))

    fun of(location: WaveformLocation): String = when (location) {
        is WaveformLocation.Local -> ofFile(File(location.path))
        is WaveformLocation.Remote -> ofAddress(location.address)
    }

    fun of(location: String): String = of(WaveformLocation.parse(location))

    private fun fileDigest(file: File): String? = try {
        RandomAccessFile(file, "r").use { handle ->
            val length = handle.length()
            if (length <= 0) return null
            val head = ByteArray(minOf(length, WINDOW.toLong()).toInt())
            handle.readFully(head)
            val tailStart = if (length > WINDOW) length - WINDOW else 0L
            val tail = ByteArray((length - tailStart).toInt())
            handle.seek(tailStart)
            handle.readFully(tail)
            digest(head, tail, length)
        }
    } catch (_: java.io.IOException) {
        null
    } catch (_: SecurityException) {
        null
    }

    private fun digest(head: ByteArray, tail: ByteArray, length: Long): String {
        val lengthBytes = ByteArray(8) { index -> ((length ushr (8 * index)) and 0xFF).toByte() }
        val mixed = fnv(tail, fnv(head, fnv(lengthBytes, OFFSET_BASIS)))
        return "c-" + hex(mixed)
    }

    private fun hex(value: ULong): String = value.toString(16).padStart(16, '0')

    private fun fnv(data: ByteArray, seed: ULong): ULong {
        var hash = seed
        for (byte in data) hash = (hash xor (byte.toULong() and 0xFFUL)) * PRIME
        return hash
    }
}
