## Leçon 86 — Un conteneur neuf a besoin de `bun install` AVANT le bootstrap de la leçon 102 (2026-08-10, routine messaging, cycle 58)

La leçon 80 prescrit `prisma generate` + `bun run build` avant toute mesure. Dans un conteneur
fraîchement cloné, les deux échouent : il n'y a aucun `node_modules`. Et `bun install` échoue lui
aussi, sur le postinstall de `grpc-tools` (binaire précompilé récupéré hors du proxy → 403). La
séquence qui marche est `bun install --ignore-scripts`, puis les deux commandes de la leçon 80.

`grpc-tools` est une dépendance du gateway et son postinstall ne sert qu'à produire les stubs
protobuf, dont aucune suite n'a besoin. Sauter les scripts n'a fait rougir aucune des 643 suites.

---
