package me.meeshy.sdk.media

import java.io.IOException

/**
 * The device has no room left for the queued media (#14710): the enqueue fails WITH this typed error — no outbox row
 * without its file, no silent failure — so the caller undoes its optimistic bubble and can say « espace insuffisant ».
 */
public class MediaStorageFullException(cause: Throwable? = null) : IOException("No space left for the queued media", cause)
