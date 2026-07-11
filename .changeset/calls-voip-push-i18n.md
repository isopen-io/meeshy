---
"@meeshy/shared": patch
"@meeshy/gateway": patch
---

Localize the incoming-call VoIP push notification (title/body) to the callee's resolved language instead of hardcoded French, in line with the Prisme Linguistique language-resolution priority (`resolveUserLanguage`). Adds `call.incoming.title`/`call.incoming.body` to the shared notification-strings catalog.
