# `apps/web` — 2026-11-27

Statut de release : **BLOCKED (#20730)**. Base : `dev` @ `467263ce24`, passe du 2026-11-27.

| Porte | Résultat | Preuve |
|---|---|---|
| Build | PASS | `bun run build`, sortie 0 |
| Type-check | PASS | `bun run type-check`, sortie 0 |
| Tests | PASS sous les conditions de la CI | 35 638 tests, 2 741 fichiers ; 25 rouges si le poste exporte `TZ`, corrigés par #20729 |
| Lint | NOT APPLICABLE | aucun script `lint` (#20732) |
| Image | BLOCKED | `postcss`, `uuid`, `browserslist`, `fast-uri` résolus hors épingles (#20730) ; `zod` direct reste 4.4.3 |

Périmètre : `src/main.tsx`, routes, coque Capacitor `android/`. Dépend de `@meeshy/shared` et `@meeshy/design-tokens`. Parle à la passerelle en REST et Socket.IO. 180 de ses témoins lisent des sources de la passerelle.

Changement de la passe : préchargement `src/test-support/timezone-isolation.ts` (#20729).

Non regardé : parcours fonctionnels, performance de rendu, sécurité du client, gardes navigateur Playwright, APK de coque.
