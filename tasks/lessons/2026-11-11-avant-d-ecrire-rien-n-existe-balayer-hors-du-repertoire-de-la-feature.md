## 2026-11-11 — Avant d'écrire « rien n'existe », balayer hors du répertoire de la feature

**Date** : 2026-11-11 · **Domaine** : jeu, plan produit · **Issues** : #17384, #17395

### Ce qui s'est passé

Le plan du Jeu (#17364) et deux issues affirmaient qu'un message qui rapporte « ne montre rien dans la
conversation » et qu'aucune série par conversation n'existait. Les deux étaient faux : la flamme de la conversation
(`ConversationHeaderFlame.swift`, `header-flame.tsx`) rejoue un effet de deux secondes à chaque envoi, et
`ConversationEngagementSnapshot.streakDays` porte une série par lecteur et par conversation. Une planche de design
proposait donc de remplacer une animation que le porteur voulait garder. Le porteur l'a relevé.

### Pourquoi

Le relevé de l'existant n'avait lu que les répertoires nommés « Game » (`Features/Game`, `utils/game`,
`services/game`). Le retour de jeu le plus visible vit dans l'en-tête de conversation, sous le vocabulaire
« engagement », pas « game ».

### La règle

- Une affirmation d'ABSENCE (« rien n'existe », « aucun retour », « rien de tel dans le dépôt ») se prouve par un
  balayage du dépôt entier sur les mots du DOMAINE et leurs synonymes (ici : flamme, flame, streak, série,
  engagement, points), jamais par la lecture du répertoire de la feature.
- Avant de proposer une animation ou un écran neuf, chercher d'abord ce que l'utilisateur voit DÉJÀ au même moment
  et au même endroit, sur les trois plateformes.
- Dans une issue, une absence non balayée s'écrit « non trouvé dans <périmètre lu> », pas « n'existe pas ».
