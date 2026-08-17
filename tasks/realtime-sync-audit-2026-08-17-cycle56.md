# Cycle 56 — la police d'un conteneur, posée à un conteneur qui n'a pas de hiérarchie

## 0. La voie, et pourquoi ce n'est toujours pas IOS_DETTE

`tasks/lane-cursor.md` est à `lane=ANDROID android_streak=2
last_run=feed-pin-own-post`. Comme aux cycles 54-bis et 55, l'environnement
d'exécution est un conteneur Linux sans Xcode ni toolchain Swift
(`which xcodebuild swift` → rien) : les deux gates obligatoires du couloir iOS
sont inexécutables, et livrer du Swift non compilé serait un diff non prouvé.

Voie retenue : le couloir temps réel côté gateway, entièrement gatable ici
(jest + tsc sous bun). Le curseur reste intact pour le prochain run disposant
d'un Xcode.

## 1. D'où vient la piste

Piste n°4 du cycle 55, listée en une ligne :

> **`PUT /conversations/:id` accepte toujours de renommer un DM** — intacte.

Instruite ici. Le renommage s'avère être le symptôme INOFFENSIF d'un défaut
d'autorisation qui, lui, ne l'est pas — et c'est le renommage qui avait retenu
l'attention, parce qu'il est le seul des huit champs du corps dont on voie
l'effet à l'écran.

## 2. Le constat

### 2.1 La route ne filtre que sur le RÔLE

`PUT /conversations/:id` (`routes/conversations/core.ts`) accepte huit champs et
pose deux gardes, toutes deux sur l'identité de l'appelant :

| Garde | Ce qu'elle demande |
|---|---|
| appartenance | une ligne `Participant` active de rôle `creator`\|`admin`\|`moderator` |
| conversation globale | `id !== 'meeshy'` |
| modérateur | un `moderator` ne touche pas les 4 champs de permissions |

**Aucune ne regarde le TYPE de la conversation.** La route ne charge même pas la
ligne `Conversation` avant de l'écrire.

### 2.2 Dans un tête-à-tête, les rôles ne nomment pas une autorité

`POST /conversations` avec `type: 'direct'` crée deux lignes `Participant` de
rôles DIFFÉRENTS : `creator` pour qui a ouvert le fil, `member` pour l'autre
(même bloc `create` que pour un groupe). C'est un ORDRE D'ARRIVÉE, pas une
hiérarchie — un tête-à-tête n'a pas d'administrateur.

La garde d'appartenance, elle, lit cette asymétrie comme une autorité :
l'initiateur passe, l'autre reçoit 403.

### 2.3 Ce que l'initiateur peut donc écrire, et ce que ça produit

`{ isAnnouncementChannel: true }` — ou un plancher `{ defaultWriteRole: 'admin' }`
— sur le tête-à-tête. Et depuis le cycle 31, **cette police est CÂBLÉE** :
`conversationWriteAdmission` est appelé dans `MessagingService.handleMessage`, le
point où REST, socket texte et socket pièces jointes convergent avant l'écriture.

```
requiredWriteRank : isAnnouncementChannel ⇒ 'admin' (rang 3)
rang du pair      : 'member'                        (rang 1)
1 < 3  ⇒  REFUSED('write-role-insufficient')
```

**Une partie d'un tête-à-tête peut faire taire l'autre, sur les trois transports
d'envoi à la fois.** Et la victime n'a aucun retour en arrière : ce même
`PUT /conversations/:id` lui répond 403, précisément parce qu'elle est `member`.
L'échappatoire du staff plateforme ne couvre que `ADMIN`/`BIGBOSS`/`MODERATOR`,
donc pas un compte ordinaire.

### 2.4 Le symptôme qui avait été vu, et pourquoi il est le moins grave

Le renommage. Web l'ignore pour un tête-à-tête : `getConversationNameOnly` et
`getConversationAvatarUrl` (`conversation-item/conversation-utils.tsx`) résolvent
le nom et l'avatar du PAIR dès que `type === 'direct'`, sans jamais regarder
`conversation.title`. Le gateway le sait aussi — il rend `title || null` pour un
`direct` là où il fabrique un titre par défaut pour un groupe.

`title`, `description`, `avatar`, `banner` sont donc des écritures MORTES sur un
tête-à-tête : du bruit, pas une usurpation. La piste nommait la moitié visible et
inoffensive d'un corps de requête dont la moitié invisible était l'attaque.

### 2.5 Pourquoi cela avait survécu au câblage du cycle 31

Le cycle 31 a répondu à « le canal d'annonces est-il APPLIQUÉ ? ». Il l'a
correctement appliqué. La question qu'il n'a pas posée est celle d'à côté :
**sur quels conteneurs ce réglage peut-il être POSÉ ?** Le module énumérait déjà
les types sans hiérarchie d'écriture — `if (conversation.type === 'global')
return 0` — donc il connaissait la catégorie « conteneur sans hiérarchie ». Il
n'en connaissait qu'un membre, et le plus exotique des deux.

En appliquant une règle jusque-là inerte, le cycle 31 a transformé un champ
cosmétique en arme, sans que rien ne change au site qui l'écrit.

### 2.6 Qui écrit ces champs — la question de la leçon 215, posée à l'écriture

| Écrivain | Peut-il viser un `direct` ? |
|---|---|
| `POST /conversations` (`isBroadcast`) | non — écrit sous `type: 'broadcast'` |
| `PUT /conversations/:id` | **oui** (le défaut) |
| `routes/links/messages.ts` (×2) | non — `select`, lectures seules |
| `core.ts:571` | non — `select` de la liste |

La surface est donc de deux écrivains, dont un seul était en cause.

## 3. Le correctif — deux gestes, deux questions distinctes

### 3.1 La règle — `WRITE_HIERARCHY_FREE_TYPES`

`requiredWriteRank` rend `0` pour `global` **et** `direct`. La ligne unique
devient un ensemble nommé, avec le raisonnement en tête : les rôles d'un
tête-à-tête nomment un ordre d'arrivée, pas une autorité.

C'est le geste qui **guérit les conteneurs DÉJÀ empoisonnés** — ceux dont aucune
route ne rendra jamais compte, puisque le drapeau est en base.

La dispense porte sur le RANG, jamais sur l'existence : l'état terminal est
tranché avant qu'on arrive là, donc un tête-à-tête CLOS reste refusé. Un témoin
le fige, jumeau de celui de la conversation globale.

### 3.2 L'autorité — la route refuse les trois champs de police

`defaultWriteRole`, `isAnnouncementChannel`, `slowModeSeconds` sur un `direct` ⇒
403. Trois champs, pas huit : `autoTranslateEnabled`, `title`, `description`,
`avatar` et `banner` ne décrivent aucune hiérarchie et restent modifiables.

Le type arrive par la relation du `findFirst` d'appartenance **déjà émis** —
`select: { role: true, conversation: { select: { type: true } } }`. Aucune
requête de plus, et le `select` réduit au passage le sur-transfert d'une requête
qui ramenait la ligne `Participant` entière pour ne lire que `role`.

### 3.3 Pourquoi les deux, et pourquoi aucun ne subsume l'autre

- La route seule laisserait empoisonnés les tête-à-tête déjà marqués.
- La règle seule laisserait la route ACCEPTER l'écriture, la persister, et
  diffuser `conversation:updated` avec un drapeau que plus rien n'applique — un
  événement qui MENT aux clients sur l'état du conteneur.

### 3.4 Le type inconnu reste permissif côté route

Idiome documenté du module d'admission (« un réglage absent ou inconnu est
PERMISSIF »). Ce n'est pas un trou : la garde qui protège réellement le pair est
la règle §3.1, qui lit le type sur la ligne AUTORITAIRE de conversation, pas sur
une relation de participant. La route, elle, ne fait qu'empêcher une écriture
sans effet et un événement mensonger — permissive sur l'inconnu, elle
n'affaiblit personne.

## 4. Gates

- Suite gateway COMPLÈTE sous bun (parité CI) : **740 suites, 17 937 témoins
  verts, 0 échec**
- 9 témoins neufs — 4 sur la règle (2 de dispense, 2 de borne), 5 sur la route
  (3 champs refusés en `it.each`, 2 de borne)
- `conversationWriteAdmission.ts` : **100 % lignes / branches / fonctions**
- `tsc --noEmit -p services/gateway` : **0 erreur** sur tout le service
- `prisma generate --generator client` + `packages/shared` reconstruits avant
  la campagne (prérequis de parité CI documentés au CLAUDE.md racine)

### Preuve par mutation, dans les deux sens

| Mutation | Effet attendu | Constaté |
|---|---|---|
| retirer `'direct'` de l'ensemble | les 2 dispenses tombent | 2 échecs |
| ajouter `'group'` à l'ensemble | la borne du groupe tombe | 10 échecs |
| neutraliser la garde de route | les 3 champs passent | 3 échecs |
| garde de route sur TOUS les champs | la borne cosmétique tombe | 1 échec |

Les deux sur-dosages sont ce qui prouve que les témoins tiennent une BORNE et pas
seulement une direction.

## 5. Écartés délibérément

**Interdire aussi `title`/`avatar` sur un tête-à-tête.** Écritures mortes (§2.4),
donc de l'hygiène, pas une correction — et une hygiène qui a un coût : un
`customName` par utilisateur existe déjà côté préférences, et trancher ce que
`Conversation.title` signifie pour un `direct` dépasse un correctif
d'autorisation.

**`slowModeSeconds` n'est toujours appliqué par personne.** Le module le
documente déjà (« un limiteur de débit, pas une admission »). Il est refusé ici
par cohérence de FAMILLE — c'est un réglage de police de conteneur — mais son
inapplication reste intacte, et ce cycle ne la corrige pas.

**`PUT` ne résout pas les identifiants alors que son schéma les annonce.**
`DELETE /conversations/:id` passe par `resolveConversationId`, `PUT` non : un
appel par identifiant échoue en 403 sur la garde d'appartenance. Constat réel,
sans conséquence de sécurité, et qui touche le contrat de la route plus que son
autorisation.

## 6. Pistes pour le cycle 57 — repérées, NON livrées

1. **Le code mort des trois hooks de préférences React Query** (piste n°1 du
   cycle 55) — intacte.
2. **`handleMessageDeleted` renonce quand le cache messages est vide** — intacte,
   à re-prouver avant d'y consacrer un cycle.
3. **Les deux ÉVÉNEMENTS avant les deux FUSIONS côté iOS** — intacte, bloquée sur
   l'absence de Xcode.
4. **Le témoin de source ne couvre qu'un fichier** (cycle 54-bis n°4) — intacte.
5. **`slowModeSeconds`, réglage de conteneur que personne n'applique** (§5) — la
   dernière des trois colonnes « WRITE PERMISSIONS » à n'avoir aucun exécuteur.
6. **`PUT /conversations/:id` n'accepte pas les identifiants que son schéma
   annonce** (§5).
7. **La question que ce cycle généralise** : pour chaque réglage de CONTENEUR
   appliqué par une garde, quels TYPES de conteneur peuvent légitimement le
   porter ? Le tableau §2.6 l'a posée à l'écriture de trois champs ; les
   préférences de communauté et les droits de lien de partage ne l'ont jamais
   reçue.
