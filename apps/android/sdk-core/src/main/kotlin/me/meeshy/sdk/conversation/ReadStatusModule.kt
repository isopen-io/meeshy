package me.meeshy.sdk.conversation

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.socket.MessageSocketManager

@Module
@InstallIn(SingletonComponent::class)
object ReadStatusModule {
    @Provides
    fun provideReadStatusEvents(socket: MessageSocketManager): ReadStatusEvents =
        ReadStatusEvents { socket.readStatusUpdated }
}
