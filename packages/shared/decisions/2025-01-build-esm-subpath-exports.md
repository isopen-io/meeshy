## 2025-01: Build - ESM + Subpath Exports
**Statut**: Accept
**Contexte**: Module moderne avec tree-shaking pour tous les consommateurs
**Decision**: `"type": "module"`, target ES2020, moduleResolution `bundler`, subpath exports (`@meeshy/shared/types/*`, `@meeshy/shared/encryption/*`)
**Alternatives rejet**: CommonJS (legacy, pas de tree-shaking), dual CJS+ESM (maintenance complexe)
**Cons**: Extensions `.js` obligatoires dans les imports (convention ESM), incompatible outils CJS-only
