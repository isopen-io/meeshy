import Foundation

/// Téléverse un lot EN PARALLÈLE et rend les résultats dans l'ordre des
/// ENTRÉES, jamais dans l'ordre où les téléversements finissent (#9776).
///
/// L'ordre des entrées est l'ordre du composeur ; la passerelle en fait le
/// rang de chaque pièce (`attachmentIds`). La concurrence est bornée par
/// l'appelant (`TusUploadManager` porte son pool) ; la première erreur
/// interrompt le lot et remonte.
public enum OrderedParallelUpload {
    public static func run<Item: Sendable, Output: Sendable>(
        _ items: [Item],
        upload: @escaping @Sendable @concurrent (Item) async throws -> Output
    ) async throws -> [Output] {
        try await withThrowingTaskGroup(of: (Int, Output).self) { group in
            for (index, item) in items.enumerated() {
                group.addTask { (index, try await upload(item)) }
            }
            var outputs = [Output?](repeating: nil, count: items.count)
            for try await (index, output) in group {
                outputs[index] = output
            }
            return outputs.compactMap { $0 }
        }
    }
}
