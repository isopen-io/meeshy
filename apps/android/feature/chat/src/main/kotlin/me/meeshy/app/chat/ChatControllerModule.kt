package me.meeshy.app.chat

import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.Multibinds

/**
 * Declares the `Set<ChatController>` multibinding — the extension point of the
 * conversation screen. Declared empty here so the set is injectable before any lot
 * contributes to it; a lot adds its controller with a module of its own:
 *
 * ```
 * @Module @InstallIn(SingletonComponent::class)
 * abstract class GalleryControllerModule {
 *     @Binds @IntoSet abstract fun controller(impl: GalleryController): ChatController
 * }
 * ```
 */
@Module
@InstallIn(SingletonComponent::class)
abstract class ChatControllerModule {

    @Multibinds
    abstract fun chatControllers(): Set<ChatController>
}
