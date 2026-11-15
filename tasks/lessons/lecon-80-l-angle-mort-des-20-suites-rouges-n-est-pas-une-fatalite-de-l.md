## Leçon 80 — L'angle mort des « 20 suites rouges » n'est pas une fatalité de l'environnement : c'est une étape de bootstrap sautée (2026-08-10, routine messaging, cycle 56)

La leçon 79, écrite le même jour, conclut que ~20 suites gateway ne compilent pas dans cet
environnement (`PostReactionService.ts:354`, `groupBy` non typé), que ce trou de 3 % ne peut
contredire aucun cycle, et que « réparer cette compilation localement vaudrait plus qu'un cycle de
correctif ».

Elle vaut, et le correctif tient en une commande — **déjà écrite dans le `CLAUDE.md` racine**, au
paragraphe « Local Test Parity (bun) » : `cd packages/shared && npx prisma generate --generator
client` (« else ~17 gateway suites fail (commentId/PostMediaSelect) »), suivi de
`cd packages/shared && bun run build` (sans quoi le web ne résout pas `@meeshy/shared/*`, dont le
`moduleNameMapper` pointe sur `dist/`).

Mesure de ce cycle, après ces deux commandes : **640 suites / 16 261 tests, 0 échec, 0 suite
rouge** — y compris `posts-share-tracking.test.ts`, précisément la suite dont la leçon 79 dit
qu'elle était invisible en local et n'a rougi qu'en CI. Le client Prisma généré n'est pas un artefact
du dépôt ; un conteneur frais n'en a aucun, et les suites qui en dépendent ne compilent pas tant
qu'on ne l'a pas généré.

**Règle** : avant toute mesure de suite gateway ou web, exécuter les deux commandes de bootstrap et
VÉRIFIER le nombre de suites rouges. S'il n'est pas nul, c'est un défaut d'environnement à réparer
avant de mesurer quoi que ce soit — pas une baseline à documenter. Une baseline rouge qu'on accepte
devient un angle mort qu'on transmet au cycle suivant.
