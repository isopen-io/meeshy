package me.meeshy.core.database.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Persisted progress of an in-flight TUS upload session (`feature-parity.md` §Q — the
 * "persistent checkpoint" follow-up to `tus-chunked-upload-core`, ADR-004: Room is the
 * SoT). [checkpointKey] is `me.meeshy.sdk.model.media.TusCheckpointKey.of(...)` — stable
 * across retries of the same content, distinct for different content. [location] is the
 * TUS session URL returned by the gateway's `POST /uploads`; [uploadedBytes] is the
 * offset of the last chunk PATCH the gateway acknowledged (only ever written after a
 * confirmed success — see `me.meeshy.sdk.model.media.TusResumePlanner`'s doc comment for
 * why zero-progress rows are never resumed from).
 *
 * A row is deleted once its upload completes (the final chunk's PATCH succeeds) or once
 * a retry decides to start fresh — its *absence* is therefore the normal steady state,
 * not an error.
 */
@Entity(tableName = "tus_upload_checkpoint")
public data class TusUploadCheckpointEntity(
    @PrimaryKey val checkpointKey: String,
    val location: String,
    val uploadedBytes: Long,
    val totalBytes: Long,
    val updatedAt: Long,
)
