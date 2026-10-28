package me.meeshy.sdk.model.fileviewer

import java.util.Locale

/**
 * Le langage d'un fichier de code (miroir de `CodeLanguage`, `MediaTypes.swift`, iOS) : nom affiché,
 * couleur de la pastille, et détection par nom de fichier, extension puis type MIME — dans cet ordre.
 */
enum class CodeLanguage(val displayName: String, val colorHex: String) {
    PYTHON("Python", "3776AB"), JAVASCRIPT("JavaScript", "F7DF1E"), TYPESCRIPT("TypeScript", "3178C6"),
    SWIFT("Swift", "F05138"), C("C", "555555"), CPP("C++", "00599C"), JAVA("Java", "ED8B00"),
    GO("Go", "00ADD8"), RUST("Rust", "DEA584"), RUBY("Ruby", "CC342D"), PHP("PHP", "777BB4"),
    SHELL("Shell", "4EAA25"), CSS("CSS", "1572B6"), HTML("HTML", "E34F26"), JSON("JSON", "292929"),
    YAML("YAML", "CB171E"), XML("XML", "0060AC"), SQL("SQL", "E38C00"), MARKDOWN("Markdown", "083FA1"),
    KOTLIN("Kotlin", "7F52FF"), SCALA("Scala", "DC322F"), DART("Dart", "0175C2"), LUA("Lua", "000080"),
    PERL("Perl", "39457E"), R("R", "276DC3"), OBJECTIVE_C("Obj-C", "438EFF"), DOCKERFILE("Dockerfile", "2496ED"),
    MAKEFILE("Makefile", "427819"), TOML("TOML", "9C4121"), INI("INI", "6D8086"),
    GRAPHQL("GraphQL", "E10098"), PROTOBUF("Protobuf", "4285F4"),
    ;

    companion object {
        private val extensions: Map<String, CodeLanguage> = buildMap {
            fun add(language: CodeLanguage, vararg exts: String) = exts.forEach { put(it, language) }
            add(PYTHON, "py", "pyw", "pyi"); add(JAVASCRIPT, "js", "mjs", "cjs", "jsx")
            add(TYPESCRIPT, "ts", "tsx", "mts", "cts"); add(SWIFT, "swift"); add(C, "c", "h")
            add(CPP, "cpp", "cc", "cxx", "hpp", "hxx", "hh"); add(JAVA, "java"); add(GO, "go"); add(RUST, "rs")
            add(RUBY, "rb", "gemspec"); add(PHP, "php"); add(SHELL, "sh", "bash", "zsh", "fish", "ksh")
            add(CSS, "css", "scss", "sass", "less"); add(HTML, "html", "htm", "xhtml")
            add(JSON, "json", "jsonc", "json5"); add(YAML, "yaml", "yml")
            add(XML, "xml", "xsl", "xsd", "svg", "plist"); add(SQL, "sql"); add(MARKDOWN, "md", "mdx", "markdown")
            add(KOTLIN, "kt", "kts"); add(SCALA, "scala", "sc"); add(DART, "dart"); add(LUA, "lua")
            add(PERL, "pl", "pm"); add(R, "r", "rmd"); add(OBJECTIVE_C, "m", "mm"); add(TOML, "toml")
            add(INI, "ini", "cfg", "conf"); add(GRAPHQL, "graphql", "gql"); add(PROTOBUF, "proto")
        }

        private val mimes: Map<String, CodeLanguage> = mapOf(
            "text/x-python" to PYTHON, "application/javascript" to JAVASCRIPT, "text/javascript" to JAVASCRIPT,
            "application/typescript" to TYPESCRIPT, "text/typescript" to TYPESCRIPT, "text/x-swift" to SWIFT,
            "text/x-c" to C, "text/x-csrc" to C, "text/x-c++" to CPP, "text/x-c++src" to CPP,
            "text/x-java" to JAVA, "text/x-java-source" to JAVA, "text/x-go" to GO, "text/x-rustsrc" to RUST,
            "text/x-ruby" to RUBY, "application/x-ruby" to RUBY, "application/x-php" to PHP, "text/x-php" to PHP,
            "application/x-sh" to SHELL, "text/x-shellscript" to SHELL, "text/css" to CSS, "text/html" to HTML,
            "application/json" to JSON, "text/yaml" to YAML, "application/x-yaml" to YAML,
            "text/xml" to XML, "application/xml" to XML, "application/sql" to SQL, "text/markdown" to MARKDOWN,
        )

        private val fileNames: Map<String, CodeLanguage> = mapOf(
            "dockerfile" to DOCKERFILE, "makefile" to MAKEFILE, "gnumakefile" to MAKEFILE,
            "rakefile" to RUBY, "gemfile" to RUBY, "podfile" to RUBY,
            ".bashrc" to SHELL, ".zshrc" to SHELL, ".bash_profile" to SHELL,
            ".gitignore" to INI, ".env" to INI, ".editorconfig" to INI,
        )

        /** Le langage du fichier, ou `null` : un texte ordinaire n'est pas du code. */
        fun detect(fileName: String, mimeType: String): CodeLanguage? {
            val lower = fileName.lowercase(Locale.ROOT)
            val base = lower.substringAfterLast('/')
            fileNames[base]?.let { return it }
            if ('.' in base) extensions[base.substringAfterLast('.')]?.let { return it }
            return mimes[mimeType.substringBefore(';').trim().lowercase(Locale.ROOT)]
        }
    }
}
