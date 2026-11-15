package me.meeshy.ui.component.media

import coil.ImageLoader
import coil.memory.MemoryCache
import me.meeshy.sdk.model.media.AbsencePresenceMemo

/**
 * Miroir de `WarmImageProbe` / `LocalImagePresence` (iOS) : « l'image est-elle sur l'appareil ? ». La residence MEMOIRE
 * se lit en composition (aucun I/O) ; la sonde DISQUE ne s'appelle que hors du fil principal, et son absence est memorisee.
 */
public object LocalImagePresence {
    private val memo = AbsencePresenceMemo()

    /** Sans I/O : sure en composition. */
    public fun inMemory(loader: ImageLoader, memoryKey: String): Boolean =
        loader.memoryCache?.get(MemoryCache.Key(memoryKey)) != null

    /** Bloquante (disque) : a appeler sur un dispatcher IO. */
    public fun isOnDevice(loader: ImageLoader, url: String, memoryKey: String): Boolean =
        memo.isOnDevice(
            key = url,
            resident = { inMemory(loader, memoryKey) },
            probe = { loader.diskCache?.openSnapshot(it)?.use { true } ?: false },
        )
}
