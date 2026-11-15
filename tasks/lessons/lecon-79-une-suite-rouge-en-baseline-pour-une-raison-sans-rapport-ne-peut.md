## Leçon 79 — Une suite rouge en baseline pour une raison sans rapport ne peut avertir de RIEN (2026-08-10, routine messaging, cycle 55)

L'extraction d'une règle a changé la forme d'un filtre (`{ targetId: id }` →
`{ targetId: { in: [id] } }`). Deux témoins la pinnaient, tous deux trouvés et mis à jour, suite
locale verte, PR ouverte. La CI en a trouvé un **troisième** — `posts-share-tracking.test.ts`.

Il n'était pas caché : un `grep` l'aurait rendu. Ce qui a manqué, c'est que la baseline locale, si
soigneusement mesurée soit-elle, comptait cette suite parmi ses **20 rouges pré-existantes** — elle
ne COMPILE pas dans cet environnement (`PostReactionService.ts:354`, `groupBy` non typé par le
client Prisma généré ici). Une suite qui ne démarre pas ne peut pas faire tomber une assertion. La
comparaison « mêmes 20 suites avant/après » était exacte et prouvait bien l'absence de régression
**parmi les suites qui tournent** — elle ne disait rien des 20 autres, et j'ai lu son silence comme
une couverture.

**Règle** : dès qu'un changement modifie la FORME d'un appel (arguments d'une requête, signature,
nom d'événement), la liste des sites à corriger se fait par `grep` sur la forme, jamais par la liste
des tests qui rougissent. Les tests qui rougissent sont un sous-ensemble de ce qu'il faut corriger,
et le complément est exactement invisible.

**Corollaire, plus important** : la baseline rouge de cet environnement n'est pas un décor, c'est un
angle mort **mesurable**. 20 suites sur 642 — soit environ 3 % du dépôt — ne peuvent contredire
aucun cycle. Tant qu'elles ne compilent pas, tout cycle qui touche `PostService`, `PostReactionService`
ou leurs voisins doit lister ses sites par `grep` et considérer la CI comme le premier vrai contrôle.
Réparer cette compilation localement vaudrait plus qu'un cycle de correctif.
