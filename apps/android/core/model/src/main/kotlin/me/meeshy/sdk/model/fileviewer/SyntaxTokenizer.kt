package me.meeshy.sdk.model.fileviewer

/** Un morceau d'une ligne de code, avec la sorte qui décide de sa couleur. */
data class CodeToken(val text: String, val kind: Kind) {
    enum class Kind { PLAIN, KEYWORD, STRING, COMMENT, NUMBER }
}

/**
 * La coloration du code : un lexeur à une passe, linéaire, sans exécution ni expression régulière
 * rétroactive — il borne donc son coût sur n'importe quel texte reçu. Il rend UNE liste de morceaux par
 * ligne (un commentaire de bloc ou une chaîne sur plusieurs lignes est coupé à chaque saut), et la
 * concaténation des morceaux d'une ligne redonne cette ligne à l'identique.
 */
object SyntaxTokenizer {

    private data class Grammar(
        val keywords: Set<String>,
        val lineComments: List<String>,
        val blockComment: Pair<String, String>? = null,
        val quotes: Set<Char> = setOf('"', '\''),
    )

    private val cLike = setOf(
        "if", "else", "for", "while", "do", "switch", "case", "default", "break", "continue", "return", "struct",
        "enum", "union", "typedef", "static", "const", "void", "int", "long", "short", "char", "float", "double",
        "unsigned", "signed", "sizeof", "extern", "volatile", "goto", "class", "public", "private", "protected",
        "new", "delete", "this", "template", "typename", "namespace", "using", "virtual", "override", "bool",
        "true", "false", "null", "nullptr", "try", "catch", "throw", "final", "interface", "extends", "implements",
        "import", "package", "abstract", "synchronized", "instanceof", "super", "byte", "boolean",
    )
    private val kotlinLike = cLike + setOf(
        "fun", "val", "var", "object", "when", "is", "in", "as", "data", "sealed", "companion", "suspend", "internal",
        "lateinit", "by", "init", "constructor", "typealias", "inline", "operator", "open", "func", "let", "guard",
        "protocol", "extension", "defer", "async", "await", "self", "nil", "inout", "where", "mut", "fn", "impl",
        "trait", "pub", "match", "loop", "use", "mod", "crate", "type", "go", "chan", "map", "range", "select",
    )
    private val scripting = setOf(
        "def", "class", "if", "elif", "else", "for", "while", "return", "import", "from", "as", "try", "except",
        "finally", "raise", "with", "lambda", "pass", "break", "continue", "yield", "global", "nonlocal", "in", "is",
        "not", "and", "or", "None", "True", "False", "async", "await", "function", "const", "let", "var", "new",
        "this", "typeof", "null", "undefined", "true", "false", "export", "default", "switch", "case", "end", "do",
        "then", "fi", "esac", "done", "echo", "local", "module", "require", "puts", "unless", "elsif", "begin",
        "rescue", "ensure", "self", "nil", "my", "sub", "use", "package", "fn",
    )
    private val sql = setOf(
        "select", "from", "where", "insert", "into", "values", "update", "set", "delete", "create", "table", "drop",
        "alter", "join", "inner", "left", "right", "outer", "on", "group", "by", "order", "having", "limit", "and",
        "or", "not", "null", "as", "distinct", "union", "index", "primary", "key", "foreign", "references", "in",
        "like", "between", "is", "case", "when", "then", "else", "end", "SELECT", "FROM", "WHERE", "INSERT", "INTO",
        "VALUES", "UPDATE", "SET", "DELETE", "CREATE", "TABLE", "DROP", "ALTER", "JOIN", "ON", "GROUP", "BY", "ORDER",
        "HAVING", "LIMIT", "AND", "OR", "NOT", "NULL", "AS", "DISTINCT", "UNION",
    )
    private val literals = setOf("true", "false", "null")

    private fun grammarOf(language: CodeLanguage): Grammar = when (language) {
        CodeLanguage.PYTHON, CodeLanguage.RUBY, CodeLanguage.SHELL, CodeLanguage.PERL, CodeLanguage.R,
        CodeLanguage.YAML, CodeLanguage.TOML, CodeLanguage.DOCKERFILE, CodeLanguage.MAKEFILE,
        -> Grammar(scripting, listOf("#"))
        CodeLanguage.INI -> Grammar(emptySet(), listOf("#", ";"))
        CodeLanguage.SQL -> Grammar(sql, listOf("--"), "/*" to "*/")
        CodeLanguage.LUA -> Grammar(scripting, listOf("--"))
        CodeLanguage.JSON -> Grammar(literals, emptyList(), quotes = setOf('"'))
        CodeLanguage.HTML, CodeLanguage.XML -> Grammar(emptySet(), emptyList(), "<!--" to "-->")
        CodeLanguage.MARKDOWN -> Grammar(emptySet(), emptyList(), quotes = emptySet())
        CodeLanguage.GRAPHQL -> Grammar(emptySet(), listOf("#"))
        CodeLanguage.CSS -> Grammar(emptySet(), emptyList(), "/*" to "*/")
        CodeLanguage.JAVASCRIPT, CodeLanguage.TYPESCRIPT, CodeLanguage.PHP, CodeLanguage.DART ->
            Grammar(kotlinLike + scripting, listOf("//"), "/*" to "*/", setOf('"', '\'', '`'))
        else -> Grammar(kotlinLike, listOf("//"), "/*" to "*/")
    }

    /** Au-delà, une ligne n'est plus lisible et sa mise en page bloquerait le fil principal : on montre son début. */
    const val MAX_DISPLAY_CHARS: Int = 2_000

    /** La ligne telle qu'elle s'AFFICHE : au plus [maxChars] caractères, suivis d'une ellipse quand elle est coupée. */
    fun clampLine(tokens: List<CodeToken>, maxChars: Int = MAX_DISPLAY_CHARS): List<CodeToken> {
        if (tokens.sumOf { it.text.length } <= maxChars) return tokens
        val kept = ArrayList<CodeToken>()
        var remaining = maxChars
        for (token in tokens) {
            if (remaining <= 0) break
            kept += if (token.text.length <= remaining) token else token.copy(text = token.text.take(remaining))
            remaining -= token.text.length
        }
        kept += CodeToken("\u2026", CodeToken.Kind.PLAIN)
        return kept
    }

    fun tokenize(code: String, language: CodeLanguage): List<List<CodeToken>> {
        val grammar = grammarOf(language)
        val lines = ArrayList<List<CodeToken>>()
        var line = ArrayList<CodeToken>()
        val plain = StringBuilder()

        fun flushPlain() {
            if (plain.isNotEmpty()) { line += CodeToken(plain.toString(), CodeToken.Kind.PLAIN); plain.setLength(0) }
        }
        fun emit(text: String, kind: CodeToken.Kind) { flushPlain(); line += CodeToken(text, kind) }
        fun newLine() { flushPlain(); lines += line; line = ArrayList() }
        // Un jeton qui traverse des sauts de ligne est rendu ligne par ligne.
        fun emitSpanning(text: String, kind: CodeToken.Kind) {
            val parts = text.split('\n')
            parts.forEachIndexed { i, part ->
                if (part.isNotEmpty()) emit(part, kind)
                if (i < parts.lastIndex) newLine()
            }
        }

        var i = 0
        val n = code.length
        while (i < n) {
            val c = code[i]
            when {
                c == '\r' -> i++
                c == '\n' -> { newLine(); i++ }
                grammar.blockComment != null && code.startsWith(grammar.blockComment.first, i) -> {
                    val end = code.indexOf(grammar.blockComment.second, i + grammar.blockComment.first.length)
                    val stop = if (end < 0) n else end + grammar.blockComment.second.length
                    emitSpanning(code.substring(i, stop).replace("\r", ""), CodeToken.Kind.COMMENT)
                    i = stop
                }
                grammar.lineComments.any { code.startsWith(it, i) } -> {
                    val end = code.indexOf('\n', i).let { if (it < 0) n else it }
                    emit(code.substring(i, end).trimEnd('\r'), CodeToken.Kind.COMMENT)
                    i = end
                }
                c in grammar.quotes -> {
                    var j = i + 1
                    while (j < n && code[j] != c && code[j] != '\n') { if (code[j] == '\\' && j + 1 < n && code[j + 1] != '\n') j++; j++ }
                    val stop = if (j < n && code[j] == c) j + 1 else j
                    emit(code.substring(i, stop), CodeToken.Kind.STRING)
                    i = stop
                }
                c.isDigit() -> {
                    var j = i
                    while (j < n && (code[j].isLetterOrDigit() || code[j] == '.' || code[j] == '_')) j++
                    emit(code.substring(i, j), CodeToken.Kind.NUMBER)
                    i = j
                }
                c.isLetter() || c == '_' -> {
                    var j = i
                    while (j < n && (code[j].isLetterOrDigit() || code[j] == '_')) j++
                    val word = code.substring(i, j)
                    if (word in grammar.keywords) emit(word, CodeToken.Kind.KEYWORD) else plain.append(word)
                    i = j
                }
                else -> { plain.append(c); i++ }
            }
        }
        newLine()
        return lines
    }
}
