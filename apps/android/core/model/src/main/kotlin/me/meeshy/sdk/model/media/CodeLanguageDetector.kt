package me.meeshy.sdk.model.media

import java.util.Locale
import me.meeshy.sdk.model.fileviewer.CodeLanguage

/**
 * Le langage d'une pièce jointe de code : nom de fichier et extension d'abord, puis type MIME. Complète
 * [CodeLanguage.detect] par les types MIME courants que les serveurs de fichiers déclarent pour le code
 * (`text/x-kotlin`, `application/x-httpd-php`…), jamais par l'inspection du contenu.
 */
object CodeLanguageDetector {

    private val extraMimes: Map<String, CodeLanguage> = mapOf(
        "text/x-kotlin" to CodeLanguage.KOTLIN, "text/x-scala" to CodeLanguage.SCALA,
        "text/x-sh" to CodeLanguage.SHELL, "application/x-shellscript" to CodeLanguage.SHELL,
        "application/x-httpd-php" to CodeLanguage.PHP, "text/x-objectivec" to CodeLanguage.OBJECTIVE_C,
        "text/jsx" to CodeLanguage.JAVASCRIPT, "text/tsx" to CodeLanguage.TYPESCRIPT,
        "application/x-typescript" to CodeLanguage.TYPESCRIPT, "application/x-javascript" to CodeLanguage.JAVASCRIPT,
        "text/x-rust" to CodeLanguage.RUST, "text/x-lua" to CodeLanguage.LUA, "text/x-perl" to CodeLanguage.PERL,
        "application/toml" to CodeLanguage.TOML, "text/x-toml" to CodeLanguage.TOML, "text/x-yaml" to CodeLanguage.YAML,
        "text/x-sql" to CodeLanguage.SQL, "application/ld+json" to CodeLanguage.JSON, "text/json" to CodeLanguage.JSON,
        "application/xhtml+xml" to CodeLanguage.HTML, "image/svg+xml" to CodeLanguage.XML,
        "text/x-dockerfile" to CodeLanguage.DOCKERFILE, "text/x-makefile" to CodeLanguage.MAKEFILE,
        "application/graphql" to CodeLanguage.GRAPHQL, "text/x-protobuf" to CodeLanguage.PROTOBUF,
    )

    fun detect(fileName: String, mimeType: String): CodeLanguage? =
        CodeLanguage.detect(fileName, mimeType)
            ?: extraMimes[mimeType.substringBefore(';').trim().lowercase(Locale.ROOT)]
}
