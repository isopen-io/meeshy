# Audit sync temps réel — cycle 63 (2026-08-17)

Branche : `claude/keen-hamilton-mz6seg` — repartie de `origin/main` (91e8314c,
cycle 62 intégralement mergé).

Sujet : **piste n°1 du cycle 62**, tranchée — mais pas dans le sens qu'elle
anticipait, et beaucoup plus loin qu'elle ne le prévoyait.

## 1. Le défaut : un contrat à DEUX formes pour TROIS faits

Le cycle 62 a corrigé un émetteur. Il a aussi, en le corrigeant, écrit la phrase
qui contenait le vrai défaut :

> Le contrat n'a AUCUNE valeur pour dire « je n'ai pas calculé ». Deux états sur
> le fil (présent / absent) servent à en exprimer trois.

C'était exact, et ce n'était pas une remarque de conception : c'était le
diagnostic. `conversation:unread-updated` porte un `bridge?` que les deux
clients recopient **autoritairement** — `updated[idx].bridge = event.bridge`
côté iOS, `setConversationUnreadInCache(…, { bridge: data.bridge })` côté web.
Un émetteur qui omet le champ n'est donc pas muet : **il ordonne un
effacement**. Et comme « je n'ai pas calculé » n'avait pas de mot à lui, il
empruntait celui de « il n'y en a pas ».

Le cycle 62 a fermé UN site en le forçant à toujours calculer. Il en restait
quatre où calculer est impossible, trop cher, ou simplement pas fait — et les
quatre continuaient de détruire :

| Site | Situation | Ce qu'il disait | Ce qu'il voulait dire |
|------|-----------|-----------------|------------------------|
| `_emitUnreadCountsSnapshot` | conversation **au-delà de la borne** | efface | *je ne l'ai pas calculée* |
| `_emitUnreadCountsSnapshot` | passe de ponts **tombée** | efface | *je n'ai pas pu* |
| `emitUnreadCountsToRecipients` | passe **tombée** | efface | *je n'ai pas pu* |
| `emitUnreadCountsToRecipients` | appelant **sans `bridgeService`** | efface | *je ne sais rien du pont* |
| `broadcastReadStatus` | après un accusé de lecture | efface | *(voir §3)* |

## 2. La trouvaille : le correctif du cycle 62 avait déplacé son propre défaut

La borne posée au cycle 62 — 30 conversations, la taille d'une page de liste —
est justifiée et le reste. Mais son commentaire annonçait un DIFFÉRÉ :

> les conversations plus anciennes gardent leur compteur exact — seul leur pont
> attend le prochain `GET /conversations`

Ce n'est pas ce qui se passait. Une conversation hors borne émettait la forme
courte, c'est-à-dire l'ordre d'effacement. La borne **n'a pas différé le
travail : elle l'a annulé.** Le cycle 62 a donc troqué un effacement GLOBAL du
pont à chaque reconnexion contre un effacement de la QUEUE à chaque
reconnexion — un progrès réel, et un défaut résiduel décrit dans son propre
carnet comme une simple attente.

Aucun témoin ne pouvait le voir. La charge émise pour « hors borne » et pour
« dans la borne, sans pont » était **rigoureusement identique**. C'est la
définition même du manque de vocabulaire : deux faits distincts, une seule
phrase.

## 3. Ce que la piste n°1 demandait vraiment

Le cycle 62 posait `broadcastReadStatus` comme un arbitrage de **prix** : le
pont devrait y être recalculé sur le nouveau curseur, il est effacé à la place,
et le corriger coûterait la passe à chaque accusé de lecture. La formulation
supposait que **garder** valait mieux qu'**effacer**, et que seul le coût s'y
opposait.

Le contrat gelé dit le contraire, et il le dit dans le type : le pont **porte
son propre `unreadCount`**, et le rang n'affiche plus aucun autre chiffre (L06
a supprimé le badge chiffré — « le chiffre vit ICI »). Une lecture partielle qui
fait tomber l'arriéré de 12 à 5 **invalide** donc le pont qu'elle annonce :
le garder ferait lire « Alice · 12 messages » à un lecteur qui n'en a plus que 5.

Le serveur n'a besoin d'aucune requête pour savoir que l'ancien pont est void —
c'est l'acte qu'il diffuse qui l'a rendu tel. `null` explicite n'est donc pas
ici un pis-aller de coût : **c'est la seule affirmation vraie**. La piste se
ferme à zéro requête, parce que la bonne question n'était pas « combien coûte le
recalcul » mais « que sait-on, au juste ».

C'est la leçon transversale du cycle : **une piste formulée comme un arbitrage
de coût cachait un manque de vocabulaire.** Tant que le contrat ne savait pas
dire trois choses, chaque site était forcé de choisir entre deux mensonges, et
le débat se déplaçait naturellement sur le prix de celui qu'on préférait.

## 4. Le correctif : le troisième état

`ConversationUnreadUpdatedEventData.bridge` devient
`ConversationBridge | null | undefined`, et les deux formes de fil expriment
enfin trois faits :

| Fil | Sens | Le client doit |
|-----|------|----------------|
| objet | « voici le pont » | remplacer |
| `null` | « j'ai calculé : il n'y en a pas » | EFFACER |
| absent | « je n'ai pas calculé » | GARDER ce qu'il a |

**La polarité est inversée, et c'est tout l'intérêt.** L'effacement était le
comportement par DÉFAUT du silence ; il devient un ACTE EXPLICITE. Un émetteur
futur qui ignore tout du pont ne peut plus, par sa seule omission, détruire
celui d'un lecteur — la classe de défaut du cycle 62 devient **structurellement
impossible**, au lieu d'être corrigée site par site.

Compatibilité : `null` reproduit exactement ce que faisaient les clients
déployés face à l'omission (ils effaçaient). Un client ancien reste donc correct
partout où l'effacement est voulu ; il ne perd que le bénéfice du troisième
état. Aucune migration, aucun drapeau.

### Les émetteurs, tous instruits dans le MÊME lot (règle du cycle 62 §8)

`services/gateway/src/socketio/unreadBridgeField.ts` porte le vocabulaire —
`bridgeComputed()` / `bridgeNotComputed()` — et sa doc énumère les sites. Chacun
DÉCLARE :

| Émetteur | Situation | Déclare |
|----------|-----------|---------|
| fan-out d'envoi | compteur à zéro (§3.2) | `bridgeComputed(undefined)` → `null` |
| fan-out d'envoi | passe tournée | `bridgeComputed(...)` |
| fan-out d'envoi | passe échouée / aucun service | `bridgeNotComputed()` → absent |
| instantané de reconnexion | conversation **soumise** à la passe | `bridgeComputed(...)` |
| instantané de reconnexion | compteur à zéro | `bridgeComputed(undefined)` → `null` |
| instantané de reconnexion | **hors borne**, ou passe échouée | `bridgeNotComputed()` → absent |
| `conversation:join` | ouvrir CONSOMME le pont | `bridgeComputed(undefined)` → `null` |
| `broadcastReadStatus` | la lecture INVALIDE le pont (§3) | `bridgeComputed(undefined)` → `null` |

Le critère de l'instantané est l'ensemble **SOUMIS** à la passe, jamais son
résultat : c'est la seule lecture qui distingue « j'ai demandé, il n'y en a
pas » de « je n'ai pas demandé ».

### Côté clients

- **Web** — `handleUnreadUpdated` teste `'bridge' in data` (et non la valeur :
  `undefined` et l'absence sont indiscernables à la lecture d'une propriété,
  ce qui est exactement la distinction à tenir), puis ne construit l'enveloppe
  `BridgeCacheUpdate` que si la clé est là. L'enveloppe existait déjà et disait
  déjà la bonne chose — c'est son appelant qui en fournissait toujours une.
- **iOS** — `UnreadUpdateEvent.bridge` (un `ConversationBridge?` qui confondait
  les deux silences) devient `announcement: BridgeAnnouncement`, énum à trois
  cas. Le décodage sépare les silences par `container.contains(.bridge)` — seul
  prédicat qui le peut, `decodeIfPresent` rendant `nil` dans les deux cas.
  `ConversationSyncEngine.handleUnreadUpdated` `switch` dessus : `.notComputed`
  ne touche à rien.

**Durcissement collatéral, iOS** : un pont **malformé** rend désormais
`.notComputed` et non `.cleared`. Le décodage reste tolérant (l'événement entier
survit, G-124), mais **ne pas savoir lire n'autorise pas à détruire**. C'est le
même principe que le reste du lot, appliqué au seul cas qui n'est pas un choix
d'émetteur.

## 5. Témoins

**Ordre TDD respecté** sur l'incrément principal : le fichier de contrat a été
écrit et vérifié ROUGE (4 échecs / 3 verts) avant toute ligne de production.

`services/gateway/src/__tests__/unit/socketio/unreadBridgeField.contract.test.ts`
— **nouveau, et son existence est le point** : la classe du cycle 62 ne vivait
pas dans un émetteur mais dans l'espace ENTRE les émetteurs, où aucun fichier
de test par émetteur ne pouvait la voir. Ce garde les convoque tous et énonce le
vocabulaire une fois pour tous. Le témoin central — « distingue, dans le même
fan-out, *la passe ne dit rien* de *je ne calcule pas* » — fait coexister les
deux situations dans UN appel et n'est vert que si elles sortent différemment.

Côté instantané (`MeeshySocketIOManager.test.ts`), trois témoins neufs, dont
celui qui **aurait rougi au cycle 62** : `conv-0` (hors borne) n'a pas la clé,
`conv-41` (soumise, sans réponse) porte `bridge: null`.

Côté web, `use-socket-cache-sync.test.tsx` monte le VRAI handler sur le VRAI
cache et exerce les trois états. Côté SDK, quatre témoins de décodage + le
témoin de synchro `notComputed_keepsTheCachedBridge`.

**Onze témoins pré-existants ont dû être retournés** — tous des
`toHaveBeenCalledWith` sur le payload ENTIER, exactement l'anti-patron que le
carnet du cycle 62 avait nommé en le quittant (« un `toHaveBeenCalledWith` sur
le payload ENTIER gèle la forme courte comme un acquis »). Ils gelaient la forme
à deux états. Un témoin iOS portait la règle fausse jusque dans son NOM
(`absentBridge_clearsPreviouslyKnownBridge`), renommé
`explicitlyClearedBridge_…`.

## 6. Trouvaille collatérale — le flake `packages/shared`, NOMMÉ

Piste n°3, ouverte depuis le cycle 61 bis (quatre cycles) : « le prochain run de
CI rouge doit le NOMMER ». Il est nommé.

`__tests__/vectors/behaviour-matrix.test.ts` — le garde « déclarés == couverts »
**parcourt le dépôt ENTIER en synchrone** (`walk` récursif + `readFileSync` sur
chaque fichier de test). Mesuré ici : **~4,2 s de temps de test contre le
`testTimeout` de 5 s par défaut de Vitest**. Seul, il passe (3 runs sur 3).
En suite complète, les 82 autres fichiers se disputent le CPU et il dépasse.

D'où un flake qui ne rougit JAMAIS isolément, et dont le message — « Test timed
out in 5000ms » — ne désigne aucune régression. Il n'y en avait pas : le témoin
fait un travail d'I/O que 5 s ne payent pas.

Sa marge se resserre à **chaque fichier de test ajouté au dépôt** — ce lot en
ajoute un et en modifie plusieurs, ce qui l'a fait tomber ici. Budget porté à
60 s, avec la mesure écrite à côté. Un ordre de grandeur de marge, sans masquer
quoi que ce soit : un balayage d'une minute signalerait un tout autre problème.

## 7. Vérification

| Gate | Résultat |
|------|----------|
| `tsc --noEmit` gateway | ✅ 0 erreur |
| `tsc --noEmit` shared | ✅ 0 erreur |
| gateway — `src/socketio`, `src/__tests__/unit/socketio`, `src/__tests__/unit/handlers` | ✅ 103 suites / 2405 tests |
| gateway — suite complète + couverture | (cf. §7 bis) |
| `packages/shared` | ✅ **83 suites / 2168 tests** (le flake §6 inclus) |
| web — suites pont/lentille/cache | ✅ 36 suites / 374 tests |
| web — suite complète | (cf. §7 bis) |
| iOS / SDK | **non compilable ici** — ni `swift` ni Xcode dans ce conteneur. Vérifié par `sdk-tests.yml`, déclenché sur `packages/MeeshySDK/**` en PR. |

## 8. Pistes pour le cycle 64

1. **`message:new` — 13 sites sur 2 transports** (cycle 62 §7 bis). Le seul
   événement multi-émetteur que le balayage n'a pas déplié. Redevient le premier
   candidat maintenant que la classe « un émetteur non instruit » a reçu son
   garde structurel : c'est là qu'elle aurait le plus de place pour se cacher.
2. **Le mock inerte de `presence.service.test.ts`** (cycle 56 §5) — intacte.
3. **`conversations.infinite()` en pagination keyset** (cycles 59/60) — intacte.
4. **La file hors-ligne par APPAREIL** (cycle 58 §7) — intacte.
5. **`attachment:reaction-*` et `message:consumed` sans lecteur web** (cycle 57
   §8-3) — décision produit, intacte.
6. **Les deux ÉVÉNEMENTS avant les deux FUSIONS côté iOS** (cycles 51/52/53) —
   intacte, bloquée sur l'absence de Xcode.
7. **`PUT /conversations/:id` accepte toujours de renommer un DM** — intacte.
8. **Le pont sur `broadcastReadStatus`, deuxième temps.** Ce lot affirme
   `null` — la vérité disponible à coût nul. Reste ouvert, et c'est maintenant
   une vraie question de PRIX et non de vocabulaire : recalculer le pont sur le
   nouveau curseur rendrait au lecteur multi-appareils un pont JUSTE au lieu
   d'aucun. À trancher sur mesure, pas sur intuition.

## 9. La leçon, généralisée

> **Quand deux sites doivent choisir entre deux mensonges, le défaut n'est pas
> dans les sites : il est dans le vocabulaire.** Une piste formulée comme un
> arbitrage de coût — « corriger ici coûterait N requêtes » — mérite d'abord la
> question « le contrat sait-il seulement dire ce que ce site voudrait dire ? ».
> Ici la réponse était non, et le correctif a coûté zéro requête.

Corollaire, sur la polarité des valeurs par défaut :

> **Le sens du SILENCE doit être le sens INOFFENSIF.** Un protocole où
> l'omission détruit fabrique un défaut à chaque émetteur qui n'a pas été mis au
> courant — et ces émetteurs-là ne se signalent jamais, puisque leur code ne
> change pas. Rendre l'effacement explicite ne corrige pas un défaut : ça retire
> à la classe entière son terrain.

Et une leçon sur les cycles eux-mêmes :

> **Un correctif qui BORNE son travail doit dire ce qu'il advient de ce qui est
> hors borne.** Le cycle 62 a écrit « leur pont attend » là où le code disait
> « leur pont est effacé », parce que les deux sortaient la même charge sur le
> fil. Quand une borne est posée, le témoin à écrire n'est pas « ce qui est dans
> la borne est traité » — c'est **« ce qui est dehors est INTACT »**.
