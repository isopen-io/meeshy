# Plan — Iteration 79i (2026-07-01) — iOS i18n complète `Router.swift`

## Objectif
iOS exclusivement. Localiser les **titres de route** (`Route.displayTitle` → `Router.sceneTitle`
→ `UIWindowScene.title`, visible en Stage Manager / app switcher / VoiceOver) et le **toast
d'erreur de deep-link conversation**, tous littéraux français figés (dont plusieurs sans
accents). Swap i18n pur, aucune logique de navigation modifiée.

## Base de départ
`main` HEAD `1111688` (post-#1130, resync avant démarrage ; branche `claude/upbeat-euler-3z5qm8`
recréée depuis `origin/main`). Itération numérotée **79i** (78i déjà pris par #1166/#1168).

## Étapes
1. [x] Audit repo iOS des littéraux FR user-visibles → `Router.swift` (23 titres + 1 toast) =
   cluster dense, auto-contenu, non touché par les PR en vol (`list_pull_requests` vérifié).
2. [x] Confirmer la visibilité : `displayTitle` → `sceneTitle` → `UIWindowScene.title`
   (`RootView.swift:443`) = titre de fenêtre iPad/Stage Manager + app switcher + VoiceOver.
3. [x] Swap des 23 titres `displayTitle` → `String(localized: "route.title.<x>",
   defaultValue: "<EN>", bundle: .main)` ; fallback `sceneTitle` → `route.title.conversations` ;
   toast `:316` → `deeplink.conversation.error`.
4. [x] Ajout des 26 clés dans `Localizable.xcstrings` (de/en/es/fr/pt-BR, `state: translated`,
   `extractionState: manual`). Sérialiseur format-Xcode (`" : "`, indent 2, `{}` inline,
   UTF-8 littéral) **round-trip byte-for-byte vérifié** sur le fichier avant insertion →
   diff = 910 lignes pure addition, 0 suppression. JSON revalidé (`json.load`, 1025 clés).
5. [x] `defaultValue` en **anglais** (pas de « français-pour-tous » sur catalogue-miss ;
   catalogue porte les 5 langues dont FR avec accents corrigés).
6. [x] Docs analyse + plan 79i ; pointeur autoritaire iOS + ligne tracking MAJ.
7. [ ] Commit, push `claude/upbeat-euler-3z5qm8`, ouvrir PR, attendre CI `iOS Tests`,
   merger dans `main` après CI verte, supprimer la branche.

## Fichiers touchés
- `apps/ios/Meeshy/Features/Main/Navigation/Router.swift` (25 sites : 23 titres + fallback + toast)
- `apps/ios/Meeshy/Localizable.xcstrings` (26 clés ×5 langues, pure addition)

## Clés introduites (defaultValue EN en code, ×5 langues au catalogue)
`route.title.{settings,profile,contacts,discover,communities,community,community_create,
community_settings,members,invite,notifications,stats,links,affiliate,tracking_links,share_links,
community_links,data_export,post,bookmarks,starred,friend_requests,edit_profile,story,
conversations}`, `deeplink.conversation.error`.

## Non-objectifs (explicitement hors périmètre)
- Pas de changement de layout / navigation / `Route` `Hashable` / iPad two-column.
- Pas de réutilisation d'SSOT dispersé (couplerait le titre de scène à des écrans sans rapport) —
  namespace `route.title.*` neuf et uniforme.
- Autres fichiers à littéraux FR (`ConversationLockSheet`, `StoryTrayView`, `ContextActionMenu`…)
  → itérations dédiées ultérieures (Différés).

## Risques / non-régression
- `String(localized:defaultValue:bundle:)` = API Foundation déjà utilisée dans `Router.swift`
  (`magicLink.*`) → aucun import neuf, aucun risque de compile.
- FR : seules les valeurs gagnent leurs accents manquants (amélioration).
- Catalogue : édité en parallèle par d'autres PR mais clés distinctes → merge additif.

## Gate
CI `iOS Tests` (compile Xcode 26.1.x + tests simu 18.2). SwiftUI ne compile pas sous Linux.
Swap i18n pur = pas de test unitaire isolable (précédent 77i/73i « 0 test neuf »).

## Statut : ⏳ push + CI → merge main
