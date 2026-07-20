package me.meeshy.sdk.outbox

/**
 * Encodes a **set** of prerequisite `cmid`s into the single `dependsOn` text column
 * and back, so one dependent can gate on *several* prerequisites — e.g. a media
 * story queued offline behind more than one still-pending upload (ARCHITECTURE.md
 * §5). The original single-`dependsOn` model only expressed one prerequisite.
 *
 * **Format.** Members are joined and wrapped with the reserved [DELIMITER] (`'|'`,
 * which a `cmid` — `cmid_<uuid>` — never contains): `{a, b}` → `"|a|b|"`. Wrapping
 * each end makes a membership test a plain substring match (`"|a|"`), so the
 * drain-time graft can find every dependent of one delivered prerequisite with a
 * single `LIKE` ([likePattern]).
 *
 * A pure, stateless building block: it knows nothing about *why* a dependency
 * exists, only how to round-trip the set through one column.
 */
public object OutboxDependencyKey {

    /** Reserved member separator/wrapper — a `cmid` never contains it. */
    private const val DELIMITER: Char = '|'

    /** SQLite `LIKE` escape character; pair it with `ESCAPE '\'` in the query. */
    public const val LIKE_ESCAPE: Char = '\\'

    /**
     * Encodes [cmids] into a wrapped key — blanks dropped, duplicates collapsed,
     * insertion order preserved. Returns `null` when nothing remains, i.e. an
     * unconstrained row (no `dependsOn`), so the column stays `null` for a free row.
     */
    public fun encode(cmids: Collection<String>): String? {
        val members = cmids.map(String::trim).filter(String::isNotEmpty).distinct()
        if (members.isEmpty()) return null
        return members.joinToString(
            separator = DELIMITER.toString(),
            prefix = DELIMITER.toString(),
            postfix = DELIMITER.toString(),
        )
    }

    /**
     * Decodes a key back to its members. `null`/blank → empty list; a **bare**
     * `cmid` with no delimiter → a singleton, so a value written by the old
     * single-prerequisite model still resolves to exactly that one prerequisite.
     */
    public fun decode(key: String?): List<String> {
        if (key.isNullOrBlank()) return emptyList()
        return key.split(DELIMITER).map(String::trim).filter(String::isNotEmpty).distinct()
    }

    /**
     * A SQLite `LIKE` pattern (use with `ESCAPE '\'`) matching every key that holds
     * [cmid] as a member. `cmid`s contain `_`, a `LIKE` wildcard, so the member is
     * escaped to keep the match literal — `cmid_a` never spuriously matches `cmidXa`.
     */
    public fun likePattern(cmid: String): String =
        "%$DELIMITER${escapeLike(cmid)}$DELIMITER%"

    /** Escapes the `LIKE` metacharacters (`\`, `%`, `_`) in [value] for `ESCAPE '\'`. */
    internal fun escapeLike(value: String): String = buildString(value.length) {
        for (c in value) {
            when (c) {
                LIKE_ESCAPE, '%', '_' -> append(LIKE_ESCAPE).append(c)
                else -> append(c)
            }
        }
    }
}
