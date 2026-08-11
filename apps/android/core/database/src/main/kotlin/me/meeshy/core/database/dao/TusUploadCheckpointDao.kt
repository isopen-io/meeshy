package me.meeshy.core.database.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import me.meeshy.core.database.entity.TusUploadCheckpointEntity

@Dao
public interface TusUploadCheckpointDao {

    @Query("SELECT * FROM tus_upload_checkpoint WHERE checkpointKey = :checkpointKey")
    public suspend fun find(checkpointKey: String): TusUploadCheckpointEntity?

    @Upsert
    public suspend fun upsert(row: TusUploadCheckpointEntity)

    @Query("DELETE FROM tus_upload_checkpoint WHERE checkpointKey = :checkpointKey")
    public suspend fun delete(checkpointKey: String)

    @Query("DELETE FROM tus_upload_checkpoint")
    public suspend fun clear()
}
