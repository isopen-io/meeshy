import Foundation

public enum LiteralRegex {

    public static func compile(
        pattern: StaticString,
        options: NSRegularExpression.Options = []
    ) -> NSRegularExpression {
        (try? NSRegularExpression(pattern: pattern.description, options: options)) ?? unmatchable
    }

    public static let unmatchable: NSRegularExpression = {
        do {
            return try NSRegularExpression(pattern: "(?!)")
        } catch {
            preconditionFailure("le motif constant « (?!) » doit toujours compiler : \(error)")
        }
    }()
}
