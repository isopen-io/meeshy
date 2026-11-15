## 2025-01: Build - Script shell custom (`meeshy.sh`)
**Statut**: Accept
**Contexte**: Automatisation build/run/test/archive sans dpendance externe
**Decision**: Script bash 601 lignes wrappant xcodebuild, dtection auto simulateur, log streaming avec crash monitoring
**Alternatives rejet**: Fastlane (overkill, dpendance Ruby), Xcode GUI (pas automatable)
**Cons**: Fragilit du bash (whitespace, quoting), macOS+Xcode obligatoire
