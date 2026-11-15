// GÉNÉRÉ — ne pas éditer; source: packages/shared/types/lens-format.ts
// Régénérer : `cd packages/shared && bun run generate:lens-format`.
// Fraîcheur gardée par packages/shared/__tests__/lens-format-swift.test.ts ;
// comportement gardé par packages/shared/fixtures/lens-v1/vectors.json (vitest ET Swift).

import Foundation

public enum LensFormat {
    /// Lit un document MeeshyLens en octets JSON. Jamais d'exception : un JSON illisible est .invalid.
    public static func parse(_ data: Data) -> LensParseOutcome {
        guard let value = try? JSONDecoder().decode(LensJSONValue.self, from: data) else { return .invalid }
        return parse(value)
    }

    /// Lit un document MeeshyLens. Même ordre que parseLens (TypeScript) : version, interdits, enveloppe, couches.
    public static func parse(_ input: LensJSONValue) -> LensParseOutcome {
        guard case let .object(root) = input, !exceedsDepth(input, levelsLeft: maxDepth) else { return .invalid }
        guard case let .number(rawSchema)? = root["schema"], rawSchema == rawSchema.rounded(), rawSchema >= 1 else { return .invalid }
        if rawSchema > Double(schemaVersion) { return .updateRequired(schema: Int(exactly: rawSchema) ?? Int.max) }
        let reasons = Set(forbiddenReasons(input) + forbiddenLayerReasons(root["layers"])).sorted()
        guard reasons.isEmpty else { return .forbidden(reasons: reasons) }
        guard let envelope = readEnvelope(root) else { return .invalid }
        let layers = envelope.declaredLayers.compactMap(readLayer)
        let ids = layers.map { $0.id }
        guard layers.count <= maxLayers, Set(ids).count == ids.count else { return .invalid }
        let known = Set(ids)
        let triggers = envelope.declaredTriggers.compactMap(readTrigger).filter { known.contains($0.target) }
        guard triggers.count <= maxTriggers else { return .invalid }
        let document = LensDocument(
            id: envelope.id, name: envelope.name, names: envelope.names, credits: envelope.credits,
            surfaces: envelope.surfaces, cost: envelope.cost, window: envelope.window,
            layers: layers, triggers: triggers, fallbacks: envelope.fallbacks.map { visible($0, among: known) }
        )
        return .ok(document, ignoredLayers: envelope.declaredLayers.count - layers.count, ignoredTriggers: envelope.declaredTriggers.count - triggers.count)
    }

    private static func visible(_ fallbacks: LensFallbacks, among known: Set<String>) -> LensFallbacks {
        func tier(_ tier: LensFallbackTier?) -> LensFallbackTier? { tier.map { LensFallbackTier(hide: $0.hide.filter(known.contains)) } }
        return LensFallbacks(reduced: tier(fallbacks.reduced), minimal: tier(fallbacks.minimal))
    }

    private struct Envelope {
        let id: String
        let name: String
        let names: [String: String]
        let credits: LensCredits
        let surfaces: [LensSurface]
        let cost: LensCost
        let window: LensWindow
        let declaredLayers: [LensJSONValue]
        let declaredTriggers: [LensJSONValue]
        let fallbacks: LensFallbacks?
    }

    private static func readEnvelope(_ root: [String: LensJSONValue]) -> Envelope? {
        guard let id = slug(root["id"]), let name = text(root["name"], max: maxNameLength),
              let credits = readCredits(root["credits"]), let surfaces = readSurfaces(root["surfaces"]),
              case let .string(rawCost)? = root["cost"], let cost = LensCost(rawValue: rawCost),
              let window = readWindow(root["window"]),
              case let .array(declaredLayers)? = root["layers"], (1...maxDeclaredLayers).contains(declaredLayers.count) else { return nil }
        let names = optional(root, "names") { readNames($0) }
        let triggers = optional(root, "triggers") { value -> [LensJSONValue]? in
            guard case let .array(items) = value, items.count <= maxDeclaredTriggers else { return nil }
            return items
        }
        let fallbacks = optional(root, "fallbacks") { readFallbacks($0) }
        guard names.isValid, triggers.isValid, fallbacks.isValid else { return nil }
        return Envelope(
            id: id, name: name, names: names.value ?? [:], credits: credits, surfaces: surfaces, cost: cost, window: window,
            declaredLayers: declaredLayers, declaredTriggers: triggers.value ?? [], fallbacks: fallbacks.value
        )
    }

    private static func readCredits(_ value: LensJSONValue?) -> LensCredits? {
        guard case let .object(fields)? = value, let author = text(fields["author"], max: maxAuthorLength),
              case let .string(createdAt)? = fields["createdAt"], isISODate(createdAt) else { return nil }
        let updatedAt = optional(fields, "updatedAt") { value -> String? in
            guard case let .string(date) = value, isISODate(date) else { return nil }
            return date
        }
        guard updatedAt.isValid else { return nil }
        return LensCredits(author: author, createdAt: createdAt, updatedAt: updatedAt.value)
    }

    private static func readSurfaces(_ value: LensJSONValue?) -> [LensSurface]? {
        guard case let .array(items)? = value, !items.isEmpty else { return nil }
        let surfaces = items.compactMap { item -> LensSurface? in
            guard case let .string(raw) = item else { return nil }
            return LensSurface(rawValue: raw)
        }
        return surfaces.count == items.count && Set(surfaces).count == surfaces.count ? surfaces : nil
    }

    private static func readNames(_ value: LensJSONValue) -> [String: String]? {
        guard case let .object(fields) = value else { return nil }
        var names: [String: String] = [:]
        for language in languages where language != "fr" {
            let entry = optional(fields, language) { text($0, max: maxNameLength) }
            guard entry.isValid else { return nil }
            names[language] = entry.value
        }
        return names
    }

    private static func readWindow(_ value: LensJSONValue?) -> LensWindow? {
        guard case let .object(fields)? = value,
              case let .string(startsAt)? = fields["startsAt"], isISODateTime(startsAt),
              case let .string(endsAt)? = fields["endsAt"], isISODateTime(endsAt), endsAt > startsAt else { return nil }
        let geo = optional(fields, "geo") { value -> [String]? in
            guard case let .object(geoFields) = value else { return nil }
            return codes(geoFields["countries"], pattern: patterns.country, max: maxCountries)
        }
        let communities = optional(fields, "communities") { codes($0, pattern: patterns.community, max: maxCommunities) }
        guard geo.isValid, communities.isValid else { return nil }
        return LensWindow(startsAt: startsAt, endsAt: endsAt, countries: geo.value, communities: communities.value)
    }

    private static func codes(_ value: LensJSONValue?, pattern: String, max: Int) -> [String]? {
        guard case let .array(items)? = value, (1...max).contains(items.count) else { return nil }
        let strings = items.compactMap { item -> String? in
            guard case let .string(code) = item, matches(pattern, code) else { return nil }
            return code
        }
        return strings.count == items.count && Set(strings).count == strings.count ? strings : nil
    }

    private static func readFallbacks(_ value: LensJSONValue) -> LensFallbacks? {
        guard case let .object(fields) = value else { return nil }
        let reduced = optional(fields, "reduced") { readTier($0) }
        let minimal = optional(fields, "minimal") { readTier($0) }
        guard reduced.isValid, minimal.isValid else { return nil }
        return LensFallbacks(reduced: reduced.value, minimal: minimal.value)
    }

    private static func readTier(_ value: LensJSONValue) -> LensFallbackTier? {
        guard case let .object(fields) = value, case let .array(items)? = fields["hide"], items.count <= maxHidden else { return nil }
        let ids = items.compactMap { slug($0) }
        return ids.count == items.count ? LensFallbackTier(hide: ids) : nil
    }
}
