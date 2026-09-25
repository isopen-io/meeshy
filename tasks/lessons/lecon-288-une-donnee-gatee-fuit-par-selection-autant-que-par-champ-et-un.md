## Leçon 288 — une donnée gatée fuit par SÉLECTION autant que par CHAMP ; et un inventaire qui cherche « qui sert le champ ? » ne le voit pas (2026-08-25, chantier confidentialité de la présence)

Le chantier a commencé par un inventaire à trois agents (gateway, iOS, web+Android) qui
a rendu douze sites de service et « quatre trous sans gate ». Les lots d'exécution en ont
trouvé TROIS de plus — tous relevés par les agents en travaillant sur le site voisin,
aucun par l'inventaire :

1. `conversation:stats.onlineUsers` — une LISTE D'IDENTITÉS en ligne (`id`, `username`,
   prénom, nom), calculée depuis les sockets connectés et émise à chaque `conversation:join`.
   Le champ s'appelle `onlineUsers`, pas `isOnline` : un grep de `isOnline|lastActiveAt`
   ne le rend pas, et le type `ConversationOnlineUser` ne porte AUCUN drapeau de présence —
   **l'appartenance à la liste EST la présence.**
2. `GET …/participants?onlineOnly=true` — le filtre s'applique EN BASE
   (`whereConditions.isOnline = true`) AVANT la porte de présence, qui masque ensuite
   `isOnline` sur chaque ligne servie. Un non-ami reçoit exactement les participants en
   ligne, chacun étiqueté `isOnline: false`. La porte est juste ; c'est la SÉLECTION
   qui parle.
3. Le repli « entrée absente de la carte » écrit trois fois, avec deux sémantiques.

> **Une porte de confidentialité gouverne un CHAMP. Mais la donnée qu'elle garde
> participe aussi à des SÉLECTIONS (filtres `where`, tris, listes « qui est en ligne »,
> compteurs nominatifs) qui ne passent par aucun champ.** La question « qui sert
> `isOnline` ? » trouve les portes manquantes ; elle ne trouve pas les fuites où la
> présence est devenue une FORME (la composition d'une liste, l'ordre d'un tri, le
> résultat d'un filtre). La question qui les trouve : **« quelles réponses CHANGENT
> quand la présence d'un tiers change ? »** — et se répond en cherchant `where …
> isOnline`, `orderBy lastActiveAt`, `getConnectedUserIds()`, `onlineOnly`, `sort=`,
> pas le nom du champ.

Corollaires :
- **Une sélection sur une donnée gatée doit être restreinte au SOUS-ENSEMBLE que le
  viewer a le droit de voir AVANT d'être appliquée** (ici : ids des amis + soi, puis
  `isOnline`), puis re-filtrée sur la valeur SERVIE (ferme le bloqué / la préférence).
  Appliquer la porte APRÈS la sélection ne masque que l'étiquette.
- **Un inventaire de « sites de service » énumère des CHAMPS ; l'exécution rencontre des
  FORMES.** Prévoir, dans tout chantier de confidentialité, une lentille de complétude
  qui balaie les prédicats (`where`/`orderBy`/`filter`) et les charges composées
  (`*Users`, `*Ids`, `stats`), pas seulement les `select`.
- **Le lot qui touche un site est le meilleur détecteur du site VOISIN** : les trois
  trouvailles viennent d'agents qui, ayant fermé une porte, ont demandé « et cette autre
  liste, qui la sert ? ». Demander explicitement à chaque lot, dans son rapport, « ce que
  tu as vu à côté » — c'est la section (f) qui a rendu les trois.

### Addendum (revue adversariale du même chantier, 2026-08-26) — cinq formes de plus, aucune « qui sert le champ ? »

La revue à 8 lentilles opus (84 agents) a rendu 28 constats confirmés, dédoublonnés en 8
correctifs. Classés par la QUESTION qui les trouve — jamais « qui sert `isOnline` ? » :

| forme | exemple | question qui l'attrape |
|---|---|---|
| champ VOISIN dans le même objet | `links/retrieval.ts` : `isOnline` gaté l. 250, `lastActiveAt: joinedAt` brut l. 251 | « qu'est-ce qui part À CÔTÉ de ce que je viens de garder ? » (leçon 275/284) |
| colonnes de la LIGNE par `include` + schéma ouvert | `POST /communities/…/conversations/:id` : `include: { participants }` rend `Participant.isOnline`, `sessionTokenHash`, `anonymousSession` ; `additionalProperties: true` les laisse passer ; le gate ne réécrit que `row.user` | « le schéma est-il FERMÉ ? un `include` sur une relation rend TOUTES ses colonnes » |
| site sans aucun gate, hors de tout inventaire | `GET /affiliate/stats` : `referredUser.isOnline` à tout parrain | grep `isOnline: true` dans TOUS les `select` du dépôt et suivre chaque hit jusqu'au fil |
| sélection / ordre sur route ADMIN à rôles mixtes | `/admin/users?lastActiveAfter=&sortBy=lastActiveAt` pour MODERATOR/AUDIT ; `sortBy` sans liste blanche | « quel rôle peut ENTRER ici, et quel rôle peut VOIR ce qu'on y filtre ? » |
| ordre + TRONCATURE | mentions : co-participants classés par `lastActiveAt`, coupés à 10 | « quelles réponses CHANGENT quand la présence d'un tiers change ? » |
| défaut FAIL-OPEN d'une option facultative | `serializeConversationParticipant(row, {})` révèle ; `PresenceTarget.deactivatedAt?` ⇒ un désactivé passe | « que fait ce site quand on OMET l'option de garde ? » — une garde facultative est une garde absente pour le prochain appelant |
| client qui GARDE ce que le serveur retire | web `mergeParticipants` : `lastActiveAt: null` reçu ⇒ `incomingTime = 0` ⇒ charge rejetée, ancienne présence conservée ≤ 5 min | « quand le serveur cesse de servir, le client REVIENT-il à rien ? » — la lentille clients a réfuté « aucune modification client » |

> **« Aucune modification client requise » est une affirmation à RÉFUTER, pas à relire.**
> L'inventaire l'avait établie en cherchant qui FABRIQUE une présence ; personne ne
> fabriquait. Mais garder une valeur que le serveur vient de retirer est une fabrication
> par inertie — et elle ne se voit qu'en jouant la séquence « servi puis masqué ».

Mécanique qui a marché : 2 sceptiques par constat (correction / reproduction par les tests) — les
6 réfutés étaient tous des sites que W3a/W3c avaient corrigés PENDANT la revue ; aucun faux
positif n'a survécu, aucun vrai n'a été perdu (les doublons entre lentilles confirment plutôt
qu'ils ne coûtent).
### Corollaire 245i — une garde d'analyse de source est adaptée à une FORME DE FICHIER, pas à un langage

La suite naturelle de 244i était « étendre la garde d'atteignabilité au reste de
l'app ». Mesuré avant d'asserter — comme la leçon 287 l'exige — le balayage rend
**355 fonctions sur 190 fichiers**, et ce nombre est **dominé par des faux
positifs structurels** :

1. **Exigences de protocole.** Un nom déclaré dans un `protocol` PUIS implémenté
   apparaît deux fois ; l'arithmétique `usages − déclarations` retombe donc à
   zéro **même quand le protocole est appelé**. `StoryComposerProviding` en
   fabrique huit à lui seul.
2. **Conformances de délégué** (`DropDelegate`, `UIScrollViewDelegate`…) :
   appelées par le framework, jamais nommées par le dépôt.
3. **Sièges de test** (`…ForTesting`, `…ForTest`), légitimes par construction.

> **La garde de 243i/244i n'est pas générale : elle est adaptée aux fichiers
> d'EXTENSION de vue SwiftUI**, où les conformances de protocole sont rares.
> Elle a trouvé treize vraies fonctions mortes là ; ailleurs, son arithmétique
> ne discrimine plus.

Deux conséquences :

- **Une allowlist de NOMS ne rattrape pas un défaut de FORME.** `frameworkInvoked`
  énumère une douzaine de contrats à la main ; il en faudrait des centaines. Ce
  qu'il faut est une exclusion STRUCTURELLE — ne pas compter une déclaration
  écrite dans un corps de `protocol`, reconnaître une conformance `: XxxDelegate`.
- **Le bon geste, quand une mesure rend un nombre trop gros, est de demander ce
  que l'outil confond**, pas de trier 355 entrées à la main. Ici la réponse
  tenait en deux `grep` : un `protocol` et un `DropDelegate`.
