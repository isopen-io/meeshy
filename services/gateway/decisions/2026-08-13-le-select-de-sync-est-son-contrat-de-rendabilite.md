## 2026-08-13 — Le select de `/sync` EST son contrat de rendabilité

**Contexte** : la collection `messages` de `GET /sync` ne rendait que six champs (`id`,
`conversationId`, `senderId`, `content`, `createdAt`, `updatedAt`). Aucun client ne consomme encore
cette route — c'est précisément ce qui rendait l'écart facile à ignorer, et c'est aussi ce qui le
rendait bloquant : un client qui appliquerait `added`/`modified` sur cette base écrirait dans sa
base locale des lignes qu'il ne peut PAS afficher. Sans `translations` ni `originalLanguage`, la
résolution du Prisme Linguistique n'a rien à résoudre et le message s'affiche dans la langue de
l'expéditeur ; sans `attachments`, la bulle perd sa pièce jointe ; sans `clientMessageId`, la
réconciliation optimiste ne peut pas apparier sa ligne et duplique la bulle.

**Décision** : `syncMessageSelect`, écrit sous `Prisma.validator<Prisma.MessageSelect>()` (un nom de
champ périmé casse le BUILD, pas la requête), et `SYNC_MESSAGE_RENDERABLE_KEYS` — la liste explicite
des clés qu'un client doit recevoir, qu'un témoin de forme oppose au select réel. Amaigrir la
projection pour économiser de la bande passante doit d'abord faire rougir un test.

**Alternatives rejetées** :
- **Laisser le select maigre et faire re-fetch les ids par le client.** N allers-retours pour une
  fenêtre de rattrapage, et une violation directe du cache-first.
- **Recopier les sous-selects `attachments` / `sender`.** C'est exactement la dérive que
  `attachmentIncludes.ts` documente en tête de fichier (cinq copies locales avaient perdu les deux
  champs Prisme). `attachmentMediaSelect` et `messageSenderUserSelect` sont réutilisés tels quels.
- **Importer `messageSenderUserSelect` depuis `conversations/messages.ts`.** L'import aurait traîné
  un module de routes entier — et ses dépendances — jusque dans les doubles jest des suites
  voisines, le danger que `utils/active-member-count.ts` nomme déjà. Le fragment est extrait dans
  `conversations/utils/message-sender-select.ts` et reste ré-exporté par `messages.ts`.

**Conséquences** :
- `SyncMessage` se DÉDUIT (`Prisma.MessageGetPayload<{ select: typeof syncMessageSelect }>`) au lieu
  d'être une déclaration parallèle qui pouvait dériver du select en silence.
- Le stream `deleted` reste maigre (`id`, `conversationId`, `deletedAt`) : un tombstone n'a rien à
  rendre. Un témoin le verrouille.
- Charge utile plus lourde, bornée par le cap 1000 et `limit` ; l'ETag reste correct (hash du
  contenu sérialisé), le keyset `(updatedAt, id)` et le cap sont inchangés — trois témoins de
  non-régression le disent.

---
