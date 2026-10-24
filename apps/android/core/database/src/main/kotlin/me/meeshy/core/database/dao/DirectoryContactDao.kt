package me.meeshy.core.database.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import kotlinx.coroutines.flow.Flow
import me.meeshy.core.database.entity.DirectoryContactEntity

@Dao
public abstract class DirectoryContactDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    public abstract suspend fun insertAll(rows: List<DirectoryContactEntity>)

    @Query("SELECT * FROM directory_contacts ORDER BY sortIndex")
    public abstract fun observeAll(): Flow<List<DirectoryContactEntity>>

    @Query("SELECT * FROM directory_contacts ORDER BY sortIndex")
    public abstract suspend fun all(): List<DirectoryContactEntity>

    @Query("DELETE FROM directory_contacts")
    public abstract suspend fun clear()

    @Transaction
    public open suspend fun replaceAll(rows: List<DirectoryContactEntity>) {
        clear()
        insertAll(rows)
    }
}
