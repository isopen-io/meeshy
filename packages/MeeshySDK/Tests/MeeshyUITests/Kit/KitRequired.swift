import Testing

/// `#require` ne s'imbrique pas dans un autre `#require` sous Xcode 26 (« recursive
/// expansion of macro »). Le déballage intérieur passe par cette fonction, qui garde
/// le message et l'emplacement de `#require`.
func kitRequired<T>(_ value: T?, sourceLocation: SourceLocation = #_sourceLocation) throws -> T {
    try #require(value, sourceLocation: sourceLocation)
}
