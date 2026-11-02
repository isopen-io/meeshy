package me.meeshy.sdk.auth

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.model.AuthSession
import me.meeshy.sdk.model.auth.SessionOrigin
import me.meeshy.sdk.session.SessionRepository
import javax.inject.Inject

/** Le port de [ProvenSessionOpener] sur l'authentification réelle. */
internal class AuthRepositoryProvenSessionPort @Inject constructor(
    private val authRepository: AuthRepository,
    private val sessionRepository: SessionRepository,
) : ProvenSessionPort {
    override val isAuthenticated: Boolean get() = authRepository.isAuthenticated
    override val activeUserId: String? get() = sessionRepository.currentUserId

    override fun install(session: AuthSession, origin: SessionOrigin) = authRepository.adoptSession(session, origin)

    override suspend fun closeServerSession(jwt: String, sessionToken: String?): Boolean =
        authRepository.closeProvenServerSession(jwt, sessionToken)
}

@Module
@InstallIn(SingletonComponent::class)
internal abstract class ProvenSessionModule {
    @Binds
    abstract fun bindsProvenSessionPort(impl: AuthRepositoryProvenSessionPort): ProvenSessionPort
}
