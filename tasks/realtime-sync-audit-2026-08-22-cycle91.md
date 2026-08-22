# Cycle 91 — le contrat de réponse contre l'émetteur

**Branche** : `claude/keen-hamilton-z6d07e`
**Point de départ** : l'inventaire §9 du cycle 90 — « 11 sites restants ».

---

## 1. Ce que le cycle a trouvé

Le cycle 90 laissait une liste de champs à déclarer. En la reprenant, le
balayage vivant en comptait **10**, pas 11. En les ouvrant un par un —
règle du cycle 90 : *ne jamais prioriser un inventaire sans avoir ouvert les
sites* — trois faits sont apparus, dans cet ordre de gravité croissante :

1. les sites listés vidaient bien ce qu'on disait ;
2. **deux d'entre eux vidaient BEAUCOUP plus que le champ nommé** ;
3. **une famille entière échappait au balayage**, et elle contenait une panne
   d'authentification.

### La connexion à deux facteurs était morte

`POST /auth/login` sert **deux** charges utiles sous le même `200`, et son
schéma n'en déclarait qu'une :

| | déclaré | envoyé par la branche 2FA |
|---|---|---|
| `data` | `user, token, sessionToken, session, expiresIn` | `requires2FA, twoFactorToken, rememberDevice, user, message` |

`fast-json-stringify` supprimant tout champ non déclaré, la réponse sortait
réduite à `{"success":true,"data":{"user":{…}}}`. Vérifié au compilateur :

```
login 2FA : {"success":true,"data":{"user":{"id":"u1","username":"alice"}}}
```

Côté client, `LoginView.swift:112` branche sur `authManager.requires2FA` et
`completeLoginWith2FA(twoFactorToken:)` attend le jeton : **aucun compte
protégé par un second facteur ne pouvait terminer sa connexion.** Le client ne
recevait ni le drapeau, ni le jeton, ni de jeton d'accès (correctement — la
branche 2FA n'en accorde aucun) : la connexion s'arrêtait là, sans erreur.

Le témoin qui couvrait ce chemin, `login.test.ts`, n'assertait que
`statusCode` et `success` — et son commentaire ÉRIGEAIT la perte en attendu :

```ts
// 2FA case returns 200 (response schema strips requires2FA from serialized output)
```

Quelqu'un avait donc VU le retrait, et l'avait gelé au lieu de le nommer.

### Éditer ou supprimer un message ne rendait rien

Les trois transports de mutation de `conversations/messages-advanced.ts`
déclaraient un `data` portant une clé `message` **que leur handler n'a jamais
posée** : `sendSuccess` rend le message à plat sous `data`.

| route | déclaré | envoyé |
|---|---|---|
| `PUT /…/messages/:messageId` | `message` | le message LUI-MÊME (`{...updatedMessage, translations, validatedMentions, meta}`) |
| `PATCH /…/messages/:messageId` | `message` | idem, sans `meta` |
| `DELETE /…/messages/:messageId` | `message` (une STRING) | `{messageId, deleted, meta}` |

Les trois répondaient `{"success":true,"data":{}}`. Une édition réussie ne
rendait ni le contenu édité, ni `editedAt`, ni les traductions invalidées, ni
les mentions revalidées ; une suppression ne rendait même pas `deleted: true`.

Seule la diffusion Socket.IO (`broadcastMessageMutation`, qui ne passe pas par
ce sérialiseur) portait la vérité — **un client qui réconcilie son optimistic
update sur la réponse REST restait sur l'ancien texte.**

Le `DELETE` est le plus instructif : **le balayage ne pouvait pas le voir.**
Son `message: { type: 'string' }` est parfaitement bien formé. Il décrit
simplement une autre charge utile.

---

## 2. La famille que le balayage ne voyait pas

C'est le vrai résultat du cycle.

> `response-schema-sweep.ts` cherche l'ABSENCE de `properties`. C'est une seule
> des deux façons dont fast-json-stringify vide une réponse. L'autre : un bloc
> `data` **bien formé** dont aucune clé déclarée n'est celle que le handler
> envoie. La réponse sort à `{}` et le schéma est irréprochable.

Trois exemplaires, tous en production, tous invisibles au premier balayage :

| route | déclaré | envoyé | effet |
|---|---|---|---|
| `POST /auth/login` (2FA) | `user, token, sessionToken, session, expiresIn` | `requires2FA, twoFactorToken, rememberDevice, user, message` | 2FA impossible |
| `POST /auth/register` (conflit) | `user, token, expiresIn` | `phoneOwnershipConflict, phoneOwnerInfo, pendingRegistration` | modale de transfert morte |
| `DELETE /…/messages/:id` | `message` (string) | `messageId, deleted, meta` | acquittement vide |

Sur `register`, `use-registration-submit.ts` branche sur
`data.data.phoneOwnershipConflict` : la clé étant retirée, il retombait sur
`return { success: false, error: 'Registration failed' }`. **S'inscrire avec un
numéro déjà détenu donnait une erreur générique**, et tout le parcours de
transfert de numéro était injoignable.

L'outil est donc installé : `routes/__tests__/response-payload-mismatch.ts`,
en cliquet comme son frère (`response-payload-mismatch.test.ts`). Il apparie
chaque bloc `response:` avec les `sendSuccess(reply, { … })` qui le suivent et
compare les jeux de clés. Il distingue `total` (réponse vidée) de `partial`
(clés supprimées nommées), et **ne conclut jamais au vide quand la charge utile
porte un `...spread`** — un spread peut apporter les clés déclarées, et c'est
exactement la forme des deux transports d'édition.

Ce qu'il ne sait pas, et c'est assumé : `sendSuccess(reply, maVariable)` lui
échappe. Remonter jusqu'à la variable demanderait un typeur, pas un balayage.

---

## 3. Un secret que seule une panne retenait

La charge utile du conflit de numéro portait `password: validatedData.password`
— **le mot de passe en clair**. Il ne sortait pas : le schéma le retirait avec
tout le reste.

C'est le piège armé du cycle 84, dans sa forme la plus nette : **déclarer la
branche du conflit, sans plus, aurait OUVERT un aller-retour du secret** — et
aucun témoin ne serait tombé.

Retiré à la SOURCE, pas laissé au sérialiseur. Le client n'en a pas besoin :
ses deux reprises (`handleContinueWithoutPhone`, `handlePhoneTransferred`)
réémettent depuis `...formData`, son propre état. Gardé par un témoin qui
assert `res.payload` ne contient pas le mot de passe.

---

## 4. L'inventaire, site par site

**Balayage des objets nus : 10 → 1.**

| site | traitement |
|---|---|
| `auth/login.ts` (2FA) | branche déclarée — `requires2FA`, `twoFactorToken`, `rememberDevice`, `message` |
| `auth/register.ts` (conflit) | branche déclarée ; `password` retiré de l'émetteur |
| `messages-advanced.ts` PUT / PATCH | `data` = `messageSchema` + `meta`, servi à plat |
| `messages-advanced.ts` DELETE | `messageId`, `deleted`, `meta` |
| `messages-advanced.ts` réactions / statuts | `total`, qui était supprimé |
| `voice/translation.ts` ×3 | `attachment` / `transcription` déclarés depuis leurs ÉMETTEURS ; `translatedAudios` ajouté |
| `conversations/sharing.ts` (création de lien) | `link` était déclaré OBJET là où le handler met une URL (string) ; `code` et `shareLink` supprimés avec |
| `calls.ts` 400 | schéma d'erreur écrit à la main → `errorResponseSchema` |
| `links/admin.ts` `creator` | déclaré depuis ses deux émetteurs — aucun champ de présence, donc aucune porte ouverte |
| `conversations/participants.ts` | `userId` et `role`, que le schéma supprimait |
| `users/profile.ts` `permissions` | **RETIRÉ** plutôt que déclaré (voir §5) |

**Balayage des désaccords : 11 → 1** (voir §6).

### Sur `voice/translation.ts` — la forme juste était dans le même fichier

Les deux routes de traduction portaient `attachment` et `transcription` NUS
quand la route de transcription du **même fichier** les déclarait entièrement,
trois cents lignes plus bas. Les champs retenus viennent des émetteurs réels
(`getAttachmentWithTranscription`, le sur-ensemble ; `translateAttachment`, les
six premiers), pas de la copie voisine — et la copie voisine a été remplacée
par la déclaration partagée, pour qu'il n'y ait plus deux vérités.

---

## 5. Deux sites où « déclarer » n'était pas la réponse

**`users/profile.ts|permissions`** n'avait aucun producteur : le handler posait
`permissions: undefined` DÉLIBÉRÉMENT — un profil public ne porte pas les
autorisations de son sujet. Le champ ne partait donc jamais. Retiré du schéma
ET de la charge utile : aucun changement de contrat, ce qui ne sortait pas ne
sort toujours pas, et l'inventaire cesse de promettre un champ qui n'existe pas.

Note vérifiée au passage : cette route (`GET /users/:id`, un profil de TIERS)
charge bien `isOnline`/`lastActiveAt`, et elle les GATE — `gateProfilePresence`.

**`calls.ts|details|400`** relevait du cycle 89 et se trompait sur l'enveloppe
dans les trois sens : `error` déclaré OBJET quand `sendError` le rend en STRING
à la racine, `message` et `code` non déclarés donc supprimés, et `details`
déclaré comme clé alors que l'enveloppe l'ÉTALE. Sur le seul 400 de cette route,
le client recevait `error: {}` sans message ni code. Remplacé par
`errorResponseSchema`, comme le veut la règle : on n'écrit pas de schéma
d'erreur à la main.

---

## 6. Ce que ce cycle laisse ouvert, et pourquoi

**Un seul désaccord subsiste, et il est DÉLIBÉRÉ.**

`POST /conversations/:id/invite` renvoie `member` quand son schéma déclare
`membership` : le profil du nouvel adhérent — présence comprise — n'atteint pas
le fil. C'est aujourd'hui ce qui tient la porte fermée, et
`conversation-invite-serialization.test.ts` garde cette propriété
**explicitement**, en le disant.

Aligner les deux noms sans poser `resolvePrefsOnly` dans le MÊME lot publierait
la présence de l'invité. C'est la règle du cycle 84, et elle interdit de traiter
ce site comme les dix autres. **Il reste donc ouvert par décision, pas par
oubli** — le lot est : déclarer `member: conversationParticipantSchema` +
gate, ensemble.

**Un seul site nu subsiste** : `messages.ts|sender|200`, dette de FORME connue
depuis le cycle 88 — la déclaration y est INERTE (le schéma décrit le message
quand `sendSuccess` répond `{success, data}`), le champ traverse entier, et
l'aligner exige de décrire tout ce que la route sert. Inchangé.

**Dettes d'environnement, inchangées** : `npx eslint` échoue dans ce conteneur
(depuis le cycle 79) ; `librosa` absent côté Python.

**Le balayage ne lit toujours pas `packages/shared`** (dette du cycle 89) — les
deux outils sont bornés à `services/gateway/src/routes`.

---

## 7. Les témoins

Tous traversent un VRAI Fastify (`app.inject()`) et assertent sur des VALEURS.

- `auth/login.test.ts` — le témoin de constat est REMPLACÉ : `requires2FA` et
  `twoFactorToken` servis, et **aucun jeton d'accès** tant que le second facteur
  n'est pas fourni. ROUGE prouvé contre la version `main`.
- `auth/register.test.ts` — drapeau + propriétaire masqué servis ; et le mot de
  passe absent de `res.payload`. Les deux ROUGES prouvés.
- `conversations/message-mutation-serialization.test.ts` (neuf) — édition et
  suppression ; un témoin garde la RAISON du correctif en montrant que
  l'ancienne forme (`message` enveloppant) vidait tout.
- `response-payload-mismatch.test.ts` (neuf) — cliquet + 8 discriminations.
- `response-schema-sweep.test.ts` — inventaire ramené à une ligne.

### Pourquoi 154 témoins verts couvraient des routes qui ne rendaient rien

`conversation-messages-advanced.test.ts` porte **154 témoins** sur exactement
les routes réparées ici. Aucun n'a jamais vu le `data: {}`, et la raison est en
tête de fichier :

```ts
jest.mock('@meeshy/shared/types/api-schemas', () => ({
  messageSchema: { type: 'object' },
  errorResponseSchema: { type: 'object' },
}));
```

**Mocker les schémas partagés DÉSARME fast-json-stringify** — la couche exacte
où vivait le défaut. C'est la mise en garde du cycle 86-ter (« ne pas mocker les
schémas partagés dans un témoin de sérialisation »), et son coût se mesure ici :
une couverture épaisse, entièrement aveugle à la seule chose qui cassait.

Ces 154 témoins restent utiles pour ce qu'ils gardent (admission, effets,
diffusion) ; ils ne peuvent simplement rien dire de ce qui SORT. C'est pourquoi
le témoin neuf de ce cycle ne mocke aucun schéma et traverse un vrai Fastify.

Une erreur commise en chemin, corrigée : le premier jet du témoin d'édition
fabriquait des traductions `{language, content}`. `transformTranslationsToArray`
produit `{targetLanguage, translatedContent, …}`. **Le témoin passait au vert
sur un double inventé** avant que l'assertion de valeur ne le fasse tomber —
la charge utile d'un témoin se prend à l'émetteur, jamais au nom qu'on
imagine.

---

## 8. Un schéma partagé complété

`conversationStatsSchema` (`packages/shared`) ne déclarait ni `createdAt` ni
`translationStats`, que le type `ConversationStats` porte depuis toujours. Tant
qu'aucune route ne l'employait, l'écart ne coûtait rien — **son PREMIER
consommateur les aurait perdus en silence.** Complété avec le type, pas au-delà.

---

## 9. Coût

Aucune requête ajoutée, aucun appel réseau, aucun chemin de code nouveau. Deux
retraits (le mot de passe échoté, `permissions` mort) ; tout le reste est de la
déclaration.

---

## 10. La leçon

> **Un schéma de réponse bien formé peut être entièrement faux.** La règle
> connue — « un objet sans `properties` EFFACE » — décrit la moitié visible du
> défaut, et c'est elle qui a été outillée. L'autre moitié n'a pas de forme
> reconnaissable : un bloc `data` irréprochable, dont les clés sont celles d'une
> AUTRE charge utile. Il vide tout aussi complètement, et aucun `grep` ne le
> distingue d'un schéma juste.
>
> Le seul discriminant est l'ÉMETTEUR. Pas le type, pas le nom du champ, pas la
> plausibilité : ce que `sendSuccess` reçoit, ligne par ligne.

Et son corollaire, qui est la raison pour laquelle ces trois-là ont vécu si
longtemps :

> **Un témoin qui n'assert que `statusCode` couvre une route morte sans
> jamais rougir** — et quand quelqu'un remarque le retrait et l'écrit en
> commentaire au lieu de le nommer comme un défaut, il ne documente pas une
> particularité : il scelle la panne. Le commentaire
> `// response schema strips requires2FA from serialized output` a tenu la
> connexion à deux facteurs fermée en le disant à voix haute.
