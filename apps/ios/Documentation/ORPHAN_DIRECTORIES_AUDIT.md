# Orphan directories audit (apps/ios)

This document records the state of three directories at `apps/ios/` that
look like compilable iOS extensions but are NOT actually wired into the
build. Investigated as part of P4.3 (the XcodeGen migration). Decision
captured here so a future contributor doesn't either delete useful work
OR re-introduce broken code by enabling them as XcodeGen targets.

## `MeeshyShareExtension/` — RÉSOLU, embarquée depuis 2026-07-28

> **Cette section décrivait l'état d'avant le 2026-06-24. Elle est
> conservée corrigée, pas supprimée, parce qu'elle a servi de garde-fou
> pendant un mois — mais son verdict « do NOT enable » est CADUC.**

Ce qui était vrai (avant `712bc56e8`, 2026-06-24) : l'`Info.plist`
déclarait `NSExtensionMainStoryboard = "MainInterface"` en pointant sur
un storyboard inexistant, et aucun target ne portait le bundle id.

Ce qui est vrai aujourd'hui :
- `Info.plist` est programmatique — `NSExtensionPrincipalClass =
  $(PRODUCT_MODULE_NAME).ShareViewController`, plus aucune référence à un
  storyboard. `ShareViewController` héberge du SwiftUI (`ShareContentView`).
- Le target `MeeshyShareExtension` est déclaré dans `project.yml`, bundle id
  `me.meeshy.app.share-extension`.
- L'App ID est enregistré au portail Apple (`QA8KGP7U96`, seed `D72UK7R5RE`)
  avec la capability `APP_GROUPS` — le blocage de signature invoqué ici est levé.
- **2026-07-28** : le target est de nouveau dans les `dependencies` de l'app
  (phase « Embed Foundation Extensions »), et le bundle id est déclaré dans
  `fastlane/Matchfile` + les lanes `sync_certificates`/`force_sync` du Fastfile.

### Réserve restante — câblage produit incomplet

L'extension **compile et se signe**, mais le contenu partagé n'atteint pas
encore l'app :
- `saveSharedContent` écrit `pending_shared_content` dans
  `UserDefaults(suiteName: "group.me.meeshy.apps")` — **aucun lecteur** de
  cette clé n'existe côté app.
- `sendToContact` ouvre `meeshy://share?contactId=<id>`, alors que
  `DeepLinkRouter.parseShareQuery` n'interprète que `?text=` et `?url=`.
  Résultat : `Router.handleShareDeepLink` journalise « Share deep link
  received with no content » et se contente d'un `popToRoot()`.

Pour rendre le partage fonctionnel, brancher un lecteur de
`pending_shared_content` sur le réveil de l'app et alimenter
`Router.pendingShareContent` (le mécanisme d'accueil existe déjà).

## `MeeshyIntents/` — partially orphaned, target placement TBD

Files:
- `Info.plist`
- `AppIntents.swift` — uses Apple's `AppIntents` framework (iOS 16+)

`AppIntents` does NOT require a separate extension target — App
Shortcuts and intents typically live inside the main app target. The
files here are not referenced anywhere in the pbxproj. The principal
class `MeeshyAppShortcuts` is defined but never compiled, so the Siri /
Spotlight integration the audit team noted as "exists" is in fact dead
code.

Decision options:
1. **Move** the contents into the `Meeshy` target's `sources` (the
   straightforward path; AppIntents in the main bundle is the
   documented Apple pattern).
2. **Delete** the directory if the feature was abandoned.
3. **Keep as reference** only — explicitly add the directory to
   `Meeshy`'s `sources.excludes` to stop discovery scripts from picking
   it up.

This audit deliberately does NOT pick option 1 because the AppIntents
code would suddenly start influencing Siri / Shortcuts behaviour
without an opportunity to review the actual phrases / actions. A
follow-up review should choose between options 1 and 2.

## `MeeshyContextMenu/` — reference material, not a target

Files:
- `README.md` — describes a "premium contextual menu component"
- `Examples/MeeshyContextMenuExamples.swift` — usage examples

This is documentation + a usage gallery. It's not meant to ship as
either an extension or a separate target. Leave it as-is. If the actual
component implementation referenced in the README lives somewhere else
in the codebase (likely `Meeshy/Features/Main/Components/`), no action
is needed.

## Summary table

| Directory | Has source files? | Wired into build? | Action in `project.yml` |
|-----------|------------------:|------------------:|-------------------------|
| `MeeshyShareExtension/` | yes | **yes — target + embed (2026-07-28)** | déjà déclaré ; reste le câblage produit (cf. réserve ci-dessus) |
| `MeeshyIntents/`        | yes              | no  | requires decision (move / delete / exclude) |
| `MeeshyContextMenu/`    | docs only        | no  | leave as-is |
| `MeeshyTests/`          | yes              | yes (via pbxproj refs) | **added to project.yml in P4.3** |

## Next P4.3 step

Once a developer with macOS access verifies that
`xcodegen generate` against the new `project.yml` produces a pbxproj
that builds cleanly:

1. Delete the 20 `apps/ios/*.rb` maintenance scripts. They no longer
   have a purpose because XcodeGen is now the canonical source.
2. Add a CI check (`ios-tests.yml`): after `xcodegen generate`, run
   `git diff --exit-code Meeshy.xcodeproj/project.pbxproj`. Any drift
   indicates someone bypassed XcodeGen.
3. Decide on the `MeeshyIntents/` action above.
