import SwiftUI

// MARK: - Adaptive onChange

/// The two-parameter `onChange(of:initial:_:)` — closure `(oldValue, newValue)`
/// — is iOS 17+. iOS 16 only has the single-parameter, now-deprecated
/// `onChange(of:perform:)`, which hands back the new value alone.
///
/// `adaptiveOnChange` exposes the iOS 17 shape everywhere: on iOS 17+ it calls
/// the real modifier verbatim (no behaviour change on current OS versions); on
/// iOS 16 it tracks the previous value itself so callers still receive
/// `(oldValue, newValue)`.
///
/// # Pourquoi un `ViewModifier` et JAMAIS un `@ViewBuilder` (2026-08-19)
///
/// La version précédente branchait l'`if #available` **dans un `@ViewBuilder`
/// renvoyant `some View`**. Le type produit était alors
/// `_ConditionalContent<ModifiedContent<Base, …iOS17…>,
///                      ModifiedContent<Base, LegacyOnChangeModifier<V>>>` :
/// `_ConditionalContent` porte les DEUX branches, donc **`Base` apparaissait
/// deux fois** — le type du site d'appel doublait à chaque `.adaptiveOnChange`,
/// et coûtait 2 niveaux d'imbrication au lieu de 1.
///
/// Avec 233 sites d'appel (dont 12 empilés sur le seul `ConversationView.body`
/// et 9 sur `ConversationListView.body`), cet empilement était le premier
/// contributeur du **débordement de pile du main thread** documenté par 18
/// rapports `.ips` device entre le 2026-07-24 et le 2026-08-19 :
/// `EXC_BAD_ACCESS`/`KERN_PROTECTION_FAILURE` dans la **page de garde** de la
/// pile, trame fautive dans le décodeur de métadonnées RÉCURSIF du runtime
/// (`swift_getTypeByMangledName` → `decodeMangledType` ⇄ `decodeGenericArgs`),
/// ~7,5 Ko de pile par niveau. `ConversationView.body` imbriquait **87
/// niveaux** dont **22 venaient d'ici**.
///
/// Encapsulé dans un `ViewModifier`, le site d'appel ne voit plus que
/// `ModifiedContent<Base, AdaptiveOnChangeModifier<V>>` — **1 seul niveau, une
/// seule occurrence de `Base`**. Le `_ConditionalContent` reste confiné au
/// `body(content:)` du modifier, que SwiftUI évalue depuis son PROPRE nœud
/// d'attribut, à pile plate.
///
/// **Ne jamais reconvertir cette fonction en `@ViewBuilder`.** Garde de
/// non-régression : `ConversationViewBodyTypeDepthTests` (app) borne la
/// profondeur d'imbrication des `body` les plus lourds.
public extension View {
    /// Drop-in replacement for `onChange(of:initial:_:)` with the two-parameter
    /// `(oldValue, newValue)` closure, available down to iOS 16.
    func adaptiveOnChange<V: Equatable>(
        of value: V,
        initial: Bool = false,
        _ action: @escaping (V, V) -> Void
    ) -> some View {
        modifier(AdaptiveOnChangeModifier(value: value, initial: initial, action: action))
    }
}

/// Porte la bascule de disponibilité SANS l'exposer au type de l'appelant
/// (cf. doc ci-dessus). L'`if #available` vit ici, dans un `body(content:)`
/// que SwiftUI évalue à sa propre profondeur de pile.
private struct AdaptiveOnChangeModifier<V: Equatable>: ViewModifier {
    let value: V
    let initial: Bool
    let action: (V, V) -> Void

    func body(content: Content) -> some View {
        if #available(iOS 17.0, *) {
            content.onChange(of: value, initial: initial, action)
        } else {
            content.modifier(LegacyOnChangeModifier(value: value, initial: initial, action: action))
        }
    }
}

/// iOS 16 backport: the deprecated `onChange(of:perform:)` only surfaces the new
/// value, so the previous value is held in `@State` to reconstruct the
/// `(oldValue, newValue)` pair. When `initial` is `true` the action also fires
/// once on first appearance with `(value, value)`, matching iOS 17 semantics.
private struct LegacyOnChangeModifier<V: Equatable>: ViewModifier {
    let value: V
    let initial: Bool
    let action: (V, V) -> Void

    @State private var previous: V?

    func body(content: Content) -> some View {
        content
            .onAppear {
                guard previous == nil else { return }
                previous = value
                if initial { action(value, value) }
            }
            .onChange(of: value) { newValue in
                let oldValue = previous ?? newValue
                previous = newValue
                action(oldValue, newValue)
            }
    }
}
