# Cycle 21 — Éditer un message EFFACE les gens qu'il nomme

Suivi direct du premier point laissé ouvert par le cycle 20 :

> « **Le chemin d'édition est un quatrième écrivain de `validatedMentions`, et il extrait moins
> bien.** `messages-advanced.ts` appelle `extractMentions` (handles bruts) là où la création
> appelle `extractMentionsWithParticipants` (qui résout aussi `@Display Name`). »

Vérifié : réel, et — comme au cycle 20 — le trou est plus large que le point noté. Le chemin
d'édition ne « extrait pas moins bien » : il **détruit**, sur quatre déclencheurs distincts, et
il détruit AVANT de savoir s'il saura reconstruire.

## D1 (racine) — l'édition purge d'abord, extrait ensuite

`messages-advanced.ts:303` supprime toutes les lignes `Mention` du message. L'extraction ne
commence qu'à la ligne 308. Entre les deux, plus rien ne protège les mentions : tout ce qui
échoue en aval laisse le message dépeuplé. Et l'aval est destructeur par écrit, pas seulement
par omission — quatre chemins remettent `validatedMentions: []` :

| Déclencheur | Ligne | Ce qui se perd |
|---|---|---|
| `extractMentions` ne reconnaît pas `@Display Name` | 308 | mention vivante, texte inchangé |
| aucun username résolu | 402 | idem |
| `fastify.mentionService` absent | 420 | **toutes** les mentions, à chaque édition |
| n'importe quelle exception | 432 | idem, y compris sur panne transitoire |

Le premier est le cas nominal, pas un cas limite. `extractMentions` ne lit que les `@handle`
bruts ; `extractMentionsWithParticipants` (chemin de création) résout en plus `@Display Name`.
Donc : envoyer « salut @John Doe » nomme John — ligne `Mention`, `validatedMentions: ['johndoe']`,
surlignage web. **Corriger une virgule ailleurs dans ce message efface John** : ligne supprimée,
champ vidé, plus de surlignage, disparu de l'inbox `/mentions`. Le texte, lui, dit toujours
`@John Doe`. Le web lit `validatedMentions` avec `staleTime: Infinity` — donc à vie.

## D2 — purger-puis-recréer réécrit `mentionedAt` des mentions QUI N'ONT PAS BOUGÉ

`Mention.mentionedAt` est l'axe de tri de l'inbox (`@@index([mentionedParticipantId,
mentionedAt(sort: Desc)])`). Purger puis recréer donne à chaque mentionné restant un
`mentionedAt` neuf : une mention d'il y a trois jours remonte en tête de l'inbox parce que
l'auteur a corrigé une faute de frappe. Rien n'a changé pour ce mentionné.

## D3 — chaque édition re-notifie TOUS les mentionnés

`createMentionNotificationsBatch(validationResult.validUserIds, …)` part sur l'ensemble complet
à chaque édition. Dix corrections successives = dix pushes à quelqu'un qui était déjà nommé au
premier envoi. Une mention doit notifier une fois.

D2 et D3 ont la même racine que D1 : l'édition traite la mise à jour comme une **re-création**
alors que c'est une **réconciliation**.

## Plan

- [x] `resolveMessageMentions` reçoit `mode: 'create' | 'replace'` (défaut `'create'`, les trois
      appelants existants inchangés)
- [x] `'replace'` réconcilie au lieu de purger : lit l'ensemble précédent, ne supprime que les
      partants, ne crée que les entrants — `mentionedAt` des inchangés préservé (D2)
- [x] `ResolvedMentions` porte `newlyMentionedUserIds` — l'éventail de notifications n'a plus
      à deviner qui est nouveau (D3). En `'create'`, c'est l'ensemble complet
- [x] En `'replace'`, le court-circuit « pas de `@` » ne saute plus l'effacement : retirer une
      mention par édition doit la retirer pour de bon
- [x] Service absent ou exception ⇒ **on ne touche à rien**. Préserver une mention périmée vaut
      mieux que détruire une mention vivante — et c'est déjà le contrat best-effort de l'unité
- [x] `messages-advanced.ts` : ~150 lignes en ligne remplacées par l'appel
- [x] Tests vus ROUGES avant le correctif

## Revue

### Réconcilier, pas re-créer

Le remède noté au cycle 20 était « une variante *remplacement* (purge des lignes existantes +
écriture même vide) ». Écrit tel quel, il corrigeait D1 et laissait D2 et D3 intacts — la purge
EST ce qui réécrit `mentionedAt` et ce qui rend « qui est nouveau ? » insoluble. Lire l'ensemble
précédent coûte une requête sur un chemin qui en fait déjà cinq, et les trois défauts tombent
ensemble : les partants partent, les restants ne bougent pas, les entrants sont exactement le
lot à notifier.

### Détruire à l'aveugle n'est pas « best-effort »

Le commentaire d'origine — `// Clear mentions on error to avoid stale data` — préfère le champ
vide au champ périmé. C'est le mauvais arbitrage quand le contenu, lui, est toujours là : une
mention périmée surligne quelqu'un de trop pendant une édition ; une mention détruite ne revient
jamais, parce que rien ne relit le texte pour la reconstruire. Le reste de l'unité tient déjà ce
contrat (« Une mention perdue ne doit pas transformer un envoi réussi en 500 ») ; l'édition
était le seul écrivain à le rompre.

### La purge est passée dans le chemin de succès

Même après réconciliation, l'ordre compte : `deleteMany` ne s'exécute plus qu'une fois la
validation rendue. Une panne d'extraction ou de résolution laisse désormais la base telle
qu'elle était, au lieu de la laisser à mi-chemin.

### `mentionedParticipantId` contient un `User.id`

Sur TOUS les chemins : `createMentions` y écrit les `validUserIds`, et l'inbox
(`getRecentMentionsForUser`) y compare un `userId`. Le nom du champ ment, la donnée est
cohérente. Ce cycle s'aligne sur l'existant plutôt que d'ouvrir une migration.

### Reste ouvert après ce cycle

- **`MessageHandler.handleMessageEdit` (édition par WebSocket) ne touche AUCUNE mention** —
  vérifié dans ce cycle, tête du suivant. Il écrit `content`, `isEdited`, `editedAt`,
  `translations: null` et s'arrête là : ni ligne `Mention`, ni `validatedMentions`. Éditer
  « salut @alice » en « salut @bob » par socket laisse Alice mentionnée (ligne + champ) et ne
  nomme jamais Bob. C'est le cinquième écrivain de la famille, et le seul qui n'écrit rien du
  tout — la variante `'replace'` construite ici est exactement ce qu'il lui faut. Non fait dans
  ce cycle : `MessageHandler` ne reçoit pas `mentionService` dans ses `MessageHandlerDependencies`,
  donc le câblage passe par le constructeur, `MeeshySocketIOManager` et tous les doubles de test
  — une pièce distincte, pas une ligne de plus.
- **`validateMentionPermissions` reçoit un `Participant.id` à la création et un `User.id` à
  l'édition** (cycle 20, précisé ici). La valeur ATTENDUE est un `User.id` : la comparaison se
  fait contre les `Participant.userId` de la conversation. C'est donc la CRÉATION qui est du
  mauvais côté, pas l'édition — un `Participant.id` n'égale jamais un `User.id`, donc en
  conversation `direct` le filtre anti-auto-mention ne filtre rien à l'envoi. Sans autre effet
  (la comparaison ne sert qu'en `direct`).
- **Le domaine social extrait encore avec `extractMentions`.** `routes/posts/core.ts` (création
  ET édition de post) et `routes/posts/comments.ts` appellent la variante handles-bruts, donc un
  `@John Doe` dans un post ou un commentaire ne nomme personne — jamais, pas seulement à
  l'édition. Même défaut que celui corrigé ici, autre domaine : `createPostMentions` /
  `createCommentMentions` sont les équivalents de `createMentions`, et l'unité de ce cycle n'est
  pas directement réutilisable (elle écrit `Message.validatedMentions`). À instruire à part.
- **Une dérive `validatedMentions` non vide sans ligne `Mention` correspondante survit à un
  effacement.** Le chemin d'effacement se déclenche sur les lignes existantes ; un message écrit
  AVANT le cycle 20 (qui persistait les mentionnés rejetés) peut porter un username sans ligne.
  Inerte à l'affichage — `mentionsToLinks` ne surligne que les handles PRÉSENTS dans le texte,
  et l'effacement n'arrive que lorsqu'ils n'y sont plus — donc laissé tel quel.
- **`MeeshySocketIOManager.getConversationParticipantsForMention` est un troisième exemplaire du
  chargeur de participants** (cycle 20, inchangé).
- **`getLatestMessageSummary` résume le DERNIER message de la conversation, pas celui qu'on
  vient d'acquitter** (cycle 19, inchangé).
- **Aucun client iOS n'écoute `link:message:new`** (cycle 15, inchangé).
- **Les pièces jointes du chemin de lien n'entrent pas dans le pipeline audio** (cycle 16).
- L'arbitrage `delete-for-me` tranché par le cycle 12 attend toujours une validation humaine.
