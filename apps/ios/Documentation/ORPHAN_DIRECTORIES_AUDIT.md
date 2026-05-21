# Orphan directories audit (apps/ios)

This document records the state of three directories at `apps/ios/` that
look like compilable iOS extensions but are NOT actually wired into the
build. Investigated as part of P4.3 (the XcodeGen migration). Decision
captured here so a future contributor doesn't either delete useful work
OR re-introduce broken code by enabling them as XcodeGen targets.

## `MeeshyShareExtension/` — broken, do NOT enable

Files:
- `Info.plist` — declares `NSExtensionMainStoryboard = "MainInterface"`
- `ShareViewController.swift` — UIViewController subclass

The Info.plist references a `MainInterface.storyboard` that does not
exist in the directory. The pbxproj has no Share Extension target with a
matching bundle ID (`me.meeshy.app.share` is absent — confirmed via
`grep PRODUCT_BUNDLE_IDENTIFIER apps/ios/Meeshy.xcodeproj/project.pbxproj`).

Conclusion: this directory is the start of an iOS Share Extension that
was never finished. Adding it to `project.yml` as-is would produce a
build break (missing storyboard) and Xcode Cloud upload rejections.

To revive: finish the storyboard (or migrate the principal class to a
programmatic SLComposeServiceViewController flow without a storyboard),
add a `me.meeshy.app.share` provisioning profile via `fastlane match`,
THEN declare the target in `project.yml`.

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
| `MeeshyShareExtension/` | yes (incomplete) | no  | do NOT add (would break) |
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
