package me.meeshy.sdk.model.metrics

/**
 * Seaux de sortie de processus (miroir Android de `BackgroundExitCounts` de MetricKit) : la raison brute de
 * `ApplicationExitInfo` est classée par cette fonction PURE, sans dépendance au framework — les constantes
 * `ApplicationExitInfo.REASON_*` sont figées par la plateforme et recopiées ici en entiers.
 */
enum class ExitReasonBucket {
    Normal,
    Crash,
    AnrWatchdog,
    LowMemory,
    ExcessiveResources,
    Other,
    ;

    companion object {
        private const val REASON_EXIT_SELF = 1
        private const val REASON_LOW_MEMORY = 3
        private const val REASON_CRASH = 4
        private const val REASON_CRASH_NATIVE = 5
        private const val REASON_ANR = 6
        private const val REASON_INITIALIZATION_FAILURE = 7
        private const val REASON_PERMISSION_CHANGE = 8
        private const val REASON_EXCESSIVE_RESOURCE_USAGE = 9
        private const val REASON_USER_REQUESTED = 10
        private const val REASON_USER_STOPPED = 11
        private const val REASON_PACKAGE_UPDATED = 16

        fun classify(reason: Int): ExitReasonBucket = when (reason) {
            REASON_EXIT_SELF, REASON_USER_REQUESTED, REASON_USER_STOPPED,
            REASON_PERMISSION_CHANGE, REASON_PACKAGE_UPDATED,
            -> Normal
            REASON_CRASH, REASON_CRASH_NATIVE, REASON_INITIALIZATION_FAILURE -> Crash
            REASON_ANR -> AnrWatchdog
            REASON_LOW_MEMORY -> LowMemory
            REASON_EXCESSIVE_RESOURCE_USAGE -> ExcessiveResources
            else -> Other
        }
    }
}
