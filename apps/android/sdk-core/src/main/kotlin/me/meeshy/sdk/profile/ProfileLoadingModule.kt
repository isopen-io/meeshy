package me.meeshy.sdk.profile

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

@Module
@InstallIn(SingletonComponent::class)
internal abstract class ProfileLoadingModule {
    @Binds
    abstract fun bindRemote(remote: UserRepositoryProfileRemote): ProfileRemote
}
