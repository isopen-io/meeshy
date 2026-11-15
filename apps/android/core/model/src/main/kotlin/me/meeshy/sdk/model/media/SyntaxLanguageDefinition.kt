package me.meeshy.sdk.model.media

import me.meeshy.sdk.model.fileviewer.CodeLanguage

/** Ce qui distingue une famille de langages pour le lexeur : vocabulaire, commentaires, chaînes, balisage. */
internal data class SyntaxLanguageDefinition(
    val keywords: Set<String>,
    val typeWords: Set<String> = emptySet(),
    val builtins: Set<String> = emptySet(),
    val lineComment: String? = null,
    val blockComment: Pair<String, String>? = null,
    val nestedBlockComments: Boolean = false,
    val quotes: Set<Char> = setOf('"', '\''),
    val tripleQuotes: Boolean = false,
    val backtickStrings: Boolean = false,
    val preprocessorPrefix: String? = null,
    val rubyIdentifiers: Boolean = false,
    val markup: Boolean = false,
    val css: Boolean = false,
    val keyColon: Boolean = false,
    val keyEquals: Boolean = false,
    val jsonKeys: Boolean = false,
    val rustChars: Boolean = false,
) {
    companion object {
        private fun words(text: String): Set<String> = text.split(' ', '\n').filter { it.isNotEmpty() }.toSet()

        private val slashes = "//"
        private val cBlock = "/*" to "*/"

        private val python = SyntaxLanguageDefinition(
            keywords = words("False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case type"),
            typeWords = words("int float str bool list dict tuple set bytes bytearray object type Exception"),
            builtins = words("print len range enumerate zip map filter sorted reversed isinstance issubclass super property staticmethod classmethod abs all any open input"),
            lineComment = "#", tripleQuotes = true,
        )
        private val script = SyntaxLanguageDefinition(
            keywords = words("break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new of return super switch this throw try typeof var void while with yield async await from static get set enum implements interface type abstract declare namespace readonly as keyof satisfies infer"),
            typeWords = words("string number boolean any void never unknown undefined null Array Object Promise Map Set Date RegExp Error Symbol BigInt Record Partial Required Readonly Pick Omit"),
            builtins = words("console Math JSON parseInt parseFloat setTimeout setInterval clearTimeout clearInterval fetch require module exports process Buffer global window document"),
            lineComment = slashes, blockComment = cBlock, backtickStrings = true,
        )
        private val swift = SyntaxLanguageDefinition(
            keywords = words("actor any as associatedtype async await borrowing break case catch class consume consuming continue convenience default defer deinit didSet do dynamic each else enum extension fallthrough fileprivate final for func guard if import in indirect infix init inout internal is isolated lazy let macro mutating nonisolated nonmutating open operator optional override package postfix precedencegroup prefix private protocol public repeat required rethrows return self Self some static struct subscript super switch throw throws try typealias unowned var weak where while willSet true false nil"),
            typeWords = words("Int String Bool Double Float Array Dictionary Set Optional Result Error Void Never Any AnyObject Character Data Date URL UUID Codable Decodable Encodable Identifiable Hashable Equatable Comparable Sendable View ObservableObject Published State Binding Environment MainActor Task AsyncSequence ObservedObject StateObject"),
            builtins = words("print debugPrint fatalError precondition assert min max abs zip stride type dump withAnimation withTransaction"),
            lineComment = slashes, blockComment = cBlock, nestedBlockComments = true, quotes = setOf('"'), tripleQuotes = true, preprocessorPrefix = "#",
        )
        private val go = SyntaxLanguageDefinition(
            keywords = words("break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var"),
            typeWords = words("bool byte complex64 complex128 error float32 float64 int int8 int16 int32 int64 rune string uint uint8 uint16 uint32 uint64 uintptr any comparable"),
            builtins = words("append cap close copy delete len make new panic print println recover nil true false iota"),
            lineComment = slashes, blockComment = cBlock, backtickStrings = true,
        )
        private val rust = SyntaxLanguageDefinition(
            keywords = words("as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type union unsafe use where while yield"),
            typeWords = words("bool char f32 f64 i8 i16 i32 i64 i128 isize str u8 u16 u32 u64 u128 usize String Vec Box Rc Arc Option Result HashMap HashSet BTreeMap"),
            builtins = words("println print eprintln eprint format panic assert assert_eq assert_ne todo unimplemented unreachable cfg derive include env concat line file column stringify vec Some None Ok Err"),
            lineComment = slashes, blockComment = cBlock, nestedBlockComments = true, quotes = setOf('"'), preprocessorPrefix = "#", rustChars = true,
        )
        private val jvm = SyntaxLanguageDefinition(
            keywords = words("abstract assert break case catch class const continue default do else enum extends final finally for goto if implements import instanceof interface native new package private protected public return static strictfp super switch synchronized this throw throws transient try volatile while when fun val var object companion data sealed suspend inline override open internal annotation crossinline noinline reified tailrec operator infix out in by lazy lateinit def trait with yield match given using export opaque transparent erased"),
            typeWords = words("boolean byte char double float int long short void String Integer Long Double Float Boolean Character Object Class List Map Set Array ArrayList HashMap HashSet Optional Unit Nothing Any Int Byte Short Char"),
            builtins = words("System out println print Math Collections Arrays Objects Thread Runnable null true false"),
            lineComment = slashes, blockComment = cBlock, nestedBlockComments = true, tripleQuotes = true,
        )
        private val cFamily = SyntaxLanguageDefinition(
            keywords = words("auto break case char const continue default do double else enum extern float for goto if inline int long register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while alignas alignof and and_eq asm bitand bitor bool catch class compl concept consteval constexpr constinit co_await co_return co_yield decltype delete dynamic_cast explicit export false friend mutable namespace new noexcept not nullptr operator or override private protected public reinterpret_cast requires static_assert static_cast template this throw true try typeid typename using virtual xor @interface @implementation @end @protocol @property @synthesize @dynamic @class @selector @encode @try @catch @finally @throw @optional @required self super nil YES NO id"),
            typeWords = words("size_t ptrdiff_t int8_t int16_t int32_t int64_t uint8_t uint16_t uint32_t uint64_t FILE string vector map set list pair tuple shared_ptr unique_ptr weak_ptr optional variant array deque queue stack unordered_map unordered_set NSObject NSString NSArray NSDictionary NSNumber UIView UIViewController CGFloat NSInteger BOOL"),
            builtins = words("printf scanf malloc free sizeof strlen strcpy strcmp memcpy memset assert exit abort std cout cin endl cerr move forward NSLog alloc init release retain autorelease NULL true false"),
            lineComment = slashes, blockComment = cBlock, preprocessorPrefix = "#",
        )
        private val ruby = SyntaxLanguageDefinition(
            keywords = words("alias and begin break case class def defined? do else elsif end ensure false for if in module next nil not or redo rescue retry return self super then true undef unless until when while yield require include extend attr_reader attr_writer attr_accessor raise puts print"),
            typeWords = words("Array Hash String Integer Float Symbol TrueClass FalseClass NilClass Regexp Range Proc Lambda IO File Dir Struct Class Module"),
            builtins = words("p pp gets chomp each map select reject reduce inject collect detect find freeze frozen? dup clone respond_to? send new initialize to_s to_i to_f to_a to_h"),
            lineComment = "#", blockComment = "=begin" to "=end", backtickStrings = true, rubyIdentifiers = true,
        )
        private val php = SyntaxLanguageDefinition(
            keywords = words("abstract and as break callable case catch class clone const continue declare default do echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile enum eval exit extends final finally fn for foreach function global goto if implements include instanceof interface isset list match namespace new or print private protected public readonly require return static switch this throw trait try unset use var while xor yield"),
            typeWords = words("array bool float int mixed never null object string void self parent iterable"),
            builtins = words("array_map array_filter array_reduce array_push array_pop count strlen substr strpos preg_match preg_replace json_encode json_decode var_dump print_r true false PHP_EOL"),
            lineComment = slashes, blockComment = cBlock,
        )
        private val shell = SyntaxLanguageDefinition(
            keywords = words("if then else elif fi for while until do done case esac in function select time coproc return exit break continue shift export readonly local declare typeset unset source eval exec trap set shopt"),
            builtins = words("echo printf read cd pwd ls cp mv rm mkdir rmdir chmod chown grep sed awk find sort uniq wc cat head tail cut tr xargs test true false command type which alias"),
            lineComment = "#", backtickStrings = true,
        )
        private val sql = SyntaxLanguageDefinition(
            keywords = words("SELECT FROM WHERE INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE ALTER DROP INDEX JOIN INNER LEFT RIGHT OUTER FULL CROSS ON AND OR NOT IN BETWEEN LIKE IS NULL AS ORDER BY ASC DESC GROUP HAVING LIMIT OFFSET UNION ALL DISTINCT EXISTS CASE WHEN THEN ELSE END BEGIN COMMIT ROLLBACK TRANSACTION PRIMARY KEY FOREIGN REFERENCES CONSTRAINT DEFAULT CHECK UNIQUE AUTO_INCREMENT CASCADE RESTRICT select from where insert into values update set delete create table alter drop index join inner left right outer on and or not in between like is null as order by asc desc group having limit offset union all distinct exists case when then else end begin commit rollback primary key foreign references constraint default check unique"),
            typeWords = words("INT INTEGER BIGINT SMALLINT TINYINT FLOAT DOUBLE DECIMAL NUMERIC VARCHAR CHAR TEXT BLOB DATE DATETIME TIMESTAMP BOOLEAN SERIAL UUID JSON JSONB ARRAY int integer bigint varchar char text boolean date datetime timestamp json jsonb"),
            builtins = words("COUNT SUM AVG MIN MAX COALESCE IFNULL NULLIF CAST CONVERT CONCAT LENGTH SUBSTRING TRIM UPPER LOWER NOW CURRENT_TIMESTAMP TRUE FALSE count sum avg min max coalesce concat length substring trim upper lower now true false"),
            lineComment = "--", blockComment = cBlock, quotes = setOf('\''), backtickStrings = true,
        )
        private val markup = SyntaxLanguageDefinition(keywords = emptySet(), blockComment = "<!--" to "-->", markup = true)
        private val css = SyntaxLanguageDefinition(
            keywords = words("import media charset font-face keyframes supports layer container scope starting-style property"),
            typeWords = words("px em rem vh vw vmin vmax ch ex cm mm in pt pc deg rad grad turn s ms Hz kHz dpi dpcm dppx fr auto inherit initial unset revert none block inline flex grid absolute relative fixed sticky static"),
            builtins = words("var calc min max clamp rgb rgba hsl hsla url attr env counter counters linear-gradient radial-gradient conic-gradient repeat"),
            blockComment = cBlock, css = true,
        )
        private val json = SyntaxLanguageDefinition(keywords = words("true false null"), quotes = setOf('"'), jsonKeys = true)
        private val yaml = SyntaxLanguageDefinition(
            keywords = words("true false null yes no on off True False TRUE FALSE Yes No YES NO Null NULL ~"),
            lineComment = "#", keyColon = true,
        )
        private val toml = SyntaxLanguageDefinition(
            keywords = words("true false"), lineComment = "#", keyEquals = true,
        )
        private val ini = SyntaxLanguageDefinition(keywords = emptySet(), lineComment = "#", keyEquals = true)
        private val fallback = SyntaxLanguageDefinition(
            keywords = words("if else for while do switch case break continue return class struct enum interface function func def fn var let const val import export from package module use public private protected static final abstract new delete this self super try catch throw finally async await yield true false null nil void type typeof instanceof"),
            typeWords = words("int float double string bool boolean char byte long short void var any object"),
            builtins = words("print println printf console log error warn"),
            lineComment = slashes, blockComment = cBlock,
        )

        fun of(language: CodeLanguage): SyntaxLanguageDefinition = when (language) {
            CodeLanguage.PYTHON -> python
            CodeLanguage.JAVASCRIPT, CodeLanguage.TYPESCRIPT, CodeLanguage.DART -> script
            CodeLanguage.SWIFT -> swift
            CodeLanguage.GO -> go
            CodeLanguage.RUST -> rust
            CodeLanguage.JAVA, CodeLanguage.KOTLIN, CodeLanguage.SCALA -> jvm
            CodeLanguage.C, CodeLanguage.CPP, CodeLanguage.OBJECTIVE_C -> cFamily
            CodeLanguage.RUBY -> ruby
            CodeLanguage.PHP -> php.copy(lineComment = slashes)
            CodeLanguage.SHELL, CodeLanguage.DOCKERFILE, CodeLanguage.MAKEFILE, CodeLanguage.PERL, CodeLanguage.R -> shell
            CodeLanguage.SQL -> sql
            CodeLanguage.CSS -> css
            CodeLanguage.HTML, CodeLanguage.XML -> markup
            CodeLanguage.JSON -> json
            CodeLanguage.YAML -> yaml
            CodeLanguage.TOML -> toml
            CodeLanguage.INI -> ini
            else -> fallback
        }
    }
}
