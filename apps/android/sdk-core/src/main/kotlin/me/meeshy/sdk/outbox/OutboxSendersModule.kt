package me.meeshy.sdk.outbox

import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.Multibinds

/**
 * Declares the [OutboxKind] -> [OutboxKindHandler] map that every domain's
 * `@Binds @IntoMap @OutboxKindKey(...)` contributes to (see `outbox/senders/`), so the
 * map exists even before the first contribution and a missing domain module fails
 * `SenderRegistryCompletenessTest`, not Dagger's graph validation.
 */
@Module
@InstallIn(SingletonComponent::class)
public interface OutboxSendersModule {
    @Multibinds
    public fun outboxKindHandlers(): Map<OutboxKind, @JvmSuppressWildcards OutboxKindHandler>
}
