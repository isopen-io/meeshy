package me.meeshy.sdk.model.export

/**
 * The two formats the gateway can serialise an export in — port of iOS `DataExportView.ExportFormat`.
 *
 * [wireValue] is the single source of truth for the `?format=` query token the gateway
 * `querystring` enum accepts (`json` | `csv`); the UI renders a localized label instead.
 */
public enum class ExportFormat(public val wireValue: String) {
    JSON("json"),
    CSV("csv"),
    ;

    public companion object {
        /** Fixed presentation order for the format picker. */
        public val ordered: List<ExportFormat> = listOf(JSON, CSV)
    }
}

/**
 * The user's export scope choice: the serialisation [format] plus which optional content sections
 * to include. The `profile` section is **always** exported (it is the identity core of a GDPR
 * portability request and is never toggleable — parity with iOS, which hard-codes `["profile"]`),
 * so only `messages` and `contacts` are selectable here.
 */
public data class DataExportSelection(
    val format: ExportFormat = ExportFormat.JSON,
    val includeMessages: Boolean = true,
    val includeContacts: Boolean = true,
)

/** The two query params `GET /me/export` takes: `format` and a comma-separated `types` list. */
public data class DataExportQuery(
    val format: String,
    val types: String,
)

/**
 * Pure builder projecting a [DataExportSelection] into the [DataExportQuery] wire params — the
 * single source of truth for the `types` list order and the always-on `profile` rule.
 *
 * Keeping the projection pure (no I/O) lets the always-profile invariant and the messages/contacts
 * inclusion be branch-tested off the JVM, and keeps [me.meeshy.sdk] repositories thin callers.
 * The `types` order (`profile`, then `messages`, then `contacts`) mirrors the gateway's
 * `parseTypes` valid-order and the iOS request.
 */
public object DataExportRequestBuilder {
    /** The section that is always present in an export — never user-toggleable. */
    public const val ALWAYS_TYPE: String = "profile"

    public fun build(selection: DataExportSelection): DataExportQuery {
        val types = buildList {
            add(ALWAYS_TYPE)
            if (selection.includeMessages) add("messages")
            if (selection.includeContacts) add("contacts")
        }
        return DataExportQuery(
            format = selection.format.wireValue,
            types = types.joinToString(","),
        )
    }
}
