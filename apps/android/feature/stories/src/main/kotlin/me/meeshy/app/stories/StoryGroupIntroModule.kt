package me.meeshy.app.stories

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.profile.ProfileCacheRepository
import me.meeshy.sdk.cache.valueOrNull
import me.meeshy.sdk.status.StatusBarCache
import me.meeshy.sdk.status.StatusFeedMode
import me.meeshy.sdk.status.StatusRepository
import me.meeshy.sdk.user.UserRepository

@Module
@InstallIn(SingletonComponent::class)
object StoryGroupIntroModule {
    @Provides
    fun storyGroupIntroResolver(
        profiles: ProfileCacheRepository,
        users: UserRepository,
        statusCache: StatusBarCache,
        statuses: StatusRepository,
        clock: CacheClock,
    ): StoryGroupIntroResolver = StoryGroupIntroResolver(
        cachedProfile = profiles::cachedProfile,
        fetchProfile = { id -> users.getProfile(id).getOrNull() },
        storeProfile = { user, key -> profiles.store(user, key, profiles.ticket()) },
        moods = {
            statusCache.load(StatusFeedMode.FRIENDS).valueOrNull
                ?: statuses.list(StatusFeedMode.FRIENDS).getOrNull()?.statuses.orEmpty()
        },
        nowMillis = clock::nowMillis,
    )
}
