# Cycle 54 — la question de la leçon 212, posée aux écrivains LOCAUX

## 1. D'où vient la piste

Le cycle 53 a fermé le mélange de la ligne de liste web sur le chemin du fan-out
SERVEUR. Sa leçon 212 ne se contente pas de décrire le défaut : elle laisse une
question de suivi, et elle est mécanique.

> La question de suivi tient en une ligne, et elle est mécanique : *quels sont
> TOUS les écrivains de ce que la ligne AFFICHE ?* Pas les écrivains du champ,
> pas les écrivains de l'objet : les écrivains de l'affichage.

Le cycle 53 y a répondu pour le chemin qu'il corrigeait. Ce cycle-ci pose la
question au reste du fichier.

## 2. Le constat

### 2.1 Ce que la ligne affiche

`ConversationItem` compose son texte d'aperçu ainsi :

```tsx
{formatLastMessage(conversation.lastMessage, {
  translations: conversation.lastMessageTranslations,
  originalLanguage: conversation.lastMessageOriginalLanguage,
  preferredLanguages
})}
```

Deux moitiés, **et elles ne vivent pas au même endroit** : le message est un
OBJET (`conversation.lastMessage`), la carte du Prisme est une paire de scalaires
posés au niveau CONVERSATION — le gateway l'y met parce que sa forme compacte
`{ langue: aperçu }` n'est pas celle de `Message.translations`.

Et `resolveLastMessagePreview` **PRÉFÈRE la carte** au contenu brut. C'est donc
elle qui gagne à l'écran chaque fois qu'elle porte une langue du lecteur.

### 2.2 Les cinq écrivains

| # | Écrivain | Événement | Écrit `lastMessage` | Écrit la carte |
|---|---|---|---|---|
| 1 | `handleNewMessage` (liste) | `message:new` | oui | **non** |
| 2 | `handleNewMessage` (branche `fetched`) | `message:new` | oui | **non** |
| 3 | `handleMessageEdited` | `message:edited` | oui | **non** |
| 4 | `advanceConversationPreviewOnDelete` | `message:deleted` | oui | **non** |
| 5 | `handleLinkMessageNew` | `link:message:new` | oui | **non** |
| — | `mergeConversationUpdate` | `conversation:updated` | oui | oui |

**Cinq écrivains de ce que la ligne affiche, un seul écrivain de la carte.**
Chacun des cinq réécrivait l'objet en laissant la carte décrire le message
PRÉCÉDENT : la ligne rendait l'auteur et l'horodatage du nouveau message avec le
TEXTE de l'ancien.

C'est le défaut du cycle 53, à l'identique, sur les chemins d'à côté — et le
corollaire de la leçon 212 le prédit mot pour mot : *le mélange se cache à la
jointure de deux modèles, un objet d'un côté, des scalaires frères de l'autre.*

### 2.3 Pourquoi le cycle 52 avait conclu l'inverse

Il avait écrit :

> Le remplacer s'écrit `{ ...conv, lastMessage: replacement }` — il n'y a rien à
> oublier, l'atomicité vient du modèle.

L'atomicité vient du modèle pour **l'objet**. La carte n'est pas dans l'objet.
Le raisonnement est le même que celui que la leçon 212 a déjà démonté une fois ;
il avait simplement survécu sur les chemins que le cycle 53 ne touchait pas.

### 2.4 Le chemin que rien ne rattrape

Quatre des cinq écrivains ont un jumeau serveur : le gateway émet un
`conversation:updated` juste derrière, avec la carte du bon message, et
`mergeConversationUpdate` la repose. Le mélange n'y dure que le temps d'une
trame — réel, visible, mais transitoire.

**`link:message:new` n'en a pas, et c'est délibéré.** `broadcastLinkMessage.ts`
le documente :

> THREE audiences, not the four `broadcastMessageMutation` fans out to: the
> conversation-list preview needs no separate channel on this path. […] the web
> `link:message:new` handler bumps the conversation's preview and ordering from
> this very event. Emitting `conversation:updated` too would cost a DB read per
> link message for an update the clients already applied.

« The clients already applied it » : vrai de l'objet, faux de la carte. Sur une
conversation de lien partagé, la ligne restait donc **durablement** fausse — rien
ne repassait jamais. Prisme `['fr']`, avant-dernier message anglais traduit
« Bonsoir », message de lien tout neuf : la ligne rendait *l'invité, à l'instant,
disant « Bonsoir »*.

C'est la même forme de raisonnement que « le web est indemne par structure », et
elle est fausse pour la même raison : elle nomme un CLIENT et une DONNÉE, pas un
CHEMIN et un AFFICHAGE.

## 3. Le correctif

`withPreviewMessage({ conversation, message, textChanged? })` — un geste unique,
exporté et pur, par lequel passent les cinq écrivains.

**L'identité décide, jamais le contenu.** Quand le message installé est celui que
la ligne décrit déjà, la carte reste vraie et on la garde ; sinon elle est périmée
en entier, et `lastMessageOriginalLanguage` est réaligné sur le message installé.

`textChanged` est la seule exception, et elle est **déclarée par l'écrivain** :
une édition garde le même id tout en remettant `Message.translations` à `null`
côté serveur — l'identité ne peut pas le révéler, seul le handler d'édition le
sait.

### 3.1 La borne fait le correctif

Sans le no-op « même id », le `conversation:updated` jumeau qui suit chaque
`message:new` dépouillerait la ligne du Prisme que le fan-out vient d'installer —
sur le chemin le plus fréquenté du service. Le gateway garantit d'ailleurs que
les deux événements portent **la même carte, résolue depuis le même message**
(`MeeshySocketIOManager`, commentaire : *« les deux événements portent donc
toujours la même carte, et le `conversation:updated` jumeau ne peut pas arriver
derrière pour effacer ce que `message:new` vient d'installer »*). Le no-op est ce
qui rend le correctif indifférent à l'ORDRE d'arrivée des deux trames.

### 3.2 Pourquoi périmer plutôt que recomposer

On aurait pu dériver la carte de `replacement.translations` — le message porte
son propre tableau de traductions. Écarté : cela demanderait de rejouer côté
client les quatre exclusions de `buildLastMessagePreviewTranslations` (hors
prisme, langue d'origine, traduction chiffrée, texte inexploitable) **et** le
plafond de 300 points de code. Une règle serveur dupliquée dans le client est
exactement ce que le Prisme interdit.

Périmer rend la ligne dans la LANGUE D'ORIGINE le temps que le serveur reparle —
ce qui EST la règle #1 du Prisme (« si aucune traduction ne matche la langue
préférée, afficher le contenu original »), pas un repli dégradé.

## 4. Gates

- **Suite web complète** : voir §6.
- **Preuve par mutation, dans les deux sens** :
  - `stillDescribed = true` (le correctif ne fait plus rien) ⇒ **10 témoins
    rouges**, dont les 4 d'intégration, un par handler.
  - `stillDescribed = false` (le correctif sur-dose) ⇒ **2 témoins rouges**,
    ceux de la borne.
- **`tsc --noEmit`** : aucune erreur sur les 2 fichiers touchés. Le dépôt en
  porte 1234 par ailleurs, préexistantes — comparaison fichier par fichier, pas
  sur le code de sortie (même méthode que le cycle 53).
- **Parité locale** : `prisma generate` + `packages/shared` reconstruit avant la
  campagne (`moduleNameMapper` pointe sur `dist/`).

## 5. Écarté délibérément

**Émettre `conversation:updated` sur le chemin `link:message:new`.** Ce serait
refermer le trou par le serveur, au prix exact que `broadcastLinkMessage`
refuse : une lecture DB par message de lien. Le client peut tenir la cohérence
sans cette lecture — il lui suffit de ne pas afficher une carte qui ne décrit
plus rien. Le commentaire du gateway reste juste sur le fond ; c'est sa
justification qui était trop large d'un cran.

**Une garde monotone web sur le groupe d'aperçu** (piste n°2 du cycle 53) — reste
entière, et distincte de ce correctif.

**Toucher `lastMessageAt` / `updatedAt` dans le geste commun.** Les cinq
appelants n'en font pas le même usage : l'édition n'en pose aucun,
`link:message:new` dérive le sien d'un payload non typé. Les poser dans le
helper les écraserait — un témoin dédié l'interdit.

## 6. Pistes pour le cycle 55 — repérées, NON livrées

1. **`handleMessageDeleted` renonce toujours quand le cache messages est vide**
   (piste n°1 du cycle 53, intacte). Ce cycle n'y touche pas : il corrige ce que
   la ligne affiche QUAND elle est réécrite, pas le cas où elle ne l'est pas.
2. **Les deux ÉVÉNEMENTS avant les deux FUSIONS** côté iOS (piste des cycles
   51/52/53) — intacte.
3. **`PUT /conversations/:id` accepte toujours de renommer un DM** — intacte.
4. **Nouveau : la carte du Prisme n'a qu'UN écrivain, et cinq lecteurs
   potentiels.** Le correctif la périme correctement, mais rien n'empêche un
   sixième écrivain de `lastMessage` d'apparaître demain sans passer par
   `withPreviewMessage`. Une garde structurelle (rendre `lastMessage` inatteignable
   autrement que par le helper) fermerait la classe entière plutôt que ses
   instances.
