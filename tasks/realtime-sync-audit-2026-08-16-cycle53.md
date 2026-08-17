# Cycle 53 — la règle du cycle 52, portée au client qui ne l'avait jamais eue

## 1. D'où vient la piste

Le cycle 52 la lègue en n°1, et la qualifie lui-même de « la plus grosse ». Son
entrée de CHANGELOG la nomme dans les mêmes termes :

> **Web non traité, défaut réel et documenté** : sa ligne rend l'objet
> `conversation.lastMessage`, que ce payload ne touche pas du tout — son
> correctif demande une décision de RENDU (d'où la ligne tire son texte quand
> l'objet est absent), pas une règle de fusion.

Deux choses ont changé depuis, et les deux comptent :

1. `main` est frais — la PR du cycle 52 a atterri.
2. **La décision de rendu était déjà écrite**, mais pour l'autre client : la
   leçon 211, posée par ce même cycle, énonce exactement la règle qui manquait
   ici. Le travail de ce cycle n'a donc pas été de trancher, il a été de porter.

## 2. Le constat

### 2.1 Ce que le serveur met sur le fil

`emitConversationPreviewUpdate` et `MeeshySocketIOManager._broadcastNewMessage`
émettent le même groupe d'aperçu, résolu POUR CHAQUE destinataire :

| Champ | Ce qu'il décrit |
|---|---|
| `lastMessageId` | l'IDENTITÉ du message que la ligne doit décrire |
| `lastMessagePreview` | son texte, plafonné |
| `lastMessageAt` | son horodatage — et le RANG de la ligne |
| `senderId` | son auteur |
| `lastMessageTranslations` / `…OriginalLanguage` | le Prisme du LECTEUR |
| `previewRecalculated` | « cet aperçu peut légitimement RECULER » |
| `location` | l'épingle du message, quand il en a une |

### 2.2 Ce que le web en faisait

Trois champs sur huit. `normalizeConversationPatch` appliquait `lastMessageAt`
et la paire du Prisme, traitait `lastMessageId` **uniquement** dans sa forme
nulle, et recopiait le reste tel quel sur la conversation — où `Conversation`
ne déclare ni `lastMessagePreview`, ni `senderId`, ni `previewRecalculated`, ni
`location`, et où personne ne les lit.

Or la ligne de liste (`ConversationItem`) ne lit RIEN de tout ça. Elle rend
l'objet :

```tsx
{conversation.lastMessage && (
  <p>
    {getSenderName(conversation.lastMessage) && <span>{…}: </span>}
    {formatLastMessage(conversation.lastMessage, {
      translations: conversation.lastMessageTranslations,   // ← patché
      originalLanguage: conversation.lastMessageOriginalLanguage,
      preferredLanguages,
    })}
  </p>
)}
```

Le texte, l'horodatage, l'auteur et la pastille de pièce jointe viennent de
`conversation.lastMessage` — que rien ne réécrivait. **La carte du Prisme, elle,
venait du payload.** Les deux moitiés de la ligne ne décrivaient donc pas
forcément le même message.

### 2.3 Pourquoi ça n'a pas sauté aux yeux plus tôt

Parce que sur le chemin le plus fréquenté, un AUTRE événement fait le travail.
Le gateway inscrit chaque socket dans **toutes** les rooms de conversation de son
porteur (`AuthHandler._joinUserConversations`), donc `message:new`,
`message:edited` et `message:deleted` arrivent même quand l'écran affiche la
liste. `handleNewMessage` pose l'objet complet ; `handleMessageEdited` le
réécrit ; `handleMessageDeleted` élit un survivant.

Le fan-out d'aperçu était donc redondant… **sauf sur les deux chemins où il est
la seule source**, et ce sont précisément les deux qui nomment un AUTRE message.

## 3. Les deux chemins qui restaient faux

### 3.1 Le masquage PERSONNEL — aucun autre événement n'existe

« Supprimer pour moi », « effacer l'historique » : le message reste vivant pour
les autres, donc **aucun `message:deleted` ne part**.
`refreshPersonalConversationPreview` n'émet que le `conversation:updated`, borné
à son auteur (`onlyForReaderUserId`), et le serveur y a résolu le dernier
message **encore visible pour ce lecteur-là** — que le client ne peut pas
calculer : le remplaçant peut être hors de la page chargée, ou masqué lui aussi.

Le web n'en lisait que la forme nulle (« plus aucun message visible »). La forme
pleine — un remplaçant nommé — était ignorée.

### 3.2 La suppression POUR TOUS, conversation non ouverte

`handleMessageDeleted` balaie le cache messages pour élire le survivant. Si la
conversation n'a jamais été ouverte dans la session, il n'y a pas de cache, et
le handler renonce — délibérément, et son commentaire le dit :

> Only advance the preview when a replacement is present in cache. If no message
> remains cached we cannot tell an empty conversation from one whose older
> messages simply aren't loaded — leaving the (stale) preview is strictly safer
> than blanking a non-empty chat.

Le raisonnement est juste **pour ce handler-là**, qui ne dispose que du cache.
Mais l'ambiguïté qu'il refuse de trancher, le serveur l'a déjà tranchée : le
`conversation:updated` jumeau porte le remplaçant, nommé. Le web laissait donc
sa ligne périmée en tenant pour indécidable une question dont la réponse
arrivait dans l'événement d'à côté.

## 4. Ce que la ligne rendait

Prisme du lecteur `['fr']`, conversation dont le dernier message est une photo
signée Windie, traduite :

| | avant le geste | après, AVANT correctif |
|---|---|---|
| `lastMessage` (objet) | photo de Windie, 10:00 | **inchangé** ✘ |
| `lastMessageTranslations` | `{fr: "Bonjour"}` | `{fr: "Bonsoir"}` ✔ |
| **affiché** | « Windie : Bonjour » | **« Windie : Bonsoir »** |

« Bonsoir » est le texte du REMPLAÇANT ; « Windie », l'horodatage et la pastille
de pièce jointe décrivent le message MASQUÉ. La ligne mélange deux messages, et
c'est le résolveur du Prisme qui rend le mélange visible : il PRÉFÈRE la
traduction à l'aperçu brut, donc c'est le seul champ patché qui gagne à
l'affichage.

Un lecteur qui n'a pas de traduction pour ce message voit l'autre moitié du
défaut : la ligne entière, texte compris, reste celle du message qu'il vient de
masquer. Dans les deux cas, **rien ne corrige ensuite** — une conversation dont
on vient de masquer le dernier message n'a plus aucune raison d'émettre.

## 5. Le correctif

### 5.1 La règle, mot pour mot celle de la leçon 211

> « Silence du payload » a deux lectures — *inchangé* et *inconnu* — et seule
> l'IDENTITÉ de l'objet décrit permet de les séparer. Même objet ⇒ inchangé ⇒
> conserver. Autre objet ⇒ inconnu ⇒ remettre à neutre.

`previewedLastMessage` est cette phrase, en TypeScript :

| Forme du payload | Décision |
|---|---|
| pas de clé `lastMessageId` | ne rien toucher (renommage, réglage) |
| `lastMessageId: null` | vider la ligne — « plus aucun message visible » |
| id **égal** à celui de la ligne | réécrire le TEXTE, garder le reste |
| id **différent** | composer un message NEUTRE depuis le seul payload |

### 5.2 Pourquoi neutre plutôt qu'hérité

Le payload ne porte ni l'expéditeur (l'objet), ni les pièces jointes. Les
hériter du message précédent est exactement le mélange qu'on ferme ; les laisser
vides rend une ligne **INCOMPLÈTE** — sans nom d'auteur, sans pastille — que le
prochain `GET /conversations` complète. `getSenderName` rend `null` sans objet
`sender`, donc l'absence de préfixe est un rendu prévu, pas un trou.

C'est le compromis que `LastMessageFacet` tient côté iOS depuis le cycle qui l'a
créée : incomplet et corrigible plutôt que faux et durable.

### 5.3 La borne qui empêche le correctif d'être une régression

Le cas « même id » est le chemin le plus fréquenté du service : `message:new`
pose l'objet COMPLET dans la room de conversation, et le `conversation:updated`
jumeau arrive juste derrière avec le même id (émis après, sur la même connexion,
donc ordonné). Le traiter comme un changement d'identité effacerait **à chaque
message** la signature et la pastille que l'événement précédent vient
d'installer. Un témoin dédié l'interdit.

### 5.4 L'horodatage est une condition, pas un champ de plus

Sans `lastMessageAt` lisible, on ne compose rien : la ligne rend
`lastMessage.createdAt` et une date fabriquée y afficherait « Invalid Date ».
Les deux émetteurs portent toujours ce champ quand l'id est plein — la garde ne
se déclenche donc jamais en nominal, elle borne le cas dégradé.

### 5.5 La forme du code

`normalizeConversationPatch` reste une fonction PURE du payload : elle ne peut
pas décider du dernier message, cela demande de savoir lequel la ligne décrit
déjà. `mergeConversationUpdate(conversation, raw)` devient le point d'entrée du
cache et compose les deux moitiés — jumeau structurel de
`ConversationStore.merging` côté SDK.

Au passage, les cinq champs du groupe d'aperçu cessent d'être recopiés sur la
conversation : `PREVIEW_GROUP_KEYS` les consomme, la fusion en fait l'objet. Ils
n'y étaient déclarés par personne et lus par personne — un champ fantôme par
ligne, à chaque message.

## 6. Les témoins

**9 neufs** (`merge-conversation-update.test.ts`, fichier neuf) + 1 existant
déplacé du normaliseur vers la fusion, son geste étant inchangé.

| Témoin | Ce qu'il fige |
|---|---|
| `adopte le remplaçant que le serveur nomme` | l'identité, le texte, l'horodatage, l'auteur |
| `ne laisse plus la ligne mélanger deux messages` | **le défaut**, mesuré sur le TEXTE AFFICHÉ |
| `neutralise ce dont l'événement ne parle pas` | l'auteur et la pastille du message parti |
| `renonce plutôt que de fabriquer une date` | le cas dégradé ne rend pas « Invalid Date » |
| `réécrit le texte sans dépouiller la ligne` | l'édition garde auteur + pièces jointes |
| `ne dégrade pas l'objet que message:new vient de poser` | **la contre-épreuve du chemin chaud** |
| `vide la ligne quand le lecteur n'a plus aucun message visible` | la forme nulle, à travers la fusion |
| `ne touche pas à la ligne quand l'événement ne parle pas du dernier message` | un renommage reste un renommage |
| `ne recopie pas le groupe d'aperçu sur la conversation` | les cinq champs fantômes |

Le deuxième mesure la sortie de `resolveLastMessagePreview`, pas le champ brut —
même choix qu'au cycle 52, et pour la même raison : **le défaut ne vit pas dans
une valeur, il vit dans la PRÉFÉRENCE du résolveur entre deux valeurs.** Un
témoin posé sur `lastMessagePreview` serait passé au vert avant le correctif.

## 7. Les autres surfaces — vérifiées

- **Gateway** : rien à corriger, et c'est un constat mesuré. Les deux émetteurs
  portent déjà l'identité, le texte, l'horodatage et le Prisme du bon message
  pour chaque lecteur. Le client n'avait qu'à les lire.
- **iOS** : traité aux cycles 51 et 52 (`adoptLastMessage`,
  `applyLastMessage(LastMessageFacet…)`). C'est de là que vient la règle.
- **Android** : `refreshSilently()` REST — même raison qu'aux cycles 49 à 52.

## 8. Écarté délibérément

**Une garde monotone sur le groupe d'aperçu côté web.** iOS en tient une, et
`previewRecalculated` existe pour la lui faire lever. Le web n'en a jamais eu —
ni avant ni après ce correctif — et l'ajouter serait un changement de
comportement distinct de celui-ci : Socket.IO ordonne les trames d'une même
connexion, et rien dans ce cycle n'introduit de recul qui ne soit pas
autoritatif. Piste n°2 du §9, à instruire pour elle-même.

**Porter les six champs manquants sur le fil** (pastille, drapeaux éphémères,
nom d'auteur). Le cycle 52 l'a chiffré : joindre `attachments` dans
`PREVIEW_MESSAGE_SELECT` coûterait la jointure sur le chemin du fan-out des
traductions, le plus chaud du service. Le constat vaut toujours, et la ligne
neutre est le compromis qu'il justifie.

**Composer `location` dans le message neutre.** La ligne web ne rend aucune
épingle — ce serait fabriquer une donnée que personne ne lit.

## 9. Pistes pour le cycle 54 — repérées, NON livrées

1. **`handleMessageDeleted` renonce encore quand le cache messages est vide**,
   et son commentaire décrit une ambiguïté que le `conversation:updated` jumeau
   tranche désormais. Ce cycle la ferme par l'AUTRE porte (l'événement serveur
   arrive et corrige), mais les deux handlers restent aveugles l'un à l'autre :
   si le fan-out d'aperçu échouait, le renoncement redeviendrait le dernier mot.
   Une reprise ferait élire le survivant depuis le cache **et** accepter celui
   que le serveur nomme, avec une règle de préséance explicite.
2. **Le web n'a aucune garde monotone sur le groupe d'aperçu** (cf. §8). iOS en
   a une, et le contrat porte `previewRecalculated` pour la lever. Instruire si
   le web en a besoin — et si non, l'écrire noir sur blanc dans le contrat, qui
   parle aujourd'hui « des clients » au pluriel pour une règle qu'un seul tient.
3. **Les deux ÉVÉNEMENTS avant les deux FUSIONS** — piste intacte des cycles 51
   et 52 : `ConversationUpdatedEvent` (app iOS) et `ConversationUpdatedStoreEvent`
   (SDK) portent des champs différents, reliés par un mapping manuel de quinze
   lignes. C'est ce mapping qui a laissé tomber `location` au cycle 50.
4. **`PUT /conversations/:id` accepte toujours de renommer un DM** (cycle 51,
   piste n°3) — donnée morte en base, écrite par une route qui n'aurait pas dû
   l'accepter.

## 10. Gates

- **Web** : suite COMPLÈTE — **580 suites, 12 430 témoins verts**, 21 ignorés,
  0 échec. Dont les 9 neufs, les 9 existants du normaliseur, et les deux suites
  qui couvrent le rendu de la ligne (`message-formatting`,
  `ConversationItem.prisme`).
- **`tsc --noEmit`** : aucune erreur sur les trois fichiers touchés. (Le dépôt
  en porte par ailleurs une trentaine, préexistantes et sans rapport — la
  comparaison a été faite fichier par fichier, pas sur le code de sortie.)
- **Parité locale** : `packages/shared` reconstruit avant la campagne — le
  `moduleNameMapper` de `apps/web/jest.config.js` pointe sur `dist/`, et un
  `dist` périmé faisait échouer `use-socket-cache-sync.test.ts` à la RÉSOLUTION,
  sur `main` comme sur la branche. Vérifié des deux côtés avant d'être écarté.
- CHANGELOG racine + ce journal + leçon 212. (`apps/web/CHANGELOG.md` n'est pas
  touché à la main : il est généré par changesets à la publication.)
