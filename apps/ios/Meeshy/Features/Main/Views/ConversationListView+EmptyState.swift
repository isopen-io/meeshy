import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Conversation List Empty Branch

/// Distinguishes `ConversationListView`'s possible "nothing to render"
/// branches so the CORRECT placeholder is picked — only relevant once
/// `groupedConversations` is already known empty. Pure/`nonisolated` (no
/// SwiftUI/MainActor dependency) so it's directly unit-testable (audit
/// 2026-07-20: the "créez-en une" CTA flashed during cold-start `.idle` —
/// skeleton was gated strictly on `.loading` — and reused verbatim for an
/// ACTIVE search with zero matches, misleadingly implying zero
/// conversations). `loadState` is resolved BEFORE the search branch (fix
/// 2026-07-21): `.idle`/`.loading` ONLY occur while the cold, cache-less
/// first fetch is in flight (`ConversationListViewModel.performLoadConversations`'s
/// `.expired`-with-nothing-recovered / `.empty` branches) — the search field
/// is always focusable, so a user typing during that window must still see
/// the cache-first skeleton, never a definitive "no results for your
/// search" (a still-loading state is not a result). Once the load has
/// settled (`.loaded`/`.offline`/`.error`/`.cachedFresh`/`.cachedStale`),
/// an active search with zero matches takes priority over every other
/// state. Top-level (not nested) — matches this codebase's established
/// `nonisolated enum` placement convention.
nonisolated enum ConversationListEmptyBranch: Equatable {
    case skeleton
    case searchNoResults
    case syncError
    case createFirstConversation
}

// MARK: - Conversation List Empty State

/// Le rendu des quatre branches « rien à lister » de `ConversationListView`
/// (squelette, recherche sans résultat, échec de synchronisation, première
/// conversation) : il ne reçoit que la branche déjà RÉSOLUE par
/// `ConversationListView.emptyBranch` et les deux actions qu'elle déclenche.
struct ConversationListEmptyState: View {
    let branch: ConversationListEmptyBranch
    let onNewConversation: (() -> Void)?
    let onRetry: () -> Void

    @ViewBuilder
    var body: some View {
        switch branch {
        case .skeleton:
            // Mux de squelette sous drapeau (contrat LWS-7,
            // workshop I-067bis — exception de périmètre
            // accordée par l'orchestrateur, seule ouverture
            // consentie dans ce fichier hors du mux de rang
            // I-067). `LentilleSkeletonRow` (`Lentille/Row/`,
            // I-066, vue pure prête depuis ce lot) ne pouvait
            // pas être montée depuis `ConversationRowItem`
            // (ÉCART CONTRAT↔CODE signalé par I-067,
            // `ConversationListView+Rows.swift` : cette
            // branche « cache vide » est un chemin de rendu
            // ENTIÈREMENT séparé, au niveau de la LISTE, où
            // aucune `Conversation` n'existe encore pour
            // instancier un `ConversationRowItem`). Drapeau
            // OFF : `SkeletonConversationRow()` INCHANGÉ, bit
            // à bit identique à avant ce lot.
            LazyVStack(spacing: 8) {
                ForEach(0..<6, id: \.self) { index in
                    if LentilleFeatureFlag.isLentilleListEnabled {
                        LentilleSkeletonRow()
                            .staggeredAppear(index: index, baseDelay: 0.04)
                    } else {
                        SkeletonConversationRow()
                            .staggeredAppear(index: index, baseDelay: 0.04)
                    }
                }
            }
            // D1 — la marge du squelette doit être celle des
            // rangées RÉELLES, sinon la liste saute
            // latéralement quand les placeholders sont
            // remplacés. Le padding est posé sur le CONTENEUR,
            // donc il porte sur les DEUX branches du mux : la
            // valeur doit être muxée, pas seulement le type de
            // rang. Peau historique : `16` inchangé.
            .padding(.horizontal, LentilleFeatureFlag.isLentilleListEnabled
                     ? LentilleMetrics.Row.marginHorizontal
                     : 16)
            .transition(.opacity)
        // behaviour-matrix:L17 — « … avec des états vides
        // restylés plats ». Seule `.skeleton` (ci-dessus)
        // était muxée sous `LentilleFeatureFlag` ; les trois
        // branches suivantes ne l'étaient pas (TROU PARTIEL,
        // documenté par B1). Restylage MINIMAL, cohérent
        // avec `.skeleton` (mêmes métriques : même
        // icône/titre/sous-titre/action, même
        // `.padding(.top, 60)`) — `EmptyStateView.compact`
        // (knob existant du primitive partagé, pas une
        // invention) donne la variante plate sous le
        // drapeau ; drapeau OFF ⇒ le rendu historique
        // EXACT, bit à bit identique (mêmes arguments,
        // aucun `compact:`).
        case .searchNoResults:
            // `Group` : un modificateur ne s'attache pas à un
            // `if/else` dans un ViewBuilder (« instance member
            // 'padding' cannot be used on type 'View' »). Le
            // mux de drapeau posé ici a rendu ces deux lignes
            // orphelines. `Group` est transparent au rendu —
            // il rétablit la cible du modificateur sans
            // dupliquer les métriques dans chaque branche, ce
            // qui est précisément ce que ce restylage promet
            // (« même `.padding(.top, 60)` »).
            Group {
                if LentilleFeatureFlag.isLentilleListEnabled {
                    EmptyStateView(
                        icon: "magnifyingglass",
                        title: String(localized: "search.no_results"),
                        subtitle: String(localized: "search.try_other_terms"),
                        compact: true
                    )
                } else {
                    EmptyStateView(
                        icon: "magnifyingglass",
                        title: String(localized: "search.no_results"),
                        subtitle: String(localized: "search.try_other_terms")
                    )
                }
            }
            .padding(.top, 60)
            .transition(.opacity)
        case .syncError:
            // Cold-start sync failed AND cache is empty: offer a
            // retry instead of the misleading "no conversations"
            // placeholder. This is the path users hit after a
            // cold start with stale/expired token or network
            // issues — previously they were trapped on an empty
            // list with no feedback.
            Group {
                if LentilleFeatureFlag.isLentilleListEnabled {
                    EmptyStateView(
                        icon: "exclamationmark.arrow.triangle.2.circlepath",
                        title: String(localized: "conversations.error.title"),
                        subtitle: String(localized: "conversations.error.subtitle"),
                        actionLabel: String(localized: "conversations.error.retry"),
                        compact: true,
                        onAction: {
                            onRetry()
                        }
                    )
                } else {
                    EmptyStateView(
                        icon: "exclamationmark.arrow.triangle.2.circlepath",
                        title: String(localized: "conversations.error.title"),
                        subtitle: String(localized: "conversations.error.subtitle"),
                        actionLabel: String(localized: "conversations.error.retry"),
                        onAction: {
                            onRetry()
                        }
                    )
                }
            }
            .padding(.top, 60)
            .transition(.opacity)
        case .createFirstConversation:
            Group {
                if LentilleFeatureFlag.isLentilleListEnabled {
                    // RIEN ICI (2026-09-09). La queue de liste
                    // porte les accès rapides et se rend dans
                    // TOUTES les branches, celle-ci comprise :
                    // les monter ici aussi les affichait DEUX
                    // fois, l'un sous l'autre, à un compte neuf
                    // — celui qui a le plus besoin d'aide.
                    EmptyView()
                } else {
                    EmptyStateView(
                        icon: "bubble.left.and.bubble.right",
                        title: String(localized: "conversations.empty.title"),
                        subtitle: String(localized: "conversations.empty.subtitle"),
                        actionLabel: String(localized: "conversations.empty.action"),
                        onAction: {
                            onNewConversation?()
                        }
                    )
                }
            }
            .padding(.top, 60)
            .transition(.opacity)
        }
    }
}
