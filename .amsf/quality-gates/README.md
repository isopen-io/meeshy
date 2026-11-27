# Portes de qualité existantes

Inventaire du 2026-11-27. Le dépôt en a déjà beaucoup ; ce fichier dit lesquelles, et où sont les trous.

| Exigence | Porte existante | Trou |
|---|---|---|
| Zones touchées | `scripts/ci-affected.mjs`, job `changes` | aucun |
| Tests hors zone | voie de parité, `scripts/ci/voie-parite.mjs` | aucun |
| Type-check | étape bloquante sur shared, passerelle, agent, web | aucun |
| Lint | étape informative, ne lance rien | #20732 |
| Formatage | aucune | pas de Prettier ni d'équivalent configuré |
| Tests unitaires | jobs `Tests ·` par paquet, passerelle en trois tranches | aucun |
| Contrats entre clients | gardes de parité Swift, Kotlin, TypeScript dans `packages/shared/__tests__/ci/` et la passerelle | voir `../contracts/README.md` |
| Sécurité du dépôt | Trivy `fs` sur CRITICAL et HIGH, Trivy par image dans `docker.yml` | pas de détection de secrets dédiée ; Trivy ne voit pas l'écart entre l'image et le lockfile (#20730) |
| Lockfile | `scripts/check-bun-lockfile-parity.mjs` | `pnpm-lock.yaml` n'a pas de garde |
| Schéma Prisma | job `Prisma · schéma et client` | aucun |
| Message de commit | `.githooks/commit-msg` | aucun |
| Limite de worktrees | `.claude/hooks/worktree-limit.sh` | aucun |
| Préparation de session | `.claude/hooks/session-start.sh` | aucun |
| Commandes destructrices, fichiers protégés | aucune porte exécutable | laissé au porteur, voir `../DECISIONS.md` |
| Versions résolues par les images | `../scripts/check-image-resolution.mjs`, non branché en CI, rouge aujourd'hui | #20730 |
| SBOM | aucune | non produit |
| Release | `release.yml` (Changesets), `promote-production.yml` | aucun mesuré |
