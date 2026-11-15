package me.meeshy.app.push

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import me.meeshy.app.calls.CallRingSilencing

/** La couture « couper la sonnerie » de l'écran d'appel (#13816) : la notification d'appel entrant, qui possède cette sonnerie. */
@Module
@InstallIn(SingletonComponent::class)
interface IncomingRingSilencerModule {
    @Binds
    fun bindRingSilencer(impl: IncomingCallNotificationPresenter): CallRingSilencing
}
