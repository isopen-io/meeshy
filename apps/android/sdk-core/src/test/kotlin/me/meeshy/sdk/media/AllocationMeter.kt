package me.meeshy.sdk.media

/**
 * Octets ALLOUÉS par le fil courant pendant un bloc (#13551) — un tableau de la taille du média s'y voit en entier,
 * même s'il est rendu au ramasse-miettes aussitôt. Lu par réflexion : les tests unitaires Android compilent contre
 * `android.jar`, qui n'expose pas `java.lang.management`, mais tournent sur une JVM HotSpot qui le porte.
 */
internal object AllocationMeter {
    private val bean: Any = Class.forName("java.lang.management.ManagementFactory").getMethod("getThreadMXBean").invoke(null)
    private val allocated = Class.forName("com.sun.management.ThreadMXBean").getMethod("getThreadAllocatedBytes", Long::class.javaPrimitiveType)

    fun allocatedBy(block: () -> Unit): Long {
        val id = Thread.currentThread().id
        val before = allocated.invoke(bean, id) as Long
        block()
        return (allocated.invoke(bean, id) as Long) - before
    }
}
