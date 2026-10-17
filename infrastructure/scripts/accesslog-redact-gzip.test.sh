#!/usr/bin/env bash
# Témoin de scripts/accesslog-redact-gzip.sh (#10855) : bash accesslog-redact-gzip.test.sh
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
input='{"RequestPath":"/api/v1/auth/magic-link/verify?token=abc123&next=/home","ClientHost":"1.2.3.4"}
{"RequestPath":"/reset-password?token=s3cr3t","x":1}
{"RequestPath":"/x?lang=fr&resetToken=zz&code=4242&sig=q1"}
{"RequestPath":"/auth/verify-email?token=9f3c\u0026email=awa%40exemple.fr\u0026next=/c/1"}
{"RequestPath":"/api/v1/conversations?limit=20","DownstreamStatus":200}'
expected='{"RequestPath":"/api/v1/auth/magic-link/verify?token=REDACTED&next=/home","ClientHost":"1.2.3.4"}
{"RequestPath":"/reset-password?token=REDACTED","x":1}
{"RequestPath":"/x?lang=fr&resetToken=REDACTED&code=REDACTED&sig=REDACTED"}
{"RequestPath":"/auth/verify-email?token=REDACTED\u0026email=REDACTED\u0026next=/c/1"}
{"RequestPath":"/api/v1/conversations?limit=20","DownstreamStatus":200}'
actual=$(printf '%s\n' "$input" | "$here/accesslog-redact-gzip.sh" -6 | gzip -dc)
if [ "$actual" != "$expected" ]; then
  diff <(printf '%s\n' "$expected") <(printf '%s\n' "$actual") >&2 || true
  echo "ÉCHEC : la valeur d'un paramètre secret survit à la compression" >&2
  exit 1
fi
echo "ok : secrets masqués, le reste intact"
