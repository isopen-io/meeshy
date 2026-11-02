package me.meeshy.sdk.privacy

/**
 * The seam through which the "Analytics" privacy switch takes effect at once (iOS
 * `AnalyticsManager.syncCollectionState()`). The settings screen calls [onAnalyticsConsentChanged]
 * with the new consent the moment the user flips the switch, in addition to the gateway sync.
 *
 * The collection engine itself arrives in a later lot: until it binds its own implementation the
 * [NoOpAnalyticsCollectionGate] is installed, so nothing is collected either way.
 */
public interface AnalyticsCollectionGate {
    /** Starts ([enabled] = true) or stops ([enabled] = false) the collection immediately. */
    public fun onAnalyticsConsentChanged(enabled: Boolean)
}

/** Inert default: no analytics engine is bound yet. */
public object NoOpAnalyticsCollectionGate : AnalyticsCollectionGate {
    override fun onAnalyticsConsentChanged(enabled: Boolean) = Unit
}
