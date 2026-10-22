package me.meeshy.app.i18n

import me.meeshy.sdk.lang.CldrPluralCategories
import me.meeshy.sdk.lang.PluralCategory

// The localization rules of the Android resource tree, as PURE functions over in-memory XML.
// The guard applies them to the real modules (LocalizationGuardTest); LocalizationRulesTest
// proves each rule on synthetic fragments, so a rule that stops detecting turns red on its own.

internal data class ResourceFile(val folder: String, val fileName: String, val text: String)

internal data class ModuleResources(val module: String, val files: List<ResourceFile>)

internal enum class Rule(val id: String) {
    SHIPPED_LOCALE_MISSING("shipped-locale-missing"),
    DECLARED_LOCALE_WITHOUT_RESOURCES("declared-locale-without-resources"),
    MISSING_KEY("missing-key"),
    MISSING_QUANTITY("missing-quantity"),
    SPECIFIER_MISMATCH("specifier-mismatch"),
    NON_POSITIONAL("non-positional-specifiers"),
    BARE_SPECIFIER("bare-specifier"),
    DUPLICATE_DEFINITION("duplicate-definition"),
}

internal data class Finding(
    val rule: Rule,
    val module: String,
    val locale: String,
    val key: String,
    val detail: String,
) {
    val signature: String get() = listOf(rule.id, module, locale, key).joinToString(" ")

    override fun toString(): String =
        "[${rule.id}] module=$module locale=$locale clé=$key — $detail"

    companion object {
        const val NONE: String = "-"
    }
}

internal data class ParsedFile(val fileName: String, val entries: List<ResourceEntry>)

internal class ParsedModule private constructor(
    val module: String,
    private val byFolder: Map<String, List<ParsedFile>>,
) {
    val folders: Set<String> get() = byFolder.keys

    fun files(folder: String): List<ParsedFile> = byFolder[folder].orEmpty()

    fun baseEntries(): Map<ResourceId, ResourceEntry> = entriesOf(LocaleFolders.BASE_FOLDER)

    fun localeTags(): List<String> =
        byFolder.keys
            .mapNotNull(LocaleFolders::parse)
            .filter { it.language != LocaleFolders.BASE_LANGUAGE }
            .map { it.tag }
            .distinct()
            .sorted()

    fun effectiveEntries(tag: String): Map<ResourceId, ResourceEntry> {
        val language = tag.substringBefore('-')
        val ofLanguage = entriesOf(LocaleFolders.folderOf(language))
        return if (tag == language) ofLanguage else ofLanguage + entriesOf(LocaleFolders.folderOf(tag))
    }

    private fun entriesOf(folder: String): Map<ResourceId, ResourceEntry> =
        files(folder).flatMap { it.entries }.associateBy { it.id }

    companion object {
        fun of(resources: ModuleResources): ParsedModule {
            val parsed = resources.files.map { file ->
                val entries = runCatching { ResourceParser.parse(file.text) }.getOrElse { cause ->
                    throw IllegalStateException(
                        "${resources.module} ${file.folder}/${file.fileName} : XML illisible — ${cause.message}",
                        cause,
                    )
                }
                file.folder to ParsedFile(file.fileName, entries)
            }
            return ParsedModule(resources.module, parsed.groupBy({ it.first }, { it.second }))
        }
    }
}

internal object LocalizationRules {

    fun check(
        resources: ModuleResources,
        shippedLocales: List<String>,
        legalExemptLocales: Set<String> = emptySet(),
    ): List<Finding> {
        val module = ParsedModule.of(resources)
        return shippedLocaleFolders(module, shippedLocales) +
            missingKeys(module, legalExemptLocales) +
            missingQuantities(module) +
            specifierMismatches(module) +
            nonPositionalSpecifiers(module) +
            bareSpecifiers(module) +
            duplicateDefinitions(module)
    }

    fun declaredLocalesWithoutResources(
        modules: List<ModuleResources>,
        declaredCodes: List<String>,
    ): List<Finding> =
        declaredCodes.map(LocaleFolders::normalizeTag).distinct().mapNotNull { code ->
            val folder = LocaleFolders.folderOf(code)
            val lacking = modules.filter { module -> module.files.none { it.folder == folder } }
            if (lacking.isEmpty()) {
                null
            } else {
                Finding(
                    rule = Rule.DECLARED_LOCALE_WITHOUT_RESOURCES,
                    module = Finding.NONE,
                    locale = code,
                    key = Finding.NONE,
                    detail = "AppLanguage.supportedCodes déclare « $code » mais ${lacking.size} module(s) " +
                        "n'ont pas de dossier $folder : ${lacking.joinToString { it.module }}",
                )
            }
        }

    fun shippedLocaleFolders(module: ParsedModule, shippedLocales: List<String>): List<Finding> =
        shippedLocales.map(LocaleFolders::normalizeTag).distinct().mapNotNull { tag ->
            val folder = LocaleFolders.folderOf(tag)
            if (folder in module.folders) {
                null
            } else {
                Finding(
                    rule = Rule.SHIPPED_LOCALE_MISSING,
                    module = module.module,
                    locale = tag,
                    key = Finding.NONE,
                    detail = "shipped-locales.txt impose le dossier res/$folder, absent du module",
                )
            }
        }

    // Legal texts wait for a validated legal translation: the locales listed in
    // legal-locale-exemptions.txt fall back to English for the keys defined in values/legal.xml,
    // and for those keys only.
    fun missingKeys(module: ParsedModule, legalExemptLocales: Set<String> = emptySet()): List<Finding> {
        val required = module.baseEntries().values.filter { it.translatable }
        val legalIds = module.files(LocaleFolders.BASE_FOLDER)
            .filter { it.fileName == LEGAL_FILE }.flatMap { it.entries }.map { it.id }.toSet()
        return module.localeTags().flatMap { tag ->
            val present = module.effectiveEntries(tag).keys
            val exempt = if (tag in legalExemptLocales) legalIds else emptySet()
            required.filter { it.id !in present && it.id !in exempt }.map { entry ->
                Finding(
                    rule = Rule.MISSING_KEY,
                    module = module.module,
                    locale = tag,
                    key = entry.name,
                    detail = "${entry.type.label} défini dans values/ mais absent de ${LocaleFolders.folderOf(tag)}/",
                )
            }
        }
    }

    fun missingQuantities(module: ParsedModule): List<Finding> {
        val locales = listOf(LocaleFolders.BASE_LANGUAGE) + module.localeTags()
        return locales.flatMap { tag ->
            val entries = if (tag == LocaleFolders.BASE_LANGUAGE) module.baseEntries() else module.effectiveEntries(tag)
            val required = CldrPluralCategories.required(tag)
            entries.values.filterIsInstance<PluralsEntry>().filter { it.translatable }.mapNotNull { plural ->
                val present = plural.items.keys.mapNotNull(PluralCategory::fromKeyword).toSet()
                val missing = required.filterNot { it in present }
                if (missing.isEmpty()) {
                    null
                } else {
                    Finding(
                        rule = Rule.MISSING_QUANTITY,
                        module = module.module,
                        locale = tag,
                        key = plural.name,
                        detail = "<plurals> sans la quantité ${missing.joinToString { it.keyword }} " +
                            "(CLDR exige ${required.joinToString { it.keyword }} pour « ${tag.substringBefore('-')} »)",
                    )
                }
            }
        }
    }

    fun specifierMismatches(module: ParsedModule): List<Finding> {
        val base = module.baseEntries()
        return module.localeTags().flatMap { tag ->
            val translated = module.effectiveEntries(tag)
            base.values.filter { it.translatable }.mapNotNull { entry ->
                val expected = comparableSpecifiers(entry) ?: return@mapNotNull null
                val actual = translated[entry.id]?.let(::comparableSpecifiers) ?: return@mapNotNull null
                if (expected == actual) {
                    null
                } else {
                    Finding(
                        rule = Rule.SPECIFIER_MISMATCH,
                        module = module.module,
                        locale = tag,
                        key = entry.name,
                        detail = "spécificateurs attendus (values/) $expected, trouvés $actual",
                    )
                }
            }
        }
    }

    private fun comparableSpecifiers(entry: ResourceEntry): List<String>? =
        when (entry) {
            is StringEntry -> if (entry.formatted) FormatSpecifiers.multiset(entry.value) else null
            is PluralsEntry -> entry.items["other"]?.let(FormatSpecifiers::multiset)
            is ArrayEntry -> null
        }

    fun nonPositionalSpecifiers(module: ParsedModule): List<Finding> =
        module.folders
            .flatMap { folder ->
                module.files(folder).flatMap { it.entries }
                    .flatMap { entry -> formattedTexts(entry).map { entry to it } }
                    .filter { (_, text) -> FormatSpecifiers.of(text).let { it.size >= 2 && it.any { s -> !s.positional } } }
                    .map { (entry, text) ->
                        Finding(
                            rule = Rule.NON_POSITIONAL,
                            module = module.module,
                            locale = localeOf(folder),
                            key = entry.name,
                            detail = "plusieurs spécificateurs dont un n'est pas positionnel (${FormatSpecifiers.multiset(text)}) : " +
                                "écrire %1\$s, %2\$d… pour qu'une traduction puisse réordonner",
                        )
                    }
            }
            .distinct()

    fun bareSpecifiers(module: ParsedModule): List<Finding> =
        module.baseEntries().values.filter { it.translatable }.mapNotNull { entry ->
            val bare = formattedTexts(entry).any { text ->
                FormatSpecifiers.of(text).let { it.size == 1 && !it.single().positional }
            }
            if (!bare) {
                null
            } else {
                Finding(
                    rule = Rule.BARE_SPECIFIER,
                    module = module.module,
                    locale = LocaleFolders.BASE_LANGUAGE,
                    key = entry.name,
                    detail = "spécificateur nu : la génération depuis iOS les produit positionnels (%1\$d), " +
                        "et une traduction ne peut pas le réordonner",
                )
            }
        }

    private fun formattedTexts(entry: ResourceEntry): List<String> =
        when (entry) {
            is StringEntry -> if (entry.formatted) listOf(entry.value) else emptyList()
            is PluralsEntry -> entry.items.values.toList()
            is ArrayEntry -> emptyList()
        }

    fun duplicateDefinitions(module: ParsedModule): List<Finding> =
        module.folders
            .flatMap { folder ->
                module.files(folder)
                    .flatMap { file -> file.entries.map { it.id to file.fileName } }
                    .groupBy({ it.first }, { it.second })
                    .filterValues { it.size > 1 }
                    .map { (id, fileNames) ->
                        Finding(
                            rule = Rule.DUPLICATE_DEFINITION,
                            module = module.module,
                            locale = localeOf(folder),
                            key = id.name,
                            detail = duplicateDetail(folder, id, fileNames),
                        )
                    }
            }

    private fun duplicateDetail(folder: String, id: ResourceId, fileNames: List<String>): String {
        val where = "${id.type.label} défini ${fileNames.size} fois dans $folder/ (${fileNames.joinToString()})"
        val generated = GENERATED_FILE in fileNames
        val handWritten = fileNames.any { it != GENERATED_FILE }
        return if (generated && handWritten) {
            "$where : généré ET écrit à la main — retirer la clé du fichier à la main, le générateur la porte"
        } else {
            where
        }
    }

    private fun localeOf(folder: String): String = LocaleFolders.parse(folder)?.tag ?: folder

    const val GENERATED_FILE: String = "strings_generated.xml"
    const val LEGAL_FILE: String = "legal.xml"

    fun parseLegalExemptions(lines: List<String>): Set<String> =
        lines.map { line ->
            val tokens = line.split(Regex("\\s+"))
            require(tokens.size == 2 && tokens[1] == LEGAL_FILE) {
                "exemption invalide « $line » : attendu « locale $LEGAL_FILE » (aucun autre fichier n'est exemptable)"
            }
            LocaleFolders.normalizeTag(tokens[0])
        }.toSet()
}

internal data class RatchetVerdict<T>(val unexpected: List<T>, val stale: List<String>)

internal object Ratchet {

    fun <T> diff(actual: List<T>, recorded: List<String>, keyOf: (T) -> String): RatchetVerdict<T> {
        val remaining = recorded.toMutableList()
        val unexpected = actual.filterNot { remaining.remove(keyOf(it)) }
        return RatchetVerdict(unexpected = unexpected, stale = remaining.toList())
    }

    fun parseLines(text: String): List<String> =
        text.lineSequence()
            .map { it.substringBefore('#').trim() }
            .filter { it.isNotEmpty() }
            .toList()

    fun parseGapSignatures(text: String): List<String> =
        parseLines(text).map { line ->
            val tokens = line.split(Regex("\\s+"))
            require(tokens.size == 4) {
                "ligne d'écart connu invalide « $line » : attendu « règle module locale clé » (« - » si sans objet)"
            }
            tokens.joinToString(" ")
        }
}
