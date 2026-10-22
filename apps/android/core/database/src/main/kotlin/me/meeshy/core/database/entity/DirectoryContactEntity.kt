package me.meeshy.core.database.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

/** A registered address-book contact as a JSON payload (tpm-address-book-directory). */
@Entity(tableName = "directory_contacts")
public data class DirectoryContactEntity(
    @PrimaryKey val contactId: String,
    val payload: String,
    val sortIndex: Int,
    val cachedAt: Long,
)
