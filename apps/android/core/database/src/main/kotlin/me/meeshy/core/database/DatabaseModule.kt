package me.meeshy.core.database

import android.content.Context
import androidx.room.Room
import androidx.room.RoomDatabase
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import me.meeshy.core.database.dao.BlockedUserDao
import me.meeshy.core.database.dao.CacheEntryDao
import me.meeshy.core.database.dao.CallHistoryDao
import me.meeshy.core.database.dao.ConversationDao
import me.meeshy.core.database.dao.DirectoryContactDao
import me.meeshy.core.database.dao.EditRevisionDao
import me.meeshy.core.database.dao.EphemeralReceiptDao
import me.meeshy.core.database.dao.FriendDao
import me.meeshy.core.database.dao.FriendRequestDao
import me.meeshy.core.database.dao.KeyedJsonCacheDao
import me.meeshy.core.database.dao.MediaBlobDao
import me.meeshy.core.database.dao.MediaIndexDao
import me.meeshy.core.database.dao.MessageDao
import me.meeshy.core.database.dao.OutboxDao
import me.meeshy.core.database.dao.NotificationDao
import me.meeshy.core.database.dao.PendingIdDao
import me.meeshy.core.database.dao.ProfileStatsCacheDao
import me.meeshy.core.database.dao.StatusBarCacheDao
import me.meeshy.core.database.dao.StoryDao
import me.meeshy.core.database.dao.SuggestionDao
import me.meeshy.core.database.dao.SyncMetaDao
import me.meeshy.core.database.dao.TusUploadCheckpointDao
import me.meeshy.core.database.crypto.DatabaseKeyProvider
import me.meeshy.core.database.crypto.EncryptedDatabaseBootstrap
import me.meeshy.core.database.crypto.EncryptionEventSink
import me.meeshy.core.database.crypto.PlaintextDatabaseMigrator
import me.meeshy.core.database.crypto.SqlCipherRuntime
import me.meeshy.core.datastore.DatabaseKeyVault
import me.meeshy.core.database.migration.MeeshyMigrations
import me.meeshy.sdk.model.security.SecureStore
import me.meeshy.core.database.search.SearchIndexSchema
import java.io.File
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
internal object DatabaseModule {

    @Provides
    @Singleton
    fun providesDatabase(
        @ApplicationContext context: Context,
        diagnostics: DatabaseInitDiagnostics,
        health: StorageHealth,
        leftovers: DatabaseLeftovers,
        encryption: EncryptedDatabaseBootstrap,
    ): MeeshyDatabase = encryptedOpener(
        context = context,
        primaryName = DATABASE_NAME,
        diagnostics = diagnostics,
        health = health,
        encryption = encryption,
        secondaryFile = secondaryFile(context),
        leftovers = leftovers,
    ).open()

    /**
     * L'ouvreur de production, partagé avec le test instrumenté qui fait tourner le vrai SQLCipher. Seule la base
     * principale est sur disque, et elle est chiffrée (SQLCipher, ADR-013). Aucune base de repli n'est écrite
     * (`allowsSecondary = false`) : elle serait en clair ; un disque qui refuse mène à la base EN MÉMOIRE, qui ne laisse
     * rien sur l'appareil. Une base de repli laissée par une version antérieure est reprise puis supprimée. Un échec du
     * chiffrement n'est jamais un repli en clair : [DatabaseOpener] ouvre alors la base en mémoire. Seule exception, une
     * base DÉJÀ en clair que le disque ne peut pas encore exporter s'ouvre telle quelle, au plus
     * [EncryptedDatabaseBootstrap.MAX_DEFERRALS] lancements consécutifs, stockage dégradé
     * ([EncryptedDatabaseBootstrap.plaintextDeferred]) ; au-delà, la base s'ouvre en mémoire.
     */
    fun encryptedOpener(
        context: Context,
        primaryName: String,
        diagnostics: DatabaseInitDiagnostics,
        health: StorageHealth,
        encryption: EncryptedDatabaseBootstrap,
        secondaryFile: File,
        leftovers: DatabaseLeftovers? = null,
    ): DatabaseOpener = DatabaseOpener(
        context = context,
        diagnostics = diagnostics,
        health = health,
        primaryName = primaryName,
        secondaryFile = secondaryFile,
        leftovers = leftovers,
        readable = { file -> SqlCipherRuntime.isReadable(file, encryption) },
        prepare = {
            SqlCipherRuntime.ensureLoaded()
            encryption.prepare()
        },
        salvageOpener = SqlCipherRuntime.salvageOpener(encryption),
        allowsSecondary = false,
        build = { ctx, location ->
            val builder = meeshyDatabaseBuilder(ctx, location)
            val onDisk = location == DatabaseLocation.Named(primaryName)
            (if (onDisk) builder.openHelperFactory(SqlCipherRuntime.openHelperFactory(encryption)) else builder).build()
        },
    )

    @Provides
    @Singleton
    fun providesEncryptedDatabaseBootstrap(
        @ApplicationContext context: Context,
        @DatabaseKeyVault vault: SecureStore,
        diagnostics: DatabaseInitDiagnostics,
        health: StorageHealth,
    ): EncryptedDatabaseBootstrap = EncryptedDatabaseBootstrap(
        databaseFile = context.getDatabasePath(DATABASE_NAME),
        keys = DatabaseKeyProvider(vault),
        migrator = PlaintextDatabaseMigrator(SqlCipherRuntime.Engine),
        onEvent = EncryptionEventSink(diagnostics, health),
    )

    @Provides
    @Singleton
    fun providesDatabaseLeftovers(@ApplicationContext context: Context): DatabaseLeftovers =
        DatabaseLeftovers(primary = context.getDatabasePath(DATABASE_NAME), secondary = secondaryFile(context))

    private fun secondaryFile(context: Context): File = File(context.cacheDir, DatabaseOpener.SECONDARY_NAME)

    /** The production configuration, shared with the tests that open the database the way the app does. */
    fun meeshyDatabaseBuilder(context: Context, name: String = DATABASE_NAME): RoomDatabase.Builder<MeeshyDatabase> =
        meeshyDatabaseBuilder(context, DatabaseLocation.Named(name))

    /**
     * Journal WAL explicite, exécuteur de requêtes dédié, réglages posés à chaque connexion. Seules les versions
     * antérieures à la base exportée v16 sont purgées : une corruption n'est jamais masquée par une migration destructive,
     * ni effacée par la couche SQLite ([KeepCorruptFileOpenHelperFactory]) — [DatabaseOpener] en sauve ce qui ne se refait
     * pas, puis la met en quarantaine.
     */
    fun meeshyDatabaseBuilder(context: Context, location: DatabaseLocation): RoomDatabase.Builder<MeeshyDatabase> {
        val builder = when (location) {
            is DatabaseLocation.Named -> Room.databaseBuilder(context, MeeshyDatabase::class.java, location.name)
            DatabaseLocation.Memory -> Room.inMemoryDatabaseBuilder(context, MeeshyDatabase::class.java)
        }
        return builder
            .addMigrations(*MeeshyMigrations.all)
            .addCallback(SearchIndexSchema.callback)
            .addCallback(RetainedTranslationCascade.callback)
            .addCallback(DatabasePragmas.callback)
            .setJournalMode(RoomDatabase.JournalMode.WRITE_AHEAD_LOGGING)
            .setQueryExecutor(DatabasePragmas.sharedQueryExecutor)
            .openHelperFactory(KeepCorruptFileOpenHelperFactory())
            .fallbackToDestructiveMigrationFrom(*PRE_BASELINE_VERSIONS)
    }

    @Provides
    fun providesConversationDao(database: MeeshyDatabase): ConversationDao =
        database.conversationDao()

    @Provides
    fun providesSyncMetaDao(database: MeeshyDatabase): SyncMetaDao =
        database.syncMetaDao()

    @Provides
    fun providesOutboxDao(database: MeeshyDatabase): OutboxDao =
        database.outboxDao()

    @Provides
    fun providesMessageDao(database: MeeshyDatabase): MessageDao =
        database.messageDao()

    @Provides
    fun providesStoryDao(database: MeeshyDatabase): StoryDao =
        database.storyDao()

    @Provides
    fun providesMediaBlobDao(database: MeeshyDatabase): MediaBlobDao =
        database.mediaBlobDao()

    @Provides
    fun providesCallHistoryDao(database: MeeshyDatabase): CallHistoryDao =
        database.callHistoryDao()

    @Provides
    fun providesFriendDao(database: MeeshyDatabase): FriendDao =
        database.friendDao()

    @Provides
    fun providesSuggestionDao(database: MeeshyDatabase): SuggestionDao =
        database.suggestionDao()

    @Provides
    fun providesProfileStatsCacheDao(database: MeeshyDatabase): ProfileStatsCacheDao =
        database.profileStatsCacheDao()

    @Provides
    fun providesStatusBarCacheDao(database: MeeshyDatabase): StatusBarCacheDao =
        database.statusBarCacheDao()

    @Provides
    fun providesTusUploadCheckpointDao(database: MeeshyDatabase): TusUploadCheckpointDao =
        database.tusUploadCheckpointDao()

    @Provides
    fun providesFriendRequestDao(database: MeeshyDatabase): FriendRequestDao =
        database.friendRequestDao()

    @Provides
    fun providesBlockedUserDao(database: MeeshyDatabase): BlockedUserDao =
        database.blockedUserDao()

    @Provides
    fun providesEphemeralReceiptDao(database: MeeshyDatabase): EphemeralReceiptDao =
        database.ephemeralReceiptDao()

    @Provides
    fun providesEditRevisionDao(database: MeeshyDatabase): EditRevisionDao =
        database.editRevisionDao()

    @Provides
    fun providesDirectoryContactDao(database: MeeshyDatabase): DirectoryContactDao =
        database.directoryContactDao()

    @Provides
    fun providesMediaIndexDao(database: MeeshyDatabase): MediaIndexDao =
        database.mediaIndexDao()

    @Provides
    fun providesCacheEntryDao(database: MeeshyDatabase): CacheEntryDao =
        database.cacheEntryDao()

    @Provides
    fun providesKeyedJsonCacheDao(database: MeeshyDatabase): KeyedJsonCacheDao =
        database.keyedJsonCacheDao()

    @Provides
    fun providesPendingIdDao(database: MeeshyDatabase): PendingIdDao =
        database.pendingIdDao()

    @Provides
    fun providesNotificationDao(database: MeeshyDatabase): NotificationDao =
        database.notificationDao()

    private const val DATABASE_NAME = "meeshy.db"

    /** Builds older than the exported v16 baseline predate the schema lock; they alone are wiped. */
    private val PRE_BASELINE_VERSIONS: IntArray = IntArray(MeeshyMigrations.BASELINE_VERSION - 1) { it + 1 }
}
