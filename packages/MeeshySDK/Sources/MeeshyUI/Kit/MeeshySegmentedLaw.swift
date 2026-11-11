import Foundation

/// La loi du choix segmenté, lue comme des VALEURS : quand le contrôle se rend,
/// où est le courant, quelle option le clavier vise, si un toucher change quelque
/// chose, et comment les segments se répartissent dans la piste. Aucun rendu ici :
/// les trois plateformes lisent les mêmes vecteurs (`docs/product/kit/K03-MeeshySegmented.vectors.json`).
public nonisolated enum MeeshySegmentedLaw {

    /// Les touches que le contrôle écoute ; la valeur brute est celle des vecteurs.
    public nonisolated enum Key: String, Sendable, CaseIterable {
        case left
        case right
        case home
        case end
        case space
    }

    public static func isRenderable(count: Int) -> Bool {
        (2...4).contains(count)
    }

    /// Les options rendues, dans leur ordre : toutes de deux à quatre, aucune sinon
    /// (loi 13 : pas même la piste).
    public static func rendered<Option>(_ options: [Option]) -> [Option] {
        isRenderable(count: options.count) ? options : []
    }

    public static func currentIndex<ID: Equatable>(selection: ID, in ids: [ID]) -> Int? {
        ids.firstIndex(of: selection)
    }

    public static func changes(from current: Int?, to target: Int) -> Bool {
        current != target
    }

    /// L'index que sélectionne un toucher sur `target`, ou `nil` quand il ne change
    /// rien : contrôle désactivé, ou segment déjà courant. `nil` ⇒ ni rappel ni haptique.
    public static func tapResult(current: Int?, target: Int, isEnabled: Bool) -> Int? {
        isEnabled && changes(from: current, to: target) ? target : nil
    }

    /// Les flèches suivent le sens de lecture (en RTL, la droite recule d'une option)
    /// et bouclent ; Début et Fin vont aux bornes sans boucler ; Espace ne déplace rien.
    public static func keyboardTarget(key: Key, index: Int, count: Int, rtl: Bool) -> Int? {
        switch key {
        case .right: return wrapped(index, count: count, delta: rtl ? -1 : 1)
        case .left: return wrapped(index, count: count, delta: rtl ? 1 : -1)
        case .home: return count > 0 ? 0 : nil
        case .end: return count > 0 ? count - 1 : nil
        case .space: return nil
        }
    }

    /// Les segments groupés par rangée, dans l'ordre des options. Une rangée se
    /// remplit tant que la somme des largeurs minimales tient dans `available`.
    public static func rows(widths: [Double], available: Double) -> [[Int]] {
        widths.indices.reduce(into: [[Int]]()) { rows, index in
            guard let last = rows.last, sum(last.map { widths[$0] }) + widths[index] <= available else {
                rows.append([index])
                return
            }
            rows[rows.count - 1].append(index)
        }
    }

    /// La largeur de chaque segment, rangée par rangée : parts égales, un segment
    /// ne descend jamais sous la largeur de son texte, la place restante se partage.
    public static func partition(widths: [Double], available: Double) -> [[Double]] {
        rows(widths: widths, available: available).map { row in
            share(row.map { widths[$0] }, available: available, fixed: [])
        }
    }

    private static func wrapped(_ index: Int, count: Int, delta: Int) -> Int? {
        guard count > 0 else { return nil }
        return ((index + delta) % count + count) % count
    }

    private static func sum(_ values: [Double]) -> Double {
        values.reduce(0, +)
    }

    private static func share(_ widths: [Double], available: Double, fixed: Set<Int>) -> [Double] {
        let free = widths.indices.filter { !fixed.contains($0) }
        let fixedSum = sum(fixed.sorted().map { widths[$0] })
        let each = free.isEmpty ? 0 : (available - fixedSum) / Double(free.count)
        let overflowing = free.filter { widths[$0] > each }
        guard overflowing.isEmpty else {
            return share(widths, available: available, fixed: fixed.union(overflowing))
        }
        return widths.indices.map { fixed.contains($0) ? widths[$0] : each }
    }
}
