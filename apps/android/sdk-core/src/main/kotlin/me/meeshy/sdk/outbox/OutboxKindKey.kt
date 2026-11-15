package me.meeshy.sdk.outbox

import dagger.MapKey

/**
 * Hilt map key that binds one [OutboxKindHandler] to the [OutboxKind] it delivers
 * (ARCHITECTURE.md §5; ADR-006).
 *
 * A handler is registered with `@Binds @IntoMap @OutboxKindKey(OutboxKind.X)` in its
 * domain file under `outbox/senders/`; [MutationSenderRegistry] receives the whole
 * `Map<OutboxKind, OutboxKindHandler>`. Dagger refuses a duplicate key at compile
 * time, and `SenderRegistryCompletenessTest` turns red when a kind has no binding —
 * so a new mutation kind is one enum value (at the end) plus one handler file, and
 * [OutboxFlushWorker] is never edited.
 */
@MapKey
@Retention(AnnotationRetention.RUNTIME)
@Target(AnnotationTarget.FUNCTION)
public annotation class OutboxKindKey(val value: OutboxKind)
