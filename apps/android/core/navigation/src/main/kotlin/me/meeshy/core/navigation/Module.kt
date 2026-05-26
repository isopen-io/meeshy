package me.meeshy.core.navigation

/**
 * Type-safe navigation route contracts shared across feature modules — keeps
 * cross-feature navigation off the `:app` recompile path (ARCHITECTURE.md §2,
 * §9; ADR-010).
 *
 * Populated in Phase 2/5: `@Serializable` route types and the `DeepLinkRouter`
 * contract.
 */
internal object NavigationModulePlaceholder
