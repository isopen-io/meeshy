import SwiftUI

// MARK: - Syntax Token Types

public enum SyntaxTokenType {
    case plain
    case keyword
    case string
    case comment
    case number
    case type
    case function
    case preprocessor
    case operator_
    case property
    case attribute
    case tag
    case punctuation
}

// MARK: - Syntax Token

public struct SyntaxToken {
    public let text: String
    public let type: SyntaxTokenType

    public init(_ text: String, _ type: SyntaxTokenType) {
        self.text = text
        self.type = type
    }
}

// MARK: - Theme Colors (GitHub-style)

public struct SyntaxTheme {
    public let keyword: Color
    public let string: Color
    public let comment: Color
    public let number: Color
    public let type: Color
    public let function: Color
    public let preprocessor: Color
    public let operator_: Color
    public let property: Color
    public let attribute: Color
    public let tag: Color
    public let punctuation: Color
    public let plain: Color
    public let background: Color
    public let lineNumber: Color
    public let lineNumberBorder: Color

    public static func github(isDark: Bool) -> SyntaxTheme {
        isDark ? githubDark : githubLight
    }

    public static let githubDark = SyntaxTheme(
        keyword: Color(hex: "FF7B72"),
        string: Color(hex: "A5D6FF"),
        comment: Color(hex: "8B949E"),
        number: Color(hex: "79C0FF"),
        type: Color(hex: "FFA657"),
        function: Color(hex: "D2A8FF"),
        preprocessor: Color(hex: "FF7B72"),
        operator_: Color(hex: "FF7B72"),
        property: Color(hex: "79C0FF"),
        attribute: Color(hex: "7EE787"),
        tag: Color(hex: "7EE787"),
        punctuation: Color(hex: "C9D1D9"),
        plain: Color(hex: "E6EDF3"),
        background: Color(hex: "0D1117"),
        lineNumber: Color.white.opacity(0.18),
        lineNumberBorder: Color.white.opacity(0.06)
    )

    public static let githubLight = SyntaxTheme(
        keyword: Color(hex: "CF222E"),
        string: Color(hex: "0A3069"),
        comment: Color(hex: "6E7781"),
        number: Color(hex: "0550AE"),
        type: Color(hex: "953800"),
        function: Color(hex: "8250DF"),
        preprocessor: Color(hex: "CF222E"),
        operator_: Color(hex: "CF222E"),
        property: Color(hex: "0550AE"),
        attribute: Color(hex: "116329"),
        tag: Color(hex: "116329"),
        punctuation: Color(hex: "24292F"),
        plain: Color(hex: "24292F"),
        background: Color(hex: "F6F8FA"),
        lineNumber: Color.black.opacity(0.18),
        lineNumberBorder: Color.black.opacity(0.06)
    )

    public func color(for type: SyntaxTokenType) -> Color {
        switch type {
        case .plain: return plain
        case .keyword: return keyword
        case .string: return string
        case .comment: return comment
        case .number: return number
        case .type: return type_color
        case .function: return function
        case .preprocessor: return preprocessor
        case .operator_: return operator_
        case .property: return property
        case .attribute: return attribute
        case .tag: return tag
        case .punctuation: return punctuation
        }
    }

    private var type_color: Color { type }
}

// MARK: - Language Definition

public struct LanguageDefinition {
    let keywords: Set<String>
    let typeKeywords: Set<String>
    let builtins: Set<String>
    let singleLineComment: String
    let multiLineCommentStart: String?
    let multiLineCommentEnd: String?
    let stringDelimiters: [Character]
    let hasTripleQuote: Bool
    let hasBacktickString: Bool
    let preprocessorPrefix: String?
    let hasHashComment: Bool

    static func definition(for language: CodeLanguage) -> LanguageDefinition {
        switch language {
        case .python:
            return LanguageDefinition(
                keywords: ["False", "None", "True", "and", "as", "assert", "async", "await",
                           "break", "class", "continue", "def", "del", "elif", "else", "except",
                           "finally", "for", "from", "global", "if", "import", "in", "is",
                           "lambda", "nonlocal", "not", "or", "pass", "raise", "return",
                           "try", "while", "with", "yield", "match", "case", "type"],
                typeKeywords: ["int", "float", "str", "bool", "list", "dict", "tuple", "set",
                               "bytes", "bytearray", "object", "type", "Exception"],
                builtins: ["print", "len", "range", "enumerate", "zip", "map", "filter",
                           "sorted", "reversed", "isinstance", "issubclass", "super", "property",
                           "staticmethod", "classmethod", "abs", "all", "any", "open", "input"],
                singleLineComment: "#",
                multiLineCommentStart: nil, multiLineCommentEnd: nil,
                stringDelimiters: ["\"", "'"],
                hasTripleQuote: true, hasBacktickString: false,
                preprocessorPrefix: nil, hasHashComment: true
            )

        case .javascript, .typescript:
            return LanguageDefinition(
                keywords: ["break", "case", "catch", "class", "const", "continue", "debugger",
                           "default", "delete", "do", "else", "export", "extends", "finally",
                           "for", "function", "if", "import", "in", "instanceof", "let", "new",
                           "of", "return", "super", "switch", "this", "throw", "try", "typeof",
                           "var", "void", "while", "with", "yield", "async", "await", "from",
                           "static", "get", "set", "enum", "implements", "interface", "type",
                           "abstract", "declare", "namespace", "readonly", "as", "keyof",
                           "satisfies", "infer", "extends"],
                typeKeywords: ["string", "number", "boolean", "any", "void", "never", "unknown",
                               "undefined", "null", "Array", "Object", "Promise", "Map", "Set",
                               "Date", "RegExp", "Error", "Symbol", "BigInt", "Record", "Partial",
                               "Required", "Readonly", "Pick", "Omit"],
                builtins: ["console", "Math", "JSON", "parseInt", "parseFloat", "setTimeout",
                           "setInterval", "clearTimeout", "clearInterval", "fetch", "require",
                           "module", "exports", "process", "Buffer", "global", "window", "document"],
                singleLineComment: "//",
                multiLineCommentStart: "/*", multiLineCommentEnd: "*/",
                stringDelimiters: ["\"", "'"],
                hasTripleQuote: false, hasBacktickString: true,
                preprocessorPrefix: nil, hasHashComment: false
            )

        case .swift:
            return LanguageDefinition(
                keywords: ["actor", "any", "as", "associatedtype", "async", "await", "borrowing",
                           "break", "case", "catch", "class", "consume", "consuming", "continue",
                           "convenience", "default", "defer", "deinit", "didSet", "do", "dynamic",
                           "each", "else", "enum", "extension", "fallthrough", "fileprivate",
                           "final", "for", "func", "guard", "if", "import", "in", "indirect",
                           "infix", "init", "inout", "internal", "is", "isolated", "lazy", "let",
                           "macro", "mutating", "nonisolated", "nonmutating", "open", "operator",
                           "optional", "override", "package", "postfix", "precedencegroup",
                           "prefix", "private", "protocol", "public", "repeat", "required",
                           "rethrows", "return", "self", "Self", "some", "static", "struct",
                           "subscript", "super", "switch", "throw", "throws", "try", "typealias",
                           "unowned", "var", "weak", "where", "while", "willSet"],
                typeKeywords: ["Int", "String", "Bool", "Double", "Float", "Array", "Dictionary",
                               "Set", "Optional", "Result", "Error", "Void", "Never", "Any",
                               "AnyObject", "Character", "Data", "Date", "URL", "UUID",
                               "Codable", "Decodable", "Encodable", "Identifiable", "Hashable",
                               "Equatable", "Comparable", "Sendable", "View", "ObservableObject",
                               "Published", "State", "Binding", "Environment", "MainActor",
                               "Task", "AsyncSequence", "ObservedObject", "StateObject"],
                builtins: ["print", "debugPrint", "fatalError", "precondition", "assert",
                           "min", "max", "abs", "zip", "stride", "type", "dump",
                           "withAnimation", "withTransaction"],
                singleLineComment: "//",
                multiLineCommentStart: "/*", multiLineCommentEnd: "*/",
                stringDelimiters: ["\""],
                hasTripleQuote: true, hasBacktickString: false,
                preprocessorPrefix: "#", hasHashComment: false
            )

        case .go:
            return LanguageDefinition(
                keywords: ["break", "case", "chan", "const", "continue", "default", "defer",
                           "else", "fallthrough", "for", "func", "go", "goto", "if", "import",
                           "interface", "map", "package", "range", "return", "select", "struct",
                           "switch", "type", "var"],
                typeKeywords: ["bool", "byte", "complex64", "complex128", "error", "float32",
                               "float64", "int", "int8", "int16", "int32", "int64", "rune",
                               "string", "uint", "uint8", "uint16", "uint32", "uint64", "uintptr",
                               "any", "comparable"],
                builtins: ["append", "cap", "close", "copy", "delete", "len", "make", "new",
                           "panic", "print", "println", "recover", "nil", "true", "false", "iota"],
                singleLineComment: "//",
                multiLineCommentStart: "/*", multiLineCommentEnd: "*/",
                stringDelimiters: ["\"", "'"],
                hasTripleQuote: false, hasBacktickString: true,
                preprocessorPrefix: nil, hasHashComment: false
            )

        case .rust:
            return LanguageDefinition(
                keywords: ["as", "async", "await", "break", "const", "continue", "crate", "dyn",
                           "else", "enum", "extern", "false", "fn", "for", "if", "impl", "in",
                           "let", "loop", "match", "mod", "move", "mut", "pub", "ref", "return",
                           "self", "Self", "static", "struct", "super", "trait", "true", "type",
                           "union", "unsafe", "use", "where", "while", "yield"],
                typeKeywords: ["bool", "char", "f32", "f64", "i8", "i16", "i32", "i64", "i128",
                               "isize", "str", "u8", "u16", "u32", "u64", "u128", "usize",
                               "String", "Vec", "Box", "Rc", "Arc", "Option", "Result",
                               "HashMap", "HashSet", "BTreeMap"],
                builtins: ["println", "print", "eprintln", "eprint", "format", "panic",
                           "assert", "assert_eq", "assert_ne", "todo", "unimplemented",
                           "unreachable", "cfg", "derive", "include", "env", "concat", "line",
                           "file", "column", "stringify", "vec", "Some", "None", "Ok", "Err"],
                singleLineComment: "//",
                multiLineCommentStart: "/*", multiLineCommentEnd: "*/",
                stringDelimiters: ["\""],
                hasTripleQuote: false, hasBacktickString: false,
                preprocessorPrefix: "#", hasHashComment: false
            )

        case .java, .kotlin, .scala:
            return LanguageDefinition(
                keywords: ["abstract", "assert", "break", "case", "catch", "class", "const",
                           "continue", "default", "do", "else", "enum", "extends", "final",
                           "finally", "for", "goto", "if", "implements", "import", "instanceof",
                           "interface", "native", "new", "package", "private", "protected",
                           "public", "return", "static", "strictfp", "super", "switch",
                           "synchronized", "this", "throw", "throws", "transient", "try",
                           "volatile", "while", "when", "fun", "val", "var", "object",
                           "companion", "data", "sealed", "suspend", "inline", "override",
                           "open", "internal", "annotation", "crossinline", "noinline",
                           "reified", "tailrec", "operator", "infix", "out", "in", "by",
                           "lazy", "lateinit", "def", "trait", "with", "yield", "match",
                           "given", "using", "export", "opaque", "transparent", "erased"],
                typeKeywords: ["boolean", "byte", "char", "double", "float", "int", "long",
                               "short", "void", "String", "Integer", "Long", "Double", "Float",
                               "Boolean", "Character", "Object", "Class", "List", "Map", "Set",
                               "Array", "ArrayList", "HashMap", "HashSet", "Optional",
                               "Unit", "Nothing", "Any", "Int", "Byte", "Short", "Char"],
                builtins: ["System", "out", "println", "print", "Math", "Collections",
                           "Arrays", "Objects", "Thread", "Runnable", "null", "true", "false"],
                singleLineComment: "//",
                multiLineCommentStart: "/*", multiLineCommentEnd: "*/",
                stringDelimiters: ["\"", "'"],
                hasTripleQuote: true, hasBacktickString: false,
                preprocessorPrefix: nil, hasHashComment: false
            )

        case .c, .cpp, .objectiveC:
            return LanguageDefinition(
                keywords: ["auto", "break", "case", "char", "const", "continue", "default",
                           "do", "double", "else", "enum", "extern", "float", "for", "goto",
                           "if", "inline", "int", "long", "register", "restrict", "return",
                           "short", "signed", "sizeof", "static", "struct", "switch", "typedef",
                           "union", "unsigned", "void", "volatile", "while",
                           "alignas", "alignof", "and", "and_eq", "asm", "bitand", "bitor",
                           "bool", "catch", "class", "compl", "concept", "consteval", "constexpr",
                           "constinit", "co_await", "co_return", "co_yield", "decltype", "delete",
                           "dynamic_cast", "explicit", "export", "false", "friend", "mutable",
                           "namespace", "new", "noexcept", "not", "nullptr", "operator",
                           "or", "override", "private", "protected", "public",
                           "reinterpret_cast", "requires", "static_assert", "static_cast",
                           "template", "this", "throw", "true", "try", "typeid", "typename",
                           "using", "virtual", "xor",
                           "@interface", "@implementation", "@end", "@protocol", "@property",
                           "@synthesize", "@dynamic", "@class", "@selector", "@encode",
                           "@try", "@catch", "@finally", "@throw", "@optional", "@required",
                           "self", "super", "nil", "YES", "NO", "id"],
                typeKeywords: ["size_t", "ptrdiff_t", "int8_t", "int16_t", "int32_t", "int64_t",
                               "uint8_t", "uint16_t", "uint32_t", "uint64_t", "FILE",
                               "string", "vector", "map", "set", "list", "pair", "tuple",
                               "shared_ptr", "unique_ptr", "weak_ptr", "optional", "variant",
                               "array", "deque", "queue", "stack", "unordered_map", "unordered_set",
                               "NSObject", "NSString", "NSArray", "NSDictionary", "NSNumber",
                               "UIView", "UIViewController", "CGFloat", "NSInteger", "BOOL"],
                builtins: ["printf", "scanf", "malloc", "free", "sizeof", "strlen", "strcpy",
                           "strcmp", "memcpy", "memset", "assert", "exit", "abort",
                           "std", "cout", "cin", "endl", "cerr", "move", "forward",
                           "NSLog", "alloc", "init", "release", "retain", "autorelease",
                           "NULL", "true", "false"],
                singleLineComment: "//",
                multiLineCommentStart: "/*", multiLineCommentEnd: "*/",
                stringDelimiters: ["\"", "'"],
                hasTripleQuote: false, hasBacktickString: false,
                preprocessorPrefix: "#", hasHashComment: false
            )

        case .ruby:
            return LanguageDefinition(
                keywords: ["alias", "and", "begin", "break", "case", "class", "def", "defined?",
                           "do", "else", "elsif", "end", "ensure", "false", "for", "if", "in",
                           "module", "next", "nil", "not", "or", "redo", "rescue", "retry",
                           "return", "self", "super", "then", "true", "undef", "unless",
                           "until", "when", "while", "yield", "require", "include", "extend",
                           "attr_reader", "attr_writer", "attr_accessor", "raise", "puts", "print"],
                typeKeywords: ["Array", "Hash", "String", "Integer", "Float", "Symbol",
                               "TrueClass", "FalseClass", "NilClass", "Regexp", "Range",
                               "Proc", "Lambda", "IO", "File", "Dir", "Struct", "Class", "Module"],
                builtins: ["puts", "print", "p", "pp", "gets", "chomp", "each", "map",
                           "select", "reject", "reduce", "inject", "collect", "detect", "find",
                           "freeze", "frozen?", "dup", "clone", "respond_to?", "send",
                           "new", "initialize", "to_s", "to_i", "to_f", "to_a", "to_h"],
                singleLineComment: "#",
                multiLineCommentStart: "=begin", multiLineCommentEnd: "=end",
                stringDelimiters: ["\"", "'"],
                hasTripleQuote: false, hasBacktickString: true,
                preprocessorPrefix: nil, hasHashComment: true
            )

        case .php:
            return LanguageDefinition(
                keywords: ["abstract", "and", "as", "break", "callable", "case", "catch",
                           "class", "clone", "const", "continue", "declare", "default", "do",
                           "echo", "else", "elseif", "empty", "enddeclare", "endfor",
                           "endforeach", "endif", "endswitch", "endwhile", "enum", "eval",
                           "exit", "extends", "final", "finally", "fn", "for", "foreach",
                           "function", "global", "goto", "if", "implements", "include",
                           "instanceof", "interface", "isset", "list", "match", "namespace",
                           "new", "or", "print", "private", "protected", "public", "readonly",
                           "require", "return", "static", "switch", "this", "throw", "trait",
                           "try", "unset", "use", "var", "while", "xor", "yield"],
                typeKeywords: ["array", "bool", "float", "int", "mixed", "never", "null",
                               "object", "string", "void", "self", "parent", "iterable"],
                builtins: ["array_map", "array_filter", "array_reduce", "array_push", "array_pop",
                           "count", "strlen", "substr", "strpos", "preg_match", "preg_replace",
                           "json_encode", "json_decode", "var_dump", "print_r", "isset", "empty",
                           "true", "false", "null", "PHP_EOL"],
                singleLineComment: "//",
                multiLineCommentStart: "/*", multiLineCommentEnd: "*/",
                stringDelimiters: ["\"", "'"],
                hasTripleQuote: false, hasBacktickString: false,
                preprocessorPrefix: nil, hasHashComment: true
            )

        case .shell:
            return LanguageDefinition(
                keywords: ["if", "then", "else", "elif", "fi", "for", "while", "until", "do",
                           "done", "case", "esac", "in", "function", "select", "time", "coproc",
                           "return", "exit", "break", "continue", "shift", "export", "readonly",
                           "local", "declare", "typeset", "unset", "source", "eval", "exec",
                           "trap", "set", "shopt"],
                typeKeywords: [],
                builtins: ["echo", "printf", "read", "cd", "pwd", "ls", "cp", "mv", "rm",
                           "mkdir", "rmdir", "chmod", "chown", "grep", "sed", "awk", "find",
                           "sort", "uniq", "wc", "cat", "head", "tail", "cut", "tr", "xargs",
                           "test", "true", "false", "command", "type", "which", "alias"],
                singleLineComment: "#",
                multiLineCommentStart: nil, multiLineCommentEnd: nil,
                stringDelimiters: ["\"", "'"],
                hasTripleQuote: false, hasBacktickString: true,
                preprocessorPrefix: nil, hasHashComment: true
            )

        case .sql:
            return LanguageDefinition(
                keywords: ["SELECT", "FROM", "WHERE", "INSERT", "INTO", "VALUES", "UPDATE",
                           "SET", "DELETE", "CREATE", "TABLE", "ALTER", "DROP", "INDEX",
                           "JOIN", "INNER", "LEFT", "RIGHT", "OUTER", "FULL", "CROSS", "ON",
                           "AND", "OR", "NOT", "IN", "BETWEEN", "LIKE", "IS", "NULL", "AS",
                           "ORDER", "BY", "ASC", "DESC", "GROUP", "HAVING", "LIMIT", "OFFSET",
                           "UNION", "ALL", "DISTINCT", "EXISTS", "CASE", "WHEN", "THEN", "ELSE",
                           "END", "BEGIN", "COMMIT", "ROLLBACK", "TRANSACTION", "PRIMARY", "KEY",
                           "FOREIGN", "REFERENCES", "CONSTRAINT", "DEFAULT", "CHECK", "UNIQUE",
                           "NOT", "NULL", "AUTO_INCREMENT", "CASCADE", "RESTRICT",
                           "select", "from", "where", "insert", "into", "values", "update",
                           "set", "delete", "create", "table", "alter", "drop", "index",
                           "join", "inner", "left", "right", "outer", "on", "and", "or", "not",
                           "in", "between", "like", "is", "null", "as", "order", "by", "asc",
                           "desc", "group", "having", "limit", "offset", "union", "all",
                           "distinct", "exists", "case", "when", "then", "else", "end",
                           "begin", "commit", "rollback", "primary", "key", "foreign",
                           "references", "constraint", "default", "check", "unique"],
                typeKeywords: ["INT", "INTEGER", "BIGINT", "SMALLINT", "TINYINT", "FLOAT",
                               "DOUBLE", "DECIMAL", "NUMERIC", "VARCHAR", "CHAR", "TEXT",
                               "BLOB", "DATE", "DATETIME", "TIMESTAMP", "BOOLEAN", "SERIAL",
                               "UUID", "JSON", "JSONB", "ARRAY",
                               "int", "integer", "bigint", "varchar", "char", "text",
                               "boolean", "date", "datetime", "timestamp", "json", "jsonb"],
                builtins: ["COUNT", "SUM", "AVG", "MIN", "MAX", "COALESCE", "IFNULL",
                           "NULLIF", "CAST", "CONVERT", "CONCAT", "LENGTH", "SUBSTRING",
                           "TRIM", "UPPER", "LOWER", "NOW", "CURRENT_TIMESTAMP",
                           "TRUE", "FALSE",
                           "count", "sum", "avg", "min", "max", "coalesce", "concat",
                           "length", "substring", "trim", "upper", "lower", "now",
                           "true", "false"],
                singleLineComment: "--",
                multiLineCommentStart: "/*", multiLineCommentEnd: "*/",
                stringDelimiters: ["'"],
                hasTripleQuote: false, hasBacktickString: true,
                preprocessorPrefix: nil, hasHashComment: false
            )

        case .css, .html, .xml:
            return LanguageDefinition(
                keywords: ["import", "media", "charset", "font-face", "keyframes", "supports",
                           "layer", "container", "scope", "starting-style", "property",
                           "html", "head", "body", "div", "span", "p", "a", "img", "ul", "ol",
                           "li", "table", "tr", "td", "th", "form", "input", "button",
                           "select", "option", "textarea", "label", "section", "article",
                           "nav", "header", "footer", "main", "aside", "h1", "h2", "h3",
                           "h4", "h5", "h6", "script", "style", "link", "meta", "title"],
                typeKeywords: ["px", "em", "rem", "vh", "vw", "vmin", "vmax", "ch", "ex",
                               "cm", "mm", "in", "pt", "pc", "deg", "rad", "grad", "turn",
                               "s", "ms", "Hz", "kHz", "dpi", "dpcm", "dppx", "fr",
                               "auto", "inherit", "initial", "unset", "revert", "none",
                               "block", "inline", "flex", "grid", "absolute", "relative",
                               "fixed", "sticky", "static"],
                builtins: ["var", "calc", "min", "max", "clamp", "rgb", "rgba", "hsl", "hsla",
                           "url", "attr", "env", "counter", "counters", "linear-gradient",
                           "radial-gradient", "conic-gradient", "repeat",
                           "important", "!important"],
                singleLineComment: "//",
                multiLineCommentStart: "/*", multiLineCommentEnd: "*/",
                stringDelimiters: ["\"", "'"],
                hasTripleQuote: false, hasBacktickString: false,
                preprocessorPrefix: nil, hasHashComment: false
            )

        case .json:
            return LanguageDefinition(
                keywords: ["true", "false", "null"],
                typeKeywords: [],
                builtins: [],
                singleLineComment: "",
                multiLineCommentStart: nil, multiLineCommentEnd: nil,
                stringDelimiters: ["\""],
                hasTripleQuote: false, hasBacktickString: false,
                preprocessorPrefix: nil, hasHashComment: false
            )

        case .yaml:
            return LanguageDefinition(
                keywords: ["true", "false", "null", "yes", "no", "on", "off", "True", "False",
                           "TRUE", "FALSE", "Yes", "No", "YES", "NO", "Null", "NULL", "~"],
                typeKeywords: [],
                builtins: [],
                singleLineComment: "#",
                multiLineCommentStart: nil, multiLineCommentEnd: nil,
                stringDelimiters: ["\"", "'"],
                hasTripleQuote: false, hasBacktickString: false,
                preprocessorPrefix: nil, hasHashComment: true
            )

        default:
            return LanguageDefinition(
                keywords: ["if", "else", "for", "while", "do", "switch", "case", "break",
                           "continue", "return", "class", "struct", "enum", "interface",
                           "function", "func", "def", "fn", "var", "let", "const", "val",
                           "import", "export", "from", "package", "module", "use",
                           "public", "private", "protected", "static", "final", "abstract",
                           "new", "delete", "this", "self", "super", "try", "catch", "throw",
                           "finally", "async", "await", "yield", "true", "false", "null", "nil",
                           "void", "type", "typeof", "instanceof"],
                typeKeywords: ["int", "float", "double", "string", "bool", "boolean", "char",
                               "byte", "long", "short", "void", "var", "any", "object"],
                builtins: ["print", "println", "printf", "console", "log", "error", "warn"],
                singleLineComment: "//",
                multiLineCommentStart: "/*", multiLineCommentEnd: "*/",
                stringDelimiters: ["\"", "'"],
                hasTripleQuote: false, hasBacktickString: false,
                preprocessorPrefix: nil, hasHashComment: false
            )
        }
    }
}

// MARK: - Syntax Highlighter (Regex-based tokenizer)

public struct SyntaxHighlighter {

    public static func tokenize(_ code: String, language: CodeLanguage) -> [[SyntaxToken]] {
        let def = LanguageDefinition.definition(for: language)
        let lines = code.components(separatedBy: "\n")
        var result: [[SyntaxToken]] = []
        var inMultiLineComment = false

        for line in lines {
            var tokens: [SyntaxToken] = []
            var i = line.startIndex

            while i < line.endIndex {
                // Multi-line comment continuation
                if inMultiLineComment {
                    if let endStr = def.multiLineCommentEnd,
                       let endRange = line.range(of: endStr, range: i..<line.endIndex) {
                        let commentText = String(line[i..<endRange.upperBound])
                        tokens.append(SyntaxToken(commentText, .comment))
                        i = endRange.upperBound
                        inMultiLineComment = false
                    } else {
                        tokens.append(SyntaxToken(String(line[i...]), .comment))
                        break
                    }
                    continue
                }

                let remaining = line[i...]

                // Multi-line comment start
                if let startStr = def.multiLineCommentStart,
                   remaining.hasPrefix(startStr) {
                    if let endStr = def.multiLineCommentEnd,
                       let endRange = line.range(of: endStr, range: line.index(i, offsetBy: startStr.count)..<line.endIndex) {
                        let commentText = String(line[i..<endRange.upperBound])
                        tokens.append(SyntaxToken(commentText, .comment))
                        i = endRange.upperBound
                    } else {
                        tokens.append(SyntaxToken(String(remaining), .comment))
                        inMultiLineComment = true
                        break
                    }
                    continue
                }

                // Single-line comment
                if !def.singleLineComment.isEmpty && remaining.hasPrefix(def.singleLineComment) {
                    tokens.append(SyntaxToken(String(remaining), .comment))
                    break
                }

                // Triple-quoted strings
                if def.hasTripleQuote {
                    let tripleDouble = "\"\"\""
                    let tripleSingle = "'''"
                    for triple in [tripleDouble, tripleSingle] {
                        if remaining.hasPrefix(triple) {
                            let afterOpen = line.index(i, offsetBy: triple.count)
                            if let closeRange = line.range(of: triple, range: afterOpen..<line.endIndex) {
                                let stringText = String(line[i..<closeRange.upperBound])
                                tokens.append(SyntaxToken(stringText, .string))
                                i = closeRange.upperBound
                            } else {
                                tokens.append(SyntaxToken(String(remaining), .string))
                                i = line.endIndex
                            }
                            continue
                        }
                    }
                }

                // Backtick strings
                if def.hasBacktickString && line[i] == "`" {
                    let start = i
                    i = line.index(after: i)
                    while i < line.endIndex && line[i] != "`" {
                        if line[i] == "\\" && line.index(after: i) < line.endIndex {
                            i = line.index(i, offsetBy: 2)
                        } else {
                            i = line.index(after: i)
                        }
                    }
                    if i < line.endIndex { i = line.index(after: i) }
                    tokens.append(SyntaxToken(String(line[start..<i]), .string))
                    continue
                }

                // Regular strings
                if def.stringDelimiters.contains(line[i]) {
                    let quote = line[i]
                    let start = i
                    i = line.index(after: i)
                    while i < line.endIndex && line[i] != quote {
                        if line[i] == "\\" && line.index(after: i) < line.endIndex {
                            i = line.index(i, offsetBy: 2)
                        } else {
                            i = line.index(after: i)
                        }
                    }
                    if i < line.endIndex { i = line.index(after: i) }
                    tokens.append(SyntaxToken(String(line[start..<i]), .string))
                    continue
                }

                // Preprocessor directives
                if let prefix = def.preprocessorPrefix, remaining.hasPrefix(prefix) {
                    let trimmed = String(remaining).trimmingCharacters(in: .whitespaces)
                    if trimmed.hasPrefix(prefix) && (i == line.startIndex || line[line.index(before: i)].isWhitespace) {
                        let wordEnd = scanWord(from: i, in: line)
                        tokens.append(SyntaxToken(String(line[i..<wordEnd]), .preprocessor))
                        i = wordEnd
                        continue
                    }
                }

                // Numbers (including hex)
                if line[i].isNumber || (line[i] == "." && i < line.index(before: line.endIndex) && line[line.index(after: i)].isNumber) {
                    let start = i
                    if remaining.hasPrefix("0x") || remaining.hasPrefix("0X") {
                        i = line.index(i, offsetBy: 2)
                        while i < line.endIndex && (line[i].isHexDigit || line[i] == "_") {
                            i = line.index(after: i)
                        }
                    } else if remaining.hasPrefix("0b") || remaining.hasPrefix("0B") {
                        i = line.index(i, offsetBy: 2)
                        while i < line.endIndex && (line[i] == "0" || line[i] == "1" || line[i] == "_") {
                            i = line.index(after: i)
                        }
                    } else {
                        while i < line.endIndex && (line[i].isNumber || line[i] == "." || line[i] == "_" || line[i] == "e" || line[i] == "E") {
                            i = line.index(after: i)
                        }
                    }
                    // Suffix (f, L, u, etc.)
                    if i < line.endIndex && line[i].isLetter {
                        while i < line.endIndex && line[i].isLetter { i = line.index(after: i) }
                    }
                    tokens.append(SyntaxToken(String(line[start..<i]), .number))
                    continue
                }

                // Words (identifiers, keywords, types)
                if line[i].isLetter || line[i] == "_" || line[i] == "@" || line[i] == "$" {
                    let start = i
                    if line[i] == "@" { i = line.index(after: i) }
                    while i < line.endIndex && (line[i].isLetter || line[i].isNumber || line[i] == "_" || line[i] == "?" || line[i] == "!") {
                        i = line.index(after: i)
                    }
                    let word = String(line[start..<i])

                    // Check if followed by ( → function call
                    let nextNonSpace = skipSpaces(from: i, in: line)
                    let isCall = nextNonSpace < line.endIndex && line[nextNonSpace] == "("

                    if word.hasPrefix("@") {
                        tokens.append(SyntaxToken(word, .attribute))
                    } else if def.keywords.contains(word) {
                        tokens.append(SyntaxToken(word, .keyword))
                    } else if def.typeKeywords.contains(word) {
                        tokens.append(SyntaxToken(word, .type))
                    } else if isCall || def.builtins.contains(word) {
                        tokens.append(SyntaxToken(word, .function))
                    } else if word.first?.isUppercase == true {
                        tokens.append(SyntaxToken(word, .type))
                    } else {
                        tokens.append(SyntaxToken(word, .plain))
                    }
                    continue
                }

                // Operators
                let ops: Set<Character> = ["+", "-", "*", "/", "%", "=", "!", "<", ">", "&", "|", "^", "~", "?", ":"]
                if ops.contains(line[i]) {
                    let start = i
                    while i < line.endIndex && ops.contains(line[i]) {
                        i = line.index(after: i)
                    }
                    tokens.append(SyntaxToken(String(line[start..<i]), .operator_))
                    continue
                }

                // Punctuation
                let puncts: Set<Character> = ["(", ")", "[", "]", "{", "}", ",", ";", "."]
                if puncts.contains(line[i]) {
                    tokens.append(SyntaxToken(String(line[i]), .punctuation))
                    i = line.index(after: i)
                    continue
                }

                // Whitespace and other
                tokens.append(SyntaxToken(String(line[i]), .plain))
                i = line.index(after: i)
            }

            result.append(tokens)
        }

        return result
    }

    // MARK: - AttributedString builder

    public static func highlight(_ code: String, language: CodeLanguage, theme: SyntaxTheme, fontSize: CGFloat = 12) -> [AttributedString] {
        let tokenizedLines = tokenize(code, language: language)
        let font = UIFont.monospacedSystemFont(ofSize: fontSize, weight: .regular)
        let boldFont = UIFont.monospacedSystemFont(ofSize: fontSize, weight: .semibold)

        return tokenizedLines.map { tokens in
            var attributed = AttributedString()
            for token in tokens {
                var part = AttributedString(token.text)
                part.foregroundColor = theme.color(for: token.type)
                part.font = (token.type == .keyword || token.type == .preprocessor)
                    ? Font(boldFont) : Font(font)
                attributed.append(part)
            }
            if attributed.characters.isEmpty {
                attributed = AttributedString(" ")
                attributed.font = Font(font)
            }
            return attributed
        }
    }

    // MARK: - Helpers

    private static func scanWord(from start: String.Index, in str: String) -> String.Index {
        var i = start
        while i < str.endIndex && (str[i].isLetter || str[i].isNumber || str[i] == "_") {
            i = str.index(after: i)
        }
        return i
    }

    private static func skipSpaces(from start: String.Index, in str: String) -> String.Index {
        var i = start
        while i < str.endIndex && str[i] == " " { i = str.index(after: i) }
        return i
    }
}
