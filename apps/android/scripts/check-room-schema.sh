#!/usr/bin/env bash
# Garde de schéma Room : une version qui change sans schéma JSON ni migration fait échouer la CI.
#   check-room-schema.sh           contrôle statique (avant la compilation)
#   check-room-schema.sh --built   après assembleDebug : le JSON généré par KSP doit être celui qui est versionné
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB="$ROOT/core/database"
SRC="$DB/src/main/kotlin/me/meeshy/core/database"
SCHEMAS="$DB/schemas/me.meeshy.core.database.MeeshyDatabase"
BASELINE=16

fail() { echo "::error::check-room-schema: $*" >&2; exit 1; }

version="$(grep -oE 'version = [0-9]+' "$SRC/MeeshyDatabase.kt" | head -1 | grep -oE '[0-9]+')"
[ -n "$version" ] || fail "version introuvable dans MeeshyDatabase.kt"
grep -qE 'exportSchema = true' "$SRC/MeeshyDatabase.kt" || fail "exportSchema doit rester true"
grep -qE 'fallbackToDestructiveMigration\(\)|fallbackToDestructiveMigrationOnDowngrade' "$SRC/DatabaseModule.kt" \
  && fail "repli destructif global interdit : seules les tables de cache se recréent (migration/CacheReset.kt)"
grep -qE "CURRENT_VERSION: Int = $version\b" "$SRC/migration/Migrations.kt" \
  || fail "MeeshyMigrations.CURRENT_VERSION doit valoir $version"

for ((v = BASELINE; v <= version; v++)); do
  [ -f "$SCHEMAS/$v.json" ] || fail "schéma $SCHEMAS/$v.json absent (build une fois, puis commite le JSON généré)"
done
for ((v = BASELINE + 1; v <= version; v++)); do
  [ -f "$SRC/migration/Migration_$((v - 1))_$v.kt" ] || fail "migration/Migration_$((v - 1))_$v.kt absent"
  grep -q "Migration_$((v - 1))_$v" "$SRC/migration/Migrations.kt" || fail "Migration_$((v - 1))_$v non enregistrée dans Migrations.kt"
  [ -f "$DB/src/test/kotlin/me/meeshy/core/database/migration/MeeshyMigrationTest.kt" ] || fail "MeeshyMigrationTest absent"
done

if [ "${1:-}" = "--built" ]; then
  python3 - "$SCHEMAS/$version.json" <<'PY' || fail "le schéma $version généré par KSP diffère du JSON versionné : commite-le"
import json, subprocess, sys
path = sys.argv[1]
def shape(doc):
    return [(e["tableName"], [(f["columnName"], f["affinity"], f["notNull"]) for f in e["fields"]],
             e["primaryKey"]["columnNames"], [(i["name"], i["columnNames"]) for i in e["indices"]])
            for e in doc["database"]["entities"]]
committed = json.loads(subprocess.check_output(["git", "show", f"HEAD:{subprocess.check_output(['git','ls-files','--full-name',path],text=True).strip()}"]))
generated = json.load(open(path))
sys.exit(0 if shape(committed) == shape(generated) else 1)
PY
fi
echo "check-room-schema: version $version, schémas et migrations cohérents"
