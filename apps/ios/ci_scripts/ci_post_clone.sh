#!/bin/sh
# Xcode Cloud — runs after the repository is cloned, before xcodebuild.
# Apple invokes this with PWD = $CI_PRIMARY_REPOSITORY_PATH/apps/ios/ci_scripts.
# Xcode Cloud's archive command uses CODE_SIGN_IDENTITY=- (ad-hoc), which is
# incompatible with restricted entitlements (aps-environment, app-groups,
# keychain-access-groups, associated-domains). The build then fails at the
# validationUtility step with "entitlements that require signing with a
# development certificate".
#
# The fix is to disable signing during the archive step (CODE_SIGNING_ALLOWED=NO)
# so xcodebuild produces an unsigned archive. Xcode Cloud's distribution action
# (TestFlight Internal/External, App Store) signs the archive afterwards using
# its cloud-managed Apple Distribution certificate.
#
# We patch project.pbxproj in place to add CODE_SIGNING_ALLOWED=NO only to the
# Release configurations of the three signed targets (Meeshy, NSE, Widgets).
# The patch is conditional on $CI_XCODEBUILD_ACTION = "archive" so it never
# affects build, test, or analyze actions on Xcode Cloud.
#
# Local builds (fastlane build_production, ./apps/ios/meeshy.sh) are NEVER
# affected because this script only runs inside Xcode Cloud.

set -euo pipefail

if [ "${CI_XCODEBUILD_ACTION:-}" != "archive" ]; then
  echo "[ci_post_clone] Action is '${CI_XCODEBUILD_ACTION:-unset}', not 'archive'; skipping signing patch."
  exit 0
fi

PROJECT_PBX="${CI_PRIMARY_REPOSITORY_PATH}/apps/ios/Meeshy.xcodeproj/project.pbxproj"

if [ ! -f "$PROJECT_PBX" ]; then
  echo "[ci_post_clone] ERROR: $PROJECT_PBX not found." >&2
  exit 1
fi

echo "[ci_post_clone] Patching $PROJECT_PBX to add CODE_SIGNING_ALLOWED=NO to all Release buildSettings."

# Insert CODE_SIGNING_ALLOWED = NO; just after CODE_SIGN_STYLE = Automatic; only
# when the surrounding block belongs to a Release configuration (heuristic: the
# matching closing brace contains 'name = Release'). We avoid Debug configs so
# local development remains unaffected if the repo is ever cloned by a dev tool.
#
# We use a simple Python pass to walk XCBuildConfiguration blocks and inject the
# setting. Pure sed/awk is fragile around brace counting; Python is shipped on
# all macOS runners.

python3 <<'PYEOF'
import os, re

path = os.path.join(os.environ["CI_PRIMARY_REPOSITORY_PATH"], "apps/ios/Meeshy.xcodeproj/project.pbxproj")
with open(path, "r") as f:
    src = f.read()

# Match each XCBuildConfiguration block — they look like:
#   <UUID> /* Release */ = {
#       isa = XCBuildConfiguration;
#       buildSettings = {
#           ...settings...
#       };
#       name = Release;
#   };
#
# We inject CODE_SIGNING_ALLOWED = NO inside buildSettings of any block whose
# closing 'name = Release;' is present, and which already declares
# CODE_SIGN_ENTITLEMENTS (i.e. the 3 entitled targets).

pattern = re.compile(
    r"(/\* Release \*/ = \{\s*isa = XCBuildConfiguration;\s*buildSettings = \{)([^}]*?CODE_SIGN_ENTITLEMENTS[^}]*?)(\s*\};\s*name = Release;\s*\};)",
    re.DOTALL,
)

def patch_block(match):
    head, body, tail = match.group(1), match.group(2), match.group(3)
    if "CODE_SIGNING_ALLOWED" in body:
        return match.group(0)  # already patched
    new_body = body + "\n\t\t\t\tCODE_SIGNING_ALLOWED = NO;"
    return head + new_body + tail

patched, count = pattern.subn(patch_block, src)
if count == 0:
    raise SystemExit("[ci_post_clone] ERROR: pattern did not match any Release config")

with open(path, "w") as f:
    f.write(patched)

print(f"[ci_post_clone] Injected CODE_SIGNING_ALLOWED=NO into {count} Release config(s).")
PYEOF

echo "[ci_post_clone] Patch complete. Xcode Cloud archive will produce unsigned binaries; distribution action will sign them."
