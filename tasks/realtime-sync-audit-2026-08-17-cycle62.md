# Audit sync temps réel — cycle 62 (2026-08-17)

Branche : `claude/keen-hamilton-clgz4v` — repartie de `origin/main` (782dc322,
cycle 61 bis intégralement mergé).

## 1. Le défaut

**`conversation:unread-updated` a QUATRE émetteurs et ils ne parlent pas la même
langue. L'instantané de reconnexion émettait une forme que les deux clients
lisent comme un ORDRE D'EFFACEMENT.**

Le champ `bridge` (le pont ✦, G-123) est OPTIONNEL sur le contrat wire
(`ConversationUnreadUpdatedEventData`). Mais les deux clients ne le traitent pas
comme optionnel à la lecture — ils le recopient INCONDITIONNELLEMENT, `undefined`
/ `nil` compris, et c'est écrit en toutes lettres dans les deux :

| Client | Site | Écriture |
|--------|------|----------|
| iOS | `ConversationSyncEngine.handleUnreadUpdated` | `updated[idx].bridge = event.bridge` |
| Web | `use-socket-cache-sync.handleUnreadUpdated` (REV-5/B1) | `setConversationUnreadInCache(…, { bridge: data.bridge })` |

Le commentaire web le dit sans ambiguïté : « un pont ABSENT du payload wire DOIT
effacer un pont déjà en cache ». C'est délibéré et c'est correct — pour
l'émetteur qui sait ce qu'il annonce.

Or `MeeshySocketIOManager._emitUnreadCountsSnapshot` — le SEUL signal qui remet
les pastilles d'aplomb à la reconnexion — n'a jamais rien su du pont :

```ts
socket.emit(SERVER_EVENTS.CONVERSATION_UNREAD_UPDATED, { conversationId, unreadCount });
```

Cette forme courte n'exprimait pas « je ne sais pas » : côté client, elle disait
**« il n'y a pas de pont »**. Donc, à CHAQUE reconnexion — bascule
Wi-Fi/cellulaire, retour d'arrière-plan, déploiement du serveur, coupure de
tunnel — le pont disparaissait de **TOUTES** les lignes du lecteur, d'un seul
coup, y compris celles où il avait des non-lus et où le pont est exactement ce
qu'il cherche : « où j'en étais ».

Rien ne le remettait ensuite : la liste web tourne en `staleTime: Infinity`
(aucun refetch ne repasse derrière), et le seul émetteur qui attache le pont est
le fan-out d'ENVOI — il faut donc qu'un nouveau message arrive dans cette
conversation précise pour que le pont revienne.

## 2. Pourquoi aucun témoin n'a changé de couleur

**Le défaut est NÉ de REV-5/B1, au cycle précédent.** Tant que le web ignorait
`bridge`, la forme courte ne coûtait rien — elle était une omission inoffensive.
Le jour où le champ est devenu autoritatif côté client, l'émetteur muet est
devenu destructeur, **sans qu'aucune ligne de son propre code ne change**.

Les deux émetteurs sont testés séparément, et aucun des deux jeux de témoins ne
connaissait la règle de l'autre :

- `emitUnreadCountsToRecipients.test.ts` prouve que le fan-out attache le pont ;
- le bloc `_emitUnreadCountsSnapshot` de `MeeshySocketIOManager.test.ts` prouvait
  que la reconnexion émet `{conversationId, unreadCount}` — et le prouvait
  EXACTEMENT, `toHaveBeenCalledWith` sur l'objet entier.

Le second témoin gelait donc la forme courte comme un acquis, au moment même où
elle devenait un ordre d'effacement. C'est la classe de défaut la plus coûteuse
du carnet : **un contrat à deux émetteurs dont un seul est au courant du
changement**, et des témoins qui garantissent la divergence au lieu de la
signaler.

Le carnet du cycle 61 bis avait vu la moitié du symptôme (piste n°4, « décision
de contrat, pas correctif »). C'était une sous-estimation : la sémantique
d'effacement côté client transforme l'asymétrie en PERTE DE DONNÉE, pas en
inconfort.

## 3. Le correctif

`_emitUnreadCountsSnapshot` construit désormais les ponts et les attache — même
champ, même contrat, même client.

La passe utilisée est celle par **CONVERSATIONS** (`buildBridgeData`) et non
celle par lecteurs (`buildBridgeDataForViewers`) : ici il y a UN lecteur et N
conversations, l'image exactement miroir du fan-out d'envoi. Elle coûte un
nombre **CONSTANT** de requêtes — la même passe que `GET /conversations` paie
déjà — et n'est jamais appelée par conversation. C'est la leçon de REV-5/B2,
appliquée avant d'avoir à la réapprendre : le fan-out avait d'abord reconstitué
un N+1 en appelant la passe une fois par destinataire.

Trois gardes de coût, écrites comme telles :

- un compteur à **zéro** n'entre pas dans la passe (contrat gelé §3.2 — un
  compteur nul n'a pas de pont, et la conversation ne coûte donc rien) ;
- **aucun non-lu ⇒ aucun appel du tout** — c'est le cas le plus fréquent d'une
  reconnexion, et il reste gratuit ;
- **aucun `agent`** (G-127) : l'étage agent reste réservé à
  `GET /conversations`. Une reconnexion touche toutes les conversations du
  lecteur d'un coup ; lui ouvrir un aller-retour HTTP par pont ferait payer le
  réveil du réseau au moment précis où il est le plus fragile.

Posture d'échec inchangée et alignée sur ses deux voisins (le fan-out et la
liste REST) : le pont est un confort, la pastille est le produit. Une passe qui
tombe ne prive personne de son compteur.

### 3 bis. La borne — ce que le correctif aurait coûté sans elle

Le fan-out d'envoi porte **UNE** conversation ; cet instantané porte **TOUTES**
celles du lecteur. La différence n'est pas cosmétique : la fenêtre du service
construit **une branche `OR` par conversation candidate**. Attacher le pont sans
borne aurait donc soumis 300 branches pour un compte qui suit 300 conversations,
à **chaque reconnexion** — quand `GET /conversations` ne lui en soumet jamais
plus d'une page. Et une reconnexion de masse (redémarrage du serveur) les fait
toutes partir en même temps.

C'était échanger un défaut d'affichage contre un défaut de charge, à l'instant
précis où le réseau est le plus fragile. La borne fait partie du correctif, pas
d'un durcissement ultérieur :

- candidats triés par `lastMessageAt` **décroissant** — l'ordre de la liste
  elle-même, obtenu sans requête supplémentaire (le champ est sélectionné sur la
  lecture de participants qui existait déjà) ;
- plafonnés à **30**, la taille de page par défaut de `GET /conversations` : le
  pont ne se voit que sur une ligne AFFICHÉE, et c'est cette page-là que le
  lecteur a sous les yeux au retour du réseau ;
- les conversations plus anciennes gardent leur **compteur exact** ; seul leur
  pont attend le `GET /conversations` qui rendra leur ligne — c'est-à-dire
  l'instant où il devient visible.

Le **compteur n'est jamais borné**, et un témoin le gèle : une pastille menteuse
sur la 200e conversation ment autant que sur la première.

Aucun changement client. Les deux plateformes lisent déjà `bridge` sur cet
événement — c'est l'émetteur qui ne le remplissait pas.

## 4. Témoins (10 nouveaux, contre le VRAI manager)

Dans `socketio/__tests__/MeeshySocketIOManager.test.ts`, harnais du vrai
`MeeshySocketIOManager` — celui que le cycle 61 bis a désigné comme le seul
endroit où poser une garde de comportement.

| Témoin | Ce qu'il gèle |
|--------|---------------|
| `attaches the bridge built FOR THIS reader…` | le pont voyage, et il est construit pour CE lecteur |
| `emits the short form for a conversation the pass returns nothing for` | l'effacement reste LÉGITIME quand la passe n'annonce rien |
| `never submits a zero count to the bridge pass` | contrat gelé §3.2, premier étage |
| `does not call the bridge pass at all when nothing is unread` | la reconnexion « tout est lu » reste gratuite |
| `asks for every bridge in ONE batched pass` | garde de coût — jumelle de `emitUnreadCountsToRecipients.cost.test.ts` |
| `builds bridges for an anonymous reader under its participant-id viewer key` | l'invité de lien partagé, population dominante de ce transport |
| `still emits every count when the bridge pass fails` | le pont est un confort, la pastille est le produit |
| `never opens the agent stage on this socket path` | G-127 — pas d'aller-retour HTTP sur le chemin socket |
| `caps the bridge pass at one list page, keeping the MOST RECENT…` | la borne, et son critère (récence, pas hasard) |
| `never caps the COUNTS — only the bridges` | le compteur reste intégral, toujours |

RED d'abord : 5 échecs sur 8 avant correctif (les 3 autres décrivent la forme
courte, qui reste correcte là où elle est correcte). Les 2 témoins de la borne
ont été écrits après son implémentation puis **vérifiés rouges en la retirant**
(`42` candidats au lieu de `30`) — garde prouvée, mais ordre TDD non respecté sur
ce second incrément, et consigné comme tel.

## 5. Balayage des jumeaux — les trois autres émetteurs

Le défaut appelle une question qu'aucun cycle n'avait posée : **qui d'autre émet
cet événement, et sait-il ce que son silence dit ?** Les quatre sites :

| Émetteur | Pont ? | Verdict |
|----------|--------|---------|
| `emitUnreadCountsToRecipients` (fan-out d'envoi) | ✅ oui | l'émetteur de référence |
| `MeeshySocketIOManager._emitUnreadCountsSnapshot` (reconnexion) | ❌ → ✅ | **le défaut, corrigé ici** |
| `ConversationHandler` (sur `conversation:join`) | ❌ non | **acceptable, documenté** |
| `broadcastReadStatus` (resynchro du LECTEUR) | ❌ non | **arbitrage de coût, consigné** |

**`conversation:join`** — l'effacement y est légitime : on rejoint une
conversation pour la LIRE, et l'ouvrir consomme le pont. Le client clampe de
toute façon le compteur à 0 pour la conversation active, et le rang ne rend
jamais un pont sans non-lus (`LentilleRow.hasBridge`). Le web ne rejoint qu'UNE
conversation à la reconnexion (`_autoJoinLastConversation`), jamais la liste
entière : le sinistre de masse n'existe pas sur ce chemin.

**`broadcastReadStatus`** — le lecteur vient de lire ; ses AUTRES appareils
reçoivent le compteur recalculé. Après une lecture PARTIELLE (le curseur
n'avance que sur le préfixe contigu), le compteur reste > 0 et le pont, lui,
devrait être recalculé sur le nouveau curseur — il est effacé à la place.
Défaut réel mais mineur, et le corriger coûterait les 5 requêtes de la passe **à
chaque accusé de lecture**, sur l'un des chemins les plus chauds du service. Le
prix est disproportionné au regard du symptôme (un pont absent sur un appareil
secondaire, jusqu'au message suivant). Consigné en piste n°1, non livré — c'est
un arbitrage, pas un oubli.

## 5 bis. Trouvaille collatérale — `main` était ROUGE

La suite complète du gateway a rendu **une suite rouge qui n'a rien à voir avec
ce lot** : `personal-history-hiding-surface-guard`. Vérifié en comparant octet à
octet avec `origin/main` — le garde ET le fichier qu'il accuse
(`ConversationBridgeService.ts`) y sont **identiques**. La rougeur préexiste donc
à ce cycle.

Le garde faisait exactement son travail. `ConversationBridgeService` a gagné une
**seconde** `prisma.message.findMany` avec la passe par lecteurs (REV-5/B2,
cycle 61) et le dénombrement est resté à `reads: 1` : une nouvelle lecture de
messages était apparue sans que personne déclare ce qu'elle fait du **masquage
personnel** — c'est-à-dire des messages qu'un lecteur a effacés pour lui.

Vérification faite, la réponse est correcte, et invisible au balayage : la passe
par lecteurs porte une fenêtre **COMMUNE** à tous les destinataires alors que le
masquage est **personnel**. Elle ne peut donc pas l'écrire dans sa clause, et
l'applique en mémoire, lecteur par lecteur — `exclusiveFloorMsFor` pour le
plancher, `hiddenMessageIds` pour les messages effacés un par un.

Corrigé en déclarant la vérité : `reads: 2, applications: 1`, et le fichier entre
dans `IN_MEMORY_HIDING_SURFACES` avec les **trois marqueurs** qui prouvent
l'application en mémoire. Retirer l'un d'eux ferait fuiter dans le pont ✦ d'un
lecteur des messages qu'il a effacés — et le garde le dira. Aucun changement de
production.

C'est la deuxième fois dans le même lot que **le cycle 61 a livré un émetteur ou
un lecteur sans instruire le dispositif qui le surveille**. Même classe que §2 :
une extension correcte, et un contrat périphérique laissé en arrière.
