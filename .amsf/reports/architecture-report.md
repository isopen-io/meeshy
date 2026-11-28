# Rapport d'architecture — 2026-11-27

La carte est dans `../ARCHITECTURE.md`, `../INVENTORY.md` et `../DEPENDENCY-GRAPH.md`.

## Constats

- Direction des dépendances saine : `packages/shared` est une feuille, tous les projets TypeScript en dépendent, aucun cycle.
- Trois clients natifs ou web tiennent des miroirs écrits à la main de lois TypeScript. Le dépôt le sait et les tient par des gardes de parité ; c'est le couplage le plus coûteux du monorepo.
- 180 témoins du web importent des sources de la passerelle par chemin relatif, sans dépendance de workspace. La voie de parité compense côté CI ; `turbo` ne voit pas ce lien.
- Deux gestionnaires de paquets résolvent différemment : pnpm ignore le champ `overrides` racine (#20730).
- `typescript` est demandé en `^7.0.2` par `packages/shared` et en `^6.0.3` ailleurs : les déclarations produites par l'un sont lues par l'autre. Non vérifié plus avant.

Aucune refonte n'est proposée : rien de mesuré ne la justifie.
