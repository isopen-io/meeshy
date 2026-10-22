package me.meeshy.core.database.migration

import androidx.sqlite.db.SupportSQLiteDatabase

/**
 * SQLite cannot alter a primary key or a column constraint in place: copy into a fresh table,
 * drop the old one, rename. Every row survives; [columnSources] maps each column of the NEW table
 * to the SQL expression read from the old one (e.g. "`id`", or "COALESCE(`seq`, 0)").
 * Indexes die with the old table and are recreated from [indexSql] after the rename.
 */
internal fun SupportSQLiteDatabase.rebuildTable(
    table: String,
    createSql: (tableName: String) -> String,
    columnSources: Map<String, String>,
    indexSql: List<String> = emptyList(),
) {
    val staging = "${table}_rebuild"
    val columns = columnSources.keys.joinToString(", ") { "`$it`" }
    val sources = columnSources.values.joinToString(", ")
    execSQL("DROP TABLE IF EXISTS `$staging`")
    execSQL(createSql(staging))
    execSQL("INSERT INTO `$staging` ($columns) SELECT $sources FROM `$table`")
    execSQL("DROP TABLE `$table`")
    execSQL("ALTER TABLE `$staging` RENAME TO `$table`")
    indexSql.forEach(::execSQL)
}
