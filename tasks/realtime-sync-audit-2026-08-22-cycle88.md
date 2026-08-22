# Cycle 88 — Les cinq sites de présence, et un faux positif qui cachait une vraie fuite

**Date** : 2026-08-22
**Branche** : `claude/keen-hamilton-inwn81`
**Périmètre** : passerelle — `routes/messages.ts`, `routes/magic-link.ts`,
`routes/communities/core.ts` (le module devenu vivant au cycle 86-ter — voir §1)

**Clients touchés** : aucun changement de code client. Aucun nom d'événement
ajouté ni retiré, aucune charge utile temps réel modifiée, aucune ligne de
Socket.IO touchée. Trois réponses REST changent de contenu — voir §5.

---

## 1. D'où vient ce cycle

L'inventaire corrigé du cycle 87 (§6) plaçait en tête les sites qui touchent la
présence, avec la consigne du cycle 84 bis :

> **`user` × 4 + `sender` × 1** — les seuls qui touchent la présence. Schéma
> **et** gate dans le même lot, sans quoi la réparation publie la fuite.

Ce cycle les prend — **les cinq**, y compris celui que j'annonçais laisser.

### Le module a bougé SOUS ce lot, une troisième fois

J'ai commencé par corriger `GET /communities/:id/conversations` dans
`routes/communities.ts`, au motif que `routes/communities/core.ts` vivait dans
le module ombré. À l'intégration de `main`, le **cycle 86-ter** avait consolidé
l'ombrage : `routes/communities.ts` est désormais une **coquille de ré-export**,
et `routes/communities/` est le module vivant. Mon correctif était donc, à
nouveau, dans le mauvais fichier — pour la raison exactement inverse de la
première fois.

Il a été porté sur `routes/communities/core.ts`, et le ROUGE re-prouvé contre
la version de `main` de ce fichier-là : **6 des 6 témoins de cette route
tombent**. C'est la troisième fois en une session que ce fichier change de
place, et la deuxième fois que je m'y trompe. La règle du cycle 86 bis tient et
mérite d'être relue avant chaque correctif de route :

> Avant de corriger une route, `grep` sur le CHEMIN de la route, pas sur le
> fichier qu'on croit être le sien.

À quoi s'ajoute, désormais : **et re-vérifier après chaque intégration de
`main`** — une consolidation peut déplacer le fichier vivant entre le moment où
l'on écrit le correctif et celui où on le pousse.

## 2. Le faux positif — et ce qu'il cachait

`routes/messages.ts` déclarait `sender: { type: 'object' }` dans la réponse de
`GET /messages/:messageId`. Le balayage l'a donc classé « champ vidé ».

**Il ne l'était pas.** Le schéma de cette route décrit le MESSAGE — `id`,
`content`, `sender`, `attachments`, `translations`, `createdAt` — alors que
`sendSuccess` répond `{ success, data }`. Aucune des six propriétés déclarées ne
correspond à une clé de l'objet réel ; `success` et `data` sont **non déclarés**
et traversent par l'`additionalProperties: true` que le bloc porte. Vérifié en
isolant le compilateur :

```
in : { success:true, data:{ id:'m1', sender:{ id:'s1', isOnline:true, user:{…} } } }
out: {"success":true,"data":{"id":"m1","sender":{"id":"s1","isOnline":true,"user":{…}}}}
```

Et confirmé par le ROUGE : sur le code d'avant, le témoin d'identité de
l'expéditeur **passait déjà**. Seuls les témoins de GATE tombent.

**La règle du balayage doit donc être bornée :**

> Un `{ type: 'object' }` nu ne vide que si le schéma qui le porte décrit
> vraiment la charge utile. Quand l'enveloppe ne correspond pas — schéma du
> contenu là où la route répond `{ success, data }` —, **toutes** les
> déclarations sont inertes, et le balayage rend un faux positif sur la FORME.

### Ce que le faux positif cachait

Le site n'était pas une non-fuite accidentelle : c'était **une fuite**.

`sender` charge `isOnline` sur DEUX porteurs — la ligne `Participant` et le
`User` qu'elle référence — et rien ne les filtrait. Comme la déclaration était
inerte, la présence brute atteignait le fil, pour de bon, sur toutes les
lectures de détail d'un message.

C'est l'inverse exact du cycle 84 bis, et la comparaison vaut d'être gardée :

| | cycle 84 bis (`/communities/search`) | ici (`/messages/:id`) |
|---|---|---|
| déclaration | s'applique | **inerte** (enveloppe non décrite) |
| effet | vide la donnée | ne fait rien |
| statut | piège armé — réparer publie la fuite | **fuite active** |
| urgence | avant la prochaine réparation | **maintenant** |

Le balayage a donc trouvé le bon site pour la mauvaise raison. Le gate est posé.

Le schéma, lui, n'est **pas** aligné sur l'enveloppe dans ce lot : le faire
exigerait de décrire tout ce que la route sert — une trentaine de colonnes,
pièces jointes et bloc de statut compris — sans quoi la déclaration tronquerait
ce qui passe aujourd'hui. C'est un lot en soi, et une note sur place le dit.

## 3. `GET /communities/:id/conversations` — trois dérives d'un coup

| ce que le schéma déclarait | ce que le handler produit |
|---|---|
| `members[]` | `participants[]` |
| `_count.members` | `_count.participants` |
| — | `title`, `type`, `identifier`, `avatar`, `banner`, `isActive`, `memberCount`, `lastMessageAt` |

Résultat sur le fil : des conversations réduites à `id`, `communityId`, deux
dates et `_count.messages`. **Sans titre ni type** — pendant que le web type
cette réponse `Conversation[]` (`communities.service.ts:55`).

Renommer `members` → `participants` ne casse aucun client : `members` n'a jamais
atteint le fil, faute de producteur, et `participants` n'y arrivait pas non plus,
faute de déclaration.

### Le régime se lit dans le `where`, pas dans le contrôle d'accès

Le contrôle d'accès de cette route ne referme que les communautés **privées** —
ce qui suggérerait le régime mixte du cycle 85-bis. Mais la requête filtre :

```ts
where: { communityId: id, participants: { some: { userId } } }
```

Elle ne rend que les conversations dont l'appelant est **lui-même** participant.
Toute personne listée est donc un co-participant : contexte acquis,
`resolvePrefsOnly`, sans condition. Le contrôle d'accès, plus permissif, aurait
conduit au critère strict — à tort, et en retirant des pastilles légitimes.

> **Lire le `where` avant de choisir le régime.** Le contrôle d'accès borne qui
> entre ; la requête borne ce qui sort. C'est la seconde qui décide.

## 4. `POST /magic-link/validate` — la connexion sans utilisateur

Les deux routes de validation déclaraient `user: { type: 'object' }` et
`session: { type: 'object' }`. Ici la déclaration **s'applique** (l'enveloppe est
correctement décrite), et les deux sortaient en `{}` : la connexion par lien
magique rendait son jeton, et aucun utilisateur.

Les deux formes sont déjà décrites par les schémas partagés — `userSchema`
couvre le `socketIOUser` que le service construit, `sessionSchema` la
`SessionData` de `createSession`. Réutilisés plutôt que recopiés.

**Aucun gate ici, et la raison est précise** : `isOnline` / `lastActiveAt` y sont
SYNTHÉTISÉS pour le compte qui vient de se connecter — c'est le lecteur
lui-même, et la politique rend `FULL` sur `isSelf`. Ce n'est pas « il n'y a pas
de champ de présence » (il y en a) ; c'est « la présence de soi est toujours
montrable ».

## 5. Ce qui change dans les réponses

- `GET /messages/:messageId` : `sender.isOnline` et `sender.user.isOnline`
  respectent désormais `showOnlineStatus`. **Contenu inchangé par ailleurs.**
- `GET /communities/:id/conversations` : titre, type, identifiant, avatar,
  bannière, activité et compteurs sortent enfin ; `members[]` devient
  `participants[]` (jamais servi sous l'ancien nom) ; la présence des
  co-participants est gatée.
- `POST /magic-link/validate` (les deux) : `user` et `session` portent leurs
  champs au lieu de `{}`.

## 6. Témoins

Quatorze neufs, tous à travers `app.inject()` :

- **`message-detail-sender-presence.test.ts`** (neuf, 5 témoins) : masquage des
  deux porteurs, conservation, routage prefs-only, expéditeur anonyme visible
  sans résolution, et un témoin de CONSTAT qui fige le fait que le schéma ne
  gouverne pas cette réponse — il rendrait visible une future « correction » du
  schéma qui, elle, tronquerait pour de bon.
- **`communities-presence-gate.test.ts`** : +6 sur la route conversations.
- **`magic-link-routes.test.ts`** : +4.

**ROUGE prouvé : 11 des 14 tombent.** Les trois qui passent des deux côtés :
le témoin de constat ci-dessus (par construction), « sert toujours le jeton »
(il borne — le jeton n'a jamais été en cause), et « sert l'expéditeur entier »
(même raison que le constat). Dits, pas comptés.

## 7. Coût

Deux résolutions de préférences supplémentaires, toutes deux mutualisées par le
cache de `PrivacyPreferencesService` : une par lecture de détail de message
(sur un seul id), une par liste de conversations de communauté (sur les ids
DISTINCTS de la page). Aucune requête de profil ajoutée.

## 8. Ce que ce cycle laisse ouvert

**Inventaire : 26 sites restants** (31 − 5 traités). Aucun ne touche la présence.

| champ | sites | note |
|---|---|---|
| `details` / `errors` (400) | 11 | sans producteur — **retirer**, pas déclarer |
| `analysis` | 4 | `voice-analysis.ts` |
| `session` (autres) | — | traités ici |
| `attachment` | 2 | `voice/translation.ts` |
| `message` | 2 | `conversations/messages-advanced.ts` |
| `creator` / `details` / `link` / `permissions` / `transcription` | 5 | un par un |
| — | — | les cinq sites de présence sont traités (le cycle 86-ter ayant rendu `communities/core.ts` vivant, il l'est aussi) |

Et, propre à ce cycle :

- **Aligner le schéma de `GET /messages/:messageId` sur son enveloppe** — lot en
  soi (§2), à faire avec la liste complète des champs servis, sinon il tronque.
- **Le balayage doit apprendre l'enveloppe.** Un site dont le schéma de réponse
  ne décrit pas `{ success, data }` produit un faux positif ; le prochain
  balayage devrait le détecter plutôt que de le laisser au lecteur.
- Dérive `member` / `membership` (`POST /conversations/:id/invite`).
- **Dette d'environnement, inchangée depuis le cycle 79** : `npx eslint` échoue
  dans ce conteneur. C'est l'environnement, pas le diff.

## 9. La leçon

> **Un balayage de forme trouve des formes, pas des défauts.** `sender:
> { type: 'object' }` a été signalé comme vidé ; il ne l'était pas, parce que le
> schéma qui le porte ne décrit pas la charge utile — toutes ses déclarations
> sont inertes. Le site méritait pourtant d'être ouvert : il portait une **fuite
> de présence active**, plus grave que ce que le balayage annonçait. **Le
> signal était faux et la conclusion juste** ; c'est le genre de coïncidence qui
> vaut d'être écrit, parce que la fois suivante elle peut aller dans l'autre
> sens — un faux positif qu'on classe sans ouvrir, et qui ne cachait rien.

Et le corollaire, sur le choix du régime :

> **Le contrôle d'accès borne qui ENTRE ; la requête borne ce qui SORT — et
> c'est la seconde qui décide du régime.** Sur
> `GET /communities/:id/conversations`, l'accès ne referme que les communautés
> privées (ce qui appellerait le strict), mais le `where` ne rend que les
> conversations dont l'appelant est participant (ce qui donne le contexte
> acquis). Lire le `where` avant de choisir.
