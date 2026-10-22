package me.meeshy.core.database.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import kotlinx.coroutines.flow.Flow
import me.meeshy.core.database.entity.DirectoryContactEntity

@Dao
public interface DirectoryContactDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    public suspend fun insertAll(rows: List<DirectoryContactEntity>)

    @Query("SELECT * FROM directory_contacts ORDER BY sortIndex")
    public fun observeAll(): Flow<List<DirectoryContactEntity>>

    @Query("SELECT * FROM directory_contacts ORDER BY sortIndex")
    public suspend fun all(): List<DirectoryContactEntity>

    @Query("DELETE FROM directory_contacts")
    public suspend fun clear()

    @Transaction
    public suspend fun replaceAll(rows: List<DirectoryContactEntity>) {
        clear()
        insertAll(rows)
    }
}
