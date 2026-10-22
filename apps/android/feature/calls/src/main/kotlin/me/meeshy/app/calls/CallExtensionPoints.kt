package me.meeshy.app.calls

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.Multibinds
import me.meeshy.sdk.model.call.CallAction
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The seams a call capability plugs into, gathered so the [CallViewModel] and the
 * call screen take ONE dependency for all of them instead of one parameter per
 * capability:
 *
 *  - [controllers] — logic: receives every FSM transition and remote event;
 *  - [overlays] — UI: layers drawn in a slot of the call screen;
 *  - [actions] — controls: user actions offered and run on tap;
 *  - [toasts] — feedback: the outcome of a local action, posted from anywhere;
 *  - [videoHealth] — input: whether the app froze the outgoing video.
 *
 * Adding a capability never edits this class: it contributes to the multibindings
 * of [CallExtensionPointsModule] from its own module. A capability injects the
 * individual seam it needs ([CallToastBus], [CallHaptics]…), never this holder:
 * the holder depends on the registries, which depend on the capabilities, so
 * injecting it back would be a dependency cycle.
 */
@Singleton
class CallExtensionPoints @Inject constructor(
    val controllers: CallFeatureControllerRegistry,
    val overlays: CallOverlayRegistry,
    val actions: CallActionDispatcher,
    val toasts: CallToastBus,
    val videoHealth: CallVideoHealth,
)

/**
 * Declares the three multibindings EMPTY so the call works with no capability
 * registered, and binds the interim implementations of the seams that have no
 * real source yet. A capability contributes with `@IntoSet` ([CallFeatureController],
 * [CallOverlay]) or `@IntoMap @CallActionKey(CallAction.X)` ([CallActionHandler]).
 */
@Module
@InstallIn(SingletonComponent::class)
interface CallExtensionPointsModule {
    @Multibinds
    fun featureControllers(): Set<@JvmSuppressWildcards CallFeatureController>

    @Multibinds
    fun overlays(): Set<@JvmSuppressWildcards CallOverlay>

    @Multibinds
    fun actionHandlers(): Map<CallAction, @JvmSuppressWildcards CallActionHandler>

    @Binds
    fun bindCallHaptics(impl: AndroidCallHaptics): CallHaptics

    @Binds
    fun bindCallVideoHealth(impl: NoopCallVideoHealth): CallVideoHealth
}
