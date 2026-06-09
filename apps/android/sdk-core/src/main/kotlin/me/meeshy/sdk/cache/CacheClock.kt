package me.meeshy.sdk.cache

interface CacheClock {
    fun nowMillis(): Long
}

object SystemCacheClock : CacheClock {
    override fun nowMillis(): Long = System.currentTimeMillis()
}
