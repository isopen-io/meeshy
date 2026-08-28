package me.meeshy.sdk.socket

import io.mockk.mockk
import io.mockk.verify
import io.mockk.verifyOrder
import org.junit.Test

class RealtimeSessionCoordinatorTest {

    private val socketManager: SocketManager = mockk(relaxed = true)
    private val messageSocketManager: MessageSocketManager = mockk(relaxed = true)
    private val socialSocketManager: SocialSocketManager = mockk(relaxed = true)
    private val categorySocketManager: CategorySocketManager = mockk(relaxed = true)
    private val preferencesSocketManager: PreferencesSocketManager = mockk(relaxed = true)
    private val preferencesSyncCoordinator: me.meeshy.sdk.preferences.PreferencesSyncCoordinator =
        mockk(relaxed = true)
    private val callSignalManager: CallSignalManager = mockk(relaxed = true)

    private fun coordinator() = RealtimeSessionCoordinator(
        socketManager = socketManager,
        messageSocketManager = messageSocketManager,
        socialSocketManager = socialSocketManager,
        categorySocketManager = categorySocketManager,
        preferencesSocketManager = preferencesSocketManager,
        preferencesSyncCoordinator = preferencesSyncCoordinator,
        callSignalManager = callSignalManager,
    )

    @Test
    fun `signing in connects then attaches every feature manager`() {
        coordinator().onAuthenticatedChanged(isAuthenticated = true)

        verifyOrder {
            socketManager.connect()
            messageSocketManager.attach()
            socialSocketManager.attach()
            categorySocketManager.attach()
            preferencesSocketManager.attach()
            callSignalManager.attach()
            preferencesSyncCoordinator.start()
        }
    }

    @Test
    fun `a redundant authenticated signal does not reconnect or re-attach`() {
        val coordinator = coordinator()

        coordinator.onAuthenticatedChanged(isAuthenticated = true)
        coordinator.onAuthenticatedChanged(isAuthenticated = true)

        verify(exactly = 1) { socketManager.connect() }
        verify(exactly = 1) { messageSocketManager.attach() }
        verify(exactly = 1) { socialSocketManager.attach() }
        verify(exactly = 1) { categorySocketManager.attach() }
        verify(exactly = 1) { preferencesSocketManager.attach() }
        verify(exactly = 1) { preferencesSyncCoordinator.start() }
        verify(exactly = 1) { callSignalManager.attach() }
    }

    @Test
    fun `signing out disconnects the socket`() {
        val coordinator = coordinator()

        coordinator.onAuthenticatedChanged(isAuthenticated = true)
        coordinator.onAuthenticatedChanged(isAuthenticated = false)

        verify(exactly = 1) { socketManager.disconnect() }
    }

    /**
     * Le collecteur de preferences vit pour la SESSION, pas pour le socket : sans cet
     * arret, il resterait abonne apres une deconnexion et rejouerait une relecture sur
     * le compte suivant.
     */
    @Test
    fun `signing out stops the preferences collector`() {
        val coordinator = coordinator()

        coordinator.onAuthenticatedChanged(isAuthenticated = true)
        coordinator.onAuthenticatedChanged(isAuthenticated = false)

        verify(exactly = 1) { preferencesSyncCoordinator.stop() }
    }

    @Test
    fun `an initial unauthenticated signal touches nothing`() {
        coordinator().onAuthenticatedChanged(isAuthenticated = false)

        verify(exactly = 0) { socketManager.connect() }
        verify(exactly = 0) { socketManager.disconnect() }
        verify(exactly = 0) { messageSocketManager.attach() }
    }

    @Test
    fun `a redundant unauthenticated signal does not disconnect again`() {
        val coordinator = coordinator()

        coordinator.onAuthenticatedChanged(isAuthenticated = true)
        coordinator.onAuthenticatedChanged(isAuthenticated = false)
        coordinator.onAuthenticatedChanged(isAuthenticated = false)

        verify(exactly = 1) { socketManager.disconnect() }
    }

    @Test
    fun `reconnecting after a logout re-attaches on the new socket`() {
        val coordinator = coordinator()

        coordinator.onAuthenticatedChanged(isAuthenticated = true)
        coordinator.onAuthenticatedChanged(isAuthenticated = false)
        coordinator.onAuthenticatedChanged(isAuthenticated = true)

        verify(exactly = 2) { socketManager.connect() }
        verify(exactly = 2) { messageSocketManager.attach() }
        verify(exactly = 2) { socialSocketManager.attach() }
        verify(exactly = 2) { categorySocketManager.attach() }
        verify(exactly = 2) { preferencesSocketManager.attach() }
        verify(exactly = 2) { preferencesSyncCoordinator.start() }
        verify(exactly = 2) { callSignalManager.attach() }
        verify(exactly = 1) { socketManager.disconnect() }
    }
}
