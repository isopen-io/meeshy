# Tête instruite pour le cycle 108 — la bonne question n'est jamais « la règle est-elle appliquée ? », c'est « par combien de lecteurs sur combien ? »

*Le cycle 107 a repris le lot laissé par le 106 et n'y a pas trouvé son défaut. Il l'a trouvé à côté,
sur la surface que le 106 venait justement de rendre fonctionnelle : le widget affiche désormais ses
conversations — dans la langue de l'expéditeur.*

> ## La leçon qui doit ouvrir chaque cycle, parce qu'elle a échoué TROIS fois (132, 137, 142)
>
> ```bash
> git fetch origin main && git log --oneline -5 origin/main
> ```
>
> **Avant chaque `Write`/`Edit` de production, et de toute façon si plus de ~15 min ont passé
> depuis le dernier fetch.**

> ## La leçon que le cycle 107 ajoute — le douzième membre de la famille
>
> Le cycle 105 : *une règle que TOUTES les lectures appliquent n'est pas tenue tant qu'une ÉCRITURE l'ignore.*
> Le cycle 106 : *une garde LOCALE sur un défaut GLOBAL rassure autant qu'une garde globale.*
> Le cycle 107 trouve la version sans garde du tout :
>
> **Une règle appliquée par ses lecteurs CANONIQUES est plus difficile à auditer qu'une règle
> appliquée nulle part. `CLAUDE.md` nomme `resolvedLastMessagePreview` comme la source de vérité du
> Prisme pour l'aperçu de conversation ; `ThemedConversationRow` l'appelle, commente la règle, et la
> teste. Un audit qui demande « le Prisme est-il appliqué à l'aperçu ? » tombe dessus et répond oui.
> La réponse juste n'est jamais un exemple — c'est un DÉNOMBREMENT : 2 appels du résolveur contre 6
> fichiers lisant le champ brut. L'écart entre les deux chiffres EST le défaut, et il se lit en deux
> greps.**
>
> **Le symptôme à reconnaître** : un commentaire de code qui explique correctement une règle
> partagée. Il prouve que ce fichier-là la connaît ; il ne dit rien des autres, et il RASSURE.
>
> **Corollaire de sortie de périmètre, à appliquer partout** : la surface la plus grave n'est pas la
> plus visible, c'est la DERNIÈRE — celle après laquelle plus personne ne peut résoudre. App Group,
> payload de notification, export gravé : toute fonction qui écrit hors de l'app est un point de
> résolution OBLIGATOIRE, jamais un relais.

## Livré au cycle 107 — l'aperçu de conversation se résout partout, et une garde le dénombre

**Le défaut.** Cinq lecteurs de production de `conversation.lastMessagePreview`, deux qui appliquent le
Prisme. Les trois autres affichaient le dernier message dans la langue de l'expéditeur : `WidgetDataManager`
(le texte publié dans `recent_conversations`, donc l'écran d'accueil), `SharePickerView` (sélecteur de
destination de partage) et `WidgetPreviewView` (aperçu in-app des widgets). Les trois recevaient pourtant
les MÊMES objets `MeeshyConversation` que la liste, `lastMessageTranslations` inclus — la traduction était
en main, personne ne la lisait. Le widget est le cas grave : son texte QUITTE l'app, aucune résolution
n'est plus possible en aval.

**Livré** : les trois surfaces résolvent par le prisme du lecteur (`AuthManager.currentUser?
.preferredContentLanguages`, la même autorité que `ConversationListView`) ; côté widget par un seam
injectable résolu une fois par publication. La ligne de liste cesse au passage de se contredire —
son `hasText` lisait le brut pendant que le rendu affichait le résolu. Et la règle n'est plus tenue par
convention : `ConversationPreviewPrismSourceGuardTests` extrait TOUS les accès `.lastMessagePreview`
sous `apps/ios/Meeshy/` et exige de chaque fichier une classification (résolu, ou allowlisté avec sa
raison — 2 entrées, dont aucune n'AFFICHE le champ : l'une l'écrit depuis `conversation:updated`,
l'autre lit un homonyme déjà résolu). La garde refuse un balayage vide, corollaire payé au cycle 106.

**Tests** : 4 témoins de garde + 4 témoins de comportement sur le payload App Group réellement publié.
**Réserve d'honnêteté sur la preuve RED** : aucune toolchain Swift dans l'environnement de la routine
(constat inchangé des cycles 86 à 106) — le rouge-avant n'a pas été EXÉCUTÉ. Il a en revanche été établi
MÉCANIQUEMENT hors Swift, par un portage à l'identique de l'algorithme de la garde : avant correctif il
rendait 4 fichiers non déclarés (`WidgetDataManager`, `SharePickerView`, `WidgetPreviewView`,
`ThemedConversationRow`), après correctif exactement les 2 de l'allowlist. C'est ce même portage qui a
servi à choisir la forme du motif (`.lastMessagePreview` en accès membre, borne droite obligatoire —
sans elle le balayage comptait `lastMessagePreviewView`, un nom de vue).

## Constats du cycle 107, NON traités — le lot naturel du cycle 108

1. **La cible `MeeshyWidgets` n'a AUCUN catalogue de chaînes.** Le cycle 106 notait que trois libellés
   du widget « Réponse rapide » (« OK », « Thanks! », « Call me ») n'étaient pas localisés « alors que
   tout le reste passe par `String(localized:)` ». Le constat est plus large et sa conclusion inverse :
   `Localizable.xcstrings` existe pour `Meeshy`, `MeeshyNotificationExtension` et `MeeshyShareExtension`
   — **pas** pour `MeeshyWidgets`. Chaque `String(localized:…, defaultValue:)` du widget retombe donc sur
   son défaut anglais pour TOUS les utilisateurs, y compris les 7 langues que l'app traduit. Localiser
   les trois littéraux ne changerait rien à l'exécution : le travail est d'ajouter un catalogue à la
   cible (`project.yml`), pas de réécrire trois lignes. **À décider en même temps** : le libellé du
   bouton est aussi le TEXTE déposé en brouillon — le premier relève de la locale appareil (chrome
   d'interface), le second de la langue configurée du compte (contenu). Les deux peuvent diverger.
2. **`WidgetDataManager` publie encore deux chaînes fabriquées à la main, hors catalogue.**
   `formatLastMessage` compose `"[N attachment(s)]"` — anglais, pluriel bricolé — et
   `publishFavoriteContacts` publie `conv.lastSeenText ?? "Offline"`, où `lastSeenText` est du FRANÇAIS
   codé en dur dans le SDK (`CoreModels.swift`, « Vu il y a … »). Le widget mélange donc les deux langues
   dans une même vue. Contrairement au point 1, ces deux-là sont composées DANS l'app, qui a son
   catalogue : elles sont corrigibles sans toucher à la cible widget. Le `lastSeenText` du SDK est le
   morceau qui demande une décision (localiser dans le SDK, ou rendre la composition app-side).
3. **`meeshy://conversations/recent` demande une destination qui n'existe pas.** Reconduit du 106 :
   l'App Shortcut s'intitule « Open Recent Conversation », la destination juste est *la conversation la
   plus récente*, aucun cas `DeepLink` ne porte cette élection. Décision de produit légère, mais décision.
4. **`meeshy://call?contactId=&type=` : amorcer un appel depuis un lien n'a pas de chemin.** Reconduit.
5. **Les boutons de la Live Activity sont doublement morts.** Reconduit — `LiveActivityBridge` est un
   stub, router les URL sans démarrer les activités ne servirait à rien. Sur iOS 17+, la bonne forme
   est `Button(intent:)` / `LiveActivityIntent`, pas un `Link`.
6. **`ContactEntity` et le widget Favoris nomment « contact » ce qui est une conversation.** Reconduit —
   un renommage touche la clé App Group, donc la compatibilité des widgets déjà posés.
7. **La garde du Prisme ne balaie que `apps/ios/Meeshy/`.** Aucune cible d'extension n'affiche
   aujourd'hui un aperçu qu'elle résout elle-même, mais si l'une venait à le faire, elle serait hors
   de portée du dénombrement. À étendre EN MÊME TEMPS que la première extension qui le ferait.
8. **Reconduits, inchangés** : `NotificationType.MESSAGE_PINNED`/`MESSAGE_UNPINNED` sans producteur ;
   `clearHistoryBefore` écrit et diffusé, jamais appliqué côté serveur ; l'épingle qui n'atteint pas la
   3e audience ; Socket.IO sans adapter Redis ; le commentaire de `handleMessage` qui affirme à tort que
   REST y passe ; la projection des accusés en trois exemplaires inline ; `TranslationStatus` sans
   référent in-repo. Et l'audit d'adressage n'est toujours pas clos : **Android hors `MessageApi`**
   n'a pas été passé au crible.

# Tête instruite pour le cycle 107 — la connaissance qui manque n'est pas toujours absente : elle peut être là, appliquée à UNE cible

*Le cycle 106 a mené l'audit d'adressage promis au cycle 102 et reconduit quatre fois. Il ne l'a pas
mené sur des appels REST comme prévu — ceux-là étaient corrects — mais sur la surface que la même
leçon désignait sans que personne l'y applique : les `meeshy://` écrits à la main par les widgets et
les App Shortcuts.*

> ## La leçon qui doit ouvrir chaque cycle, parce qu'elle a échoué TROIS fois (132, 137, 142)
>
> ```bash
> git fetch origin main && git log --oneline -5 origin/main
> ```
>
> **Avant chaque `Write`/`Edit` de production, et de toute façon si plus de ~15 min ont passé
> depuis le dernier fetch.**

> ## La leçon que le cycle 106 ajoute — le onzième membre de la famille
>
> Le cycle 102 : *un appel réseau écrit à la main n'est confronté à la table de routage de PERSONNE.*
> Le cycle 105 : *une règle que TOUTES les lectures appliquent n'est pas tenue tant qu'une ÉCRITURE l'ignore.*
> Le cycle 106 trouve le onzième :
>
> **La connaissance qui manque n'est pas toujours absente du dépôt : elle peut y être ÉCRITE,
> testée, et appliquée à UNE SEULE cible. `ShareExtensionSourceGuardTests` interdit depuis 2026-07
> à l'extension de partage d'émettre un deep link `contactId=`, avec la raison exacte en clair —
> « DeepLinkParser ne comprend que text=/url= ». Pendant ce temps `MeeshyAppIntents.swift` en
> émettait deux, et le widget cinq autres formes. La garde n'était pas fausse ; elle était
> LOCALE, et une garde locale sur un défaut GLOBAL rassure autant qu'une garde globale.**
>
> **Le symptôme à reconnaître** : quand une garde nomme une limite d'un composant PARTAGÉ (« le
> parseur ne comprend que X »), la limite ne concerne pas la cible gardée — elle concerne toutes
> celles qui parlent à ce composant. Chercher les AUTRES émetteurs est un réflexe, pas une enquête.
>
> **Corollaire d'outillage, payé comptant ce cycle** : le découpeur de commentaires que ce dépôt
> recopie de garde en garde traite `//` comme un début de commentaire — donc il EFFACE
> `meeshy://` avant toute recherche. Une garde bâtie dessus aurait balayé zéro URL et serait
> passée au VERT en n'ayant rien vérifié. Toute garde qui compte des occurrences doit refuser
> explicitement un balayage vide (`XCTAssertFalse(emitted.isEmpty)`) — sans quoi son silence est
> indiscernable d'un succès.

## Livré au cycle 106 — le widget et Siri cessent d'adresser le vide

**Le défaut.** Sept hosts `meeshy://` sont émis par des cibles qui ne lient pas le routeur (widget,
App Shortcuts) ; trois seulement existaient dans la table. `quickreply/{id}?text=` (les quatre
boutons du widget « Réponse rapide », c'est-à-dire sa raison d'être entière), `contact/{id}`,
`send?contactId=&message=` (raccourci Siri « Message X on Meeshy », qui demande le destinataire ET
le texte avant de les jeter), `call?contactId=`, `translate?text=`, `conversations/recent` et
`…/unread` retombaient tous sur `.external` — l'app s'ouvre, le geste est perdu, rien ne rougit.

**Livré** : les trois hosts qui portaient DÉJÀ un identifiant de conversation sont routés —
`contact/{id}` et `send?contactId=` en portent un malgré leur nom (`publishFavoriteContacts` écrit
`conv.id` dans `FavoriteContact.id` ; `ContactQuery` sert ses entités de la même clé). Le texte
d'un raccourci est **déposé en brouillon** (`DraftStore`, relu par `ConversationView` à l'ouverture)
et jamais envoyé : un tap accidenté ou une dictée Siri mal transcrite ne peut pas produire un
message irrattrapable. Un brouillon qui porte déjà du texte n'est **jamais** écrasé.

**Ce qui reste NON routé, délibérément** : `conversations` (élire « la plus récente » demande une
destination qui n'existe pas), `call` (deux de ses trois formes sont hors d'atteinte —
`LiveActivityBridge` est un stub), `translate` (pas d'écran pour un texte hors conversation). Ils
ne sont plus invisibles : `DeepLinkSurfaceRoutingGuardTests` extrait les hosts réellement émis et
exige de chacun une classification — routé avec URL témoin qui doit résoudre, ou non routé avec sa
raison. Un huitième host inventé demain fait rougir l'égalité d'ensembles.

**Correction annexe, même famille sur une clé plutôt qu'une URL** : `ContactQuery.entities(for:)`
lisait la clé App Group `contacts`, qu'aucun écrivain du dépôt ne pose — tout Raccourci enregistré
perdait son destinataire au deuxième lancement, sans erreur (une liste vide est un résultat valide).
Elle lit désormais `favorite_contacts`, la seule écrite, et celle que son propre jumeau
`suggestedEntities` lisait déjà.

**Tests** : 2 suites neuves (17 témoins) sous `MeeshyTests/Unit/Navigation/`. **Réserve d'honnêteté
sur la preuve RED** : aucune toolchain Swift n'existe dans l'environnement de la routine (constat
inchangé des cycles 86 à 105), donc le rouge-avant n'a pas été EXÉCUTÉ — il est établi par lecture
du `switch` (aucun `case` pour ces hosts avant le correctif, visible au diff) et l'exécution
revient à la CI. En revanche l'extraction de hosts de la garde a été vérifiée mécaniquement, hors
Swift, par un portage à l'identique de son algorithme : c'est CE contrôle qui a révélé le bug du
découpeur de commentaires (`//` de `meeshy://`) avant qu'il ne soit poussé.

## Constats du cycle 106, NON traités — le lot naturel du cycle 107

1. **`meeshy://conversations/recent` demande une destination qui n'existe pas.** L'App Shortcut
   s'intitule « Open Recent Conversation » : la destination juste est *la conversation la plus
   récente*, pas la liste. Aucun `DeepLink` ne porte cette élection, et l'app-side sait l'élire
   (`ConversationListViewModel`) sans que le routeur y ait accès. Un cas `.mostRecentConversation`
   consommé par `RootView` est le geste naturel — décision de produit légère, mais décision.
2. **`meeshy://call?contactId=&type=` : amorcer un appel depuis un lien n'a pas de chemin.**
   `CallManager` démarre un appel depuis une conversation ouverte ; rien n'amorce depuis une URL.
   Le raccourci Siri « Call X on Meeshy » restera inerte tant que ce chemin n'existe pas.
3. **Les boutons de la Live Activity sont doublement morts.** `meeshy://call/mute` et `call/end`
   ne sont pas routés, ET aucune Live Activity n'est jamais démarrée : `LiveActivityBridge` est un
   stub qui journalise, bloqué depuis toujours sur le partage de `MeeshyActivityAttributes` entre
   la cible widget et l'app. Le fichier documente lui-même les 4 étapes du déblocage. **Router les
   deux URL sans démarrer les activités ne servirait à rien** — les deux moitiés vont ensemble.
   Note produit : sur iOS 17+, la bonne forme n'est de toute façon pas un `Link` (qui ouvre l'app)
   mais un `Button(intent:)` / `LiveActivityIntent`, qui agit sans premier plan.
4. **Les libellés du widget « Réponse rapide » ne sont pas localisés.** « OK », « Thanks! », « Call
   me » sont des littéraux anglais codés en dur, dans un widget dont tout le reste passe par
   `String(localized:)`. Le brouillon déposé porte donc de l'anglais à un utilisateur francophone —
   visible dès maintenant, puisque le bouton fonctionne enfin.
5. **`ContactEntity` et le widget Favoris nomment « contact » ce qui est une conversation.** Le
   correctif de ce cycle l'assume et le documente aux quatre sites, mais le nom continue de mentir.
   Un renommage (`FavoriteConversation`, `ConversationEntity`) toucherait la clé App Group et donc
   la compatibilité ascendante des widgets déjà posés — à faire avec une migration, pas à la volée.
6. **Reconduits, inchangés** : `NotificationType.MESSAGE_PINNED`/`MESSAGE_UNPINNED` sans producteur
   (décision produit à trancher) ; `clearHistoryBefore` écrit et diffusé, jamais appliqué côté
   serveur (change une API publique, à valider par un humain) ; l'épingle qui n'atteint pas la 3e
   audience (aucun défaut observable tant qu'aucune ligne de liste n'affiche d'épingle) ;
   Socket.IO sans adapter Redis (contrainte d'architecture mono-instance) ; le commentaire de
   `handleMessage` qui affirme à tort que REST y passe ; la projection des accusés en trois
   exemplaires inline ; `TranslationStatus` sans référent in-repo. Et l'audit d'adressage lui-même
   n'est pas clos : **Android hors `MessageApi`** n'a toujours pas été passé au crible.

# Tête instruite pour le cycle 106 — une règle que TOUTES les lectures appliquent n'est pas tenue tant qu'une ÉCRITURE l'ignore

*Le cycle 105 est parti d'un audit large de la pile temps réel (file hors-ligne, dédup, ordonnancement,
indicateurs de frappe, présence, reconnexion) et n'a rien trouvé à y reprendre : les cycles 96 à 104 ont
laissé ces modules dans un état où chaque invariant est écrit, commenté et testé. Le défaut était à côté,
sur la seule route de message que ce travail d'unification n'avait jamais touchée.*

> ## La leçon qui doit ouvrir chaque cycle, parce qu'elle a échoué TROIS fois (132, 137, 142)
>
> ```bash
> git fetch origin main && git log --oneline -5 origin/main
> ```
>
> **Avant chaque `Write`/`Edit` de production, et de toute façon si plus de ~15 min ont passé
> depuis le dernier fetch.**

> ## La leçon que le cycle 105 ajoute — le dixième membre de la famille
>
> Le cycle 100 : *un champ SANS ÉCRIVAIN ne reste pas neutre : il se DIVERGE.*
> Le cycle 101 : *une règle posée sur le chemin CHAUD n'est tenue que par les chemins qui la RELISENT.*
> Le cycle 103 : *zéro écrivain n'implique pas zéro lecteur, et c'est le LECTEUR qui décide du geste.*
> Le cycle 104 : *un TEST peut être le seul lecteur d'un champ, et il lui donne l'apparence d'un contrat.*
> Le cycle 105 trouve le dixième :
>
> **Une règle que TOUTES les lectures appliquent a l'air d'un invariant, et n'en est pas un tant
> qu'une ÉCRITURE l'ignore. `deletedAt: null` était écrit dans la liste des messages, dans la
> recherche, et dans la liste des messages épinglés — cent lignes sous les deux routes d'épinglage
> qui ne l'écrivaient pas. L'unanimité des lectures est précisément ce qui rend le trou
> INVISIBLE : la donnée fausse est écrite, elle est diffusée, et aucune lecture ne la rend jamais —
> donc rien ne la contredit non plus.**
>
> **Le symptôme à reconnaître** : quand la règle manque à l'écriture mais tient à la lecture, le
> défaut ne se voit pas en base ni dans une réponse HTTP. Il se voit **sur le fil** — un événement
> temps réel qui nomme un objet qu'aucune lecture ne rendra plus. Et il ne se répare pas tout seul :
> le client qui applique l'événement à son cache n'a plus aucune source pour le détromper.
>
> **Corollaire d'outillage, distinct et vérifié ce cycle** : un balayage d'audit qui grepe une FORME
> (`to(ROOMS.conversation(`) ne voit pas les sites qui composent la même valeur autrement
> (`` to(`conversation:${id}`) ``). Le dépôt porte la trace de ce balayage (note de `participants.ts`
> § `PARTICIPANT_ROLE_UPDATED`, « pour qu'un prochain balayage […] ne le rouvre pas ») et les deux
> seules lignes qu'il ne pouvait pas voir étaient précisément celles qui portaient le défaut de ce
> cycle. **Écrire par la constante n'est pas cosmétique : c'est ce qui rend un site VISIBLE au
> prochain audit.**

## Livré au cycle 105 — l'épingle cesse de survivre à la suppression de son message

**Le défaut.** `PUT` et `DELETE /conversations/:id/messages/:messageId/pin` localisaient leur cible
par `{ id, conversationId }` seuls. Toutes les LECTURES du même fichier disent pourtant déjà
l'inverse — liste des messages (`deletedAt: null`), recherche, et liste des messages épinglés cent
lignes plus bas (`{ pinnedAt: { not: null }, deletedAt: null }`) : un message supprimé pour tout le
monde n'est plus un objet épinglable. Les deux ÉCRITURES de l'épingle étaient les seules à ne pas le
dire.

**Ce que ça donnait** : `200`, `pinnedAt`/`pinnedBy` écrits sur un tombstone, et `message:pinned`
diffusé dans la room de conversation **ET** mis dans la file de rattrapage hors-ligne
(`enqueueOfflineMessageMutation`) — un événement qui nomme un message que tous les clients ont déjà
retiré. Le web l'applique à son cache (`use-socket-cache-sync.handleMessagePinned`), iOS à sa
persistance locale (`ConversationSocketHandler` → `updatePinned`), et **rien ne les détrompe
ensuite** : la liste des épinglés filtre ce message, donc aucun rechargement ne corrige l'état ; et
l'identité de dédup de la file étant `(messageId, 'pinned')`, l'entrée fantôme se rejoue à chaque
reconnexion jusqu'au TTL de 48 h.

**Livré** : `deletedAt: null` sur les DEUX sens du même geste. N'en garder qu'un rouvrirait le trou
par l'autre — et les deux gardes sont indépendamment portantes, la mutation-proof le montre témoin
par témoin.

**Ce qui a été délibérément NON fait, et pourquoi.** L'épingle qui SURVIT à une suppression
(épingler puis supprimer) reste en base sans être atteignable par le dépinglage. La nettoyer aurait
demandé `pinnedAt: null` dans les **quatre** chemins qui écrivent `deletedAt` sur un message
(`MessageHandler`, `conversations/messages-advanced.ts`, `messages.ts`,
`ExpiredMessagesCleanupService`) — exactement la duplication en N exemplaires dont un finit par
manquer, que ce dépôt a documentée trois fois. La ligne survivante n'est visible **nulle part**
(toutes les lectures filtrent `deletedAt: null`) et le tombstone lui-même part au balayage : pas de
défaut observable, donc pas de geste.

**Deux corrections annexes dans le même diff, chacune sur une ligne du même bloc.** (1) La requête
d'épinglage chargeait le document ENTIER — contenu, traductions, `metadata`, pièces jointes — pour
un simple `if (!message)`, là où son jumeau sélectionnait déjà `id` seul ; asymétrie laissée par le
correctif précédent, refermée. (2) Les deux diffusions composaient leur nom de room et leur nom
d'événement **à la main** (`` `conversation:${id}` ``, `'message:pinned'`) — les **seules** du
service à le faire, donc invisibles au balayage d'audience qui grepe `to(ROOMS.conversation(`. Elles
passent par `ROOMS.conversation()` / `SERVER_EVENTS`, à valeur identique (les tests existants
assertent les chaînes littérales et restent verts, ce qui est la preuve d'équivalence).

**Tests** : 5 neufs dans `conversation-message-pin.test.ts`, dont 4 vus ROUGES avant le correctif
(`Expected: 404 / Received: 200`, et `emit` appelé avec `"message:pinned"` sur un message supprimé).
Le 5e verrouille le chemin nominal : la garde ne ferme que la porte des supprimés. Le double Prisma
modélise désormais `deletedAt` comme Prisma le fait (`where: { deletedAt: null }` ne rend pas une
ligne supprimée), sans quoi il aurait rendu un tombstone à une route croyant demander un message
vivant. **Mutation-proof** : retirer `deletedAt: null` du `PUT` fait rougir exactement ses 2
témoins ; le retirer du `DELETE`, exactement les 2 autres ; aucun recouvrement.

## Constats du cycle 105, NON traités — le lot naturel du cycle 106

1. **`NotificationType.MESSAGE_PINNED` / `MESSAGE_UNPINNED` n'ont AUCUN producteur.** Déclarés dans
   `packages/shared/types/notification.ts`, admis par l'allowlist de `validation.ts`, et RENDUS par
   de vrais consommateurs — iOS (`NotificationModels.swift` : icône `pin.fill`, groupement,
   `UserNotificationPreferences+Filter`), web (`types/notification.ts`) — mais `grep` ne trouve pas
   une seule création côté gateway. Cas de la leçon 226 (zéro écrivain, vrais lecteurs ⇒ **brancher
   l'écrivain**, pas supprimer), mais l'écrivain est ici une décision PRODUIT avec un rayon de
   souffle push : « X a épinglé un message » notifie-t-il, et qui ? À trancher avant de coder.
   Noter que `pushCategoryForNotificationType` renvoie `undefined` pour ces deux types — donc même
   branché, le push sortirait sans catégorie ni actions.
2. **`clearHistoryBefore` est écrit et diffusé, jamais APPLIQUÉ côté serveur.**
   `POST /user-deletions/.../clear-history` persiste la coupure et la synchronise sur tous les
   appareils ; aucune requête de listing de la passerelle ne la lit. « Effacer l'historique »
   n'efface donc rien côté serveur, et le cycle 12 avait déjà noté qu'iOS ne l'applique pas non plus
   (`ConversationStore.dispatchPreferencesUpdate` → succès purement local). **Non traité
   délibérément** : le corriger change la sémantique d'API publiques, ce qu'un cycle autonome ne
   tranche pas — même réserve que celle posée sur l'arbitrage `delete-for-me`. À valider par un
   humain.
3. **L'épingle n'atteint pas la 3e audience que ses jumelles atteignent.**
   `broadcastMessageMutation` documente TROIS audiences pour une mutation de message (room ;
   `user:<id>` pour qui est sur la LISTE ; file hors-ligne). L'épingle sert la 1re et la 3e, jamais
   la 2e. **Instruit et NON traité** : aucun client ne rend aujourd'hui d'état d'épingle sur une
   ligne de liste, et l'ouverture du fil recharge de toute façon — donc pas de défaut observable
   pour motiver l'élargissement, exactement le raisonnement que `participants.ts` a déjà tenu pour
   `PARTICIPANT_ROLE_UPDATED`. **À rouvrir dès qu'une ligne de liste affiche une épingle.**
4. **Socket.IO tourne sans adapter Redis** (`grep` : aucun `@socket.io/redis-adapter`). Toute la
   couche temps réel est donc mono-instance : `io.to(room)` ne franchit pas le processus, et
   `connectedUsers` — la Map qui décide si un participant est « hors ligne » et mérite la file — ne
   connaît que les sockets de l'instance courante. Contrainte d'architecture, pas défaut de code ;
   relevé ici parce qu'aucun document du dépôt ne la nomme et qu'elle borne toute discussion de
   montée en charge.
5. **Reconduits, inchangés** : l'audit d'adressage promis au cycle 102 (`MeeshyShareExtension`,
   `MeeshyWidgets`, Android hors `MessageApi`) — **quatrième** reconduction ; le commentaire de
   `handleMessage` qui affirme à tort que REST y passe (constat 1 du cycle 104) ; la projection des
   accusés en trois exemplaires inline (constat 2 du cycle 104) ; `TranslationStatus` sans référent
   in-repo (constat 3 du cycle 104).

# Tête instruite pour le cycle 105 — un TEST peut être le seul lecteur d'un champ, et il lui donne l'apparence d'un contrat

*Le cycle 104 a ouvert le lot que son prédécesseur lui avait légué : les deux dernières colonnes
mortes de `Message` et le `deliveryStatus` codé en dur de l'ACK. Il a trouvé, sous le second, ce
qui empêchait depuis toujours de le voir mort.*

> ## La leçon qui doit ouvrir chaque cycle, parce qu'elle a échoué TROIS fois (132, 137, 142)
>
> ```bash
> git fetch origin main && git log --oneline -5 origin/main
> ```
>
> **Avant chaque `Write`/`Edit` de production, et de toute façon si plus de ~15 min ont passé
> depuis le dernier fetch.** Le cycle 104 l'a posé deux fois (ouverture + juste avant les
> premières éditions de production) ; `main` n'avait pas bougé, ce qui est le résultat NORMAL —
> le réflexe ne se juge pas à ses prises.
> Corollaire du cycle 91 (leçon 143) : **avant de jeter — ou d'imposer — un travail doublonné,
> comparer la COUVERTURE, pas l'intitulé.**

> ## La leçon que le cycle 104 ajoute — le neuvième membre de la famille
>
> Le cycle 96 : *un commentaire qui NOMME un suivi est une promesse.*
> Le cycle 97 : *un commentaire qui JUSTIFIE un geste destructeur est une PRÉMISSE périssable.*
> Le cycle 98 : *un CURSEUR est une promesse de couverture, et rien ne la vérifie.*
> Le cycle 99 : *un champ de pagination PARTAGÉ porte le contrat du mode qui l'a créé.*
> Le cycle 100 : *un champ SANS ÉCRIVAIN ne reste pas neutre : il se DIVERGE.*
> Le cycle 101 : *une règle posée sur le chemin CHAUD n'est tenue que par les chemins qui la RELISENT.*
> Le cycle 102 : *un appel réseau écrit à la main n'est confronté à la table de routage de PERSONNE.*
> Le cycle 103 : *zéro écrivain n'implique pas zéro lecteur, et c'est le LECTEUR qui décide du geste.*
> Le cycle 104 trouve le neuvième :
>
> **Un TEST peut être le seul lecteur d'un champ — et il lui donne l'apparence d'un contrat. La
> colonne « lecteurs » de la leçon 226 doit EXCLURE les tests : ce sont des lecteurs CIRCULAIRES.
> `expect(response.metadata.deliveryStatus).toBeDefined()` ne prouve pas qu'un client le lit ; elle
> prouve seulement que le producteur le produit. Six assertions tenaient en vie un bloc qu'aucun
> transport ne transmettait.**
>
> Et le symptôme qui va avec, plus fin que le champ mort : **le test savait**. `should include
> delivery status in metadata` assertait `status === 'sent'` et **s'arrêtait là** — jamais
> `deliveredCount`, jamais `readCount`. Écrire `expect(...deliveredCount).toBe(1)` aurait sauté aux
> yeux comme absurde. Le test avait contourné la partie mensongère du champ sans le dire.
>
> **La méthode qui en découle :** devant un champ que seuls des tests lisent, lire les assertions
> AVANT de conclure au contrat. Ce qu'elles ÉVITENT d'affirmer désigne la partie du champ que son
> auteur savait déjà fausse.

## Livré au cycle 104 — deux façons de mentir sur la livraison, retirées ensemble

**Le défaut, moitié A (l'ACK).** `MessagingService.createSuccessResponse` composait à chaque envoi
un bloc `metadata` de six sections. Trois ne mesuraient rien : `deliveryStatus` valait
`{recipientCount: 1, deliveredCount: 1, readCount: 1}` **en dur** (un envoi dans un groupe de douze
annonçait « livré à 1, lu par 1 » à l'instant de la persistance) ; `performance` rapportait
`dbQueryTime` / `translationQueueTime` / `validationTime` comme des **fractions arbitraires** du
temps total (× 0,6 / 0,2 / 0,1, somme = 90 %) ; `context` portait deux constantes et faisait DEUX
balayages du contenu (`extractMentions` + `containsLinks`) — sur le chemin de l'ACK, celui que
l'architecture garde délibérément libre de tout effet de bord.

**Rien de tout cela n'atteignait un client.** Les TROIS appelants de `handleMessage` n'utilisent que
`success` / `data` / `error`, et `MessageHandler._sendResponse` remplace la réponse entière par
`buildMessageAckData(data)` avant de rappeler le client. Calculé puis jeté, à chaque message.

**Livré** : `MessageResponse` ne porte plus de `metadata`. `createSuccessResponse` redevient
synchrone et ne fait plus que normaliser `senderId`. Huit types disparaissent de
`packages/shared/types/messaging.ts` faute de producteur COMME de consommateur
(`MessageResponseMetadata`, `DeliveryStatus` local, `RecipientDeliveryDetail`, `PerformanceMetrics`,
`MessageContext`, `DebugInfo`, `MessageBroadcastPayload`, `MessageBroadcastEvent`).

**Le défaut, moitié B (le stockage).** Les quatre colonnes du bloc « COMPUTED STATUS FIELDS » de
`Message` — `deliveredToAllAt`, `readByAllAt`, `deliveredCount`, `readCount` — n'ont plus d'écrivain
depuis le passage aux curseurs (`updateMessageComputedStatus` est un no-op assumé). Les cycles 101 à
103 en avaient rebranché la LECTURE (calcul dans `getConversationReadStatuses`, servi par les deux
routes) ; le stockage restait.

**Livré** : les quatre colonnes sortent de `schema.prisma`, avec un commentaire qui dit où la valeur
se calcule — pour qu'aucun futur écrivain ne les « restaure ». **La charge utile est identique au
bit près** : `deliveredCount`, `readCount`, `deliveredToAllAt`, `readByAllAt` RESTENT dans les types
de charge utile, parce que trois clients les décodent (`DeliveryStatusResolver` iOS et Android,
`MessageRecord+ToMessage`). Application directe de la leçon 226 : le lecteur lit une valeur
CALCULÉE, pas une colonne.
ADR : `services/gateway/decisions.md` et `packages/shared/decisions.md` § 2026-08-13 (2).

**Tests** : 6 assertions neuves remplacent les 6 qui verrouillaient la fabrication. **RED prouvé** —
la sortie d'échec est la pièce à conviction elle-même : `deliveryStatus: {deliveredCount: 1,
readCount: 1, recipientCount: 1}`, `performance: {dbQueryTime: 3.5999999999999996, …}`.
**Mutation-proof** : réintroduire un `metadata` — même réduit à `{}` — fait rougir **exactement 6**
témoins, ni plus ni moins.
Gate : `tsc --noEmit` gateway **propre** (c'est lui qui prouve qu'aucun `select` Prisma ne touchait
les quatre colonnes), suite gateway **692 suites / 17 061 tests** vertes, `packages/shared`
**52 fichiers / 1 506 tests** verts.

## Constats du cycle 104, NON traités — le lot naturel du cycle 105

1. **Le commentaire de `handleMessage` affirme que REST y passe : c'est faux.** « Both the Socket.IO
   and the REST entry points funnel through `handleMessage`, so both inherit the fast ACK » —
   `grep` ne trouve que TROIS appelants, tous socket (`MessageHandler` ×2,
   `MeeshySocketIOManager.handleAgentResponse`). Le `POST /messages` REST passe ailleurs. C'est une
   PRÉMISSE au sens du cycle 97, laissée en place ce cycle faute d'avoir instruit le chemin REST.
   **À instruire avant de la corriger** : si REST ne passe pas par `handleMessage`, quelles des
   garanties documentées là (ACK rapide, effets post-save, dedup) lui manquent réellement ?
2. **La projection des accusés existe en TROIS exemplaires inline** (`conversations/messages.ts`,
   `messages.ts`, `conversations/messages-advanced.ts`). Constat des cycles 102 et 103, **réexaminé
   ce cycle et volontairement NON traité** : les trois sites projettent vers des FORMES différentes
   (deux enrichissent un message, la troisième construit un endpoint de statuts avec `entries`
   nominatives). Une extraction naïve les uniformiserait de force. Le lot reste ouvert mais demande
   d'abord de nommer ce qui est réellement commun — vraisemblablement la seule dérivation
   `summary → {deliveredCount, readCount, recipientCount, deliveredToAllAt, readByAllAt}`.
3. **`TranslationStatus` (interface locale de `messaging.ts`) n'a plus aucun référent in-repo** après
   le retrait de `MessageResponseMetadata`. Gardée délibérément : c'est un type PUBLIC du package
   partagé, et un type exporté sans consommateur interne n'est pas du code mort au même titre qu'un
   champ. À trancher si le cycle 105 fait une passe sur la surface publique de `@meeshy/shared`.
4. **L'audit d'adressage promis au cycle 102 n'a toujours PAS été mené** : `MeeshyShareExtension`
   (`ShareSender`), `MeeshyWidgets`, et tout appel Android hors `MessageApi` restent à confronter à
   la table de routage réelle. Reconduit pour la troisième fois.

# Tête instruite pour le cycle 104 — trois champs, un seul défaut, DEUX gestes opposés

*Le cycle 103 a ouvert le lot que ses deux prédécesseurs lui avaient légué : les colonnes de statut
dénormalisées de `Message`. Il a trouvé sous la note ce que la note ne pouvait pas voir — que les
trois champs qu'elle rassemblait ne se traitaient pas du même geste.*

> ## La leçon qui doit ouvrir chaque cycle, parce qu'elle a échoué TROIS fois (132, 137, 142)
>
> ```bash
> git fetch origin main && git log --oneline -5 origin/main
> ```
>
> **Avant chaque `Write`/`Edit` de production, et de toute façon si plus de ~15 min ont passé
> depuis le dernier fetch.** Le cycle 102 en a fait la démonstration en direct (deux lots livrés
> en parallèle sur les MÊMES fichiers). Le cycle 103 a repris le réflexe : le fetch posé avant les
> premières éditions de production a ramené **#2932**, livré pendant l'audit.
> Corollaire du cycle 91 (leçon 143) : **avant de jeter — ou d'imposer — un travail doublonné,
> comparer la COUVERTURE, pas l'intitulé.**

> ## La leçon que le cycle 103 ajoute — le huitième membre de la famille
>
> Le cycle 96 : *un commentaire qui NOMME un suivi est une promesse.*
> Le cycle 97 : *un commentaire qui JUSTIFIE un geste destructeur est une PRÉMISSE périssable.*
> Le cycle 98 : *un CURSEUR est une promesse de couverture, et rien ne la vérifie.*
> Le cycle 99 : *un champ de pagination PARTAGÉ porte le contrat du mode qui l'a créé.*
> Le cycle 100 : *un champ SANS ÉCRIVAIN ne reste pas neutre : il se DIVERGE.*
> Le cycle 101 : *une règle posée sur le chemin CHAUD n'est tenue que par les chemins qui la RELISENT.*
> Le cycle 102 : *un appel réseau écrit à la main n'est confronté à la table de routage de PERSONNE.*
> Le cycle 103 trouve le huitième :
>
> **Zéro écrivain n'implique pas zéro lecteur, et c'est le LECTEUR qui décide du geste. Des champs
> que la déclaration rassemble — même bloc, même commentaire, même défaut d'écriture — peuvent
> exiger deux gestes opposés : le retrait pour celui que personne ne décode, le CALCUL pour celui
> dont trois clients lisent la valeur. Trier sur la déclaration, c'est casser des décodeurs pour
> supprimer un défaut qui se répare.**
>
> Et le symptôme qui va avec : un champ mort à l'écriture mais LU ne casse pas ses lecteurs — il les
> fait tourner à vide. `if readByAllAt != nil || readCount >= recipientCount` : la première moitié
> n'était plus jamais vraie depuis le passage aux curseurs, et rien ne l'a signalé parce que la
> seconde couvrait tous les cas.
>
> **La méthode qui en découle :** devant un groupe de champs morts, ne pas décider par lot. Faire la
> COLONNE « lecteurs clients » avant la colonne « écrivains », plateforme par plateforme. Le lot
> livrable est le sous-ensemble qui a la même réponse dans CETTE colonne-là.

## Livré au cycle 103 — les dates du seuil « tous servis » cessent de mentir

**Le défaut.** `MessageReadStatusService.updateMessageComputedStatus` est un no-op documenté depuis
le passage aux curseurs : aucune des cinq colonnes de statut de `Message` n'a d'écrivain. Les cycles
101 et 102 avaient rebranché les COMPTEURS ; les DATES `deliveredToAllAt` / `readByAllAt` sortaient
encore de la ligne dans `GET /conversations/:id/messages` et `GET /messages/:messageId`, donc
valaient `null` en permanence — alors que les résolveurs iOS, Android et SDK traitent
`readByAllAt != null` comme la PREUVE que tous les destinataires ont lu.

**Livré** : `getConversationReadStatuses` rend aussi les deux dates, dérivées de la MÊME union
curseur/reçu figé que les compteurs (donc opt-out `showReadReceipts` retiré du numérateur comme du
dénominateur) — l'instant du DERNIER destinataire servi, `null` tant qu'il en manque un. Les deux
routes les servent de là et ne `select`ent plus AUCUNE des cinq colonnes mortes.
**`receivedByAllAt` sort entier** — Prisma, `message-types.ts`, `conversation.ts`, `api-schemas.ts`,
les deux `select` — parce qu'il est le seul des trois à n'avoir aucun lecteur nulle part.
ADR : `services/gateway/decisions.md` et `packages/shared/decisions.md` § 2026-08-13.

**Correction portée au dossier** : la note du cycle 102 affirmait que les trois champs étaient
« sans aucun écrivain ni lecteur client » et « sortent ensemble ». Faux pour deux d'entre eux —
`DeliveryStatusResolver` (iOS et Android), `MessageRecord+ToMessage` et `MessagePersistenceActor`
les décodent. La relecture du code, et non de la note, est ce qui l'a montré (méthode du cycle 102).

**Tests** : 11 neufs — 5 sur le service (dernier servi vs premier, seuil non franchi, aucun
destinataire actif, opt-out qui ne retient plus le seuil), 6 sur les deux routes. **RED prouvé sur
les 11**. **Mutation-proof** : garder le PREMIER reçu au lieu du dernier → exactement les 2 témoins
« LAST » rougissent ; retirer le seuil `count >= totalMembers` → exactement le témoin « un
destinataire manquant » rougit ; remettre les routes à lire la colonne → exactement les 4 témoins de
route rougissent. **Une garde a été RETIRÉE parce que sa mutation ne rougissait rien**
(`totalMembers > 0`, structurellement inatteignable) — cf. leçon 226.
Gate : `tsc --noEmit` gateway **propre**, suite gateway **692 suites / 17 061 tests** vertes,
`packages/shared` **52 fichiers / 1 506 tests** verts.

## Constats du cycle 103, NON traités — le lot naturel du cycle 104

1. **`deliveredCount` / `readCount` sont les deux dernières colonnes mortes de `Message`.** Même
   absence d'écrivain, mais — contrairement à `receivedByAllAt` — elles ont des lecteurs clients et
   sont DÉJÀ servies calculées par les deux routes. Leur retrait du modèle Prisma et des types
   partagés est donc un lot propre, purement déclaratif : il ne change aucune charge utile. À
   instruire avec la colonne « lecteurs » de la leçon 226, plateforme par plateforme — la valeur
   circule, seul son STOCKAGE est mort.
2. **`MessagingService.createSuccessResponse` code en dur `{recipientCount: 1, deliveredCount: 1,
   readCount: 1}`** dans `metadata.deliveryStatus` de la réponse d'envoi (`services/messaging/
   MessagingService.ts:483-487`). Ce sont des constantes, pas une mesure : un envoi dans un groupe
   de douze annonce « livré à 1 / lu par 1 » au moment même où le serveur sait compter. Consommateur
   non vérifié ce cycle — le vérifier AVANT de décider entre câbler et retirer.
3. **La projection des accusés existe en TROIS exemplaires inline** (`conversations/messages.ts`,
   `messages.ts`, `conversations/messages-advanced.ts`). Constat du cycle 102, inchangé : une
   extraction (`services/messaging/messageReceipts.ts`) avait été écrite puis retenue pour ne pas
   churner du code livré depuis moins d'une heure. **#2931 a maintenant reposé** — le lot est
   reprenable, et ce cycle vient d'ajouter deux champs à la projection, donc à la duplication.
4. **L'audit d'adressage promis au cycle 102 n'a toujours PAS été mené** : `MeeshyShareExtension`
   (`ShareSender`), `MeeshyWidgets`, et tout appel Android hors `MessageApi` restent à confronter à
   la table de routage réelle.

# Tête instruite pour le cycle 103 — un CLIENT peut appeler une route qui n'existe pas, et rien ne devient rouge

*Le cycle 102 a trouvé la septième forme de la famille. Les six premières venaient d'un producteur
SERVEUR qui recomposait sa propre vérité ; celle-ci vient d'un CONSOMMATEUR qui adresse une vérité
qu'aucun producteur ne sert.*

> ## La leçon qui doit ouvrir chaque cycle, parce qu'elle a échoué TROIS fois (132, 137, 142)
>
> ```bash
> git fetch origin main && git log --oneline -5 origin/main
> ```
>
> **Avant chaque `Write`/`Edit` de production, et de toute façon si plus de ~15 min ont passé
> depuis le dernier fetch.** Le cycle 102 en a fait la démonstration en direct : le fetch posé
> juste avant le commit a ramené **#2931**, livré en parallèle sur les MÊMES fichiers et le MÊME
> défaut. Sans ce fetch, le lot écrasait le travail d'autrui.
> Corollaire du cycle 91 (leçon 143), appliqué ici pour la première fois à chaud : **avant de
> jeter — ou d'imposer — un travail doublonné, comparer la COUVERTURE, pas l'intitulé.**

> ## La leçon que le cycle 102 ajoute — le septième membre de la famille
>
> Le cycle 96 : *un commentaire qui NOMME un suivi est une promesse.*
> Le cycle 97 : *un commentaire qui JUSTIFIE un geste destructeur est une PRÉMISSE périssable.*
> Le cycle 98 : *un CURSEUR est une promesse de couverture, et rien ne la vérifie.*
> Le cycle 99 : *un champ de pagination PARTAGÉ porte le contrat du mode qui l'a créé.*
> Le cycle 100 : *un champ SANS ÉCRIVAIN ne reste pas neutre : il se DIVERGE.*
> Le cycle 101 : *une règle posée sur le chemin CHAUD n'est tenue que par les chemins qui la RELISENT.*
> Le cycle 102 trouve le septième :
>
> **Un appel réseau écrit à la main — chaîne interpolée, méthode implicite — n'est confronté à la
> table de routage de PERSONNE. Le compilateur le valide, les tests du client ne l'atteignent pas,
> ceux du serveur ne le connaissent pas. Un couple méthode/chemin qui n'existe NULLE PART peut
> donc vivre indéfiniment en rendant 404 — et un appelant qui avale son échec en fait un silence.**
>
> `NSEDataSync.syncMessage` faisait `GET /conversations/:cid/messages/:mid` ; la gateway
> n'enregistre à ce chemin que `PUT` et `DELETE`. Le préchargement de notification n'a donc JAMAIS
> fonctionné. Et le coût réel n'était pas la latence : `NotificationService.prePersistMessage`
> saute les messages E2EE **parce que** « NSEDataSync already fetches the canonical record » — un
> saut délibéré adossé à un appel mort, donc un push chiffré ne déposait rien du tout.
>
> **La méthode qui en découle :** énumérer les appels réseau écrits à la main dans les cibles qui
> n'importent pas le SDK (extensions iOS, widgets, workers Android, scripts) et confronter chaque
> couple méthode/chemin à la table de routage réelle du gateway. Un appelant qui avale son échec
> ne dira jamais qu'il se trompe d'adresse.

## Livré au cycle 102

**`NSEDataSync.syncMessage` vise `GET /messages/:messageId`** — la lecture mono-message canonique.
Le préchargement de notification existe pour la première fois, et un push E2EE dépose enfin quelque
chose. La branche E2EE de `prePersistMessage` porte l'avertissement qui manquait.
ADR : `services/gateway/decisions.md` § 2026-08-13.

**Tests** : 4 neufs au niveau HTTP (`message-detail-read-receipts.test.ts`, harness Fastify réel +
double Prisma nourrissant le **VRAI** `MessageReadStatusService`) figeant le contrat SERVEUR dont
le repointage dépend : `GET /messages/:messageId` sert des compteurs calculés et respecte l'opt-out
`showReadReceipts`. La couverture existante de cette route (`messages.test.ts`) DOUBLE le service
et ne peut donc pas voir l'opt-out.

### Convergence — DEUX fois dans le même cycle, sur deux chantiers distincts

**C'est le fait marquant du cycle 102**, plus encore que le défaut trouvé. Deux sessions
parallèles ont livré, pendant que celle-ci travaillait, exactement ce qu'elle était en train
d'écrire — une fois sur le lot d'accusés (#2931), une fois sur le correctif de compile Swift 6
(#2929). Les deux fois, la comparaison de COUVERTURE a fait abandonner le travail local.

**Ce qui a rendu les deux abandons possibles : le `git fetch origin main` posé AVANT le commit.**
Sans lui, les deux lots écrasaient le travail d'autrui. La leçon d'ouverture n'est pas une
formalité — elle a payé deux fois en une seule session.

#### Convergence 2 — #2929 (correctif de compile `MeeshyVideoWatermarkBaker`)

Le gate iOS était rouge sur `main` (`error: sending 'request' risks causing data races`, 25×).
Ce cycle l'a diagnostiqué et corrigé en deux poussées (c5c3cdc puis c6c32d2) — puis a trouvé
#2929 déjà mergé sur le même défaut. Couverture comparée :

| Point | #2929 (sur `main`) | Ce lot (abandonné) |
|---|---|---|
| Marquage du peintre | **membre par membre** (`paint`, `tile`, `renderOnMain`, `init`) + `nonisolated(unsafe)` sur les stockées mutables | `nonisolated` sur la CLASSE |
| `animationFPS` | oui | oui (2ᵉ poussée) |
| `orientedSize` / `sizesMatch` | **oui** (les tests les appellent hors MainActor) | non |
| `MeeshyAudioSignature` | **oui** — 3ᵉ site, jamais examiné ici | non |

**#2929 gagne nettement.** Le marquage au niveau CLASSE ne couvre pas les propriétés stockées
mutables — leur `nonisolated(unsafe)` explicite indique que la variante locale aurait rouge au
tour suivant. Le lot local a donc été retiré de la branche par `reset` + `cherry-pick` du seul
commit NSE.

#### Convergence 1 — #2931 (les routes servant les colonnes mortes)

Le cycle 102 avait aussi instruit et implémenté le lot que le cycle 101 lui avait légué (les deux
routes servant les colonnes mortes, la fuite d'`entries` sans opt-out). Le fetch posé avant le
commit a révélé **#2931**, livré en parallèle sur exactement ce défaut. Comparaison de COUVERTURE,
pas d'intitulé :

| Point | #2931 (sur `main`) | Ce lot (abandonné) |
|---|---|---|
| `/messages/:messageId` délègue | oui, + `recipientCount` | idem |
| `/conversations/:id/status` | **réparé** (opt-out sur `entries` via `filterReadReceiptVisible`, plafond 50) | **retiré** |
| Projection partagée | inline ×3 | extraite dans `messageReceipts.ts` |

**#2931 gagne sur le point décisif** : réparer la route préserve une API publique là où la retirer
la casse, et son plafond de 50 ferme en plus un déni de service que le retrait ne traitait pas. Le
lot local a donc été ABANDONNÉ plutôt qu'imposé — écraser le travail d'un autre pour un intitulé
équivalent est exactement ce que la leçon 143 interdit. Les 4 témoins écrits AVANT #2931 étaient
RED sur l'ancien code et passent sur le sien sans retouche : confirmation indépendante, conservée.

## Constats du cycle 102, NON traités — le lot naturel du cycle 103

- **L'audit d'adressage promis par la leçon ci-dessus n'a PAS été mené.** Seuls les trois endpoints
  de `NSEDataSync` ont été confrontés à la table de routage (`/posts/:postId` ✓,
  `…/delivery-receipt` ✓, le troisième était le défaut). Restent à passer au même crible :
  `MeeshyShareExtension` (`ShareSender` poste `/conversations/:id/messages`), `MeeshyWidgets`,
  et tout appel Android hors `MessageApi`.
- **`NSEDataSync` n'appartient à aucune cible de test** : l'endpoint corrigé n'est gardé que par le
  build CI. Le motif de la double appartenance existe (`NSEDecryptor`, helpers de
  `MeeshyShareExtension`) mais le fichier utilise `URLSession.shared` sans injection — le rendre
  testable est un lot de refactorisation à part.
- **La projection des accusés existe désormais en TROIS exemplaires inline** (`conversations/messages.ts`,
  `messages.ts`, `conversations/messages-advanced.ts`) : `receivedCount → deliveredCount`,
  `totalMembers → recipientCount`. C'est le motif du cycle 101 à l'état naissant. Une extraction
  (`services/messaging/messageReceipts.ts`) était écrite et testée dans ce cycle ; elle a été
  retenue pour ne pas churner du code livré depuis moins d'une heure par une session concurrente.
  **À reprendre à froid**, quand #2931 aura reposé.
- **`deliveredToAllAt` / `receivedByAllAt` / `readByAllAt`** restent déclarés (Prisma, deux types
  partagés, schéma OpenAPI) et sans aucun écrivain ni lecteur client. Cas du cycle 100 à l'état
  pur ; ils sortent ensemble, avec leurs déclarations, ou pas du tout.

## Ce qui reste ouvert des cycles précédents (inchangé au cycle 102)

- **Item 1 (rétention des posts supprimés) : toujours à poser à un humain, pas à réessayer.** Refus
  motivé aux cycles 98, 99 et 100.
- **L'index MongoDB `expiresAt_ephemeral_partial` n'est toujours pas appliqué** (cycle 92) —
  COLLSCAN par minute sur `Message`. Demande un accès de déploiement que la routine n'a pas.
- **Les 242 « source guards » iOS** (tête du cycle 86) : aucune toolchain Swift ici, inchangé des
  cycles 86 à 102.
- La porte `actions: write` reste close (cycle 82) : pas de `workflow_dispatch` à la demande.
- **La SUPPRESSION de branche distante est refusée en 403** (cycle 91) : les `push` passent, le
  `push --delete` non. Purger depuis un contexte qui a le droit (`tasks/branch-purge-*.sh`).
- Le couple de mesure PR↔`dev` sur la même lignée de clés DerivedData (cycle 84, item 2) n'existe
  toujours pas.
- **`UploadProcessor.test.ts` › `should upload a valid file successfully` est flaky sous charge**
  (cycle 87). Non reproduit aux cycles 88 à 102.
- Le mode `around` de `GET /conversations/:id/messages` lit `limit + 1` sans jamais retirer de ligne
  sonde (cycle 99) — inoffensif aujourd'hui, piège si la fenêtre s'élargit.
- `callParticipantStatusEnum` (`utils/validation.ts`) survit sans lecteur et décrit un espace
  d'états que `CallParticipant` ne porte pas (cycle 100).

# Tête instruite pour le cycle 103 — un compteur se tait, un NOM se tait deux fois

*Le cycle 102 a exécuté le lot que le cycle 101 avait instruit et refusé de livrer dans le même
passage. En l'ouvrant, il a trouvé sous le défaut annoncé (un résumé lu de colonnes mortes) deux
défauts que l'instruction n'avait pas vus : la fuite y était NOMINATIVE, et la requête n'avait
aucune borne.*

> ## La leçon qui doit ouvrir chaque cycle, parce qu'elle a échoué TROIS fois (132, 137, 142)
>
> ```bash
> git fetch origin main && git log --oneline -5 origin/main
> ```
>
> **Avant chaque `Write`/`Edit` de production, et de toute façon si plus de ~15 min ont passé
> depuis le dernier fetch. Un bloc de trois correctifs, ce sont TROIS fetchs.** Deux secondes
> contre une heure. Détail et les deux motifs techniques rescapés : leçon 142.
> Corollaire du cycle 91 (leçon 143) : **avant de jeter un travail doublonné, comparer la
> COUVERTURE, pas l'intitulé.**

> ## La leçon que le cycle 102 ajoute — le septième membre de la famille
>
> Le cycle 96 : *un commentaire qui NOMME un suivi est une promesse.*
> Le cycle 97 : *un commentaire qui JUSTIFIE un geste destructeur est une PRÉMISSE périssable.*
> Le cycle 98 : *un CURSEUR est une promesse de couverture, et rien ne la vérifie.*
> Le cycle 99 : *un champ de pagination PARTAGÉ porte le contrat du mode qui l'a créé.*
> Le cycle 100 : *un champ SANS ÉCRIVAIN ne reste pas neutre : il se DIVERGE.*
> Le cycle 101 : *un gate posé sur le chemin CHAUD n'est tenu que par les chemins qui le RELISENT.*
> Le cycle 102 trouve le septième :
>
> **Un constat reporté est une hypothèse, pas un inventaire. Le cycle qui l'ouvre doit RELIRE le
> code, pas croire sa propre note — le défaut annoncé est rarement le seul, et rarement le pire.**
>
> Le cycle 101 avait consigné : « ces deux routes servent leur résumé depuis les colonnes mortes,
> donc `{0, 0, null, null}` ». Exact, et incomplet sur deux points que seule la relecture donne :
> (1) les `entries` de `GET /conversations/:id/status` exposaient `readAt` **avec l'identité** —
> `displayName`, `avatar`, `username` — sans aucun filtre `showReadReceipts`, une fuite d'une autre
> NATURE que le compteur fermé au cycle 101 ; (2) sa requête n'avait **aucun `take`** — chaque
> message non supprimé de la conversation, chacun avec ses entrées de statut et le participant
> joint sur chacune. Un déni de service qu'un participant ordinaire déclenchait, et que la note du
> cycle 101 ne mentionnait pas parce qu'elle regardait la valeur servie, pas la requête qui la
> produit.
>
> **La méthode qui en découle :** rouvrir un constat reporté, c'est rouvrir le HANDLER ENTIER —
> sa requête, ses jointures, ses bornes, ce qu'il expose — et non seulement la ligne que la note
> désignait. Une note de suivi oriente le regard ; elle ne le remplace pas.

## Livré au cycle 102 — les deux dernières surfaces d'accusés rejoignent la source de vérité

**Le défaut, en trois couches.** `GET /conversations/:id/status` (a) servait un `summary` lu de
colonnes sans écrivain, donc toujours `{0, 0, null, null}`, **à côté** d'`entries` portant les
vraies dates — une charge utile qui se contredisait elle-même ; (b) exposait ces `entries`
NOMINATIVES sans le gate `showReadReceipts` que les cinq autres lecteurs posent ; (c) chargeait la
conversation ENTIÈRE, sans `take`, chaque message avec ses entrées et le participant joint sur
chacune. `GET /messages/:messageId` partageait le défaut (a), au niveau de `statusSummary` **et**
de ses champs de premier niveau, ceux que les trois clients décodent pour leurs coches.

**Livré** : les deux routes délèguent à `getConversationReadStatuses` ; nouvelle méthode publique
`MessageReadStatusService.filterReadReceiptVisible(participants)` (le cœur `_loadReadReceiptOptOuts`
reste privé) par laquelle `/status` filtre ses `entries` ; plafond
`CONVERSATION_STATUS_PAGE_SIZE = 50`. ADR : `services/gateway/decisions.md` § 2026-08-13 (2ᵉ entrée).

**Tests** : 8 nouveaux, **RED prouvé sur 7** — le résumé rendait `99` (la colonne stubbée à une
valeur impossible), le participant opt-out figurait dans `entries` avec son nom et sa date, et
`findMany` n'avait pas de `take`. Deux tests PRÉEXISTANTS ont été repointés : ils figeaient
`deliveredCount: 3` / `deliveredCount: 1`, c'est-à-dire des valeurs que la production ne produit
jamais — ils verrouillaient le comportement du double, pas celui de la route. **Mutation-proof** :
retrait du `.filter(visibleParticipantIds)` → exactement le test de fuite rougit ; retrait du
`take` → exactement le test de borne rougit. Gate : `tsc --noEmit` gateway **propre**, suite
gateway complète **691 suites / 17 046 tests** vertes.

**Robustesse rencontrée en chemin** : le premier câblage de `/messages/:messageId` utilisait
`.catch()` sur la promesse du service. Un jet SYNCHRONE (méthode absente sur un double, demain une
erreur de construction) le traversait et rendait un **500** sur la route entière. Remplacé par un
`try/catch` : le résumé est un ENRICHISSEMENT, son échec ne doit jamais emporter le contenu demandé.

## Constats du cycle 102, NON traités — le lot naturel du cycle 103

1. **`GET /conversations/:id/status` n'a AUCUN consommateur** — vérifié par grep sur `apps/web`,
   `apps/ios`, `apps/android` et `packages/MeeshySDK`. Sa fonction est rendue, correctement et
   paginée, par `GET /messages/:messageId/status-details`. Le cycle 102 l'a RÉPARÉ plutôt que
   retiré, délibérément : supprimer un endpoint d'une API publiée est une décision produit
   irréversible, du genre de celles que cette routine confie à un humain. **La question mérite
   d'être posée** — la réparation ne la referme pas.
2. **`receivedByAllAt`** reste déclaré (Prisma, deux types partagés, schéma OpenAPI), `select`é et
   relayé par trois routes, **sans écrivain ni lecteur** — aucun client des trois plateformes ne le
   décode. Cas du cycle 100 à l'état pur ; il sort entier, avec ses déclarations, ou pas du tout.
   Ses voisins `deliveredToAllAt` / `readByAllAt` sont dans le même cas côté ÉCRITURE mais, eux,
   sont décodés par iOS et Android — ils ne se valent pas et ne doivent pas être retirés du même
   geste.

## Ce qui reste ouvert des cycles précédents (inchangé au cycle 102)

- **Item 1 (rétention des posts supprimés) : toujours à poser à un humain, pas à réessayer.**
- **L'index MongoDB `expiresAt_ephemeral_partial` n'est toujours pas appliqué** (cycle 92) —
  COLLSCAN par minute sur `Message`. Demande un accès de déploiement que la routine n'a pas.
- **Les 242 « source guards » iOS** (tête du cycle 86) : aucune toolchain Swift ici.
- La porte `actions: write` reste close (cycle 82) : pas de `workflow_dispatch` à la demande.
- **La SUPPRESSION de branche distante est refusée en 403** (cycle 91) — re-confirmé au cycle 101,
  `claude/keen-hamilton-zphlmj` survit à son merge. Purger depuis un contexte qui a le droit.
- Le couple de mesure PR↔`dev` sur la même lignée de clés DerivedData (cycle 84) n'existe toujours pas.
- **`UploadProcessor.test.ts` › `should upload a valid file successfully` est flaky sous charge**
  (cycle 87). Non reproduit aux cycles 88 à 102.
- Le mode `around` de `GET /conversations/:id/messages` lit `limit + 1` sans jamais retirer de ligne
  sonde (cycle 99).
- `callParticipantStatusEnum` (`utils/validation.ts`) survit sans lecteur (cycle 100).

# Tête instruite pour le cycle 102 — le gate posé à l'ÉMISSION ne vaut que si le RATTRAPAGE le tient

*Le cycle 101 a porté la méthode du cycle 100 (« compter les ÉCRIVAINS d'un champ avant ses
lecteurs ») d'un cran plus loin : quand un champ mort a des lecteurs qui le CONTOURNENT, chaque
contournement est une réimplémentation — et les réimplémentations divergent sur ce qu'aucun test ne
confronte.*

> ## La leçon qui doit ouvrir chaque cycle, parce qu'elle a échoué TROIS fois (132, 137, 142)
>
> ```bash
> git fetch origin main && git log --oneline -5 origin/main
> ```
>
> **Avant chaque `Write`/`Edit` de production, et de toute façon si plus de ~15 min ont passé
> depuis le dernier fetch. Un bloc de trois correctifs, ce sont TROIS fetchs.** Deux secondes
> contre une heure. Détail et les deux motifs techniques rescapés : leçon 142.
> Corollaire du cycle 91 (leçon 143) : **avant de jeter un travail doublonné, comparer la
> COUVERTURE, pas l'intitulé.**

> ## La leçon que le cycle 101 ajoute — le sixième membre de la famille
>
> Le cycle 96 : *un commentaire qui NOMME un suivi est une promesse.*
> Le cycle 97 : *un commentaire qui JUSTIFIE un geste destructeur est une PRÉMISSE périssable.*
> Le cycle 98 : *un CURSEUR est une promesse de couverture, et rien ne la vérifie.*
> Le cycle 99 : *un champ de pagination PARTAGÉ porte le contrat du mode qui l'a créé.*
> Le cycle 100 : *un champ SANS ÉCRIVAIN ne reste pas neutre : il se DIVERGE.*
> Le cycle 101 trouve le sixième :
>
> **Une règle de confidentialité posée sur le chemin CHAUD (l'émission) n'est tenue que par les
> chemins qui la relisent. Le chemin de RATTRAPAGE — celui qui rejoue la même vérité après coup —
> est écrit par quelqu'un d'autre, un autre jour, et il ne la relit pas. Il n'a même pas besoin de
> la contredire : il lui suffit de recompter.**
>
> `showReadReceipts` était gaté à l'émission (`message-read-status.ts` suspend le broadcast) et
> tenu par les QUATRE lecteurs de `MessageReadStatusService`, chacun portant le commentaire
> explicite « filtré EN AMONT, donc absent du numérateur comme du dénominateur ». Le CINQUIÈME
> producteur du même résumé — une copie inline dans `GET /conversations/:id/messages` — reproduisait
> l'union curseur/reçu figé, la borne `createdAt`, l'exclusion de l'expéditeur, et **pas la
> préférence**. L'expéditeur ne voyait rien passer en direct, relançait l'application, et lisait sa
> coche bleue.
>
> **La méthode qui en découle :** quand une règle de confidentialité est trouvée sur un chemin,
> énumérer les AUTRES chemins qui servent la même donnée — en particulier le rattrapage REST, qui
> existe pour rejouer ce que le temps réel a manqué — et vérifier que chacun la RELIT plutôt que de
> la recalculer. Un gate ne se prouve pas sur son site de pose ; il se prouve sur le dernier chemin
> qui sert la donnée.

## Livré au cycle 101 — le rattrapage REST cesse de recompter les accusés à sa façon

**Le défaut.** `GET /conversations/:id/messages` — lu à chaque démarrage à froid et à chaque
remontée de fil — tenait une copie inline (≈70 lignes) de
`MessageReadStatusService.getConversationReadStatuses`. Copie fidèle sur tout sauf un point :
l'opt-out `showReadReceipts` n'y était jamais consulté. Double conséquence, toutes deux visibles :
la lecture d'un destinataire qui l'avait explicitement tue ressortait dans `readCount` (fuite de
métadonnée, PHASE 10), et `recipientCount` comptait ce destinataire que le socket en retire — donc
« lu par tous » basculait ou non selon le chemin par lequel la vérité arrivait (deux vérités pour un
même message, PHASE 2).

**Livré** : la route délègue ; `computeRecipientCount` descend du module de route vers
`utils/read-exactness.ts` et devient l'unique formule du dénominateur, employée par le service ; les
quatre lectures indépendantes de `getConversationReadStatuses` passent séquentiel → `Promise.all`
(la délégation coûte donc DEUX allers-retours, pas cinq) ; le repli `?? message.deliveredCount` sort
du mapping de réponse — un champ sans écrivain ne doit pas se présenter comme valeur de secours.
ADR : `services/gateway/decisions.md` § 2026-08-13.

**Tests** : 4 nouveaux au niveau HTTP
(`messages-list-read-receipt-optout.test.ts`, harness Fastify réel + double Prisma), **RED prouvé
sur 3** — la route rendait 2/2/2 quel que soit l'opt-out, le 4ᵉ (« personne ne s'est retiré »)
passait avant comme après et atteste la fidélité du harness. Trois tests de
`messages-routes.test.ts` qui vérifiaient l'ARITHMÉTIQUE inline (désormais couverte par
`MessageReadStatusService.test.ts` › `getConversationReadStatuses`) ont été repointés sur le
contrat de DÉLÉGATION : l'identifiant résolu est bien celui passé au service, le mapping
`receivedCount→deliveredCount` / `totalMembers→recipientCount` est verrouillé par trois valeurs
distinctes (une permutation ne peut pas passer), et l'échec du service laisse la page servie.
**Mutation-proof** : permutation `receivedCount`/`readCount` dans le mapping → exactement le test de
mapping rougit. Gate : `tsc --noEmit` gateway propre, suite gateway complète **691 suites / 17 038
tests** vertes.

## Constats du cycle 101, NON traités — le lot naturel du cycle 102

`GET /conversations/:id/status` (`routes/conversations/messages-advanced.ts`) et
`GET /messages/:messageId` (`routes/messages.ts`) servent leur résumé d'accusés DEPUIS les colonnes
mortes `deliveredCount` / `readCount` / `deliveredToAllAt` / `readByAllAt` : toujours
`{0, 0, null, null}`. Le premier se contredit **dans la même charge utile** — il expose à côté les
`entries` per-participant avec leurs `readAt` RÉELS, et **sans aucun filtre d'opt-out**, ce qui en
fait une fuite plus directe que celle fermée ici (des horodatages nominatifs, pas un compteur).
`getMessageStatusDetails` fait déjà exactement ce travail, opt-out compris. Aucun client connu
n'appelle ces deux routes — d'où le report, pas l'indulgence.

Troisième constat, plus petit : `receivedByAllAt` est déclaré (Prisma, deux types partagés, schéma
OpenAPI), `select`é et relayé par trois routes, et **n'a ni écrivain ni lecteur** — aucun client des
trois plateformes ne le décode. C'est le cas du cycle 100 à l'état pur ; il sort entier, avec ses
déclarations, ou pas du tout.

## Ce qui reste ouvert des cycles précédents (inchangé au cycle 101)

- **Item 1 (rétention des posts supprimés) : toujours à poser à un humain, pas à réessayer.** Refus
  motivé aux cycles 98, 99 et 100.
- **L'index MongoDB `expiresAt_ephemeral_partial` n'est toujours pas appliqué** (cycle 92) —
  COLLSCAN par minute sur `Message`. Demande un accès de déploiement que la routine n'a pas.
- **Les 242 « source guards » iOS** (tête du cycle 86) : aucune toolchain Swift ici, inchangé des
  cycles 86 à 101.
- La porte `actions: write` reste close (cycle 82) : pas de `workflow_dispatch` à la demande.
- **La SUPPRESSION de branche distante est refusée en 403** (cycle 91) : les `push` passent, le
  `push --delete` non. Purger depuis un contexte qui a le droit (`tasks/branch-purge-*.sh`).
- Le couple de mesure PR↔`dev` sur la même lignée de clés DerivedData (cycle 84, item 2) n'existe
  toujours pas.
- **`UploadProcessor.test.ts` › `should upload a valid file successfully` est flaky sous charge**
  (cycle 87). Non reproduit aux cycles 88 à 101.
- Le mode `around` de `GET /conversations/:id/messages` lit `limit + 1` sans jamais retirer de ligne
  sonde (cycle 99) — inoffensif aujourd'hui, piège si la fenêtre s'élargit.
- `callParticipantStatusEnum` (`utils/validation.ts`) survit sans lecteur et décrit un espace
  d'états que `CallParticipant` ne porte pas (cycle 100).

# Tête instruite pour le cycle 101 — un champ que PERSONNE n'écrit reste un contrat que TOUT LE MONDE lit

*Le cycle 100 a exécuté, en un seul passage, le lot que le cycle 99 avait entièrement instruit mais
refusé de livrer faute de pouvoir prouver l'innocuité côté clients. La preuve manquante a été
produite autrement que par la compilation — et c'est la méthode que ce cycle lègue.*

> ## La leçon qui doit ouvrir chaque cycle, parce qu'elle a échoué TROIS fois (132, 137, 142)
>
> ```bash
> git fetch origin main && git log --oneline -5 origin/main
> ```
>
> **Avant chaque `Write`/`Edit` de production, et de toute façon si plus de ~15 min ont passé
> depuis le dernier fetch. Un bloc de trois correctifs, ce sont TROIS fetchs.** Deux secondes
> contre une heure. Détail et les deux motifs techniques rescapés : leçon 142.
> Corollaire du cycle 91 (leçon 143) : **avant de jeter un travail doublonné, comparer la
> COUVERTURE, pas l'intitulé.**

> ## La leçon que le cycle 100 ajoute — le cinquième membre de la famille
>
> Le cycle 96 : *un commentaire qui NOMME un suivi est une promesse.*
> Le cycle 97 : *un commentaire qui JUSTIFIE un geste destructeur est une PRÉMISSE périssable.*
> Le cycle 98 : *un CURSEUR est une promesse de couverture, et rien ne la vérifie.*
> Le cycle 99 : *un champ de pagination PARTAGÉ porte le contrat du mode qui l'a créé.*
> Le cycle 100 trouve le cinquième :
>
> **Un champ SANS ÉCRIVAIN ne reste pas neutre : il se DIVERGE. Chaque couche qui le redéclare
> le fait depuis sa propre intuition, et rien ne les confronte jamais — parce qu'aucune donnée
> réelle ne traverse la chaîne pour les mettre en contradiction.**
>
> `CallParticipant.connectionQuality` était déclaré **quatre fois, de quatre façons mutuellement
> incompatibles** — `Json?` (Prisma), une interface objet `{ latency, packetLoss, bandwidth }`
> (type partagé), `z.number()` (Zod), `{ type: 'number', 0-100 }` (OpenAPI) — et les fixtures de
> test en portaient une **cinquième**, une CHAÎNE (`'good'`). Ces cinq formes ont coexisté sans
> qu'aucun test ne tombe, précisément parce que **rien ne l'écrivait** : la valeur était toujours
> `null`, et `null` satisfait les cinq. Un champ mort n'est pas de la dette dormante, c'est de la
> dette qui **se ramifie** — chaque nouvelle couche ajoute une déclaration de plus, jamais une
> vérification.
>
> **La méthode qui en découle :** quand un champ paraît suspect, compter ses ÉCRIVAINS avant ses
> lecteurs. Zéro écrivain ⇒ énumérer toutes ses DÉCLARATIONS (Prisma, types, Zod, OpenAPI,
> fixtures) et les comparer entre elles. Leur divergence est la mesure du temps pendant lequel
> personne n'a rien fait passer dedans.

## Livré au cycle 100 — `CallParticipant` cesse de décrire une qualité que personne ne mesure

**Le défaut.** Zéro écrivain (aucun des 12 sites `callParticipant.{create,update,updateMany}` du
gateway ne pose le champ), TROIS émissions socket qui le relayaient donc à `null` à tout client,
toujours — deux `call:initiated` (rejeu `call:check-active` et initiation) et
`call:participant-joined`, toutes trois sous un double cast `as unknown as ConnectionQuality | null`
qui masquait que la forme Json n'avait jamais été validée. ZÉRO consommateur : les trois clients
calculent leur qualité LOCALEMENT depuis leur propre pile WebRTC (iOS `PeerConnectionState`,
Android `ConnectionQuality.from(sample.level())`, web `ConnectionQualityLevel`) — trois types
distincts, aucun n'étant celui du serveur.

**Retiré** : le champ du modèle Prisma, du type partagé `CallParticipant`, l'interface
`ConnectionQuality` devenue orpheline, les trois émissions et l'import correspondant. **Lot joint**,
comme le cycle 99 l'avait prescrit (« ils sortent entiers, pas champ par champ ») :
`CallParticipantSchemas` (Zod) et `callParticipantSchema` (OpenAPI), sans aucune référence dans le
dépôt, et qui déclaraient en outre `status`, `duration`, `isMuted`, `isVideoOff` — **quatre champs
absents du modèle Prisma**. Deux descriptions entières d'une entité qui n'a jamais existé.

**Pourquoi RETIRER et non CÂBLER** (argument à ne pas rejouer) : le signal existe déjà et circule
en temps réel. `call:quality-report` porte `rtt`, `packetLoss`, `level` par participant, et sur
dégradation soutenue le handler émet `call:quality-alert` par participant aux pairs. Persister le
même signal coûterait jusqu'à **30 écritures/min/participant** (plafond
`SOCKET_RATE_LIMITS.CALL_QUALITY_REPORT`) sur le chemin CHAUD de l'appel, dans une ligne que
personne ne lit. La qualité de connexion est ÉPHÉMÈRE : sa place est le canal transitoire qui
existe. ADR consigné : `packages/shared/decisions.md` § 2026-08.

**Tests** : 4 (`CallEventsHandler.test.ts`, describe « la qualité de connexion n'est pas un champ
serveur »), **RED prouvé sur 3** (les trois émissions rendaient `'good'`) ; la 4ᵉ ancre le
comportement CONSERVÉ (l'état média et l'identité du participant restent portés). Gate :
`tsc --noEmit` gateway **propre**, suite gateway complète verte, `packages/shared` **1 506 tests /
52 fichiers** verts, build shared propre, client Prisma régénéré sans le champ.

### La méthode que ce cycle lègue vraiment — prouver une non-régression quand le typage est ÉTEINT

Le cycle 99 avait refusé ce lot pour une raison honnête : la suppression touche `packages/shared`,
donc la surface de compilation du web et du SDK, or `tsc --noEmit` sur `apps/web` rend un mur de
diagnostics pré-existants — **le signal y est éteint**, et aucune toolchain Swift n'existe ici.
« Très probablement nul » n'était pas la barre.

**La barre a été franchie sans réparer le signal, en le DIFFÉRENÇANT.** `tsc --noEmit` a été exécuté
sur `apps/web` **deux fois** — une fois avec le lot appliqué, une fois sur la base restaurée par
`git stash` (avec, à chaque fois, `prisma generate` + `bun run build` de `packages/shared`, sans
quoi la comparaison porterait sur un `dist` qui ne correspond à aucune des deux versions) — et les
deux sorties ont été comparées ligne à ligne. **1 760 diagnostics des deux côtés, mêmes sites.** Les
seules différences sont **cinq** messages où TypeScript énumère les membres d'une union dans un
ordre différent d'une exécution à l'autre (`"USER" | "ADMIN" | …` vs `"BIGBOSS" | "ADMIN" | …`) —
du bruit d'affichage, aucun diagnostic ajouté ni retiré.

**À réutiliser tel quel** : un compteur de diagnostics pré-existants n'interdit pas de prouver une
non-régression de typage ; il interdit seulement de la prouver par un vert. Le DIFF de deux sorties
bruitées est une preuve, à trois conditions — reconstruire les dépendances des deux côtés,
comparer les sites et non le total, et savoir que l'ordre des unions est instable.

**Côté Swift, aucune compilation n'était nécessaire ici**, et c'est vérifiable : le grep du champ
sur tout le dépôt montre que `packages/MeeshySDK` ne le déclare NULLE PART. Le modèle `CallParticipant`
du SDK ne l'a jamais décodé — le serveur émettait un champ que le décodeur Swift ignorait déjà.

**Réserve d'honnêteté** : les 1 760 diagnostics web relevés ici ne recoupent pas les « 1 224, tous
dans `__tests__` » consignés au cycle 99 — le chiffre a monté et déborde désormais hors des tests.
Ce cycle n'a **pas** instruit d'où vient l'écart (dérive du dépôt depuis le cycle 99, ou artefact
d'un conteneur neuf où `bun install` a dû tourner en `--ignore-scripts`, le postinstall de
`grpc-tools` échouant à télécharger son binaire à travers le proxy). Les deux mesures de CE cycle
sont prises dans le MÊME environnement, ce qui suffit au diff ; mais **le chiffre absolu n'est pas
comparable d'un cycle à l'autre** et personne ne devrait le traiter comme un indicateur de santé.

## Constat annexe du cycle 100, NON traité

`callParticipantStatusEnum` (`utils/validation.ts`) survit à la sortie de `CallParticipantSchemas` :
son unique usage restant est son propre alias `VCallParticipantStatus`, lui-même sans lecteur. Il
énumère `invited | ringing | connected | disconnected | declined` — **un espace d'états que le modèle
Prisma `CallParticipant` ne porte pas** (il n'a aucun champ `status`). C'est le même défaut que celui
fermé ici, en plus petit. Laissé en place **délibérément** : il n'était pas dans le lot instruit, et
l'impact minimal prime. Son voisin `callParticipantRoleEnum` est dans le même cas mais décrit, lui,
un champ RÉEL (`role`) — les deux ne se valent pas et ne doivent pas être retirés du même geste.

## Ce qui reste ouvert des cycles précédents (inchangé au cycle 100)

- **Item 1 (rétention des posts supprimés) : toujours à poser à un humain, pas à réessayer.** Refus
  motivé aux cycles 98 et 99, confirmé ici (geste irréversible hors dépôt ; `N` est une décision
  produit).
- **L'index MongoDB `expiresAt_ephemeral_partial` n'est toujours pas appliqué** (cycle 92) —
  COLLSCAN par minute sur `Message`. Demande un accès de déploiement que la routine n'a pas.
- **Les 242 « source guards » iOS** (tête du cycle 86) : aucune toolchain Swift ici, inchangé des
  cycles 86 à 100.
- La porte `actions: write` reste close (cycle 82) : pas de `workflow_dispatch` à la demande.
- **La SUPPRESSION de branche distante est refusée en 403** (cycle 91) : les `push` passent, le
  `push --delete` non. Purger depuis un contexte qui a le droit (`tasks/branch-purge-*.sh`).
- Le couple de mesure PR↔`dev` sur la même lignée de clés DerivedData (cycle 84, item 2) n'existe
  toujours pas.
- **`UploadProcessor.test.ts` › `should upload a valid file successfully` est flaky sous charge**
  (cycle 87). Non reproduit aux cycles 88 à 100.
- Le mode `around` de `GET /conversations/:id/messages` lit `limit + 1` sans jamais retirer de ligne
  sonde (cycle 99) — inoffensif aujourd'hui, piège si la fenêtre s'élargit.

# Tête instruite pour le cycle 100 — le curseur qui pointait dans le mauvais SENS

*Le cycle 99 a porté la méthode du cycle 98 (« un CURSEUR est une promesse de couverture ») de
`/sync`, endpoint pilote SANS consommateur, vers le seul chemin de rattrapage local-first qui en a
un en production : `GET /conversations/:id/messages?after=`. Le défaut y était d'une autre nature —
non pas un curseur trop AVANCÉ, mais un curseur qui pointait dans le SENS INVERSE de la page qu'il
prétendait continuer.*

> ## La leçon qui doit ouvrir chaque cycle, parce qu'elle a échoué TROIS fois (132, 137, 142)
>
> ```bash
> git fetch origin main && git log --oneline -5 origin/main
> ```
>
> **Avant chaque `Write`/`Edit` de production, et de toute façon si plus de ~15 min ont passé
> depuis le dernier fetch. Un bloc de trois correctifs, ce sont TROIS fetchs.** Deux secondes
> contre une heure. Détail et les deux motifs techniques rescapés : leçon 142.
> Corollaire du cycle 91 (leçon 143) : **avant de jeter un travail doublonné, comparer la
> COUVERTURE, pas l'intitulé.**

> ## La leçon que le cycle 99 ajoute — le quatrième membre de la famille
>
> Le cycle 96 : *un commentaire qui NOMME un suivi est une promesse.*
> Le cycle 97 : *un commentaire qui JUSTIFIE un geste destructeur est une PRÉMISSE périssable.*
> Le cycle 98 : *un CURSEUR est une promesse de couverture, et rien ne la vérifie.*
> Le cycle 99 trouve le quatrième :
>
> **Un champ de pagination PARTAGÉ entre plusieurs modes de lecture porte le contrat du mode
> qui l'a créé — et le ment à tous les autres.**
>
> `cursorPagination.nextCursor` a été écrit pour le mode BACKWARD (`before`), et sa description
> le dit : *« Message id to pass as `before` for the next page »*. Le mode FORWARD (`after`,
> ajouté plus tard pour le rattrapage local-first) réutilise la même structure de réponse — et
> hérite donc du champ, rempli par le même `messages[messages.length - 1].id`. Sauf que sa page
> est ASCENDANTE : sa dernière ligne est la PLUS RÉCENTE. Le curseur rendu pointait donc vers
> *tout ce qui est plus ANCIEN que la page qu'on vient de consommer* — l'exact opposé de ce
> qu'il promettait. Un client qui suit le curseur génériquement (le geste évident quand on lit
> la description du champ) relit l'historique en boucle sans jamais avancer.
>
> **La méthode qui en découle :** pour chaque champ de méta-pagination, énumérer les MODES de
> lecture qui traversent la même construction de réponse, et vérifier que la sémantique du champ
> tient dans CHACUN. Un mode ajouté après coup n'a presque jamais fait relire les champs qu'il
> hérite. Ici, trois modes (`before`, `around`, `after`) partagent un unique bloc `cursorPagination`
> et un unique `take` : le troisième arrivé était faux sur les deux.

## Livré au cycle 99 — `GET /conversations/:id/messages` : le mode `after` dit enfin la vérité

Le mode forward-watermark est le chemin de rattrapage de trou local-first. Consommateur RÉEL et
vivant, contrairement à `/sync` : `MessageService.listAfter` (SDK) →
`ConversationViewModel.syncMissedMessages` (`apps/ios/…`, appelé par `ConversationSocketHandler` à
chaque reconnexion socket). Deux défauts, fermés ensemble
(`services/gateway/src/routes/conversations/messages.ts`) :

1. **`nextCursor` pointait à l'envers.** Détaillé dans la leçon ci-dessus. Rendu `null` en mode
   `after` : ce mode reprend sur le watermark `createdAt` que le client détient déjà, il n'existe
   AUCUNE continuation `before` à publier, et en annoncer une était le mensonge. La description du
   champ dans le schéma de réponse le dit désormais explicitement, par mode.
2. **`hasMore` était DEVINÉ, pas mesuré.** Les modes `before` et `around` lisent `limit + 1` lignes
   — la ligne SONDE — pour trancher. Le mode `after` lisait `limit` et inférait
   `messages.length === limit`, qui ne distingue pas une page pleine FINALE d'une page tronquée :
   tout rattrapage tombant pile sur la frontière annonçait « il y a la suite » et coûtait au client
   un aller-retour pour prouver le contraire. `after` lit désormais `limit + 1` comme ses deux
   voisins, la sonde est retirée des DEUX tableaux (`messages` ET `mappedMessages` — le second est
   celui que le client reçoit ; ne trimmer que le premier avait déjà livré `limit+1` lignes par le
   passé, cf. le commentaire conservé), et `hasMore` devient exact.

Tests : 5 (`messages-routes.test.ts`, nouveau `describe` « after-mode cursor meta »), **RED prouvé
sur 4** ; la 5e ancre le comportement CONSERVÉ (le mode `after` reste une lecture curseur — aucun
bloc `pagination` offset, aucun `COUNT`). Gate : suite `messages-routes` 206/206,
`tsc --noEmit` gateway propre, suite gateway complète verte.

**Portée honnête — et une erreur d'inventaire à ne pas rejouer.** Le corps de la PR #2925
affirmait que le mode `after` n'avait qu'UN consommateur (iOS). **C'est faux**, et l'erreur a été
commise en s'arrêtant au premier appelant trouvé (`MessageService.listAfter`, côté SDK Swift) sans
balayer le web. Inventaire exact, vérifié après coup et corrigé en commentaire sur la PR :

| Client | Chemin | lit `nextCursor` ? | lit `hasMore` ? |
|---|---|---|---|
| iOS | `MessageService.listAfter` → `ConversationViewModel.syncMissedMessages` | non | non (`page.count < pageSize`) |
| **web** | `MessagesService.getMessages(…, after)` → `syncNewerMessages` (`use-conversation-messages-rq.ts` ~658), déclenché sur reconnexion socket ET retour de focus | non | **OUI** (`:700`) |

**La conclusion tenait, mais pas pour la raison écrite.** Personne ne lit `nextCursor` en mode
`after` — le web fait bien remonter `cursorPagination`, mais sa boucle de rattrapage n'en consomme
que `messages` et `hasMore`, et le `getNextPageParam` de l'`useInfiniteQuery` (qui lit, lui,
`lastPage.nextCursor`) n'est alimenté que par `fetchMessagesFromService`, **qui ne passe jamais
`after`**. Les deux chemins ne se croisent pas. Le défaut 1 est donc bien LATENT, et sa valeur est
celle invoquée au cycle 98 : le contrat est corrigé AVANT que le prochain client ne s'y règle.

Le défaut 2, lui, avait un lecteur RÉEL (le web) — mais le correctif serveur seul ne suffisait pas
à réaliser le gain : `const hasMore = result.hasMore === true || missed.length === CATCH_UP_PAGE_LIMIT;`
était une seconde estimation, côté client cette fois, **reproduisant exactement le défaut corrigé
côté serveur**. Tant qu'elle était là, une page pleine finale faisait boucler le web une fois de
plus, et l'itération de trop se terminait par un `refetch()` COMPLET (la sortie de boucle sur
`newestFetchedMs <= watermarkMs` tombe dans le `await refetch()` final) — soit **deux** lectures
serveur gaspillées, pas une.

**Corrigé dans le même cycle** (`apps/web/hooks/queries/use-conversation-messages-rq.ts`) : la
boucle s'arrête désormais sur `result.hasMore !== true`, le serveur faisant autorité et lui seul.
**Sûr dans les deux sens pendant un déploiement** — un gateway antérieur annonce `true` sur cette
même page, donc la boucle se comporte au pire comme avant ; le garde-fou client n'était pas une
compatibilité descendante, seulement une redondance devenue fausse.

Tests : 2 (`use-conversation-messages-rq.test.ts`, describe « rattrapage en avant — le hasMore du
serveur fait autorité »), **RED prouvé sur 1** (4 lectures observées au lieu de 2) ; la 2ᵉ ancre le
comportement CONSERVÉ (`hasMore: true` continue de paginer). Suite web complète verte.

**La leçon d'inventaire, à ajouter au réflexe d'ouverture de cycle** : avant d'écrire « le seul
consommateur est X », balayer les TROIS clients (iOS, web, Android) séparément. Le nom de la
méthode diffère d'un client à l'autre (`listAfter` côté Swift, un simple paramètre `after` côté
web) — chercher le NOM de l'appelant ne trouve qu'un client sur deux. Chercher le paramètre de
requête (`after`) les trouve tous.

**Nettoyage annexe, sans contrat** : `callParticipantSchema` était importé dans
`services/gateway/src/routes/calls.ts` et n'y était **jamais utilisé** (une seule occurrence dans
tout le fichier : la ligne d'import). Retiré.

## Ce que le cycle 99 a INSTRUIT sans le livrer — `CallParticipant.connectionQuality` (item 2 du cycle 99)

Le cycle 98 signalait « aucun écrivain, trois lecteurs ». Le cycle 99 a **fini l'instruction** et le
dossier est désormais complet — mais l'exécution demande une capacité que la routine n'a pas ici
(voir le pourquoi plus bas). **Tout ce qui suit est vérifié dépôt entier :**

**QUATRE déclarations du même champ, mutuellement incompatibles :**

| Site | Forme déclarée |
|---|---|
| `packages/shared/prisma/schema.prisma:1866` | `Json?` — commentaire `{ latency, packetLoss, bandwidth }` |
| `packages/shared/types/video-call.ts:126` | `ConnectionQuality` = `{ latency, packetLoss, bandwidth, jitter? }` |
| `packages/shared/utils/validation.ts:1744` (`CallParticipantSchemas.full`) | `z.number().nullable().optional()` |
| `packages/shared/types/api-schemas.ts:2314` (`callParticipantSchema`) | `{ type: 'number', 0-100 }` |

**ZÉRO écrivain** : aucun des 12 sites `callParticipant.{create,update,updateMany}` du gateway ne
met `connectionQuality` dans son `data`. **TROIS lecteurs**, tous des émissions socket
(`CallEventsHandler.ts:1903`, `:2030`, `:2385`), qui envoient donc `connectionQuality: null` à tout
client, toujours — sous un double cast `as unknown as ConnectionQuality | null` qui masque le fait
que la forme Json n'a jamais été validée. **ZÉRO consommateur** : les trois clients calculent leur
qualité LOCALEMENT depuis leur propre pile WebRTC (iOS `CallManager.connectionQuality:
PeerConnectionState` ; Android `CallViewModel` ← `ConnectionQuality.from(sample.level())` ; web
`call-store.connectionQuality: ConnectionQualityLevel`). Aucun décodeur client ne lit le champ
serveur.

**Les deux déclarations de schéma sont elles-mêmes MORTES**, et pas seulement sur ce champ :
`CallParticipantSchemas` (Zod) n'a **aucune référence** dans tout le dépôt ; `callParticipantSchema`
(OpenAPI) n'avait que l'import inutilisé retiré ci-dessus. Toutes deux déclarent en outre `status`,
`duration`, `isMuted`, `isVideoOff` — **aucun de ces quatre champs n'existe sur le modèle Prisma**
(qui porte `isAudioEnabled`, `isVideoEnabled`, `leftAt`, et ni `status` ni `duration`). Ce ne sont
pas des contrats périmés sur un champ : ce sont deux descriptions entières d'une entité qui n'a
jamais existé sous cette forme.

**Trancher RETIRER, pas CÂBLER — et voici l'argument, à ne pas rejouer :** le signal par
participant existe déjà et circule EN TEMPS RÉEL. `call:quality-report` porte `rtt`, `packetLoss`,
`level` par participant, et le handler résout déjà le `participantId` ; sur dégradation soutenue il
émet `call:quality-alert` **par participant** aux pairs (`socket.to(ROOMS.call(...))`). Persister le
même signal coûterait jusqu'à **30 écritures/min/participant** (plafond
`SOCKET_RATE_LIMITS.CALL_QUALITY_REPORT`) sur le chemin chaud de l'appel, dans une ligne que
personne ne lit. La qualité de connexion est une donnée ÉPHÉMÈRE : sa place est le canal transitoire
qui existe, pas une colonne.

**Ce que le cycle 100 doit exécuter, en un seul passage :** retirer `connectionQuality` du modèle
Prisma `CallParticipant` (MongoDB — aucune migration, aucune donnée à perdre puisque rien ne l'a
jamais écrit), du type partagé `CallParticipant`, et des trois émissions de `CallEventsHandler`
(avec l'import `ConnectionQuality` s'il devient orphelin). Traiter `CallParticipantSchemas` et
`callParticipantSchema` comme un lot séparé — ils sortent entiers, pas champ par champ.

**Pourquoi le cycle 99 ne l'a pas fait :** la suppression touche `packages/shared`, donc la surface
de compilation de `apps/web` et du SDK. Or `tsc --noEmit` sur `apps/web` rend déjà 1 224
diagnostics pré-existants (tous dans `__tests__/**`) — **le signal y est éteint**, et aucune
toolchain Swift n'existe ici. Retirer un champ de type partagé sans pouvoir prouver qu'aucun client
ne casse aurait été un pari, pas un correctif. Le champ étant `optional` et sans aucun lecteur
identifié, le risque est très probablement nul — mais « très probablement » n'est pas la barre.
**Faire ce lot depuis un contexte qui compile web + iOS**, ou après assainissement du signal `tsc`
côté web.

## Constat annexe du cycle 99, non traité

Le mode `around` lit lui aussi `limit + 1` (`take`) mais **ne retire jamais** de ligne sonde. Ce
n'est PAS un défaut aujourd'hui : `around` filtre par `whereClause.id = { in: allIds }` où `allIds`
vaut au plus `2 × floor(limit/2) + 1 ≤ limit`, donc le `+1` du `take` ne mord jamais. Vérifié avant
d'écrire quoi que ce soit — noté ici pour qu'un futur cycle qui élargirait la fenêtre `around`
sache que le trim ne le couvre pas.

## Ce qui reste ouvert des cycles précédents (inchangé au cycle 99)

- **Item 1 (rétention des posts supprimés) : toujours à poser à un humain, pas à réessayer.** Le
  cycle 98 a refusé, le refus est motivé (geste irréversible hors dépôt ; `N` est une décision
  produit ; la question repost-simple-d'un-post-permanent n'est pas tranchée). Le cycle 99 ne l'a
  pas rouvert et confirme le refus. Voir la tête du cycle 99 pour le détail.
- **L'index MongoDB `expiresAt_ephemeral_partial` n'est toujours pas appliqué** (cycle 92) —
  COLLSCAN par minute sur `Message`. Demande un accès de déploiement que la routine n'a pas.
- **Les 242 « source guards » iOS** (tête du cycle 86) : aucune toolchain Swift ici, inchangé des
  cycles 86 à 99.
- La porte `actions: write` reste close (cycle 82) : pas de `workflow_dispatch` à la demande.
- **La SUPPRESSION de branche distante est refusée en 403** (cycle 91) : les `push` passent, le
  `push --delete` non. Purger depuis un contexte qui a le droit (`tasks/branch-purge-*.sh`).
- Le couple de mesure PR↔`dev` sur la même lignée de clés DerivedData (cycle 84, item 2) n'existe
  toujours pas.
- **`UploadProcessor.test.ts` › `should upload a valid file successfully` est flaky sous charge**
  (cycle 87). Non reproduit aux cycles 88 à 99.
- Les constats non instruits des cycles 93 à 95 (`maxViewOnceCount: null` ambigu, passif de
  `scheduleViewOnceBurn`, `.forward` non masqué sur vue unique, `copyForwardedAttachments` qui
  partage l'octet, `MessageAttachment.isViewOnce` sans écrivain, veine « événement socket manqué »,
  1 224 diagnostics `tsc` sur `apps/web`) : inchangés.

## Environnement de la routine — ce qui s'exécute et ce qui ne s'exécute pas

| Cible | Exécutable ici ? | Note |
|---|---|---|
| suites Swift / iOS | ✗ | aucune toolchain |
| build web (Next.js) | ⚠ | dépend du réseau Google Fonts (cf. cycle 88) ; `tsc` web = signal éteint |
| gateway + web (jest) | ✓ | après `bun install --ignore-scripts`, `prisma generate`, build de `shared` |

`bun install` **échoue** sans `--ignore-scripts` (le postinstall de `grpc-tools` sort en erreur et
interrompt toute l'installation). C'est la première chose à faire dans un environnement neuf.

**Ordre exact, re-vérifié au cycle 99** (sans lui, `tsc --noEmit` rend un faux positif
`Cannot find module '@meeshy/shared'` sur `utils/sanitize.ts`) :

```bash
bun install --ignore-scripts
cd packages/shared && npx prisma generate --generator client && bun run build
cd services/gateway && npx tsc --noEmit && bun run test
```

**Piège d'outillage relevé au cycle 99** : `bun run test -- --testPathPattern=…` est REFUSÉ par le
Jest du dépôt (« Option "testPathPattern" was replaced by "--testPathPatterns" »). Utiliser
`--testPathPatterns` (au pluriel).

---

# Tête instruite pour le cycle 99 — le cycle 98 a REFUSÉ l'item 1 et fermé un trou que personne ne surveillait

*Le cycle 98 devait livrer la passe de rétention des posts supprimés (item 1 de la tête du cycle
98). Il ne l'a pas fait, et le refus est motivé — voir §« Ce que le cycle 98 a refusé de faire ».
Il a livré à la place la correction d'un défaut de la MÊME famille méthodologique, trouvé en
appliquant le filtre du cycle 97 à un endroit où personne ne l'avait porté : le watermark de
l'endpoint de synchronisation.*

> ## La leçon qui doit ouvrir chaque cycle, parce qu'elle a échoué TROIS fois (132, 137, 142)
>
> ```bash
> git fetch origin main && git log --oneline -5 origin/main
> ```
>
> **Avant chaque `Write`/`Edit` de production, et de toute façon si plus de ~15 min ont passé
> depuis le dernier fetch. Un bloc de trois correctifs, ce sont TROIS fetchs.** Deux secondes
> contre une heure. Détail et les deux motifs techniques rescapés : leçon 142.
> Corollaire du cycle 91 (leçon 143) : **avant de jeter un travail doublonné, comparer la
> COUVERTURE, pas l'intitulé.**

> ## La leçon que le cycle 98 ajoute — le troisième membre d'une famille
>
> Le cycle 96 : *un commentaire qui NOMME un suivi est une promesse.*
> Le cycle 97 : *un commentaire qui JUSTIFIE un geste destructeur est une PRÉMISSE, et une
> prémisse peut périmer sans que personne ne réécrive la phrase.*
> Le cycle 98 trouve le troisième :
>
> **Un CURSEUR est une promesse de couverture — et rien ne la vérifie jamais.**
>
> Un watermark (`checkpoint`, `updatedSince`, `since`, `seq`) dit au client : *tout ce qui
> précède cette borne, tu l'as reçu.* La borne serveur étant STRICTE (`gt`), un curseur rendu
> trop AVANCÉ ne produit ni erreur, ni log, ni test rouge : il produit un **trou définitif**,
> silencieux, dans les données d'un client qui a fait exactement ce qu'on lui a dit de faire.
>
> **La méthode qui en découle :** pour chaque curseur rendu à un client, poser trois questions —
> (a) *à quel instant est-il ancré, AVANT ou APRÈS les lectures qu'il prétend couvrir ?*
> (b) *l'estampille sur laquelle il porte est-elle posée au COMMIT ou à la CONSTRUCTION de
> l'écriture ?* (c) *que vaut-il quand la réponse est TRONQUÉE ?* Les trois se répondaient mal
> dans le même endpoint, et chacune produisait sa propre fenêtre de perte.
>
> Le dépôt SAVAIT déjà tout cela — mais côté CLIENT seulement, et pour un autre endpoint :
> `SyncWatermark.advancedAfterDeltaPage` (`packages/MeeshySDK/.../SyncWatermark.swift`) écrit
> noir sur blanc « une page qui laisse du reste n'a pas rendu toute la fenêtre » et « la borne
> serveur est STRICTE (`gt`) ». Cette règle n'avait jamais traversé jusqu'au serveur qui émet
> les curseurs. **Chercher les règles déjà écrites d'un côté de la frontière et jamais portées
> de l'autre est, en soi, un filtre productif.**

## Livré au cycle 98 — **le watermark de `GET /sync` promettait ce qu'il n'avait pas livré**

`checkpoint` est le curseur que le client renvoie en `since` au tour suivant. Trois fenêtres de
perte définitive, fermées ensemble (`services/gateway/src/routes/sync.ts`) :

1. **Ancrage APRÈS les lectures.** `checkpoint: new Date()` était évalué à la construction du
   payload. Toute ligne écrite entre la requête et cet horodatage était invisible dans la réponse
   ET exclue du tour suivant. Ancré désormais au DÉBUT du handler. Détail qui donne la mesure du
   défaut : `checkpointSeq`, dans le MÊME payload, était déjà lu avant les collections — les deux
   watermarks penchaient en sens **opposés**, l'un conservateur, l'autre optimiste.
2. **`@updatedAt` est estampillé au BUILD de l'écriture, pas à son COMMIT.** Une ligne estampillée
   T peut n'être visible qu'à T+δ : un checkpoint pris même AVANT nos lectures laisse passer les
   écritures en vol. Seul un retrait ferme cette fenêtre — `SYNC_CHECKPOINT_LAG_MS` (5 s), borné
   par le bas au `since` déjà acquitté (sans quoi un client interrogeant plus vite que le lag
   rejouerait sans fin une fenêtre déjà livrée).
3. **Page TRONQUÉE = couverture non démontrée.** Le reste de la fenêtre est un ARRIÉRÉ : ses
   `updatedAt` sont par construction ANTÉRIEURS au checkpoint. Le rendre frais invitait le client
   à perdre tout l'arriéré d'un coup. Le watermark reste sur `since` tant que `hasMore` est vrai ;
   seule la page qui CLÔT le parcours en rend un adoptable.

Tests : 6 (`sync.test.ts`, deux nouveaux `describe`), **RED prouvé sur 5**, la 6e ancrant le
comportement CONSERVÉ (la page qui clôt le parcours avance bien le watermark). La première garde
a exigé un délai artificiel dans le double de `findMany` : sans lui, lecture et checkpoint
partagent la milliseconde et le défaut passe VERT par accident — noté ici parce que la première
rédaction du test est effectivement passée au vert sur un code défectueux.

Gate : suite `sync` 22/22, `tsc --noEmit` propre, suite gateway complète verte.

**Portée honnête, à ne pas surestimer : le défaut était LATENT.** `/sync` est l'endpoint PILOTE
du SyncEngine et n'a aujourd'hui **aucun consommateur** — ni web (`apps/web/lib/sync/` ne porte
que `sync-seq-state.ts`), ni iOS (`ConversationSyncEngine` ne l'appelle pas). Aucun utilisateur
n'a perdu de message par ce chemin. La valeur du correctif est qu'il arrive AVANT que la première
implémentation cliente ne se règle sur un contrat faux.

## Ce que le cycle 98 a REFUSÉ de faire, et pourquoi — à trancher par un humain

**L'item 1 de la tête du cycle 98 (passe de rétention des posts supprimés) n'a PAS été livré.**

Le raisonnement technique qui y menait est intact et je ne le conteste pas : la suppression d'un
post est irréversible (cycle 97 §1), il n'existe qu'un seul destructeur de lignes `Post` (§2), et
la rétention illimitée des posts soft-supprimés ne protège donc personne. Ce qui bloque n'est pas
le raisonnement, c'est la NATURE du geste : mettre en service une passe planifiée qui DÉTRUIT
définitivement du contenu utilisateur, et ses octets, N jours après sa suppression douce.

Trois raisons de ne pas l'écrire dans une routine automatique :

1. **Le geste est irréversible et sort du dépôt.** Une erreur de périmètre ne se corrige pas par
   un rollback : le cycle 97 vient précisément de trouver que la passe voisine détruisait depuis
   des mois des posts permanents qu'elle n'avait jamais eu le droit de toucher.
2. **`N` est une décision produit, pas technique.** Aucune valeur n'est déductible du dépôt, et
   aucune n'est neutre : elle fixe la fenêtre pendant laquelle un utilisateur qui supprime par
   erreur peut encore être secouru par un humain.
3. **La question ouverte de la tête du cycle 98 n'est toujours pas tranchée** — un repost SIMPLE
   d'un post PERMANENT ne duplique rien (l'instantané ne se déclenche que sur source ÉPHÉMÈRE) ;
   le détacher le VIDE au lieu de le sauver. Les deux issues honnêtes (rétention conditionnelle,
   ou extension de l'instantané au repost de source permanente à la CRÉATION) sont l'une et
   l'autre des choix produit.

**Ce que le cycle 99 doit faire de cet item : le poser à un humain, pas le réessayer.** Si la
décision revient (`N`, et laquelle des deux issues), l'implémentation est balisée et courte.

## Ce que le cycle 98 a prospecté sans le traiter — la famille CALL (item 2, partiellement instruit)

Aux trois constats du cycle 97 (`recordingEnabled` sans écrivain ni lecteur ;
`CallSession.transcriptionEnabled` sans écrivain ; modèle `Transcription` sans écrivain), le
cycle 98 en ajoute un quatrième, **vérifié dépôt entier** :

- **`CallParticipant.connectionQuality` n'a AUCUN écrivain, et pourtant trois LECTEURS.**
  `CallEventsHandler` le mappe dans la charge utile participant à trois endroits
  (`:1903`, `:2030`, `:2385`) : tout client reçoit donc `connectionQuality: null` pour tout
  participant, toujours. Le signal existe pourtant et circule — `call:quality-report` porte
  `rtt`, `packetLoss`, `level` par PARTICIPANT — mais il n'est persisté qu'AGRÉGÉ sur la session
  (`CallSession.networkQuality`, dernier rapport gagnant, tous participants confondus). Les
  clients, eux, calculent leur qualité LOCALEMENT (iOS `CallManager.connectionQuality` depuis
  l'état de la peer connection ; web `call-store`) et ne lisent jamais le champ serveur.
  Même famille que `MessageAttachment.isViewOnce` : soit le retirer (avec ses trois lecteurs),
  soit le câbler depuis `call:quality-report`, qui a déjà tout ce qu'il faut sous la main.

**Piste non instruite, notée pour honnêteté** : un appel `active` dont TOUS les participants ont
un `leftAt` (orphelin) n'est pas fauché par l'étage 4 du GC — sa garde est
`dbStale.length > 0 && >= participants.length`, et la liste filtrée sur `leftAt: null` est VIDE,
donc `0 > 0` est faux. Il attend l'étage 2, soit **2 h**, pendant lesquelles
`Conversation.activeCallId` reste pris et la conversation refuse tout nouvel appel
(`reclaimFromTerminalHolder` ne récupère que sur un détenteur TERMINAL, or celui-ci est `active`).
Le commentaire de l'étage 2 nomme explicitement ce routage — c'est donc un choix, pas un oubli —
mais sa conséquence sur le verrou d'appel n'est écrite nulle part. **Reste à établir avant tout
correctif : cet état orphelin est-il seulement ATTEIGNABLE ?** Tous les chemins de départ lus au
cycle 98 terminent l'appel avec le dernier partant. Ne pas écrire de correctif avant d'avoir
exhibé le chemin.

## Ce que le cycle 98 laisse strictement inchangé

### Item 3 — l'index MongoDB non appliqué, toujours le maillon faible

`expiresAt_ephemeral_partial` (cycle 92) est fourni mais **jamais appliqué** — aucun déploiement
ne joue les migrations MongoDB manuelles. Sans lui, le balayage fait un COLLSCAN par minute sur
`Message`, et c'est ce balayage qui `unlink`. Trois dépendants s'y exécutent désormais (cycles 96,
97). Inchangé : cela demande un accès de déploiement que la routine n'a pas.

### Item 4 — les constats non instruits des cycles 93 à 95 (inchangés)

- `maxViewOnceCount: null` veut dire « 1 » dans le code et « tous les membres » dans le schéma.
- Le passif en base de `scheduleViewOnceBurn` ne se rattrape pas tout seul.
- Aucun client ne masque `.forward` sur un message à vue unique (iOS : toolchain absente ici).
- `copyForwardedAttachments` copie `filePath` VERBATIM — la copie transférée et l'original
  partagent l'octet. Motif propre à la famille message ; côté post, la duplication est réelle.
- `MessageAttachment.isViewOnce` n'a aucun écrivain : soit le retirer, soit le câbler.
- Veine « événement socket manqué » : modération admin, rattrapage à la reconnexion.
- `tsc --noEmit` sur `apps/web` rend 1 224 diagnostics, tous dans `__tests__/**`, tous
  pré-existants. Signal éteint ; assainir est un chantier en soi.

## Ce qui reste ouvert des cycles précédents

- **Les 242 « source guards » iOS** (tête du cycle 86) : des tests qui `grep` le code au RUNTIME
  depuis un `#filePath` figé à la COMPILATION. **Aucune toolchain Swift dans l'environnement de
  la routine** — inchangé aux cycles 86 à 98. Exige une machine macOS.
- La porte `actions: write` reste close (cycle 82) : pas de `workflow_dispatch` à la demande.
- **La SUPPRESSION de branche distante est refusée en 403** (cycle 91). Les `push` passent, le
  `push --delete` non. Les branches mergées s'accumulent — à purger depuis un contexte qui a le
  droit (cf. `tasks/branch-purge-*.sh`).
- Le couple de mesure PR↔`dev` sur la même lignée de clés DerivedData (cycle 84, item 2)
  n'existe toujours pas.
- **`UploadProcessor.test.ts` › `should upload a valid file successfully` est flaky sous
  charge** (cycle 87). Non reproduit aux cycles 88 à 98.

## Environnement de la routine — ce qui s'exécute et ce qui ne s'exécute pas

| Cible | Exécutable ici ? | Note |
|---|---|---|
| suites Swift / iOS | ✗ | aucune toolchain |
| build web (Next.js) | ⚠ | dépend du réseau Google Fonts (cf. cycle 88) |
| gateway + web (jest) | ✓ | après `bun install --ignore-scripts`, `prisma generate`, build de `shared` |

`bun install` **échoue** sans `--ignore-scripts` (le postinstall de `grpc-tools` sort en erreur
et interrompt toute l'installation). C'est la première chose à faire dans un environnement neuf.

**Ordre exact re-vérifié au cycle 98** (sans lui, `tsc --noEmit` rend un faux positif
`Cannot find module '@meeshy/shared'` sur `utils/sanitize.ts`) :

```bash
bun install --ignore-scripts
cd packages/shared && npx prisma generate --generator client && bun run build
cd services/gateway && npx tsc --noEmit && bun run test
```

---

# Tête instruite pour le cycle 98 — la chaîne de destruction ne détruit plus ce qu'elle ne devait pas ; reste ce qu'elle ne détruit toujours pas

*Le cycle 97 devait porter à la famille CALL la question posée cinq fois de suite. Il ne l'a pas
fait, et pour une bonne raison : en instrumentant la passe qu'il s'apprêtait à étendre, il a
trouvé qu'elle DÉTRUISAIT du contenu permanent. Fermer une fuite d'octets sur un balayage qui
efface des posts qu'il n'a jamais eu le droit d'effacer aurait été bâtir sur du sable.*

> ## La leçon qui doit ouvrir chaque cycle, parce qu'elle a échoué TROIS fois (132, 137, 142)
>
> ```bash
> git fetch origin main && git log --oneline -5 origin/main
> ```
>
> **Avant chaque `Write`/`Edit` de production, et de toute façon si plus de ~15 min ont passé
> depuis le dernier fetch. Un bloc de trois correctifs, ce sont TROIS fetchs.** Deux secondes
> contre une heure. Détail et les deux motifs techniques rescapés : leçon 142.
> Corollaire du cycle 91 (leçon 143) : **avant de jeter un travail doublonné, comparer la
> COUVERTURE, pas l'intitulé.**

> ## La leçon que le cycle 97 ajoute, jumelle exacte de celle du cycle 96
>
> Le cycle 96 avait retenu : *un commentaire qui NOMME un suivi est une promesse, au même titre
> qu'un champ de schéma.* Le cycle 97 trouve l'autre moitié :
>
> **Un commentaire qui JUSTIFIE un geste destructeur est une PRÉMISSE — et une prémisse peut
> périmer sans que personne ne réécrive la phrase.**
>
> Ici, la cascade qui détruisait les reposts d'un contenu éphémère était accompagnée de sa raison,
> écrite noir sur blanc : « *a repost of a story dead for 7+ days has no value (stories are
> ephemeral)* ». Elle était VRAIE le jour de son écriture — un repost ne faisait alors que
> RÉFÉRENCER sa source, et privé d'elle il n'affichait plus rien. Une fonctionnalité postérieure,
> l'INSTANTANÉ (`repostPost` duplique médias, audio, effets et texte de toute source éphémère), l'a
> rendue fausse — et son propre commentaire annonce exactement pourquoi : *« so a repost that merely
> referenced it via repostOfId would render EMPTY once the source is gone »*. Les deux commentaires
> se contredisent, à trois cents lignes l'un de l'autre, dans le même dépôt, depuis des mois. **La
> destructrice gagnait.**
>
> **La méthode qui en découle, et qu'il faut appliquer au cycle 98 :** relire la JUSTIFICATION de
> chaque suppression comme on relit un champ de schéma — *cette phrase est-elle encore vraie
> aujourd'hui ?* Une prémisse périmée ne lève aucune alerte, ne casse aucun test, et n'apparaît
> dans aucun audit : elle a l'air d'une décision.

> ## La méthode, validée cinq fois, et son angle mort
>
> Cinq pour cinq en cherchant la PROMESSE au DERNIER maillon : `expiresAt` (92),
> `isViewOnce`/`maxViewOnceCount` (93), le transfert (94), les OCTETS de message (95), les OCTETS
> de post (96). Le cycle 97 montre que la question symétrique n'avait jamais été posée : non pas
> « *qui fait respecter la promesse ?* » mais « **qui vérifie que ce qu'on détruit méritait de
> l'être ?** ». Le premier filtre trouve les fuites. Le second trouve les PERTES.

## Livré au cycle 97 — **le balayage détruisait des posts permanents**

1. **Filtre de type sur la cascade des reposts** (`ExpiredStoriesCleanupService`). La passe
   emportait, avec chaque statut périmé, TOUT post le repostant : `where: { repostOfId: { in: ids } }`,
   sans filtre. L'API expose `targetType` (`POST | REEL | STORY | STATUS`,
   `routes/posts/types.ts`), donc « reposter un STATUS en POST PERMANENT » — le chemin
   `status→post` que le commentaire de l'instantané nomme lui-même — est un geste ordinaire et
   supporté. Quatorze jours plus tard (1 h d'échéance + 7 j de masquage + 7 j de grâce), le
   balayage détruisait ce post permanent, ses commentaires, ses notifications, ses liens de
   partage, ses lignes média — et, **depuis le cycle 96**, ses OCTETS. La cascade ne porte plus
   que sur les reposts eux-mêmes éphémères (`SWEPT_POST_TYPES`), dont l'échéance propre est
   périmée depuis aussi longtemps que celle de leur source.
2. **`detachReposts`** (`services/posts/detachReposts.ts`) — le repost qui survit survit
   DÉTACHÉ. `repostOfId` et `originalRepostOfId` de tout post visant la fournée sont coupés AVANT
   sa destruction. Sans cela, le correctif n'aurait fait que déplacer le défaut sur le motif que
   cette famille poursuit depuis trois cycles (`TrackingLink.targetId`,
   `Notification.context.postId`) : une référence dénormalisée que plus aucun chemin ne rattrape.
3. **Trois choses fermées d'un seul geste par la coupure** : le pointeur pendant ; le routage des
   réactions (`originalRepostOfId ?? repostOfId` — un post VIVANT aurait envoyé ses réactions vers
   un id disparu) ; et la **profondeur** des chaînes de reposts, que la cascade d'un seul niveau
   ignorait. `Post.repostOf` est en `onDelete: NoAction` — la MÊME construction que la
   self-relation `CommentReplies` dont l'émulation MongoDB de Prisma refuse la suppression (P2014,
   régression de production 2026-06-01). Le remède était écrit **trois lignes plus haut dans la
   même passe** pour les réponses, et n'avait jamais été appliqué à son jumeau.
4. **Deux pointeurs, deux requêtes, jamais fondues.** Un repost de repost les porte vers deux posts
   DIFFÉRENTS : quand seule la racine est détruite, la source immédiate est vivante et doit rester.
   Un `updateMany` unique aurait coupé un lien parfaitement valide.
5. **Régime d'échec REJETTE**, comme ses quatre voisines de bloc.

Tests : 7 sur le module (`detachReposts.test.ts`), 9 sur la passe
(`ExpiredStoriesCleanupService.repostSurvival.test.ts`). **RED prouvé : 7 des 9 gardes de passe
rouges avant correctif**, les 2 vertes étant celles qui ancrent le comportement CONSERVÉ (le
repost éphémère reste emporté par sa source). Le double de la passe applique lui-même le filtre de
type qu'on lui envoie — sans quoi la garde « le repost permanent survit » serait verte par
construction du double plutôt que par le correctif.

## Ce que le cycle 97 a VÉRIFIÉ et qui débloque le cycle 98

### 1. La suppression d'un post n'est PAS réversible — la question bloquante du cycle 97 est tranchée

Le cycle 96 n'avait « trouvé aucune route de restauration » et demandait de revérifier. Vérifié
autrement, et de façon concluante : **aucun chemin du gateway n'écrit `deletedAt: null` sur un
`Post`**. Toutes les occurrences de ce littéral dans `services/gateway/src` sont des `where` de
lecture (`MessageReadStatusService`, `MentionService`, `NotificationService`, `broadcast-sender`,
`messageRemovalEffects`…) ou des commentaires ; aucune n'est un `data`. Il n'existe donc pas de
corbeille, et la rétention illimitée des posts supprimés ne sert **personne**.

**L'item 1 du cycle 97 est donc entièrement débloqué pour le cycle 98** (détail ci-dessous).

### 2. Un seul destructeur de lignes `Post` dans tout le gateway

`post.delete` / `post.deleteMany` n'ont que **deux** sites, tous deux dans
`ExpiredStoriesCleanupService`. La chaîne de destruction corrigée au cycle 97 est donc la totalité
de la surface : une passe de rétention (item 1) qui réutilise ce chemin hérite mécaniquement de
toutes ses gardes, et n'a aucune seconde implémentation à rattraper.

### 3. Ce que le cycle 97 a commencé à prospecter côté CALL, sans le traiter

Trois constats bruts, à instruire au cycle 98 (item 2) :

- **`recordingEnabled` n'a ni écrivain ni lecteur.** Le champ est annoncé par le commentaire de
  `CallSession.metadata` (« `{ maxParticipants, recordingEnabled, etc. }` ») et déclaré dans
  `packages/shared/types/video-call.ts:104`. Aucune autre occurrence dans tout le dépôt —
  gateway, web, iOS, Android. Même famille que `MessageAttachment.isViewOnce` : soit le retirer,
  soit le câbler.
- **`CallSession.transcriptionEnabled` n'a aucun écrivain** dans le gateway (les occurrences du
  nom appartiennent toutes aux préférences audio de l'utilisateur, un champ homonyme et distinct).
- **Le modèle `Transcription` n'a aucun écrivain.** Le schéma l'annonce « prepared for future »,
  ce qui est une dette DÉCLARÉE et non une promesse trahie — mais la conséquence est qu'il n'y a
  aujourd'hui, côté appel, **aucun octet à protéger**. La famille CALL doit donc être prospectée
  sur ses MÉTADONNÉES (rétention des `CallSession`/`CallParticipant`/`analytics`), pas sur ses
  fichiers.

## Ce que le cycle 98 doit faire

### 1. La rétention des posts supprimés — désormais SANS question préalable

Un `Message` supprimé perd ses octets IMMÉDIATEMENT (`deleteAttachment` sur les quatre écrivains
de `deletedAt`). Un `Post` supprimé ne perd rien, jamais : ni lignes, ni fichiers. L'asymétrie
n'est écrite nulle part comme une décision — elle est le résidu d'un balayage dont le périmètre
s'est rétréci aux STATUS.

La question bloquante est tranchée (ci-dessus §1) : la suppression est **irréversible**, donc la
rétention illimitée ne protège rien. Le geste juste est une **passe de rétention générique** —
soft-delete + N jours → destruction complète par le chemin corrigé au cycle 97.

**Ce que le cycle 97 change dans la difficulté de cet item :** la garde qu'il annonçait comme
« à ajouter » — *un repost simple rend le média de l'original par la relation `repostOf`, détruire
l'original casserait l'affichage du repost* — **est déjà écrite**. `detachReposts` coupe le
pointeur avant la destruction, et le repost, autoporteur par l'instantané, continue de s'afficher.
Il reste à vérifier UN cas que le cycle 97 n'a pas eu à traiter : un repost simple d'un post
**PERMANENT** ne duplique rien (l'instantané ne se déclenche que sur source ÉPHÉMÈRE) — il n'a donc
aucun contenu propre, et le détacher le viderait au lieu de le sauver. C'est la vraie décision de
l'item 1, et elle n'a que deux issues honnêtes : soit la rétention épargne un post encore reposté
(rétention conditionnelle, à documenter comme telle), soit l'instantané est étendu au repost de
source permanente à la CRÉATION. Trancher avant d'écrire.

### 2. La famille CALL — prospectée à moitié, jamais instruite

Voir §3 ci-dessus pour les trois constats bruts. Même filtre, mêmes deux questions (qui fait
respecter la promesse ? et au niveau de l'octet ?) — plus, depuis le cycle 97, la troisième :
**ce qu'on détruit méritait-il de l'être ?**

### 3. L'index MongoDB non appliqué — inchangé, et toujours le maillon faible

`expiresAt_ephemeral_partial` (cycle 92) est fourni mais **jamais appliqué** — aucun déploiement ne
joue les migrations MongoDB manuelles. Sans lui, le balayage fait un COLLSCAN par minute sur
`Message`, et c'est ce balayage qui `unlink`. Le cycle 96 y a ajouté un second dépendant (la
récupération des octets de post), et le cycle 97 un troisième (la coupure des pointeurs de repost) :
les trois s'exécutent dans la passe horaire du balayage éphémère.

### 4. Les constats non instruits des cycles 93 à 95 (inchangés)

- `maxViewOnceCount: null` veut dire « 1 » dans le code et « tous les membres » dans le schéma.
- Le passif en base de `scheduleViewOnceBurn` ne se rattrape pas tout seul.
- Aucun client ne masque `.forward` sur un message à vue unique (iOS : toolchain absente ici).
- `copyForwardedAttachments` copie `filePath` VERBATIM — la copie transférée et l'original
  partagent l'octet. Motif propre à la famille message ; côté post, la duplication est réelle.
- `MessageAttachment.isViewOnce` n'a aucun écrivain : soit le retirer, soit le câbler.
- Veine « événement socket manqué » : modération admin, rattrapage à la reconnexion.
- `tsc --noEmit` sur `apps/web` rend 1 224 diagnostics, tous dans `__tests__/**`, tous
  pré-existants. Signal éteint ; assainir est un chantier en soi.


## Ce qui reste ouvert des cycles précédents

- **Les 242 « source guards » iOS** (tête du cycle 86) : des tests qui `grep` le code au RUNTIME
  depuis un `#filePath` figé à la COMPILATION. **Aucune toolchain Swift dans l'environnement de
  la routine** — inchangé aux cycles 86 à 97. Exige une machine macOS.
- La porte `actions: write` reste close (cycle 82) : pas de `workflow_dispatch` à la demande.
- **La SUPPRESSION de branche distante est refusée en 403** (cycle 91). Les `push` passent, le
  `push --delete` non. Les branches mergées s'accumulent — à purger depuis un contexte qui a le
  droit (cf. `tasks/branch-purge-*.sh`).
- Le couple de mesure PR↔`dev` sur la même lignée de clés DerivedData (cycle 84, item 2)
  n'existe toujours pas.
- **`UploadProcessor.test.ts` › `should upload a valid file successfully` est flaky sous
  charge** (cycle 87). Non reproduit aux cycles 88 à 97.

## Environnement de la routine — ce qui s'exécute et ce qui ne s'exécute pas

| Cible | Exécutable ici ? | Note |
|---|---|---|
| suites Swift / iOS | ✗ | aucune toolchain |
| build web (Next.js) | ⚠ | dépend du réseau Google Fonts (cf. cycle 88) |
| gateway + web (jest) | ✓ | après `bun install --ignore-scripts`, `prisma generate`, build de `shared` |

`bun install` **échoue** sans `--ignore-scripts` (le postinstall de `grpc-tools` sort en erreur
et interrompt toute l'installation). C'est la première chose à faire dans un environnement neuf.

**Ordre exact vérifié aux cycles 95 et 97** (sans lui, `tsc --noEmit` rend un faux positif
`Cannot find module '@meeshy/shared'` sur `utils/sanitize.ts`) :

```bash
bun install --ignore-scripts
cd packages/shared && npx prisma generate --generator client && bun run build
cd services/gateway && npx tsc --noEmit && bun run test
```
---

# Cycle 95 — Les octets d'une pièce jointe ignoraient la destruction du message porteur

## Rappel — livré au cycle 94 — **mergé sur `main` le 2026-08-12 (PR #2902, merge `4ecd765e`)**

*Gate local avant merge : 683/683 suites, 16 902/16 902 tests, `tsc --noEmit` propre,
`forwardAdmission.ts` à 100 % de lignes couvertes, total gateway 95,93 %. Réintégration de `main`
après merge (PR #2900, calls/video-call) : sans conflit, périmètres disjoints.*

Le détail du garde de transfert est consigné au CHANGELOG et dans la section « Cycle 94 » plus bas.

## Livré au cycle 95 (détail)

1. **`carrierMessageStillServesBytes` — les octets suivent la vie du message porteur.** Prédicat
   pur dans `services/attachments/carrierMessageLifecycle.ts`, appelé depuis
   `resolveAttachmentReadVerdict` (`routes/attachments/download.ts`), qui garde les DEUX routes
   authentifiées : `GET /attachments/:attachmentId` et `GET /attachments/:attachmentId/thumbnail`.
   Refuse un message rappelé (`deletedAt`), expiré (`expiresAt` passé) ou dont la brûlure de vue
   unique est consommée — cette dernière gratuitement, l'échéance étant la brûlure.
2. **Trois issues au lieu de deux.** `callerMayReadAttachment` (booléen) devient
   `resolveAttachmentReadVerdict` → `'allow' | 'forbidden' | 'gone'`. L'appartenance se juge
   AVANT le cycle de vie : un étranger reçoit le même 403 que le message soit vivant ou détruit,
   sinon la paire 403/404 lui apprendrait ce qu'il est advenu d'un contenu auquel il n'a jamais eu
   accès.
3. **Le refus est un 404, pas un 403** — identique à celui que la route rendra une minute plus
   tard, quand le balayage aura `unlink` le fichier. Aucun client ne voit son comportement changer
   selon qu'il arrive avant ou après le balayage.
4. **Coût nul en aller-retours** : `deletedAt`/`expiresAt` voyagent dans le `select` qui lisait
   déjà `conversationId`.

Tests : 12 sur le prédicat (`carrierMessageLifecycle.test.ts`), 11 sur les routes
(`attachments-download.test.ts`, section « cycle de vie du message porteur »). Les 6 refus étaient
RED avant correctif. Suite gateway complète : 684 suites / 16 927 tests verts, `tsc --noEmit` propre.

## Ce que le cycle 95 a VÉRIFIÉ et qui corrige le dossier

### 1. `/attachments/file/*` est une URL-CAPACITÉ, pas un trou d'énumération — et c'est elle que les clients utilisent

**C'est le constat le plus important du cycle, et il tempère le correctif ci-dessus.**

`UploadProcessor.getAttachmentUrl` émet `/api/v1/attachments/file/<chemin encodé>` : c'est cette
URL qui est rangée dans `MessageAttachment.url` et remise à tous les clients. Cette route
**n'a aucune authentification** — ni `onRequest`, ni `preValidation`, et il n'existe aucun hook
d'auth global (vérifié : `server.ts` n'ajoute que `request-id`, `clientMutationId`, `deviceLocale`,
`deviceCountry`). Le dépôt le sait : `routes/posts/audio.ts:27` le documente noir sur blanc.

**La garde du cycle 95 ne couvre donc PAS le chemin par lequel les octets circulent réellement.**

Avant de crier à la faille, ce qui a été vérifié :

- **Les noms de fichiers portent un UUIDv4** (`UploadProcessor:156`, `${cleanName}_${uuidv4()}${ext}`)
  — 122 bits d'entropie. Ce n'est pas énumérable. C'est le motif URL-capacité que pratiquent les
  CDN de WhatsApp et de Slack, pas un `/attachments/1,2,3…`.
- **`deleteAttachment` `unlink` VRAIMENT le fichier** (`AttachmentService:266`), miniature comprise,
  et les quatre écrivains de `deletedAt` l'appellent (handler socket, les deux routes DELETE,
  `MaintenanceService`), tout comme le balayage `ExpiredMessagesCleanupService:250`.

**Conséquence — l'hypothèse « unsend laisse la photo téléchargeable pour toujours » est FAUSSE**,
et elle a été testée avant d'être écrite. Le résiduel réel sur cette route se réduit à :

- **la fenêtre d'une minute** entre l'échéance et le passage du balayage ;
- **l'absence de révocation** propre aux URL-capacité : une URL captée avant destruction
  (capture d'écran, lien transféré, journal de proxy, historique) reste valable tant que le
  fichier est là ;
- **la fiabilité du balayage** — et là, voir le point ouvert sur l'index MongoDB non appliqué.

**Décision assumée, pas oubli : aucune garde n'a été ajoutée sur `/attachments/file/*`.** Elle
coûterait une lecture base sur la route la plus chaude du produit (chaque avatar, chaque vignette,
chaque image de fil) — et `MessageAttachment.filePath` **n'est pas indexé** (vérifié dans
`schema.prisma`) — pour ne gagner que la fenêtre d'une minute ci-dessus. Le compromis est
consigné dans l'en-tête de `carrierMessageLifecycle.ts` pour que le prochain cycle ne le
redécouvre pas comme un oubli.

**Si un cycle veut vraiment fermer cette route**, le chantier n'est pas « ajouter une garde » mais
**passer aux URL signées à durée de vie courte** (HMAC du chemin + expiration, vérifié sans base) —
ce qui ferme la révocation ET le cycle de vie d'un coup, sans aller-retour base. C'est un chantier
d'infrastructure : il touche `UploadProcessor`, `MediaService`, `MediaStorage`, le cache nginx
immutable, et les trois clients. À instruire comme tel, pas à improviser.

### 2. Ce que la tête du cycle 95 annonçait et qui ne s'est PAS confirmé

- « le budget de vue unique se contourne par un simple GET » — **exact sur le fond, faux sur la
  conséquence**. `viewOnceCount` n'est effectivement incrémenté que par `POST …/consume`, mais
  compter les GET n'était pas le correctif : le cycle de vie l'était. Le compteur reste alimenté
  par les seuls clients bien élevés, **et c'est acceptable** — parce que ce qui protège le contenu
  n'est plus le compteur mais l'échéance qu'il pose une fois épuisé.
- « décider ce qui compte comme une vue touche les vignettes, les requêtes Range et le rejeu » —
  **sans objet**, cf. la leçon en tête.


# Cycle 93 — La vue unique ne se consommait nulle part, et « ce n'est pas le contenu » était faux

*Branche `claude/keen-hamilton-9dbzne`. Deux correctifs, RED-prouvés avant correction, et une
dette du cycle précédent close pour une raison que le cycle précédent n'avait pas vue.*

## 0. Ce que la tête demandait, et l'ordre dans lequel il a fallu vérifier

La tête du cycle 93 donnait trois pistes. La vérification a écarté la troisième avant d'écrire
une ligne : elle annonçait que le balayage éphémère « n'émet AUCUN `conversation:unread-updated`
ni `message:deleted` en direct », et le code portait déjà `_announce()` via
`broadcastMessageMutation` — clos par les commits `b3e95ef0`/`6b9d32e6` du cycle 92 lui-même,
après la rédaction de sa tête. **Une tête de cycle se vérifie contre le code, pas contre
elle-même.** C'est consigné en tête du cycle 94 comme règle.

Restaient la piste 1 (`isViewOnce`) et la piste 2 (les deux restes de la destruction éphémère).
Les deux ont rendu.

## 1. `isViewOnce` — le budget se comptait, rien ne le dépensait

### Le défaut

`recordViewOnceConsumption` (cycle 57) compte les spectateurs exactement. La route
`POST /conversations/:id/messages/:messageId/consume` calcule `isFullyConsumed`. L'annonce
`message:consumed` la porte à toute la room. Les clients masquent le média.

**Et rien n'effaçait.** `content`, `encryptedContent` et les pièces jointes restaient servis par
les ~119 lectures du modèle, qui sont toutes gardées par `deletedAt` seul — que personne ne posait
sur un budget épuisé. Une réinstallation, un nouvel appareil, un appel d'API avec un jeton valide,
ou simplement le client WEB — qui n'a AUCUN traitement de la vue unique et rend la photo comme
n'importe quelle autre — relisaient indéfiniment ce que l'émetteur croyait consommé.

Exactement la forme d'`expiresAt` avant le cycle 92 : toute la chaîne a l'air branchée, et il
manque la seule pièce que personne ne regarde parce qu'elle ne produit aucun événement.

### Le correctif : décider ici, détruire ailleurs

La tête posait la bonne question — *le balayage, ou la consommation elle-même ?* La réponse est
**les deux, et pas au même titre** :

- la **consommation** est la seule à SAVOIR que le budget vient de s'épuiser ;
- elle est la plus mauvaise place pour DÉTRUIRE : `consumeViewOnce` est attendu AVANT la
  révélation de la bulle (iOS, `BubbleBlurRevealLifecycle`), et le média n'est pas toujours déjà
  en cache. Effacer dans la foulée prendrait le contenu des mains du destinataire à l'instant
  précis où il vient de payer sa vue.

`scheduleViewOnceBurn` pose donc `expiresAt = now + VIEW_ONCE_BURN_GRACE_MS` (5 min) et laisse le
balayage du cycle 92 exécuter — fichiers, clair, traductions, effets de retrait et annonce
`message:deleted` comprises. **Aucune seconde implémentation de la destruction**, et la vue unique
hérite gratuitement de tout ce que le balayage a coûté à écrire.

### Les deux choses que ce correctif pouvait casser

1. **Rallonger la vie d'un contenu.** Un message peut être à la fois éphémère et à vue unique. Un
   `update` nu écrirait la grâce par-dessus un `expiresAt` de 30 s — une régression silencieuse
   sur la plus forte des deux promesses. Le prédicat n'apparie que l'absence, le nul, et les
   échéances POSTÉRIEURES à celle qu'on pose. La conséquence utile est l'idempotence gratuite :
   un second appel ne réécrit rien.
2. **Perdre la vue déjà payée.** La programmation est best-effort : une panne d'écriture est
   journalisée, la réponse reste un succès. Échouer ici retirerait au spectateur un média dont la
   revendication est déjà dépensée — sans rendre le contenu plus sûr pour autant. Non gardée par
   `firstConsumption`, la programmation se rejoue et répare.

### Ce que le correctif n'a délibérément PAS changé

`maxViewOnceCount: null` vaut « 1 » dans la route (`?? 1`) et « tous les membres » dans le
commentaire du schéma. Les clients agissent déjà sur le `isFullyConsumed` que la route calcule :
le comportement effectif EST « 1 ». Faire respecter une sémantique et la changer dans le même
geste aurait mélangé deux décisions. Porté en tête du cycle 94.

## 2. `metadata` — la dette du cycle 92 reposait sur un raisonnement faux

Le cycle 92 avait mis `metadata` hors périmètre au motif que « ce n'est pas le contenu du
message ». Vérification faite, c'est faux là où ça compte :

- `MessageProcessor.saveMessage` range le lieu partagé dans `metadata.location` — coordonnées
  **en clair**, stockage assumé (`services/location/sharedPlace.ts`) ;
- `metadata.postReplyTo` porte l'instantané figé du post cité (contenu, vignette, compteurs).

Une position GPS survivait donc à l'échéance du message qui la portait, en clair et pour toujours,
pendant que le TEXTE du même message était détruit — précisément la fuite au repos que cette passe
a été écrite pour fermer.

Et le second reste nommé par la tête (« les lignes de localisation, `MessageLocation` ») **n'existe
pas** : il n'y a pas de modèle séparé, la localisation vit dans ce même champ. Les deux dettes
étaient la même, et se ferment d'un `metadata: null`.

L'effacement vient APRÈS la capture : `applyMessageRemovalEffects` lit `metadata` pour décompter
les compteurs de conversation et travaille sur la copie prise par le `select`. Un test garde
maintenant explicitement `select.metadata === true`.

## 3. Preuves

| Vérification | Résultat |
|---|---|
| `scheduleViewOnceBurn.test.ts` avant correctif | RED (module absent) |
| `ExpiredMessagesCleanupService.test.ts` (2 cas ajoutés) avant correctif | RED (2 échecs sur 18) |
| `bunx tsc --noEmit` (gateway) | 0 diagnostic |
| `bun run test` (gateway, suite complète) | 682/682 suites, 16 886 tests |

## 4. Ce que ce cycle laisse ouvert, et qu'il a lui-même créé

- **Le passif en base.** `scheduleViewOnceBurn` n'est appelé que depuis la route de consommation.
  Un message épuisé AVANT ce déploiement n'obtient son échéance que si quelqu'un rappelle
  `consume` dessus — ce que personne ne fait sur un média déjà masqué. Une passe de rattrapage
  unique fermerait le passif ; elle n'est pas écrite.
- **Le transfert reste la seule sortie ouverte**, et le devient d'autant plus que les deux autres
  sont maintenant fermées. Détail en tête du cycle 94.
- **L'index `expiresAt_ephemeral_partial` n'est toujours pas appliqué** en production, et ce cycle
  augmente le débit du balayage qui en dépend.

---

# Cycle 92 — L'autodestruction n'existait que sur l'écran

*Branche `claude/keen-hamilton-zexh82`. Un correctif, RED-prouvé avant correction, et un audit
qui a rendu autre chose que ce que la tête du cycle attendait.*

## 0. Ce que l'audit cherchait, et ce qu'il a trouvé

La tête du cycle 92 donnait trois pistes, toutes de la même famille : *un état poussé par socket
et jamais re-demandé à la reconnexion*. En suivant la deuxième (« réactions, épinglages,
présence »), la vérification a d'abord établi que la famille était **déjà couverte** — la file
hors ligne porte `new`, `edited`, `deleted`, `pinned`, `unpinned`, les deux réactions et les
mises à jour de pièce jointe, sur cinq transports, et `_drainedEventName` les rejoue toutes.

C'est en cherchant ce qui restait de non couvert dans le cycle de vie d'un message que le
`expiresAt` du schéma est apparu — écrit partout, **lu nulle part côté serveur**.

## 1. Le défaut

`Message.expiresAt` est écrit par les deux transports d'envoi (`MessageHandler` pour le WS,
`routes/conversations/messages.ts` pour le REST), et `MessageProcessor.saveMessage` en dérive le
drapeau `MESSAGE_EFFECT_FLAGS.EPHEMERAL`. Les trois clients le décodent ; deux replient la bulle
à l'échéance (iOS `ThemedMessageBubble` + `BubbleStandardLayout`, Android « collapse ephemeral
bubble when its self-destruct timer expires »). Toute la chaîne avait l'air branchée.

Elle ne l'était pas :

| Ce qui existait | Ce qui manquait |
|---|---|
| écriture d'`expiresAt` sur les 2 transports | aucune LECTURE ne le filtre — les ~119 requêtes du modèle sont gardées par le seul `deletedAt` |
| repli de la bulle sur 2 clients sur 3 | le web n'a AUCUN traitement d'éphémère |
| `ExpiredStoriesCleanupService` pour les `Post` | rien pour les `Message` — `MaintenanceService` ne balaye que les messages VIDES |

Conséquence : le texte en clair d'un message « autodestructible » restait servi par
`GET /conversations/:id/messages` **indéfiniment** après son échéance. Réinstallation, nouvel
appareil, client web, appel d'API brut avec un jeton valide : tous le rendaient intégralement.
Ce que l'expéditeur croyait effacé au bout de trente secondes était intact un an plus tard.

## 2. Le correctif, et les deux façons dont il pouvait faire pire

`ExpiredMessagesCleanupService` (`services/gateway/src/services/`), démarré par `server.ts` à
côté du balayage des stories. Une passe par minute — et non l'heure des stories : la plus courte
durée offerte par les clients est de 30 s, la fenêtre résiduelle doit rester du même ordre que
la durée qu'elle borne.

**Effacer plutôt que masquer.** Les quatre écrivains existants de `deletedAt` posent la date et
vident les traductions mais LAISSENT le clair en base : une suppression demandée par une
personne veut dire « retire-le de la vue ». Une échéance dit « détruis-le ». Ce balayage est
donc le seul chemin qui écrase `content` et `encryptedContent`. Masquer sans effacer aurait
fermé la fuite de LECTURE en laissant intacte la fuite AU REPOS — celle que l'échéance promet
précisément de fermer.

**Masquer plutôt que filtrer.** `deletedAt` retire le message des ~119 lectures **sans en
toucher une seule**. Filtrer `expiresAt` dans chacune aurait fermé la fenêtre résiduelle au prix
de 119 sites, chacun libre de l'oublier.

Les deux garde-fous, tous deux RED-prouvés :

- **`unsetOrNull('deletedAt')`, jamais `deletedAt: null` seul.** Une ligne dont le créateur n'a
  pas écrit `LIVE_MESSAGE_MARK` a la colonne ABSENTE ; le filtre nul ne l'apparie pas et
  l'éphémère survivrait exactement là où personne ne le chercherait. C'est le piège que ce dépôt
  a payé quatre fois en production (cf. `utils/prisma-unset.ts`).
- **`_isLapsed` re-filtre dans le processus.** Sur MongoDB l'ordre BSON place `null` avant les
  dates ; `$lt` est bracketé par type et ne les apparie donc pas. C'est vrai — et le rayon de
  souffle d'une erreur ici est la destruction de TOUS les messages de la base. Un invariant à ce
  prix se revérifie dans le processus plutôt que dans un commentaire. Une divergence entre ce
  que la requête rend et ce que le filet accepte est journalisée en `error`, pas avalée.

**Index partiel.** `expiresAt` est écrit explicitement à `null` par tous les créateurs : un
`@@index([expiresAt])` ordinaire porterait une entrée par message pour servir une fraction
infime d'entre eux. `partialFilterExpression: { expiresAt: { $type: 'date' } }` n'indexe que les
lignes qui ont réellement une échéance — exactement l'ensemble interrogé. Prisma ne sait pas
l'exprimer dans le schéma ; le dépôt a le précédent
(`2026-05-09-message-client-id.mongodb.js`).

**Tests** (11, tous RED d'abord) : le prédicat d'échéance ; l'appariement des deux états de
`deletedAt` ; la fournée bornée et ordonnée par échéance croissante ; l'effacement exact
(clair + chiffré + traductions + `deletedAt`) ; **rien n'est détruit d'un message sans échéance
ou pas encore échu** ; les fichiers partent avant la ligne qui les nomme ; un fichier
récalcitrant n'empêche pas la destruction ; les effets de retrait partagés jouent avec le
contenu CAPTURÉ avant l'effacement ; un message en échec ne fait pas échouer la passe ; une
requête en échec rend une passe vide ; `start`/`stop` arment et désarment.

## 3. Ce que le cycle 92 laisse volontairement de côté — et qui est nommé, pas oublié

- `metadata` (instantané de post cité, résumé d'appel) et les lignes de localisation survivent à
  la destruction. Ce n'est pas le contenu du message, mais un partage de position éphémère laisse
  ses coordonnées en base.
- **Aucune émission live.** Le balayage ne pousse ni `message:deleted` ni
  `conversation:unread-updated` : un client web connecté garde le message affiché et lisible
  jusqu'au prochain rechargement. C'est le reste le plus visible, et le plus facile à fermer.
- Les migrations MongoDB manuelles n'étant jouées par aucun déploiement, l'index est **fourni,
  pas appliqué**.

---

# Cycle 91 — Le rattrapage des accusés n'existait que pour un client sur trois

*Branche `claude/keen-hamilton-6o1jgj`. Un correctif gateway, RED-prouvé avant correction. Et le
doublon de la leçon 142 rencontré une quatrième fois — mais à moitié seulement, ce qui a changé la
conclusion.*

## 0. Le doublon, et pourquoi le salvage a été POSITIF cette fois

Le cycle a ouvert sur la tête du cycle 90 et implémenté ses DEUX priorités : la pastille de non-lus
sur les transports REST de suppression, et le rattrapage des accusés. Le `fetch` d'avant-PR a
rapporté `8ee058fa` — une session parallèle avait livré le cycle 90 pendant ce temps.

Le verdict n'est pas le même sur les deux moitiés, et c'est tout l'enseignement :

| Moitié | Verdict | Pourquoi |
|---|---|---|
| pastille sur suppression REST | **jetée** | même défaut, même site, et leur `MessageMutationParams` en union discriminée est meilleur que le champ optionnel écrit ici — le type interdit l'oubli au lieu de le rattraper |
| rattrapage des accusés | **conservée** | même défaut, **couverture disjointe** : leur correctif est web-only (`use-conversation-messages-rq.ts`), celui-ci est gateway et sert les trois clients |

La leçon 142 dit de fetcher au grain de l'ÉDIT. Elle reste juste et n'a, ici encore, pas été
appliquée. Mais elle ne dit pas quoi faire APRÈS la collision, et la réponse du cycle 90
(« salvage intégralement négatif ») n'est pas généralisable : **un doublon de défaut n'est pas un
doublon de correctif**. Ce qu'il faut comparer, c'est la surface réparée — ici, deux clients sur
trois n'étaient réparés par personne.

## 1. `read-status:updated` manqué pendant une coupure n'était rejoué nulle part, sauf sur le web

`read-status:updated` n'est émis que par une ACTION d'accusé : un pair qui lit, une remise
automatique. Un socket coupé à cet instant ne le reçoit jamais et **rien ne le lui rejoue** — la
file de livraison hors ligne ne porte que des messages et leurs mutations. La coche de l'expéditeur
reste figée sur sa valeur d'avant la coupure ; les compteurs étant monotones côté client depuis le
cycle 85, un événement manqué n'est pas un retard qu'un suivant corrigerait, c'est un **gel
permanent**.

Le cycle 90 a réparé le web en relançant son lot REST sur le front montant de la reconnexion. iOS
et Android n'ont pas de lot REST équivalent : ils n'avaient **aucun** rattrapage.

**Site** : `ConversationHandler._resyncReadStatusToSocket`, appelé depuis `handleConversationJoin`
après l'émission du badge. `conversation:join` est le point de rattachement de chaque reconnexion
des trois clients — web `_autoJoinLastConversation`, iOS et Android re-joignent après
authentification (vérifié sur les trois). Le payload est celui qu'ils traitent déjà.

**`type: 'received'`, jamais `'read'`** — et ce n'est pas un détail de forme. iOS
(`ConversationSyncEngine.handleReadStatusUpdated`, `NotificationCoordinator.handleReadStatusUpdated`)
et Android ne remettent le compteur de non-lus à zéro que sur un `'read'` émis par SOI-MÊME. Un
rattrapage estampillé `read` aurait vidé la pastille du rejoignant à **chaque ouverture de
conversation** — le correctif aurait fabriqué un défaut pire que celui qu'il ferme. `received` ne
porte que le `summary` agrégé : même contrat que la remise automatique en lot
(`MessageHandler.autoDeliverToOnlineRecipients`), qui est le précédent de cette forme.

**Le rattrapage ne peut pas faire reculer une coche.** Vérifié sur les trois clients avant d'écrire
la ligne, parce que c'était le seul moyen que ce correctif nuise : `isStaleReceipt` (web,
`conversation-ui-store.ts`), `if newStatus.isBetterThan(current)` (iOS, `applyReadReceipt`),
`deliveryRank` (Android, `MessageRepository.applyReadReceipt`). Les trois n'appliquent le résumé
que vers le haut.

Un résumé entièrement à zéro (conversation sans message) n'est pas émis : il n'y a rien à
rattraper, et les trois clients l'ignoreraient de toute façon.

**Tests** (5, tous RED d'abord) : le résumé courant part au socket qui rejoint ; il part aussi sous
le nom canonique `message:read-status-updated` ; il n'est JAMAIS estampillé `read` ; rien ne part
d'une conversation vide ; un résumé en échec ne fait pas échouer le join.

---

# Cycle 90 — Deux compteurs qui mentaient sans jamais se corriger

*Branche `claude/keen-hamilton-acrbyg`. Deux correctifs, chacun RED-prouvé avant correction. Et une
heure perdue en doublon, consignée en tête de fichier et en leçon 142.*

## 0. Ce que ce cycle a d'abord écrit pour rien

Le cycle a ouvert sur la tête du cycle 90, qui donnait les trois défauts restants du pipeline de
traduction. Ils ont été implémentés et prouvés (10 tests, suite gateway verte) — puis le `fetch`
d'avant-PR a rapporté `ee547fa8` : une session parallèle avait livré les **mêmes trois**, plus la
moitié WS de la priorité 3, et était déjà sur `main`.

Le salvage a été mené test par test et s'est révélé **intégralement négatif**. Les 10 tests écrits
passaient tous contre l'implémentation de `main` — les deux sessions avaient donc la même lecture
des défauts — mais les 7 tests d'en face couvraient strictement plus (forme canonique de la langue,
retry ne redemandant que les langues manquantes, erreur nommant les langues jamais rendues, double
livraison). **Rien n'a été conservé.** La branche a été remise à plat sur `origin/main`.

Deux points où la version parallèle était objectivement meilleure, gardés comme motifs (leçon 142) :
un **plafond FIFO doit être renégocié quand sa clé gagne une dimension** (5 000 → 20 000 : sinon
l'éviction couvre N fois moins de MESSAGES, et une entrée évincée se lit « jamais périmé » — le
garde se désarme tout seul sous charge) ; et un **retry après succès partiel ne doit redemander que
ce qui manque**, sous peine de dupliquer le travail du worker pool ML.

## 1. Les deux transports REST de suppression ne repoussaient pas la pastille de non-lus

Le cycle 89 avait câblé le recalcul sur le transport WS. Les deux transports REST —
`DELETE /messages/:id` (Android) et `DELETE /conversations/:id/messages/:messageId` (SDK iOS) —
ne le faisaient pas : le lecteur voyait le message disparaître pendant que sa pastille continuait
de le compter. La liste web tourne en `staleTime: Infinity` : la valeur ne vieillit pas, **elle
ment**. Le décompte était déjà juste (`deletedAt: null` filtré) ; il ne manquait que de le
redemander.

La poussée vit dans `broadcastMessageMutation` — l'unique broadcaster des cinq routes de mutation
REST — donc écrite **une seule fois** pour les deux suppressions. Les trois autres appelants sont
des éditions : une édition ne change aucun compte, et l'y brancher aurait coûté deux requêtes par
frappe validée pour zéro delta.

L'exclusion porte sur l'**AUTEUR**, jamais sur l'acteur : un modérateur qui retire le message d'un
autre est lui-même un destinataire à rafraîchir. C'est l'inverse de la file hors ligne, dix lignes
plus bas, qui exclut bien l'acteur.

**C'est le TYPE qui tient la règle** : `MessageMutationParams` est une union discriminée où
`authorId` est requis sur `'deleted'` et absent de `'edited'`. Les deux callsites à corriger ont été
trouvés par `tsc`, pas par lecture — et un sixième transport de suppression ne compilera pas sans
nommer son auteur.

## 2. Les accusés de lecture ne se rattrapaient jamais après une coupure socket

Le lot REST `getReadStatuses` est gardé par `${conversationId}:${dernier message à soi}` : il ne se
relance donc que lorsqu'on **ENVOIE**. Et `conversation:join` ne re-émet aucun `read-status:updated`.

Depuis que le cycle 85 a rendu ces compteurs **monotones**, un événement manqué n'est plus une
valeur en retard qu'un suivant corrigerait : c'est un **gel permanent**. L'expéditeur garde une
coche « remis » sur un message que tout le monde a lu, jusqu'à ce qu'il en envoie un autre.

Le hook rattrapait déjà les MESSAGES manqués sur le front montant de la reconnexion. Ce front est
désormais compté **une seule fois** (`reconnectEpoch`) et sert les deux dettes du même instant. La
détection de front, dupliquée pour les messages et absente pour les accusés, n'existe plus qu'en un
endroit.

## Vérification

- Suite gateway complète : **680/680 suites, 16 847/16 847 tests**. `tsc --noEmit` : 0 diagnostic.
- Suite web complète verte ; `tsc --noEmit` web : **1 224 diagnostics, tous dans `__tests__/**` et
  strictement pré-existants** — compte identique mesuré sur l'arbre stashé, aucun sur un fichier
  touché ici. Consigné plutôt qu'assaini (hors périmètre).
- Le test de rattrapage a d'abord été **flaky sous la suite complète** (`waitFor`, délai par défaut
  d'une seconde, 564 suites en parallèle). Il asserte désormais directement après `rerender` : le
  front monté relance le lot de façon synchrone, il n'y avait rien à attendre. RED/GREEN re-prouvé
  sous cette forme, en retirant `reconnectEpoch` de la clé.

---

# Cycle 89 — Le pipeline de traduction jetait, détruisait, et abandonnait

*Branche `claude/keen-hamilton-sr0nsc`. Quatre correctifs gateway, chacun RED-prouvé avant
correction : trois sur le pipeline de traduction (l'ancienne priorité 2 en entier), un sur la
pastille de non-lus.*

## 1. Le garde « traduction périmée » jetait des résultats VALIDES

`_isStaleTranslationResult` comparait un `taskId` **par MESSAGE**. Toute retraduction — même ne
visant qu'UNE langue — supplantait donc les résultats encore en vol de TOUTES les autres. Ces
lecteurs restaient sur l'original **définitivement** : rien ne retente une traduction que le gateway
a lui-même jetée, et le message n'est plus jamais retraduit.

La clé porte désormais la langue : `${messageId}::${normalizeLanguageCode(langue)}`. Les deux côtés
normalisent — l'enregistrement au dispatch et la lecture à la réception — sinon une cible demandée
`'pt-BR'` et un résultat rendu `'pt'` ne se reconnaissent pas (c'est exactement la leçon du cycle 88
sur `getTranslation`, dans l'autre sens).

Le garde reste entier pour ce qu'il vise vraiment : une langue REDEMANDÉE par une tâche plus récente
est bien périmée, et un test le verrouille dans les deux sens.

## 2. La retraduction SUPPRIMAIT la traduction avant que le remplacement existe

`_processRetranslationAsync` retirait les langues cibles de `Message.translations` et **persistait
la suppression avant l'envoi ZMQ**, sans rollback. Translator muet, retries épuisés, circuit
breaker ouvert : la traduction correcte était perdue définitivement.

Cette suppression ne protégeait de rien. Les QUATRE transports d'édition écrivent déjà
`translations: null` **dans l'écriture du contenu elle-même** (`routes/messages.ts:361`,
`messages-advanced.ts:253` et `:793`, `MessageHandler.ts:781`) — c'est ce qui ferme la fenêtre
« texte d'après + traductions d'avant », et un test dédié le verrouille depuis le cycle 35. Et
`_saveTranslationToDatabase` REMPLACE `translations[langue]` quoi qu'il s'y trouve. Le bloc ne
pouvait donc que détruire, notamment sur une retraduction ciblée, qui n'accompagne aucune réécriture
de contenu.

Bénéfice annexe : un read-modify-write sous mutex et un `message.update` de moins sur le chemin
chaud de CHAQUE édition.

## 3. Une requête multi-langues était réputée soldée par son PREMIER résultat

Le translator rend les langues **une par une** : `translationCompleted` arrive N fois pour un même
`taskId`. `ZmqTranslationClient` appelait `removePendingRequest` dès le premier — désarmant d'un
coup deadman, retry et `translationError` pour les langues 2..N. Si le translator mourait après
avoir rendu l'anglais, l'espagnol et l'italien ne revenaient jamais, personne ne l'apprenait, rien
ne les retentait.

`ZmqRequestSender` mémorise désormais le jeu des langues encore attendues (forme canonique) et
`settleTranslationLanguage()` n'en solde qu'une à la fois ; la requête ne tombe qu'avec la dernière.
Le retry porte le même `taskId` mais **ne redemande que les langues manquantes** — re-pousser une
langue déjà rendue duplique le travail du worker pool ML, exactement le mode de panne que l'incident
prod du 2026-08-06 a documenté sur le pipeline audio.

Pour que le renvoi CONNAISSE les langues manquantes, `registerTimeout` les passe à son callback :
l'entrée est retirée avant l'appel, c'est la seule occasion de les lire.

## 4. Rien ne recalculait les non-lus après une suppression

Aucun des sites d'émission de `conversation:unread-updated` n'était un chemin de suppression : ils
sont tous des chemins d'ENVOI. Le badge comptait un message que le lecteur voit disparaître, et la
liste web tourne en `staleTime: Infinity` — la pastille ne vieillit pas, elle ment.

Le décompte était déjà juste (`getUnreadCountsForParticipants` filtre `deletedAt: null`) : il ne
manquait que de le redemander. `handleMessageDelete` appelle donc l'unité partagée, à côté de
`emitConversationPreviewUpdate`.

**L'exclusion porte sur l'AUTEUR, pas sur l'acteur** — l'inverse exact du choix fait juste en
dessous pour la file hors ligne, et pour une raison symétrique : l'auteur est la seule identité dont
le compteur ne peut PAS bouger ici (ses propres messages ne comptent jamais dans ses non-lus), alors
qu'un modérateur qui supprime le message d'un autre est, lui, un destinataire à rafraîchir.

Au passage, `_updateUnreadCounts` ne prend plus qu'un `senderId` — la seule chose que l'unité lise
du message. Exiger un `Message` complet obligeait le chemin de suppression, qui n'a qu'un `select`
étroit, à mentir par cast.

## Vérification

- `bun run test` gateway : suite complète verte (voir la section de vérification du commit).
- `npx tsc --noEmit` gateway : sans erreur.
- Documentation : `src/socketio/README.md` gagne « La pastille de non-lus — l'envoi n'est pas le
  seul instant qui la bouge » ; `src/services/zmq-translation/README.md` gagne « Une requête
  multi-langues se solde LANGUE PAR LANGUE ».

---

# Cycle 88 — Cinq défauts prouvés, cinq correctifs, et une porte laissée fermée exprès

*Branche `claude/keen-hamilton-blazrp`. Cinq correctifs (2 gateway, 2 web, 1 translator), chacun
RED-prouvé avant correction. Suites complètes vertes des deux côtés : **gateway 654/654 suites,
16 504/16 504 tests** ; **web 563/563 suites, 12 089 tests passés, 21 ignorés, 0 échec**.*

## 1. L'invité de lien partagé rejoignait en silence — accusé ET badge

`conversation:join` gatait TOUTES ses émissions post-join sur `connectedUser.userId` — `undefined`
pour un anonyme — alors que le contrôle d'appartenance juste au-dessus l'a laissé passer et que le
socket EST dans la room.

**Le compteur.** `getUnreadCount` accepte indifféremment un `Participant.id` ou un `User.id` (son
en-tête nomme même le chemin anonyme comme le cas courant). Piège évité : passer `connectedUser.id`
(le jeton de session) aurait rendu `0` en silence — un badge « correct » et faux. Un test verrouille
l'identité exacte transmise, pas seulement le fait qu'un compteur parte.

**L'accusé.** Le cycle 87 l'avait laissé fermé faute d'avoir lu les clients. **Cette lecture a été
faite ici**, et elle renverse la difficulté : les cinq consommateurs
(web `use-socket-cache-sync` / `use-stream-socket` / `orchestrator`, iOS `ConversationSyncEngine` /
`ParticipantsView`) n'exploitent QUE `conversationId`. Aucun ne lit `userId`.

La seule contrainte dure est de DÉCODAGE : `ConversationParticipationEvent.userId` est un `String`
**non optionnel** côté Swift — omettre le champ ferait échouer le décodage et l'accusé serait
silencieusement jeté sur iOS. Le champ doit exister ; sa valeur n'est lue par personne. D'où
`participationId = userId ?? participantId`, une seule résolution d'identité pour les deux
émissions.

**Ce qui reste fermé, et pourquoi.** Les stats de conversation restent gatées sur `userId` :
diffuser un effectif et une liste de présents à un invité de lien est une décision produit, pas un
correctif.

## 2. `getTranslation()` lisait une clé que personne n'écrit

Lecture verbatim de `translations[targetLanguage]` alors que tous les écrivains stockent sous la
forme canonique de `normalizeLanguageCode` (`'pt-BR'` → `'pt'`). Une demande `pt-BR` sondait donc
une clé absente pendant que la traduction attendait une clé plus loin — puis l'appelant rendait un
repli **fabriqué** `[PT-BR] <texte original>` après 10 s. La pire forme de violation du Prisme : du
contenu non traduit présenté comme traduit.

Verbatim d'abord, normalisé en repli — aucune traduction ne change de gagnant, seules celles qu'on
ne trouvait pas deviennent trouvables. La cible RENDUE reste celle demandée (`'pt-BR'`) : le client
corrèle sa requête dessus, la normalisation est un détail de stockage.

## 3. Ouvrir un profil coupait la connexion temps réel

`useSocketIOMessaging` appelait `reconnect()` sans condition au montage. Or `reconnect()` n'est pas
un « connecte si besoin » : c'est `disconnect()` + reconnexion différée par backoff (1 à 2,5 s au
premier essai, `connection.service.ts:141`). Cinq composants montent ce hook — ouvrir un profil
coupait donc un socket parfaitement sain. L'étape 1C, quinze lignes plus bas, fait le même geste
correctement gardé ; c'est cette garde qui a été appliquée.

**Ce que le RED a révélé au passage** : les deux tests de montage existants ne passaient que parce
que le code ignorait les diagnostics. Ils héritaient par FUITE d'un `isConnected: true` posé par un
test « Initial State » plus haut — `jest.clearAllMocks()` remet les appels à zéro mais **pas les
implémentations**. Leur précondition est désormais explicite.

## 4. Une réaction refusée par le serveur restait affichée pour toujours

Les deux mutations gardaient leur rollback derrière `if (context?.previousData)`. Or `onMutate`
FABRIQUE l'état quand le cache est vide — `previousData` vaut alors `undefined`, et le garde refusait
précisément de défaire ce qui venait d'être inventé.

**Le rollback inconditionnel ne suffisait pas** : `setQueryData(key, undefined)` est un **no-op** en
React Query (`undefined` = « ne rien changer »), et les tests sont restés ROUGES après le premier
correctif. Restaurer l'absence de donnée exige `removeQueries`. D'où `restoreReactionSnapshot`, qui
retire l'entrée quand il n'y avait rien et la réécrit sinon.

## 5. Chaque audio traduit partait en double

Bloc `if audio_bytes:` dupliqué VERBATIM dans le sender multipart : 2× la charge ZMQ par message
vocal multilingue. La seconde copie écrasait en outre la métadonnée avec son propre index — celle-ci
désignait le doublon, et la première copie restait un frame orphelin.

**Pourquoi ça n'avait rien cassé, et donc survécu** : le gateway résout les frames STRICTEMENT par
`info.index` (`extractAudioBinaryFrames`, bornes vérifiées, aucune hypothèse de position). Origine
sans ambiguïté au `git log -L` : un hunk de conflit résolu en double dans un commit de merge.

**Réserve d'honnêteté** : la suite pytest du translator n'a PAS pu être exécutée — `numpy`/`torch`
s'installent depuis l'index PyTorch, bloqué par le proxy. La sûreté du retrait est établie par
lecture des deux côtés du contrat, **pas par exécution**. C'est le seul des cinq correctifs qui ne
soit pas couvert par un test vert.

## Ce que le cycle 88 a mesuré au passage

- **La suite gateway a plus que doublé depuis la dernière note du dossier** : 654 suites / 16 504
  tests, contre les « 249 suites » que `CLAUDE.md` annonce encore. Durée : 8 min 06.
- **`npx tsc --noEmit` sur `apps/web` remonte 1 757 erreurs pré-existantes**, toutes dans des
  fichiers de test (`TS7031` implicit any sur des mocks, `TS2345` sur des littéraux
  `ReactionUpdateEvent`). Le CI ne s'en émeut pas : l'étape `Type-check` de `ci.yml` porte
  `continue-on-error: true`. Aucune n'est imputable à ce cycle — les lignes écrites ici n'en
  produisent aucune. À traiter comme une dette déclarée, pas comme une régression.
- **`bun install` échoue sans `--ignore-scripts`** : le postinstall de `grpc-tools` sort en erreur
  et interrompt l'installation entière (`node_modules` racine à 8 entrées, aucun workspace servi).


---

# Cycle 87 — Trois compteurs qui mentaient, et un correctif écrit deux fois

*Branche `claude/keen-hamilton-tpltop`. Trois correctifs gateway, chacun RED-prouvé par
réintroduction du défaut. Suite gateway complète verte.*

## 1. `conversation:leave` ne retractait pas la frappe — livré par une AUTRE session

Écrit ici, et simultanément sur `claude/keen-hamilton-8m3aqm` qui l'a mergé sur main en premier.
Les deux implémentations ont convergé : même nom (`retractTypingIn`), même signature à id déjà
normalisé, même ordre (retracter avant `socket.leave`), même refus de re-résoudre la conversation.

**Résolution du merge, en faveur de main partout où les deux se touchent** — sa dépendance
`retractTyping` est optionnelle là où la mienne était requise, et son `try/catch` vit au point
d'appel plutôt que dans la retraction. Deux choix défendables, déjà mergés, non rejoués.

Ce qui a survécu de cette branche :

- **`StatusHandler.test.ts` : trois tests de `retractTypingIn`** — main n'en avait aucun, sa
  couverture passait entièrement par `ConversationHandler`. Dont celui qui compte : *« costs nothing
  for a socket that never typed »* (aucune résolution, aucune requête, aucune diffusion), soit
  l'écrasante majorité des changements de conversation.
- **Deux garanties ajoutées à `ConversationHandler.test.ts`** : la conversation n'est résolue
  QU'UNE fois, et un payload refusé ne retracte rien.
- Un test que j'avais écrit affirmait « la retraction ne rejette jamais » : c'était **mon** contrat,
  pas celui de main, qui place le `try/catch` chez l'appelant. Réécrit pour affirmer ce que la
  version de main garantit réellement — l'ordre untrack-avant-I/O, qui est ce qui évite un socket
  éternellement « en train d'écrire » après une panne DB.

## 2. `mark-read` diffusait un `read-status:updated` amputé — iOS ne synchronisait jamais ses lectures

`POST /conversations/:id/mark-read` construisait son payload sans `lastReadAt` ni `unreadCount`.
`ReadStatusUpdatedEventData` les déclare comme une **paire** sur `type: 'read'`, et le contrat dit
qu'un consommateur les applique ensemble ou pas du tout. iOS le fait à la lettre
(`ConversationStoreSocketBridge` : `guard … let lastReadAt, let unreadCount else { return }`), donc
un payload amputé n'est pas appliqué partiellement — il est **jeté**.

Et c'est cette route que poste `ConversationService.markRead`, le transport de lecture primaire
d'iOS. **Chaîne vérifiée de bout en bout** (Swift → route → payload → garde client) : la synchro de
lecture multi-appareils d'iOS ne partait jamais. Lire sur son iPhone ne descendait pas le badge sur
son iPad. La route jumelle `message-read-status.ts` envoyait le couple correctement depuis toujours.

Le couple est désormais résolu une fois et utilisé deux fois — il accompagne la diffusion ET
alimente la remise à zéro du badge, qui faisait jusqu'ici son propre `getUnreadCount` : **une
requête de moins par marquage**. Payload typé `ReadStatusUpdatedEventData`.

## 3. `GET /conversations/:id` rendait toujours `unreadCount: 0` à un invité de lien partagé

Clause `where: { conversationId, userId, isActive: true }` écrite à la main. Pour un invité,
`authContext.userId` PORTE un `Participant.id` : la clause comparait un id de participant à la
colonne `userId`, ne matchait rien, et le `0` obtenu **écrasait le badge que le socket venait de
pousser juste**. Le badge d'un invité ne pouvait que disparaître à chaque ouverture.

`resolveCallerParticipant` existe exactement pour ce site — son en-tête décrit ce défaut mot pour
mot pour les autres routes. Sa précédence (`participantId` avant `userId`) est celle de
`canAccessConversation` : accès et comptage ne peuvent plus diverger sur l'identité de l'appelant.
Le helper exclut en plus les bannis, ce que la clause manuelle ne faisait pas.

**Le site jumeau signalé par le cycle 86 n'en est pas un** : `_emitUnreadCountsSnapshot`
(`MeeshySocketIOManager`) est gardé par un `if (!isAnonymous)` explicite. Il ne produit pas une
valeur fausse, il n'en produit aucune — c'est une omission délibérée, pas le même défaut. L'étendre
aux anonymes est une évolution, pas un correctif, et rejoint la question d'identité de la
priorité 1 ci-dessus.

## Méthode

Chaque correctif RED-prouvé **en réintroduisant le défaut** dans le code de production, pas en
supposant le rouge : retraction débranchée → 1 rouge ; couple retiré du payload → 2 rouges ; clause
manuelle restaurée → 1 rouge. Restaurés, re-vérifiés verts à chaque fois.

Un test écrit pour le n°3 partait d'une prémisse fausse — il posait un compteur pré-marquage à 0,
or la route court-circuite légitimement quand il n'y a rien à marquer. **C'était le test qui avait
tort, pas la route** : corrigé pour distinguer le compteur d'avant et celui d'après le marquage.

Le double de base de données du test d'invité ne répond **que sur la colonne interrogée** — une
clause `{ userId: <participant id> }` n'y matche rien, comme en base. Et le module d'access-control
n'y est plus stubbé que sur `canAccessConversation` : c'est la vraie règle de précédence qui est
exercée, pas un mock qui la répète.

---

## Cycle 87 (bis) — la retraction de frappe, telle que la session qui l'a mergée l'a consignée

*Section écrite par `claude/keen-hamilton-8m3aqm`, la session qui a livré PR #2880. Conservée
telle quelle au merge : sa vérification par mutation est la sienne, et elle porte une information
que l'autre session n'avait pas.*

Livré et mergé : PR #2880. Détail dans `.changeset/gateway-leave-retracts-typing.md` et dans la
section « Livré au cycle 87 » ci-dessus.

Vérification : RED prouvé (d'abord à la compilation, puis 3 rouges de comportement) ; **5 mutations,
5 rouges** — retraction jamais appelée, retraction déplacée après `socket.leave`, id brut relayé,
`try/catch` local retiré, extraction rendue injoignable depuis `typing:stop` (10 rouges sur les
suites StatusHandler, ce qui prouve que le chemin d'origine passe bien par l'unité extraite). Suite
gateway complète **654/654 suites, 16 491 tests** (baseline au même commit : 16 486). `tsc` gateway
0 diagnostic avant comme après. CI verte sur `e5a88697`, `main` mergé à la main sans conflit avant
le merge.

**Un test du fichier ne discriminait rien, et seule la mutation l'a montré.** Le double de
`validateSocketEvent` rend un `conversationId` CONSTANT : « id normalisé » et « id brut » y étaient
indistinguables, et la mutation correspondante a survécu au premier passage. Le test fait désormais
échoïser son entrée au double. C'est la deuxième fois en deux cycles qu'un double trop complaisant
laisse passer les deux versions du code (leçon 128) — la mutation reste le seul détecteur fiable.


# Cycle 86 — Les indicateurs de saisie du web : morts à la réception, fantômes à l'émission

## Le correctif livré (PR #2879)

Sur le web, la **vue conversation** n'a jamais affiché « X est en train d'écrire… », et n'a jamais
retracté ce qu'elle faisait afficher aux autres. Deux défauts indépendants sur la même
fonctionnalité.

**Réception.** `ConversationLayout.onUserTyping` — le callback que la vue confie au socket — se
réduisait à deux gardes suivies de rien :

```ts
const onUserTyping = useCallback((userId, _username, _isTyping, typingConversationId) => {
  if (!user || userId === user.id) return;
  if (typingConversationId !== selectedConversation?.id) return;
}, [user, selectedConversation?.id]);        // ← la fonction se termine ici
```

`useConversationTyping.handleUserTyping` — **seul écrivain** de `typingUsers` — n'était ni
déstructuré ni appelé. Chaque `typing:start`/`typing:stop` était reçu, filtré, jeté. L'en-tête rend
pourtant bien cet état (`ConversationView.mapTypingUsers` → `ConversationHeader` →
`ParticipantsDisplay` → `TypingIndicator`) : il n'a simplement jamais rien eu à rendre.

Ce qui a caché la panne : le **flux d'accueil** (`use-stream-socket.ts:128,306`) tient sa PROPRE
copie du handler et la câble correctement. La fonctionnalité marchait sur une surface et pas sur
l'autre.

**Émission.** Le nettoyage de `useConversationTyping` est une fermeture créée au rendu où
`conversationId` a changé pour la dernière fois : elle y capture un `isTyping` qui vaut toujours
`false`, donc `if (isTyping) stopTyping()` était **inatteignable** — et le même nettoyage annule le
timer d'auto-stop (3 s), si bien qu'aucun des deux chemins d'arrêt ne partait. Rien en aval ne
rattrapait (cf. priorité 1 ci-dessus). Changer de conversation sans vider le composeur laissait donc
un fantôme chez tous les pairs jusqu'à leur filet de 8 s.

Trois décisions :

- **Le layout délègue, il ne recopie pas.** Les deux gardes du callback existaient déjà dans
  `handleUserTyping` ; les rebrancher aurait dupliqué la règle. Le callback relaie, point.
- **Un ref pour casser le cycle.** `useConversationTyping` a besoin de `startTyping`/`stopTyping` que
  produit `useSocketIOMessaging`, qui a besoin du récepteur : la dépendance est réellement
  bidirectionnelle. Le ref la casse, et rend le callback STABLE — l'abonnement socket cesse de se
  refaire à chaque changement de conversation.
- **Un miroir de `isTyping` écrit à la main, pas synchronisé par effet.** React exécute tous les
  nettoyages avant tous les effets : un ref synchronisé par `useEffect` serait juste par accident
  d'ordonnancement. Écrit aux trois mêmes endroits que l'état, il est juste par construction.

### Vérification

- **RED prouvé avant le correctif** : 4 rouges (2 hook, 2 vue). Les 4 gardes négatives (écho de soi,
  autre conversation, pas de stop si on ne tapait pas, pas de double stop) passaient déjà — elles
  verrouillent le correctif contre une sur-émission.
- **Mutation appliquée et vérifiée — 6 réversions, 6 rouges** : relais neutralisé (2), branchement du
  ref retiré (2), nettoyage relisant l'état périmé (2), miroir non armé par `handleTypingStart` (2),
  non désarmé par `handleTypingStop` (1), non désarmé par l'auto-stop (1). Restauré, re-vérifié vert.
- **Suite web complète : 563/563 fichiers, 12 084 tests verts** (21 skipped).
- `tsc --noEmit` : **1 224 diagnostics avant comme après**, aucun dans les fichiers touchés.
- Baseline gateway relevée au même commit, non touchée : **654/654 suites, 16 486 tests verts**.

### Deux tests qui ne prouvaient rien

Le défaut d'émission a traversé une suite verte parce que deux tests le DOCUMENTAIENT au lieu de
l'affirmer — « The cleanup effect may or may not call stopTyping depending on React's cleanup
timing » — et n'assertaient donc rien sur `stopTyping`. Le défaut de réception, lui, était hors de
portée de tout test de la vue : `useConversationTyping` y était doublé en ENTIER, ce qui figeait
`typingUsers: []` et rendait `undefined` tout export nouvellement consommé (leçon 128, corollaire).
Le double est retiré ; le hook réel tourne désormais sous le test de la vue.

### Réserve d'honnêteté

Le dépôt est arrivé en **clone superficiel** (`--depth`, 24 greffes) : `origin/main` pointait sur un
commit vieux de trois jours et `git merge-base` ne trouvait AUCUN ancêtre commun avec la branche de
travail, ce qui affichait « 334 en avance / 340 en retard » pour deux références en réalité
identiques. Diagnostic établi par `git ls-remote` (main = `4fd18273` = HEAD), pas par déduction.
Toute conclusion de divergence tirée d'un `git log` dans cet environnement doit d'abord vérifier
`git rev-parse --is-shallow-repository`.


---

# (Reporté — non exécuté au cycle 86, faute de toolchain Swift) Dossier iOS : la suite rend des verdicts que le code ne justifie pas

*Le cycle 85 est allé chercher pourquoi la suite de référence iOS est rouge un run sur trois. La
réponse n'est pas « des tests flaky » : au moins un verdict est DÉMONTRABLEMENT faux.*

## Le fait à instruire en priorité

Run `31543763910` (`push dev`, 2026-08-11 22:45 UTC, head `bec43248`) rapporte :

```
XCTAssertTrue failed - hasActiveEffects must also check config.hasAdvancedFilters,
not just config.isEnabled, …
CallViewAccessibilityTests/test_hasActiveEffects_alsoChecksAdvancedFilters_notIsEnabledAlone()
```

Or `git show bec43248:apps/ios/Meeshy/Features/Main/Views/CallView.swift` contient bien, ligne
1528, `return config.isEnabled || config.hasAdvancedFilters`. Le test cherche `hasAdvancedFilters`
dans les **700 premiers caractères** suivant `private var hasActiveEffects: Bool {` : la chaîne s'y
trouve à l'**offset 500**, et le motif d'ancrage n'apparaît **qu'une fois** dans le fichier
(vérifié en rejouant l'assertion caractère par caractère sur le blob de ce commit exact).

**L'assertion ne PEUT pas échouer sur la source du commit testé. Elle a donc lu autre chose.**

C'est un défaut de classe, pas un test isolé : `MeeshyTests` compte **137 fichiers** et
**242 lectures** de la forme `String(contentsOf: URL(fileURLWithPath: #filePath)…)` — des « source
guards » qui grep le code produit **au runtime**, depuis un chemin figé à la COMPILATION. Le verdict
de ces 242 assertions ne dépend donc pas de ce qui a été compilé, mais de ce que le système de
fichiers de l'hôte présente au moment de l'exécution. Quand les deux divergent — cache DerivedData
restauré, worktree partagé, re-tentative après `** TEST EXECUTE FAILED **` (le log de ce run montre
bien un second `Testing started`) — la suite prononce un verdict sans rapport avec le commit.

Ce qu'il faut instruire, dans l'ordre :

1. **Reproduire sur macOS** : relancer ce test seul sur `bec43248` et logguer le chemin ET la taille
   du fichier réellement lu (`url.path`, `source.count`) avant l'assertion. C'est la mesure qui
   tranche entre « mauvais chemin » et « bon chemin, contenu périmé ».
2. **Décider du sort de l'idiome.** Un source guard qui passe vert sur une source qu'il n'a pas
   compilée ne garde rien. Soit on l'ancre à la compilation (ressource copiée dans le bundle de test
   par une build phase, donc solidaire du binaire), soit on le remplace par une assertion de
   COMPORTEMENT là où c'est possible. 242 sites : chantier à cadencer, pas à faire d'un bloc.
3. **Ne pas confondre avec le reste du rouge.** Sur 30 runs `push dev`, 11 échecs (37 %). Trois
   récidivistes — `AuthServiceTests` (timeout 2 s), `MiniAudioPlayerBarTests`,
   `LocalizationConsistencyTests` — ont été corrigés le 2026-08-11 par `0032297d`, déjà sur `main`
   ET sur `dev`. Le rouge restant se partage entre le défaut ci-dessus et le RETARD de `dev` :
   au moment du relevé, `dev` était **40 commits derrière `main`** et n'avait pas le correctif du
   cycle 81 que `StoryUploadQueueTests/test_uploadSucceeds_dequeuesItsWriteAheadIntent` exige.
   **Rapprocher `dev` de `main` avant de conclure quoi que ce soit d'un run rouge.**

## Ce qui reste ouvert des cycles précédents

- La porte `actions: write` reste close (cycle 82) : la routine ne peut toujours pas déclencher
  `workflow_dispatch`, donc pas de lancement à la demande de la suite complète.
- Le couple de mesure PR↔`dev` sur la même lignée de clés DerivedData (cycle 84, item 2) n'existe
  toujours pas.

## Ce que le cycle 85 n'a PAS pu faire

Aucune toolchain Swift dans l'environnement de la routine (`swift`, `swiftc`, `xcodebuild` absents,
Linux). Tout ce dossier iOS est donc établi par lecture de source, rejeu d'assertion et API Actions —
jamais par exécution. C'est suffisant pour affirmer le point 1 (l'arithmétique de l'offset est
vérifiable hors Xcode) ; ça ne l'est pas pour corriger.

---

# Cycle 85 — Un accusé de lecture ne recule pas, et la suite iOS rend un verdict faux

## 1. Le correctif livré — web, accusés de lecture monotones

`readStatusSummaries` / `messageReadStatuses` (`apps/web/stores/conversation-ui-store.ts`) ont deux
écrivains et **un seul est ordonné** :

| écrivain | nature | ordre |
|---|---|---|
| socket — `presence.service.ts` → `updateReadStatusSummary` | événement | ordonné par connexion |
| lot REST — `use-conversation-messages-rq.ts` → `getReadStatuses` → `updateMessageReadStatusBatch` | **instantané** pris au départ de la requête | **aucun** |

`updateMessageReadStatusBatch` faisait `{ ...state.messageReadStatuses, ...statuses }` — le dernier
arrivé écrase, quelle que soit son ancienneté.

**La fenêtre est large.** La clé de garde du lot (`batchFetchedRef`) est indexée sur l'id du dernier
message propre : chaque message envoyé relance la lecture REST. Un pair qui lit pendant que la
requête est en vol suffit pour que l'instantané, parti AVANT cette lecture, atterrisse APRÈS elle.

**Et c'est visible.** `DeliveryIndicator` rend `readCount > 0` en double coche BLEUE,
`readCount === 0 && deliveredCount > 0` en double coche GRISE. Les coches passent au bleu, puis
reviennent au gris, et restent fausses jusqu'au prochain accusé. Le même écrasement pouvait
« dé-livrer » un message (`deliveredCount` qui redescend).

Correctif : un prédicat unique `isStaleReceipt(current, incoming)` dans le store, appliqué par les
TROIS écrivains — un seul énoncé de la règle, là où l'état vit.

Trois décisions, chacune verrouillée :

- **`totalMembers` est le discriminant.** Les accusés ne sont croissants que pour un effectif FIXE ;
  quand quelqu'un part, le serveur recompte sur les survivants et rapporte légitimement MOINS de
  lectures. Sans ce discriminant la garde figerait les compteurs à vie.
- **Un résumé qui recule est rejeté ENTIER**, jamais fusionné champ par champ : un max par champ
  synthétiserait un état qu'aucun serveur n'a rapporté, alors que `readCount >= totalMembers` pilote
  la branche « lu par tous ».
- **Le lot filtre par ENTRÉE**, pas en tout-ou-rien ; et le miroir vers le dernier message propre est
  gardé sur SA propre histoire, pas sur celle de la conversation (le lot REST écrit cette entrée
  directement, elle peut être en avance).

### Vérification

- **RED prouvé avant le correctif** : 10 tests neufs, 6 rouges / 4 verts (les 4 verts sont les cas
  « la progression s'applique », qui passaient déjà). GREEN après : 10/10.
- **Mutation appliquée et vérifiée (leçon 117) — 7 réversions, 7 rouges** : prédicat neutralisé
  (6 rouges), discriminant `totalMembers` retiré (1), garde du lot retirée (3), garde du miroir
  retirée (1), garde de `updateMessageReadStatus` retirée (1), garde conversationnelle retirée (1),
  `||` changé en `&&` (5). Restauré, re-vérifié 10/10.
- **Suite web complète : 563/563 fichiers, 12 077 tests verts** (21 skipped).
- `tsc --noEmit` : **1 757 diagnostics avant comme après** (pré-existants, fichiers de test admin
  sans rapport), **aucun** dans les fichiers touchés.

Réserve d'honnêteté : un premier passage de suite complète a rapporté 6 échecs — c'était MON
`git stash` de mesure du tsc de référence qui a retiré le correctif sous une exécution de fond déjà
lancée. Relancé sur arbre propre : vert. Et les 23 « suites en échec » du passage suivant étaient
toutes des erreurs de CONFIGURATION (`@meeshy/shared/dist` non construit — prérequis documenté dans
le CLAUDE.md racine), pas des tests : après `bun run build` dans `packages/shared`, 563/563.

## 2. Le dossier iOS — mesure, et un verdict qui ne tient pas

Le cycle 84 signalait la suite `dev` « rouge très fréquemment » et la renvoyait à qui possède la
zone. Relevé de ce cycle sur les **30 derniers runs `push dev`** d'`ios-tests.yml` : **11 échecs,
soit 37 %**.

Échecs relevés sur 4 runs échantillonnés :

| run | date (UTC) | tests en échec |
|---|---|---|
| `31543763910` | 08-11 22:45 | `CallViewAccessibilityTests/test_hasActiveEffects_…`, `StoryUploadQueueTests/test_uploadSucceeds_dequeuesItsWriteAheadIntent` |
| `31482338455` | 08-11 10:28 | `AuthServiceTests/test_handleUnauthorized_…`, `MiniAudioPlayerBarTests/test_tapPlayPause_…` |
| `31468948328` | 08-11 07:26 | `LocalizationConsistencyTests/test_everyAppCatalogIdentifierKeyIsReferencedInCode`, `MiniAudioPlayerBarTests/test_tapPlayPause_…` |
| `31417194286` | 08-10 18:04 | `AuthServiceTests/test_handleUnauthorized_…` (« Exceeded timeout of 2 seconds ») |

**Les trois récidivistes sont déjà corrigés** par `0032297d` (2026-08-11 11:45 UTC) : timeout
AuthService porté à 10 s, `MiniAudioPlayerBar` adapté à la relance de tête, 39 clés orphelines
purgées du catalogue. Ce commit est sur `main` ET sur `dev`.

**Le run le plus récent, lui, ne s'explique pas ainsi** — et c'est le point porté en tête de cycle
ci-dessus : son verdict sur `CallViewAccessibilityTests` est faux au regard de la source du commit
testé (démonstration reproduite en tête). Sa seconde ligne rouge, `StoryUploadQueueTests`, est en
revanche un simple RETARD : le correctif du cycle 81 (`704a3c5b`, 2026-08-12 03:03 UTC) est
POSTÉRIEUR au run et n'était pas sur `dev` au moment du relevé — `dev` accusait alors 40 commits de
retard sur `main`.

Conséquence pratique, à retenir avant de rouvrir ce dossier : **un run `dev` rouge ne prouve rien
tant que `dev` n'a pas été rapproché de `main`.**

## 3. Ce qui a été audité et trouvé SAIN (ne pas re-défricher)

- **`emitToConversationParticipants`** (gateway) — chaînage `to()` (une copie par socket au plus),
  `userId ?? id` pour les participants sans compte, seed de la room de conversation. Correct.
- **Ajout d'un participant** (`routes/conversations/participants.ts`) — auto-join des sockets vivants
  à la room, `CONVERSATION_NEW` en room personnelle, effectif ABSOLU et non delta, arrivant écarté du
  fan-out. Correct. Retrait/bannissement/départ font bien `fetchSockets()` + `leave()`.
- **Catch-up incrémental web** (`use-conversation-messages-rq.ts` → `syncNewerMessages`) — déclenché
  sur le front montant de la reconnexion socket ET au focus d'onglet ; filigrane calculé sur les
  seuls messages CONFIRMÉS par le serveur (un optimiste stampé par l'horloge locale sauterait la
  fenêtre) ; réconciliation des optimistes par `clientMessageId`. La boucle de pagination est
  correcte **parce que** le gateway trie `asc` en mode `after`
  (`routes/conversations/messages.ts` : `orderBy: { createdAt: afterMode ? 'asc' : 'desc' }`) —
  en `desc` elle sauterait le milieu d'un trou plus grand qu'une page. Vérifié.
- **`admitEditedContent`, `emitMentionCreated`, `isStaleEdit`** — corrects.

## 4. Un constat reporté, non traité

`message:read-status-updated` est **dual-émis** avec `read-status:updated` aux 5 points d'émission,
et **aucun client ne l'écoute** (web, iOS, Android : tous sur le nom legacy). C'est délibéré et
documenté (`tasks/socketio-events-cleanup.md` #3, coexistence ~3 mois depuis le 2026-07-05), donc
**pas un défaut** — mais les accusés de lecture/livraison sont la classe d'événements la plus
volumineuse d'une messagerie, et chacun coûte aujourd'hui deux trames par socket. La fenêtre se
ferme début octobre 2026 : migrer les clients vers le nom namespacé est le préalable au retrait du
legacy. À cadencer, pas urgent.

---

# Tête instruite pour le cycle 84 — le gate compile existe ; ce qui reste à instruire est ce qu'il ne voit pas

*Le cycle 83 a exécuté la consigne du cycle 82 : mesurer avant de câbler. La mesure a répondu, le
gate est câblé, et pour la première fois depuis le 2026-07-27 une PR qui touche du Swift le compile.*

## Ce que le cycle 84 hérite, et ne doit pas défaire

Le gate est **compile seule**, délibérément. Il ne dit RIEN de :

- **la suite `MeeshyTests`** — toujours sur `dev` uniquement. Un test qui compile mais échoue passe
  le gate sans un mot. C'est le compromis assumé : les 8 min d'exécution sont exactement l'un des
  deux postes qui avaient saturé la file en juillet ;
- **la suite `MeeshySDK`** (`sdk-tests.yml`) — déjà déclenchée sur PR, mais gatée sur
  `packages/MeeshySDK/**` seul. Une PR qui ne touche que `apps/ios` ne l'exerce pas ;
- **les baselines de snapshot Timeline** — enregistrées sur iOS 18.2, donc invérifiables sans le
  runtime que le gate saute exprès.

## Ce que le cycle 84 devrait instruire

1. **Relever le coût réel du gate après un mois.** Deux points de mesure réels existent désormais
   (cf. rapport du cycle 83) : **10m02 à froid, 4m54 en régime permanent**. Le régime permanent
   étant le cas courant, la projection tombe à 340 runs/mois × ~5 min ≈ **1 700 min de runner
   macOS**, la moitié de l'estimation qui accompagnait le câblage. Cela reste une projection à
   partir des horodatages de commits, pas un relevé de facturation — et le nombre de runs, lui,
   n'a pas été re-mesuré. La mesurer pour de vrai, et si elle dérape, la première coupe évidente
   est le filtre de chemins (aujourd'hui `apps/ios/**` entier, y compris les ressources et les
   `.md`, qui ne changent rien à la compilation).
2. **Vérifier que le cache DerivedData profite bien aux PR.** Les runs de PR écrivent maintenant
   sous la même lignée de clés que `dev` (`ios-dd-macos15-xc26_1_1-…`). Deux hypothèses non
   vérifiées : que les produits d'un build `generic/platform=iOS Simulator` (arm64 épinglé) se
   réutilisent sans rebuild complet par un build `id=<sim>`, et l'inverse. Si elles sont fausses,
   les deux modes se piétinent le cache et chaque run repart à froid — mesurable dans les logs à
   la durée de l'étape `Build for testing` sur deux runs consécutifs.
3. **La porte `actions: write` reste close** (cycle 82) et le reste : l'intégration GitHub App de la
   routine ne peut toujours pas déclencher `workflow_dispatch`. Le gate compile la contourne pour le
   Swift ; elle continue de bloquer tout lancement à la demande de la suite complète.

Point d'entrée : `.github/workflows/ios-tests.yml` (en-tête « PR GATE RESTORED, COMPILE-ONLY ») et
son garde `packages/shared/__tests__/ci/ios-pr-compile-gate.test.ts`.

---

# Cycle 83 — La routine cesse de merger du Swift que rien n'a compilé

## La mesure que la tête du cycle 83 exigeait

La consigne était explicite : *« combien de PR touchent `apps/ios/**` simultanément ? Si c'est 1-2,
un job de 10-18 min ne sature rien. Si c'est 5-6, la réponse est encore non. Mesurer d'abord,
câbler ensuite. »*

Le clone de la session était **shallow** (82 commits de premier parent, ~1,5 jour) — la première
mesure tentée portait donc sur 3 jours en se croyant sur 30. Approfondi
(`git fetch --shallow-since="35 days ago"`, 2 178 commits, retour au 2026-07-08), puis : pour chaque
merge de premier parent sur `main`, les commits propres au côté fusionné qui touchent
`apps/ios/**` ou `packages/MeeshySDK/**` ; commits à moins de 5 min regroupés en une poussée ; chaque
poussée ouvre une fenêtre de 18 min, tronquée par la poussée suivante sur la même PR — c'est ce que
fait `cancel-in-progress`.

**148 PR, 340 poussées sur 30 jours.** Concurrence pondérée par le temps :

| runs iOS en vol | part du temps calendaire |
|---|---|
| ≥ 1 | 8,9 % (64,2 h / 720) |
| ≥ 2 | 1,9 % (13,4 h) |
| ≥ 3 | 0,7 % (5,1 h) |
| ≥ 5 | 0,2 % (1,6 h) |

**La réponse est 1-2, pas 5-6.** La fenêtre est vide 91 % du temps. Le chiffre de juillet est
atteint 1,6 h par mois, et seulement dans des salves d'intégration groupée — dont les horodatages de
commits SURESTIMENT les poussées réelles (une session humaine qui merge dix vieilles branches d'un
coup produit dix commits rapprochés qui n'ont jamais été poussés séparément). Cette queue est donc
un MAJORANT. Ce qui saturait le plafond macOS n'était pas le déclencheur : c'était la suite complète
à 29-45 min derrière lui.

## Le correctif

Un seul job, un seul jeu d'étapes, une bascule nommée : `COMPILE_ONLY` vaut `'true'` sur le seul
événement `pull_request`. Elle gate les deux étapes qui coûtent le plus et prouvent le moins au
temps de la PR — celles que le fichier lui-même signalait comme « déjà séparées » :

- **provisionnement du runtime iOS 18.2** (~7 min, borné par le réseau) — inutile :
  `generic/platform=iOS Simulator` compile contre le SDK simulateur sans runtime installé ;
- **exécution des tests** (~8 min) — c'est le poste qui a saturé la file en juillet.

Reste `build-for-testing`, qui compile l'app **et les cibles de test** : un fichier de test qui ne
compile pas rougit, ce qui couvre l'autre moitié du Swift que la routine écrit. ~18 min à froid,
~10 min sur cache SPM chaud, sur le runner standard, au tarif standard.

**Le piège évité, et il est réel** : une destination générique n'a PAS d'architecture active, donc
`ONLY_ACTIVE_ARCH=YES` n'a rien à quoi se réduire et `xcodebuild` compile arm64 **et** x86_64 — le
double du poste le plus cher du job, soit un gate plus lent que la suite qu'il remplace. Les runners
`macos-15` sont Apple Silicon : l'architecture est épinglée explicitement (`ARCHS=arm64`) dans la
branche compile-seule, et `ONLY_ACTIVE_ARCH=YES` reste inchangé dans la branche simulateur.

Trois réglages de coût, chacun motivé sur place : `ready_for_review` ajouté aux `types` (sans lui,
une PR ouverte en brouillon puis marquée prête n'émet plus aucun événement et le gate serait sauté
en silence), les brouillons exclus par un `if` de job, et `timeout-minutes` ramené à 30 sur PR (50
reste le plafond de la suite complète — une compilation qui déborde 30 min est bloquée, pas lente).

## Vérification

- **RED prouvé avant tout YAML** : le garde écrit en premier, 8 échecs sur 10 contre le workflow
  d'origine. GREEN après câblage : 10/10.
- **Mutation appliquée et vérifiée (leçon 117) — 7 réversions, 7 rouges** : déclencheur
  `pull_request` retiré (3 témoins tombent), gate du simulateur retiré, gate des tests retiré,
  `ARCHS=arm64` retiré, `ready_for_review` retiré, `COMPILE_ONLY` figé à `'false'`, destination
  générique annulée. Restauré, re-vérifié vert.
- **Suite `shared` complète** : 52 fichiers, 1 506 tests verts (vitest 4.1.10), contre 51/1 496 au
  départ. `tsc --noEmit` : 0 erreur.
- **YAML re-parsé après édition** (`yaml.safe_load`) : 3 déclencheurs, 12 étapes, 5 conditionnées ;
  les expressions de `name`, `if`, `env` et `timeout-minutes` du job relues une à une.
- **Les deux branches du script bash exécutées** : `COMPILE_ONLY=true` →
  `generic/platform=iOS Simulator` + `ARCHS=arm64` ; `false` → `platform=iOS Simulator,id=<sim>` +
  `ONLY_ACTIVE_ARCH=YES`. `bash -n` propre.
- **Le gate s'est prouvé sur sa propre PR** (PR #2875, run #31564979638, job 94014846909) :
  `.github/workflows/ios-tests.yml` fait partie du filtre de chemins, donc cette PR-là a déclenché le
  job compile qu'elle introduisait. **Vert en 10m02**, cache SPM ET DerivedData froids, contre les
  35 min de la baseline `dev` :

  | étape | baseline `dev` | gate de PR |
  |---|---|---|
  | provision du runtime iOS 18.2 | 7m01 | **sautée (0 s)** |
  | résolution SPM (froide dans les deux cas) | 8m07 | 2m02 |
  | `build-for-testing` | 8m58 | **6m33** |
  | sauvegarde DerivedData | 40 s | 32 s |
  | `test-without-building` | 8m20 | **sautée (0 s)** |
  | **total** | **~35 min** | **10m02** |

  L'estimation d'avant câblage disait « ~18 min à froid, ~10 min à chaud » : le run FROID a fait le
  temps prédit pour un run CHAUD. Et le compile est **plus rapide** que celui de la baseline, pas
  plus lent — c'est la preuve observable que le pin `ARCHS=arm64` prend effet. Sa perte se verrait
  ici comme un compile environ double, jamais comme un échec.
- **Le régime permanent, mesuré au run suivant** (job 94017664432, caches SPM ET DerivedData
  chauds) : **4m54**. Restauration SPM 18 s (hit), DerivedData 14 s (hit, semé par le run froid),
  résolution SPM 23 s (contre 2m02), `build-for-testing` **3m19** en incrémental (contre 6m33),
  sauvegarde 17 s. **Un gate froid coûte ~10 min, le régime permanent ~5** — le froid ne revient
  que si la clé SPM (`project.yml`) change ou si la lignée DerivedData repart, pas à chaque PR.
- **Une des deux hypothèses de cache est levée** : les produits DerivedData d'un run compile-seule
  SONT réutilisés par le run compile-seule suivant (6m33 → 3m19). Reste non vérifié le cas
  CROISÉ — `generic/platform` ↔ `id=<sim>` — dont l'échec ne coûterait qu'un compile froid sur
  `dev`, jamais un résultat faux.
- **Les 16 checks de la PR verts** (Quality, Security, Build, shared, web, gateway, agent, Prisma,
  Python, audio, TTS, Voice API ; Trivy `neutral`, son état habituel).

## Où vit le garde, et pourquoi là

`packages/shared/__tests__/ci/ios-pr-compile-gate.test.ts`. La suite `shared` est celle que
`ci.yml` exécute sur **chaque** PR : c'est donc la seule qui puisse constater la disparition du gate
iOS. Le dépôt hébergeait déjà un garde d'hygiène sans rapport avec le runtime partagé au même
endroit (`esm-relative-imports.test.ts`), et le précédent Swift (`ArchiveSignatureStripGuardTests`)
ne s'exécuterait, lui, que sur `dev` — précisément le chemin qui ne surveille rien au bon moment.

Le retrait du 2026-07-27 était juste et n'a rien signalé pendant six semaines. Celui-ci rougira.

---

# Tête instruite pour le cycle 83 — les deux portes du gate iOS sont instruites, l'une est close par un droit, l'autre par une dépense

*Le cycle 82 a exécuté la consigne du cycle 81 : instruire une des deux portes avant tout Swift. Les
deux le sont. Aucune ne se referme par du code, et c'est le résultat.*

## Porte 2 — `actions: write` : close, re-mesurée aujourd'hui

`POST /repos/isopen-io/meeshy/actions/workflows/ios-tests.yml/dispatches` répond
**403 Resource not accessible by integration**. Le cycle 80 l'avait constaté depuis la CLI ; ce
cycle l'a rejoué depuis l'**intégration GitHub App** de la routine, qui est la seule identité dont
elle dispose. Ce n'est donc pas un défaut d'outil : le jeton de l'App n'a pas le droit `actions:
write` sur ce dépôt. Les runs `workflow_dispatch` existants sur `main` et sur une branche de
worktree (#30748751746, #31079195135) prouvent que la porte s'ouvre pour un humain — pas pour elle.

**C'est une décision d'accès, hors du code.** Rien qu'un cycle puisse écrire ne la lève. Elle est
remontée à la propriétaire de la routine.

## Porte 1 — `macos-15-xlarge` : ouverte, mais c'est une dépense, et la mesure dit qu'elle vise à côté

Décomposition RÉELLE d'un run vert de 35 min (#31488415343, `dev`, 2026-08-11, pas à pas) :

| étape | durée |
|---|---|
| checkout + Xcode + caches + XcodeGen | 38 s |
| **provision du runtime iOS 18.2** | **7 min 01** |
| **résolution SPM** (cache manqué) | **8 min 07** |
| sauvegarde du cache SPM | 36 s |
| **compilation (`build-for-testing`)** | **8 min 58** |
| sauvegarde de DerivedData | 40 s |
| **exécution des tests** | **8 min 20** |
| relevé + fin de job | 26 s |

Deux des quatre gros postes — téléchargement du runtime et résolution SPM, soit **15 min sur 35** —
sont bornés par le RÉSEAU, pas par le CPU. `macos-15-xlarge` ne les raccourcit pas. Il attaque les
17 min de compile+tests, qu'il peut plausiblement ramener à ~6-8 (plus de cœurs, assez de RAM pour
du vrai parallélisme, ce que l'en-tête du fichier appelle « the RIGHT fix »). Gain espéré : 35 min →
~24. Pas les « reliably under ~30 min » promis parce que le fichier ne comptait pas les 15 min de
réseau, mais un vrai gain — payé environ **2 à 4× la minute**, ce qui rend le run PLUS CHER en
valeur absolue malgré sa brièveté.

**Réponse à la question que le cycle 81 posait — « les deux gestes ne sont-ils pas UN SEUL ? » :
non.** Le trigger `pull_request` avait été retiré le 2026-07-27 pour une raison qui n'est pas la
durée du job mais la SATURATION du plafond de concurrence macOS du compte (24-49 min de pure attente
de runner, 5-6 runs de PR simultanés). Diviser la durée par 1,5 ne crée pas de runner ; la file
reste la file. Rétablir le trigger PR après un passage à xlarge referait exactement ce que la mesure
de juillet a puni, en plus cher.

## Ce que le cycle 83 devrait instruire à la place — une troisième porte, non explorée

Le gate qui manque à cette routine n'est pas « tous les tests iOS passent » : c'est **« le Swift que
je viens d'écrire compile »**. Les deux sont séparés dans le workflow depuis toujours
(`build-for-testing` puis `test-without-building`, étapes 10 et 12). Un job **compile seule** :

- n'a PAS besoin du runtime iOS 18.2 (`-destination 'generic/platform=iOS Simulator'` suffit à
  compiler) → **−7 min**, et le poste le plus variable disparaît ;
- n'exécute pas les tests → **−8 min**, le second poste variable disparaît ;
- coûte donc ≈ **18 min à froid, ~10 min avec le cache SPM chaud**, sur le runner standard, au tarif
  standard.

Reste la seule vraie question, celle que le 2026-07-27 a tranchée pour l'AUTRE job et qu'il faut
mesurer pour celui-ci : **combien de PR touchent `apps/ios/**` simultanément ?** Si c'est 1-2, un job
de 10-18 min ne sature rien et la routine cesse de merger du Swift non compilé. Si c'est 5-6, la
réponse est encore non, et il faut alors le restreindre (label d'opt-in, ou branches `claude/**`).
**Mesurer d'abord, câbler ensuite** — c'est la leçon 125, et elle vaut aussi pour la porte qu'on
ouvre soi-même.

Point d'entrée : `.github/workflows/ios-tests.yml` (en-tête « TRIGGER SCOPE (2026-07-27) », étapes
10 et 12), et l'historique des PR touchant `apps/ios/**` sur les 30 derniers jours.

---

# Cycle 82 — Le badge d'un invité de lien partagé ne pouvait que monter

## Ce que la tête demandait, et pourquoi le Swift n'a pas été touché

La tête du cycle 82 interdisait de partir en Swift avant d'avoir tranché une des deux portes du gate
iOS. Les deux sont instruites ci-dessus ; aucune ne se referme par du code. Le travail de ce cycle
est donc allé là où un gate RÉEL existe — la passerelle, dont les 654 suites tournent en local — et
il y a trouvé un défaut que le dépôt documentait sans le voir.

## Le défaut : le serveur compte les non-lus d'un invité, et refuse qu'il les acquitte

Trois faits que le dépôt porte déjà, chacun écrit délibérément :

- `MessageReadStatusService.getUnreadCount` résout son argument par `OR: [{ id }, { userId }]` — il
  SAIT compter pour un participant sans compte ;
- `emitUnreadCountsToRecipients` adresse `ROOMS.user(recipient.userId ?? recipient.id)` ;
- `AuthHandler` fait rejoindre cette room aux sockets anonymes, avec le motif écrit sur place :
  « joining anything else had already left anonymous participants without their unread badge ».

Le compte est donc tenu, et poussé. Ce qui manquait est la moitié qui le REMET À ZÉRO, et elle
manquait deux fois : la porte (`allowAnonymous: false` sur `message-read-status.ts` et sur les trois
routes de lecture de `conversations/messages.ts`) et la clé (six gardes filtrant `Participant.userId`
avec `authContext.userId`, qui vaut un `Participant.id` pour un anonyme).

**Le dépôt l'avait déjà constaté, sans le nommer comme un défaut serveur** :
`apps/web/components/common/bubble-stream-page.tsx` débranche son propre suivi de lecture pour les
sessions anonymes — « la route mark-as-read est JWT-only (allowAnonymous: false) — chaque flush
partirait en 401 » — trois lignes après avoir expliqué qu'un écran sans ce hook voit « son compteur
croître indéfiniment ». Le contournement client était la trace du défaut serveur.

## Le correctif

- **La porte** : `requireAuth: true, allowAnonymous: true` — « authentifié, avec ou sans compte ».
  Pas `optionalAuth` (`requireAuth: false`), qui laisserait entrer un appelant sans jeton. C'est
  exactement la configuration de `routes/reactions.ts` (« Les anonymes peuvent aussi réagir »), et
  l'invité envoyait déjà des messages par une route `optionalAuth`.
- **La clé** : un `resolveCallerParticipant` unique dans `access-control.ts`, dont la précédence
  (`participantId` d'abord, `userId` ensuite) est celle de `canAccessConversation` juste au-dessus —
  les deux fonctions répondent à la même question et ne peuvent plus diverger. Les contextes
  enregistrés ne portent jamais `participantId` (branche `type: 'user'` de `UnifiedAuthService`), la
  précédence est donc sans ambiguïté et non conventionnelle.
- Trois effets de bord réparés : les préférences de confidentialité d'un anonyme sont demandées EN
  TANT QU'anonyme ; `mark-unread` ne relit plus deux fois le même participant ; et
  `GET /messages/:messageId/read-status` cesse de filtrer l'appartenance EN RELATION (5ᵉ copie).

## Vérification

- **Suite passerelle complète** : `654/654` suites, `16 481` tests verts (`jest --maxWorkers=50%`),
  sous bun 1.3.11 après `prisma generate --generator client` + `packages/shared && bun run build`.
- `tsc --noEmit` sur `services/gateway` : **0 erreur**.
- **Mutation appliquée et vérifiée** (leçon 117) : production ramenée à `allowAnonymous: false` ET à
  une garde `where: { conversationId, userId, isActive }` ⇒ **3 témoins tombent** (options du
  middleware, identité de résolution, préférences d'anonyme). Restauré, re-vérifié vert.
- **Les doubles Prisma des nouveaux tests ÉVALUENT le `where`** (`helpers/mongo-where`, déjà dans le
  dépôt) : une garde revenue à `userId` seul ne trouve plus la ligne anonyme et rougit. Un
  `mockResolvedValue` constant, lui, aurait passé dans les deux sens — c'est ainsi que le défaut a
  traversé des suites vertes pendant des mois.
- **Quatre fichiers de test corrigés, pas contournés** : ceux qui doublaient `access-control` en
  entier rendaient `resolveCallerParticipant` indéfini ; ils gardent désormais l'implémentation
  RÉELLE (`jest.requireActual`) et ne doublent que `canAccessConversation`. Le double de
  `departed-member-status-gates` a été enseigné à discriminer sur `isActive` par
  `participant.findFirst` — la garde qu'il mesure reste mesurée.
- iOS : **aucune ligne de Swift**, et aucune n'était nécessaire — `APIClient.swift` envoie déjà
  `X-Session-Token` et `ConversationService.swift` appelle exactement `/mark-read` et `/mark-unread`.

## Reste ouvert après ce cycle

- **Le gate iOS** — voir la tête du cycle 83. Les deux portes prescrites sont closes ; la troisième
  (job compile seule) est chiffrée mais demande une mesure de concurrence avant d'être câblée.
- **La webapp ne rebranche PAS son suivi de lecture dans ce lot.** Le blocage y est ailleurs :
  `apiService` (`apps/web/services/api.service.ts`) ne pose que `Authorization: Bearer` et ignore
  `X-Session-Token` — un flush anonyme partirait en 401 sans avoir touché la nouvelle porte. Le
  geste correct est de faire porter le jeton de session à `apiService` (le chemin anonyme du web
  l'ajoute aujourd'hui à la main, service par service : `anonymous-chat.service.ts`,
  `link-conversation.service.ts`, `message-translation.service.ts`, `tusUploadService.ts` — quatre
  copies), PUIS de retirer l'exclusion `isAnonymousMode` de `bubble-stream-page.tsx`. Chantier
  web à part entière, avec sa propre suite.
- **Les autres routes filtrant `Participant` par `userId` n'ont pas toutes été auditées.** Ce cycle a
  traité la famille lecture/non-lus. `calls.ts`, `sync.ts`, `translation-non-blocking.ts`,
  `messages-advanced.ts`, `conversations/leave.ts`, `participants.ts` portent le même motif ; pour
  certaines c'est délibéré (un invité ne gère pas les membres), pour d'autres il faudra regarder.
  `resolveCallerParticipant` existe maintenant pour celles qui doivent changer.
- Les points hérités des cycles précédents restent ouverts tels quels.

---

# Cycle 81 — Le tray coupé à 50 sur le web, et un intent write-ahead qui courait contre son propre succès

## Ce que la tête annonçait, et ce que l'inventaire a répondu

**Borne 1 levée sans ambiguïté : une des deux copies est morte.** `apps/web/services/posts.service.ts`
et `apps/web/services/story.service.ts` déclaraient tous deux un `getStories()` appelant
`GET /posts/feed/stories` sans paramètre. `rg` exhaustif des consommateurs : `postsService.getStories`
n'a **aucun lecteur de production** — sa seule occurrence dans tout le dépôt est son propre test
(`__tests__/services/posts.service.test.ts:49`). Le lecteur vivant est
`storyService.getStories`, via `hooks/social/use-stories.ts:26` (`useStoriesFeedQuery`). La copie
morte est supprimée, son test avec ; paginer les deux aurait dupliqué la dette, comme la tête le
craignait — mais la question n'était même pas « laquelle garder », c'était « laquelle existe ».

**Borne 2 respectée : rien de la troncature de tombstones n'a été transposé.** Le web ne passe
jamais `updatedSince`, donc `meta.deletedStoryIds` lui vaut toujours `[]` et
`meta.deletedStoryIdsTruncated` toujours `false`. L'escalade sur troncature du cycle 80 n'a
strictement rien à faire ici, et n'y est pas.

## Le correctif web

`storyService.getStories` drainait une page unique et jetait l'enveloppe : ni `limit`, ni `cursor`,
aucune lecture de `pagination.hasMore`/`nextCursor`. Le tray web était donc coupé à 50 stories
exactement comme celui d'iOS avant le cycle 80.

Il draine désormais, avec les **deux arrêts** que le cycle 80 avait établis comme nécessaires et
distincts :

- **Plafond de pages** (`STORY_TRAY_MAX_PAGES_PER_PASS = 6`, valeur miroir d'iOS) — protège contre
  un serveur qui annoncerait `hasMore` sans fin. Ce n'est PAS une protection de bande passante : le
  tray ne préfetche aucun média par page.
- **`hasMore` sans curseur ⇒ arrêt** (cycle 80, D2) — une page suivante qu'on ne sait pas demander ;
  boucler dessus rejouerait la même page indéfiniment. Deux témoins, `null` et `''`.

La pagination de cette route est réellement exacte (fenêtre filtrée par `updatedAt`, mais curseur
porté sur le couple `(createdAt, id)` de l'ordre) — c'est ce qui rend le drain suffisant, sans
l'escalade dont le cycle 79 avait besoin.

## Le défaut qui n'était pas au programme — et qui rougissait le gate

En exécutant la consigne du cycle 80 (« vérifier l'état de iOS Tests avant tout »), le dernier run
sur `dev` (#31543763910, 5471 verts) portait **2 rouges**, dont un jamais consigné :
`StoryUploadQueueTests.test_uploadSucceeds_dequeuesItsWriteAheadIntent`. Le fichier n'avait pas
bougé depuis `0737b063` et deux runs antérieurs du même code étaient verts : **intermittent**, donc
une course, pas une régression.

La course est dans la production, pas dans le test. `StoryViewModel.launchUploadTask`, sur succès
serveur, retirait l'intent write-ahead dans un `Task.detached` — puis, sans aucune synchronisation,
vidait `activeUploads`, affichait le toast de succès et libérait le slot. Rien n'ordonne les deux.
Le test observe la fin visible (`activeUploads.isEmpty`) et lit la queue : il gagne ou perd la
course selon l'ordonnancement.

**Ce que la course coûte en production, et pourquoi ce n'est pas qu'un test flaky** : le commentaire
du site le dit lui-même — « sinon le boot suivant re-publierait ». L'intent est le garde-fou contre
la re-publication ; le détacher de la déclaration de succès ouvre une fenêtre où l'app peut mourir
avec l'intent encore en base alors que la story est **déjà en ligne**. Le drain de boot la publie
une seconde fois.

Le retrait est donc désormais **awaité** — la tâche englobante est déjà `async`, la mesure ne coûte
qu'un saut d'acteur. C'est exactement le geste que le chemin de drain hors-ligne
(`executeQueuedPublish`, ligne ~2518) applique depuis toujours : le `Task.detached` du chemin online
était l'incohérence, pas la règle. Le ménage disque, lui, RESTE détaché — c'est de l'IO synchrone
`nonisolated` qu'on ne veut pas sur le MainActor, et aucun boot n'en dépend une fois l'intent parti.

## Le second rouge : déjà réparé sur `main`, et pour une raison instructive

`CallViewAccessibilityTests.test_hasActiveEffects_alsoChecksAdvancedFilters_notIsEnabledAlone` est
un garde de SOURCE : il cherche `hasAdvancedFilters` dans une fenêtre de N caractères après la
déclaration de `hasActiveEffects`. La production était déjà correcte ; le token se trouve à
**exactement 500 caractères** de la déclaration, sous une fenêtre de 500 — `[i, i+500)` s'arrête un
caractère avant de pouvoir matcher. `180e364f` a élargi à 700 sur `main`, donc ce rouge est éteint.

Aucun correctif supplémentaire n'a été tenté ici, **délibérément** : réécrire un scanner de source
en Swift non compilable (cf. tête du cycle 82) pour gagner de la robustesse est un mauvais échange.
Follow-up ci-dessous.

## Vérification

- **Suite web complète** : `561/561` suites, `12 062` tests verts, 21 skipped (`jest --maxWorkers=50%`).
- **Mutations appliquées et vérifiées** (leçon 117), trois fois, revert confirmé par grep :
  - production ramenée à la page unique ⇒ **3 témoins tombent** (drain, plafond, signature d'appel) ;
  - garde `!nextCursor` retirée ⇒ **les 2 témoins** `hasMore`-sans-curseur tombent (`null` et `''`) ;
  - plafond 6 → 9 ⇒ **le témoin de plafond** tombe.
- `tsc --noEmit` sur `apps/web` : **1757 erreurs avant, 1757 après** — base pré-existante inchangée,
  et **zéro** sur les fichiers touchés (`services/story.service.ts`, `services/posts.service.ts`).
  Relevé après `prisma generate --generator client` + `packages/shared && bun run build`, donc le
  chiffre n'est pas un artefact d'install incomplète.
- **Local sous bun 1.3.11**, pas 1.3.14 comme la CI (`bun upgrade` non tenté dans le conteneur) —
  l'écart n'a pas mordu ici (aucun test de couverture relevé), mais il est réel.
- iOS : **rien n'a compilé le lot `apps/ios`**, même contrainte qu'au cycle 80 (pas de toolchain
  Swift dans le conteneur, `ios-tests.yml` ne tourne pas sur PR, dispatch manuel `403`). Mitigation :
  aucun fichier ni symbole neuf, 2 lignes déplacées dans un `do { try await … }` déjà async,
  `await` sur un acteur déjà awaité 6 lignes plus haut dans le même fichier.

## Reste ouvert après ce cycle

- **Le gate iOS lui-même** — voir la tête du cycle 82. C'est le vrai reliquat, et il commande tout
  travail iOS futur de cette routine.
- **`cancelUpload(id:)` garde le même `Task.detached` pour le même intent**, et il n'est PAS
  réparable de la même façon : c'est une `func` synchrone appelée depuis l'UI, elle ne peut pas
  awaiter. La fenêtre y est la même (annulation confirmée à l'écran, intent encore en base ⇒ le
  drain de boot publie une story que l'utilisateur a annulée). Le geste correct est probablement de
  rendre le chemin d'annulation async, ou de faire porter au drain de boot une vérification
  « cette story a-t-elle déjà été publiée/annulée ». Chantier à part entière, pas un mini-fix.
- **Le garde de source `hasActiveEffects` reste une fenêtre de N caractères** — 700 aujourd'hui, ce
  qui laisse 200 de marge. Toute ligne de commentaire ajoutée dans ce bloc le re-rougit sans qu'un
  seul comportement change. Le geste robuste est de scanner jusqu'à l'accolade fermante appariée de
  la propriété ; il vaut mieux le faire quand le gate iOS sait dire oui.
- **Le web n'a toujours aucun delta stories** (`updatedSince` jamais passé) : `staleTime: Infinity`
  + invalidations socket. Ce n'est pas un défaut du tray, c'est une capacité absente ; la comparer à
  iOS demanderait d'abord de décider si le web en a besoin.
- **Le drain web ne lit pas `meta.mentionedUsers`** — il ne le lisait pas avant non plus (aucune
  régression), mais si un jour il le fait, l'union inter-pages sera à écrire, pas juste la dernière
  page à garder.
- **`STORY_TRAY_PAGE_LIMIT`/`STORY_TRAY_MAX_PAGES_PER_PASS` sont tenues à la main** face au
  `Math.min(limit, 50)` du serveur, comme leurs jumelles iOS. Troisième cycle consécutif à relever
  cette dette de constantes non liées (`deltaPageLimit`/`DELTA_PAGE_LIMIT` au 79, `trayPageLimit` au
  80) : le motif mériterait un geste unique — exposer les plafonds de la route dans
  `packages/shared` et les lire des deux côtés.

---
# Cycle 80 — Deux troncatures, deux gestes opposés : l'une se pagine, l'autre s'escalade

## Le défaut

`GET /posts/feed/stories` plafonne `limit` à 50 et annonce la suite par
`pagination.hasMore`/`nextCursor`. **Ces deux champs n'avaient aucun lecteur dans tout le dépôt** —
`rg` sur `apps/ios`, `packages/MeeshySDK` et `apps/web` : les 3 call sites iOS passent
`cursor: nil` et ne lisent jamais `pagination`. Le tray était donc coupé à 50 stories pour tout le
monde, sans qu'une ligne de code puisse s'en apercevoir.

Et le plafond des tombstones (`STORY_TOMBSTONE_LIMIT = 500`) n'était signalé que par un
`logger.warn` **côté serveur** : un client dont les disparitions avaient été coupées gardait ses
stories fantômes en silence.

## Ce que l'inventaire a trouvé et que la tête n'annonçait pas

**Le fetch « complet » n'est pas complet — il emprunte la MÊME route plafonnée à 50.** La tête
proposait, en s'appuyant sur le cycle 79, d'escalader vers un full fetch sur `hasMore`. Ce geste
n'aurait **rien rattrapé** : `storyService.list(cursor: nil, limit: 50)` est une page unique, elle
aussi tronquée. Pire, c'est le chemin qui fait `storyGroups = groups` (REMPLACEMENT) puis sauve le
cache disque : la troncature n'y laissait pas un trou, elle EFFAÇAIT les stories coupées de l'état
affiché et gravait le résultat. Le défaut était donc plus grave sur le chemin que la tête
considérait comme le recours.

**La route offre une pagination réellement exacte, contrairement aux conversations.** La page est
filtrée par `updatedAt` mais ordonnée par `(createdAt, id)` — le mésappariement de la leçon 121 —
SAUF que son curseur porte sur ce même couple `(createdAt, id)`. Le parcours est donc exact : ni
saut ni doublon. C'est ce qui rend le drain suffisant ici là où le cycle 79 devait escalader.

**Le coût redouté n'existe pas.** `prefetchAllStoryMedia` est borné à `groups.prefix(8)` : drainer
6 pages ne télécharge pas un octet de média de plus. La borne de pages ne protège donc pas la
bande passante — elle protège contre un serveur qui annoncerait `hasMore` sans fin.

## L'ordre des gestes, qui EST le correctif

**Deux signaux de troncature, deux gestes OPPOSÉS** — et c'est le point du cycle :

- **Page tronquée ⇒ paginer.** Un curseur de reprise existe et il est exact. Escalader serait
  inutile (même plafond) et coûteux.
- **Tombstones tronqués ⇒ escalader.** Aucun curseur de reprise n'existe pour les disparitions :
  il n'y a pas de « page suivante » de tombstones à demander. Le seul geste qui fasse sortir les
  fantômes restants est le REMPLACEMENT du tray par un fetch complet.

Les confondre — appliquer le geste de l'un à l'autre — donnait dans un sens une escalade stérile,
dans l'autre une purge qu'on croit complète. Et l'escalade des tombstones ne devient *correcte*
que parce que le drain a été livré : sans lui, le fetch complet vers lequel on escalade serait
lui-même tronqué.

## D1 — la sonde plutôt que l'égalité, et pourquoi ce n'est pas cosmétique

`deletedIds.length === STORY_TOMBSTONE_LIMIT` ne distingue pas une page coupée d'une fenêtre de très
exactement 500 suppressions, qui est **complète**. Sous cette égalité, un tel utilisateur aurait
déclenché un fetch complet **à chaque delta**, indéfiniment, tant que sa fenêtre reste sur ce
nombre. La sonde (`take: LIMIT + 1` + slice) est le patron que la même méthode utilise déjà trois
lignes plus haut pour `hasMore` — il n'y avait pas de raison de l'abandonner ici.

## D2 — un `hasMore` sans curseur s'arrête, il ne rejoue pas

`hasMore: true` avec `nextCursor` nul ou vide est une page suivante qu'on ne sait pas demander.
Boucler dessus rejouerait la même page indéfiniment ; le drain s'arrête. Témoin dédié
(`test_fullFetch_stopsWhenHasMoreCarriesNoCursor`), parce que c'est exactement le genre de branche
qu'un serveur mal réveillé finit par produire.

## D3 — la fiche gwcontract-11 existait, et disait juste

`docs/reviews/2026-08-01-ios-local-first-realtime/06-reseau-et-contrat-gateway.md` prescrivait
déjà ce correctif de tombstones, sonde comprise, et nommait même le RED discriminant. Trouvée en
cherchant où documenter, pas avant. **Chercher la fiche d'audit AVANT de concevoir** aurait fait
gagner l'aller-retour de conception — le backlog du dépôt est une source, pas seulement un
registre. Elle est marquée LIVRÉ, avec la mention du défaut voisin qu'elle ne listait pas.

## Vérification

- Gateway : `PostFeedService.test.ts` **64/64 vert**, `routes/posts/feed.test.ts` **46/46 vert**.
- **Mutations appliquées et vérifiées** (leçon 117) : l'égalité `=== LIMIT` remise en place fait
  tomber **2 témoins sur 2** (les deux qui distinguent sonde et heuristique) ; le retrait du champ
  `meta.deletedStoryIdsTruncated` de la route fait tomber ses **2 témoins**. Reverts confirmés par
  grep après coup.
- `tsc --noEmit` gateway : 0 erreur (après `packages/shared && bun run build`).
- Suite gateway **complète** (`bun run test:coverage`, parité CI) : **653/653 suites, 16 462/16 462
  tests**, exit 0. (Le pourcentage global de couverture n'a pas été relevé — la commande était
  filtrée par `| tail -35`, qui a coupé la ligne `All files`. Aucun témoin retiré, donc la
  couverture ne peut que monter sur les fichiers touchés ; le chiffre n'est pas rapporté plutôt que
  deviné.)
- **CI de la PR #2867 : tous les checks verts** — `Quality (bun)`, `Build (bun)`, `Security`,
  `Test gateway`, `Test shared`, `Test web`, `Test agent`, `Test Python (translator)`, `Prisma`,
  `Audio Pipeline`, `TTS/STT`, `Voice API`, `Summary`, et **`sdk-tests`** (qui compile
  `packages/MeeshySDK` et valide donc le décodage du nouveau champ). `Trivy` neutre,
  `Voice E2E Benchmark` sauté — comme sur les PR précédentes.
- iOS : 9 témoins ajoutés à `StoryViewModelTests` (drain de pages, chaînage des curseurs, plafond
  de pages, `hasMore` sans curseur, union des tombstones inter-pages, escalade sur troncature,
  non-escalade sur fenêtre complète, rétro-compat `meta` absent). **Ces 9 témoins n'ont été
  exécutés par personne** — voir §Reste ouvert, c'est la limite la plus importante de ce cycle.
- Aucun fichier Swift NEUF : les témoins vivent dans des suites déjà enregistrées au pbxproj —
  donc pas d'orphelin possible (leçon 120).

## Reste ouvert après ce cycle

- **⚠️ LE LOT `apps/ios` A ÉTÉ MERGÉ SANS AVOIR ÉTÉ COMPILÉ NULLE PART.** À dire franchement,
  parce que c'est un écart au gate documenté d'`apps/ios/CLAUDE.md` (« `./apps/ios/meeshy.sh test`
  MUST pass before any commit ») et que les cycles suivants doivent le savoir. Trois faits qui se
  cumulent, aucun contournable depuis la routine :
  1. **pas de toolchain Swift dans le conteneur** (`swift`/`xcodebuild` absents — vérifié, pas
     supposé) ;
  2. **`ios-tests.yml` ne tourne pas sur une PR** : son trigger est `push` sur `dev` +
     `workflow_dispatch` ;
  3. **le dispatch manuel est REFUSÉ à l'intégration** (`403 Resource not accessible by
     integration`) — donc la porte de sortie que le workflow prévoit exprès pour ce cas est fermée
     à cette routine.
  `sdk-tests` couvre `packages/MeeshySDK` (donc `APIResponseMeta`), mais **rien** ne compile
  `apps/ios/**`. Différence matérielle avec le cycle 79, qui touchait le SDK et était donc bien
  gaté : **ne pas se référer à ce précédent pour conclure « la routine sait gater l'iOS ».**
  Mitigation appliquée à défaut : revue statique ciblée (équilibrage des accolades comparé à HEAD
  pour écarter les artefacts du parseur maison, aplatissement du chaînage d'optionnels
  `pagination?.hasMore`, inférence générique de `JSONStub.decode` sous `return` implicite,
  interpolation `os.Logger` avec `privacy:`, continuations `\` et indentation des littéraux
  multi-lignes, isolation des types imbriqués dans une classe `@MainActor`), et **aucun fichier
  Swift neuf** donc aucun risque d'orphelin pbxproj. Points de rupture les plus probables s'il y a
  une erreur : la compilation du drain (`DrainedStoryPages`, `for _ in 0..<Self.maxTrayPagesPerPass`)
  et la file `listResults` du mock.
  **Action pour le prochain cycle : commencer par vérifier l'état de « iOS Tests » sur `dev`/`main`
  et corriger sans délai ce qui viendrait de ce lot.** Et si la routine doit continuer à toucher
  `apps/ios`, la vraie correction est structurelle : obtenir le droit `actions: write` pour
  l'intégration, ou ajouter un trigger `pull_request` restreint aux chemins `apps/ios/**`.
- **Le tray WEB reste coupé à 50**, et deux services se disputent la route. Voir la tête du
  cycle 81 ci-dessus.
- **`maxTrayPagesPerPass = 6` est une borne tenue à la main**, comme `trayPageLimit = 50` face au
  `Math.min(limit, 50)` de la route. Rien de mécanique ne les lie — même dette jumelle que
  `deltaPageLimit`/`DELTA_PAGE_LIMIT` relevée au cycle 79.
- **Le drain ne déduplique pas entre pages.** Une story dont l'`updatedAt` bouge PENDANT la passe
  peut apparaître deux fois (la borne keyset porte sur `createdAt`, pas sur ce qui a changé).
  `toStoryGroups` + `insertOrMergeStoryGroups` dédupliquent par id en aval, donc l'effet est nul
  aujourd'hui — mais c'est une propriété du consommateur, pas du drain.

## Suite livrée après coup — les tombstones scopent la FENÊTRE, pas la page

Le drain fait jusqu'à 6 requêtes pour une même fenêtre delta. La requête de tombstones, elle, ne
dépend PAS du curseur : sa clause est `deletedAt != null AND updatedAt > since`, identique d'une
page à l'autre. Elle repartait donc à CHAQUE page — jusqu'à 6 lectures de 501 lignes sous filtre de
visibilité, pour un résultat que le client tenait déjà depuis la première.

Elle ne court plus que sur la page qui OUVRE la fenêtre (`options.updatedSince && !cursorData`).
Sûr **parce que** le drain fusionne par union (`formUnion`) et par `||`, jamais par écrasement : une
page suivante sans tombstone ne peut pas effacer ceux de la première. Deux témoins encadrent la
règle — pas de requête sur une page cursorée, et la requête TOUJOURS présente sur la page
d'ouverture (sans ce second témoin, l'optimisation pourrait supprimer les tombstones du produit).

Trouvé en instruisant le même cycle 80 depuis une session concurrente, qui a livré le reste du
correctif (PR #2867). Les deux sessions ont convergé sur le drain, la ligne sonde et le drapeau ;
seul ce point les distinguait.

---

# Cycle 79 — Un curseur persisté qui avance sur une page dont on ignore si elle est complète

## Le défaut

`ConversationSyncEngine.deltaSyncCore` (SDK iOS) demandait `limit=500` à
`GET /conversations?updatedSince=`, que la route plafonne à 100
(`Math.min(parseInt(limit), 100)`). Puis il avançait `lastSyncTimestamp` au max des `updatedAt`
REÇUS — **sans jamais regarder si la page avait été coupée**.

Le tri par `updatedAt` croissant livré au cycle 77 fait pointer le curseur sur les lignes coupées
dans le cas général : la troncature y est devenue une pagination. Le résidu que l'ordre ne rattrape
pas est celui de plus de 100 conversations partageant la MÊME milliseconde d'`updatedAt` : la borne
serveur est stricte (`gt`), donc le débordement était enjambé **définitivement**, jusqu'à la
réconciliation complète bornée à 1× par 24 h. Entre les deux, la liste iOS affichait des compteurs
de non-lus et des aperçus périmés sans qu'aucun signal ne l'indique.

## Ce que l'inventaire a trouvé et que la tête n'annonçait pas

**Le serveur dit déjà la vérité, personne ne l'écoutait.** Une page delta part toujours
d'`offset=0`, et la route ne compte alors PAS un total décoratif : elle exécute
`prisma.conversation.count({ where: whereClause })` sur la **même clause `updatedAt > since`**
(`routes/conversations/core.ts`, branche `totalCount > 0 && (includeCount || offset === 0)`).
Son `pagination.hasMore` vaut donc exactement « la fenêtre contenait plus de lignes que cette page
n'en rend ». La tête proposait de détecter la troncature par `count >= limit` — l'heuristique du
web. Le signal autoritaire était disponible des deux côtés depuis toujours.

**La différence n'est pas cosmétique** : `count >= limit` escalade sur une fenêtre de très
exactement 100 conversations, qui est pourtant COMPLÈTE. Sur le web, cette escalade est une
relecture de TOUTES les pages chargées — précisément ce que le cycle 77 avait retiré du chemin de
focus. Le web a donc été corrigé dans le même lot : il lit `pagination.hasMore`, dont
`getConversations` porte déjà le repli conservateur `length >= limit` quand la réponse omet son
bloc pagination.

## L'ordre des gestes, qui EST le correctif

Ne pas avancer le curseur, PUIS escalader. Pas l'inverse, et pas seulement escalader :
`fullSync()` peut échouer (offline, panne gateway), et un curseur persisté déjà avancé aurait
survécu à cet échec — les lignes coupées auraient été perdues pour de bon, le delta suivant
repartant d'après elles. Parce que le curseur est resté en arrière, une escalade échouée laisse la
fenêtre **entière** rejouable au prochain delta. La fusion de la page reçue, elle, est conservée
dans les deux cas : ce qu'on a reçu est vrai, c'est seulement la COUVERTURE qui n'est pas prouvée.

## D1 — la divergence web/iOS sur le curseur est assumée, pas une dette

Le web ne peut pas « ne pas avancer » : son curseur est RECALCULÉ depuis le cache à chaque passe,
donc fusionner la page l'avance mécaniquement. iOS PERSISTE le sien. Deux natures, deux gestes —
et c'est le curseur persisté qui exige la garde, puisque lui seul survit à l'échec de l'escalade.
La note est écrite en tête de `syncSinceLastCheckpoint` pour que la prochaine passe de parité ne
« corrige » pas l'un vers l'autre.

## D2 — `limit=500` n'était pas qu'une coquette inexactitude

Le corriger à 100 ne change rien au nombre de lignes rendues — la route plafonnait déjà. Mais le
repli heuristique `data.count >= deltaPageLimit`, celui qui sert quand une réponse n'annonce pas sa
pagination, **n'aurait jamais pu déclencher** sous `limit=500`. Un mensonge de constante avait
désactivé silencieusement le filet de sécurité qu'on venait d'écrire.

## Vérification

- `apps/web` : suite `use-conversations-delta-sync` **28/28 verte**, dont le nouveau témoin
  « page de très exactement 100 que le serveur dit complète ⇒ aucune escalade », **vérifié ROUGE**
  contre l'ancienne règle `length >= DELTA_PAGE_LIMIT` avant d'être livré.
- `apps/web` (large) : `__tests__/hooks` + `__tests__/lib/conversations` — 2 003 tests verts,
  2 sautés. Les 6 suites qui ne démarrent pas (posts/commentaires/register/encryption) échouent sur
  de la résolution de module dans ce conteneur, sans rapport avec le lot.
- `tsc --noEmit` : aucune erreur sur les fichiers touchés.
- SDK iOS : 4 témoins d'ingénierie (`ConversationSyncEngineTests`) + 3 témoins de règle pure
  (`SyncWatermarkTests`) — pas de toolchain Swift dans ce conteneur, la validation passe par
  `sdk-tests.yml` (macOS) sur la PR.

## Reste ouvert après ce cycle

- **Le résidu même-milliseconde n'est pas FERMÉ, il est rendu convergent.** Une fenêtre de plus de
  100 conversations à la même milliseconde escalade désormais vers `fullSync` ; elle ne se rattrape
  toujours pas par pagination delta. Fermer vraiment demanderait un curseur composite
  `(updatedAt, id)` côté route — chantier de contrat.
- **La troncature de tombstones du delta des stories est le même angle mort, un cran plus grave**
  (le serveur la journalise sans la dire au client). Voir la tête du cycle 80 ci-dessus.
- **`ConversationSyncEngine.deltaPageLimit` et `DELTA_PAGE_LIMIT` (web) restent deux constantes
  jumelles tenues à la main**, comme `fullReconcileInterval` / `FULL_RECONCILE_INTERVAL_MS`. Rien
  de mécanique ne les lie au `Math.min(limit, 100)` de la route.

---

# Cycle 78 — Une dizaine d'écrivains tenaient un cache que personne ne lisait

## Le défaut

`queryKeys.conversations` exposait deux formes de liste : `lists()` / `list(filters)` valant
`['conversations','list', …]`, et `infinite()` valant `['conversations','infinite']`. **Les deux
préfixes sont DISJOINTS** — un `setQueriesData` sur l'un ne touche jamais l'autre.

Et **aucun écran ne lisait la forme plate.** La sidebar passe par `useConversationsPaginationRQ`
→ `useInfiniteConversationsQuery`, donc `infinite()`. `rg` sur tout le dépôt : les hooks de la
forme plate n'apparaissaient que dans leur propre fichier, leur fichier de témoins, et le baril
`hooks/queries/index.ts`.

Une dizaine d'écrivains l'alimentaient quand même, à chaque événement.

Le coût n'était pas la performance — un `setQueriesData` sans correspondance est un no-op. C'était
la LECTURE : le code se lisait comme si deux caches étaient tenus en phase alors qu'un seul
existait. Le prochain à corriger un aperçu de liste avait une chance sur deux de corriger la copie
morte et de conclure que son correctif ne marchait pas.

## Ce que l'inventaire a trouvé et que la tête n'annonçait pas

**Les témoins passaient au vert sans rien prouver.** Trois blocs de `use-socket-cache-sync` —
« déplacer la conversation en tête sur message:new », « avancer l'aperçu quand le dernier message
est supprimé », « purger la conversation refusée » — n'étaient assertés QUE sur la forme plate. Le
chemin réel, celui que la sidebar lit, n'avait donc **aucune couverture**. C'est le vrai danger
d'un cache mort : il ne se contente pas de dormir, il capte les témoins.

**`use-send-message-mutation.ts` était mort en entier.** Ses quatre mutations
(`useSendMessageMutation`, `useEditMessageMutation`, `useDeleteMessageMutation`,
`useMarkAsReadMutation`) n'ont aucun appelant : l'envoi réel passe par l'orchestrateur Socket.IO
(`services/socketio/orchestrator.service.ts` + `createOptimisticMessage`). Le module est un vestige
d'une approche abandonnée. Ses six écritures de liste n'étaient PAS doublées d'une écriture
`infinite()` — les « corriger » plutôt que les supprimer aurait ressuscité un chemin d'envoi
concurrent de celui qui fonctionne.

**Deux `invalidateQueries` de réaction ne visaient rien.** `use-reactions-query.ts` invalidait
`conversations.lists()` sur réaction ajoutée / retirée, commentaire à l'appui (« réaction ajoutée =
conversation modifiée »). Préfixe disjoint ⇒ **l'intention déclarée ne s'exécutait jamais.**

## L'ordre des gestes, qui EST le correctif

Rebrancher les témoins sur `infinite()` **avant** de retirer quoi que ce soit, puis vérifier qu'ils
sont ROUGES contre une écriture `infinite()` cassée. Fait : neutraliser
`updateInfiniteConversationCache` dans `advanceConversationPreviewOnDelete` fait tomber 3 témoins
sur 30. Sans cette étape, le retrait des écritures plates aurait fait passer les témoins du vert au
vert — en supprimant toute couverture du chemin réel sans qu'une seule ligne ne rougisse.

## D1 — rediriger n'est pas toujours le geste juste

Pour les six écritures de `use-socket-cache-sync`, chacune était DOUBLÉE d'une écriture `infinite()`
identique : le retrait est strictement neutre. Pour les deux invalidations de réaction, rediriger
vers `infinite()` aurait déclenché **une relecture de TOUTES les pages chargées à chaque réaction**
— exactement ce que le cycle 77 (lot focus) venait de retirer du chemin de focus. Vérifié avant de
trancher : la ligne de liste ne porte rien qui dépende des réactions de message
(`reaction={prefs?.reaction}` dans `ConversationList` est une PRÉFÉRENCE de conversation, pas un
agrégat de réactions). Supprimées.

## D2 — une option silencieusement ignorée est un piège de la même famille

`useInfiniteConversationsQuery` acceptait un `filters` que sa clé de requête n'incluait pas : un
appelant qui l'aurait passé aurait reçu la liste NON filtrée, sans erreur. Retiré avec le reste.
Une liste filtrée, le jour où elle existera, devra naître avec sa propre clé ET son lecteur.

## Vérification

- `apps/web` : **561 suites, 12 055 tests verts**. Le compte de témoins baisse de 41 : ceux des
  hooks morts, qui ne testaient rien de vivant. Une suite en moins — le fichier de témoins du module
  supprimé.
- Les témoins rebranchés sur `infinite()` ont été vérifiés ROUGES contre une écriture cassée AVANT
  le retrait — la couverture est réelle, pas déplacée.
- `tsc --noEmit` : aucune erreur sur les fichiers touchés.
- Bilan : **545 lignes retirées, 92 ajoutées**, dont un fichier de production entier.

## Reste ouvert après ce cycle

- **`conversations.all` reste, et couvre bien `infinite()`** (préfixe commun). Les
  `invalidateQueries({ queryKey: conversations.all })` sont vivants et hors lot — ne pas les
  confondre avec ce qui vient d'être retiré.
- **La règle « un seul cache de liste » n'est portée que par une note** dans `apps/web/CLAUDE.md` et
  le commentaire de `queryKeys.conversations`. Rien de mécanique n'empêche une deuxième forme de
  renaître sans lecteur ; un lint maison sur « clé de requête sans `useQuery` correspondant » serait
  la seule garde réelle.
- **Le même audit n'a PAS été mené sur les autres familles de clés** (`posts`, `notifications`),
  qui portent toutes le couple `lists()` / `infinite()`. `queryKeys.messages.list` est, lui, bien
  vivant — il sert de PRÉFIXE à `messages.infinite(id)`. Les autres sont à instruire par le même
  `rg`, pas par déduction.

---

# Cycle 78 — Une réaction n'est pas une ligne de liste (et D1 a été livré par une autre session)

Ce cycle a instruit et corrigé les DEUX têtes ouvertes pour le cycle 78. Il n'en livre qu'une.
Le récit de la seconde est conservé ici parce qu'il vaut plus que le code retiré.

## D2 — deux invalidations de réaction ne matchaient aucun cache (LIVRÉ)

`use-reactions-query.ts` invalidait `conversations.lists()` (`['conversations','list']`) sur
réaction ajoutée / retirée, commentaire à l'appui : « réaction ajoutée = conversation modifiée ».
La sidebar lit `conversations.infinite()` : **préfixes disjoints, intention jamais exécutée.**
Panne silencieuse, pas code mort — le commentaire faisait foi pour le prochain lecteur.

Le geste juste n'était PAS de rediriger vers `infinite()` : ça aurait relu toutes les pages
chargées à chaque réaction, exactement le refetch que le cycle 77 venait de retirer du chemin de
focus. Vérifié avant de trancher : **une ligne de liste ne porte rien qui dérive des réactions**
(aperçu, non-lus, horodatage). Le `reaction` rendu par `ConversationList` est l'emoji de
PRÉFÉRENCE de conversation — homonyme, sans rapport.

Convergence : la PR #2860 (session parallèle, entrée ci-dessus) a supprimé les mêmes deux lignes
en retirant la forme plate. Ce qui reste ici est donc le **commentaire** qui dit pourquoi il n'y
a pas d'invalidation, plus les deux témoins. Un retrait silencieux invite le prochain lecteur à
« réparer l'invalidation manquante » ; c'est le seul piège encore ouvert sur ce site.

## D1 — la page delta tronquée : LIVRÉ PAR LA PR #2863, pas par ce cycle

Ce cycle avait écrit, testé et fait passer la CI (SDK Tests verts, runs #965/#967/#971) sur une
marche de pages : `limit=100` demandé, page courte = fin de fenêtre, page pleine = reprise SOUS
son groupe d'`updatedAt` le plus haut (`SyncWatermark.resumeAfterFullPage`), escalade vers
`fullSync` sur le seul résidu (page pleine à une milliseconde unique, ou au-delà de 5 pages).

Pendant la CI, la PR #2863 (« une page delta qui laisse du reste ne fait plus avancer le
curseur ») a été mergée sur `main` par une session parallèle. Elle corrige le MÊME défaut, plus
simplement : `advancedAfterDeltaPage(previous:receivedUpdatedAt:pageMayHaveMore:)` — si la page
laisse du reste, **le curseur ne bouge pas du tout**, et l'appelant escalade vers `fullSync`.

**Le merge a été résolu en faveur de `main`, intégralement.** Trois raisons, dans cet ordre :

1. **Leur détection est MEILLEURE que la mienne.** `mayHaveMore = pagination?.hasMore ??
   (data.count >= deltaPageLimit)` : le serveur ANNONCE le reste, et le comptage n'est que le
   repli. Ma version ne connaissait que le repli.
2. **Les deux mécanismes sont incompatibles, pas superposables.** Leur contrat testé dit « le
   curseur n'avance pas sur une page qui laisse du reste » ; ma marche, elle, AVANCE (sous le
   groupe du haut) pour paginer. Garder les deux, c'est faire échouer leurs témoins.
3. **Réécrire en résolution de merge un correctif déjà mergé et testé n'est pas un droit qu'on
   se donne.** L'instruction de la routine est explicite : gérer le merge à la main pour ne rien
   écraser. Le fait d'être arrivé deuxième ne rend pas ma version prioritaire.

Ce qui est retiré avec elle : `SyncWatermark.resumeAfterFullPage`, la boucle de pages,
`maxDeltaPages`, `DeltaSyncOutcome`, `MockAPIClient.stubSequence` et 10 témoins. Aucun n'a de
consommateur une fois `main` adopté ; les garder aurait été exactement la « plomberie
mensongère » que ce cycle dénonce par ailleurs.

### Ce qui reste vrai et non couvert par `main` — tête instruite pour un prochain cycle

`main` escalade vers `fullSync` sur **CHAQUE** page qui laisse du reste. C'est correct et
prudent, et c'est cher : dès que plus de 100 conversations bougent dans la fenêtre (reconnexion
après une longue coupure, compte à gros volume), le client relit sa liste ENTIÈRE au lieu de
tirer une deuxième page.

La marche paginée reste donc une amélioration réelle, mais elle doit être instruite CONTRE le
comportement désormais en place, pas contre l'ancien défaut. Deux bornes qui ne se devinent pas,
payées par ce cycle :

1. **Sur une page pleine, reprendre au max des `updatedAt` reçus est FAUX.** La coupure peut
   tomber au milieu d'un groupe partageant une milliseconde ; la borne stricte `gt` enjamberait
   ses survivantes. Le seul curseur sûr est le plus haut `updatedAt` STRICTEMENT inférieur au
   max de la page — le groupe du haut est alors relu entier (upsert idempotent).
2. **Il reste un résidu qu'aucun curseur ne franchit** : une page pleine dont toutes les lignes
   portent la même milliseconde. Là, et là seulement, l'escalade de `main` est la seule réponse.
   Une marche qui l'oublierait bouclerait à l'infini.

Fermer proprement demanderait plutôt un curseur composite `(updatedAt, id)` côté route —
chantier de contrat serveur, pas garde de client.

## Vérification

- **D2** : 2 témoins neufs, **RED observé** avant correctif (`flatFetch` appelé 2× au lieu de
  1×). Ils montent de VRAIS observateurs sur les deux formes de clé — une `invalidateQueries` ne
  refetch que les requêtes ACTIVES, donc un cache posé à la main (`setQueryData`/`fetchQuery`)
  serait resté muet et le témoin serait passé au vert sans rien prouver.
- Suite web complète : **561 suites / 12 057 tests verts** en local (bun/jest) après le merge de
  `main`.
- CI complète verte sur la tête (13 jobs) + SDK Tests verts.
- **D1 : la vérification de ce cycle a bien eu lieu et est verte** (SDK Tests #965, #967, #971
  sur la marche de pages) — elle ne prouve plus rien d'utile, puisque le code qu'elle couvrait
  a été retiré au profit de celui de `main`. C'est dit franchement plutôt qu'effacé : le coût
  d'un cycle est aussi ce qu'il jette.

## Addendum — trois sessions, un cycle, deux collisions

Ce cycle a collisionné DEUX fois avec des sessions parallèles :

| Tête | Session parallèle | Issue |
|---|---|---|
| D2 (invalidations mortes) | PR #2860 | convergence — les deux ont retiré les mêmes lignes ; ce cycle garde le commentaire |
| D1 (page delta tronquée) | PR #2863 | **collision** — leur version, mergée d'abord et mieux instrumentée, l'emporte intégralement |

Plus un troisième conflit, sans rapport avec le fond : `tasks/lane-cursor.md`, avancé par la
routine Android pendant le run. Résolu en faveur de `main` sans discussion — ce fichier est
l'état d'une AUTRE routine, et ce cycle n'avait aucune raison d'y écrire.

Trois collisions sur un cycle, ce n'est plus de la malchance : c'est le régime normal quand
plusieurs routines instruisent la MÊME liste de têtes ouvertes. La parade n'est pas de merger
plus vite — c'est de **relire `main` avant d'ouvrir une tête, pas seulement avant de merger**.
Une tête instruite dans `todo.md` n'est pas une réservation.

## Reste ouvert après ce cycle

- **La marche paginée** (ci-dessus), à instruire contre le comportement de `main`, avec ses deux
  bornes déjà payées.
- **Le résidu des égalités** — plus de 100 conversations à la même milliseconde — reste ouvert
  sur les deux plateformes ; il demande un curseur composite `(updatedAt, id)` côté route.
- **`apps/web` porte 1224 erreurs `tsc --noEmit` préexistantes** sous son propre tsconfig
  (aucune introduite ici ; le fichier de tests touché en portait déjà 20 de la même forme). Ce
  n'est pas un gate CI aujourd'hui, et c'est précisément pourquoi ça mérite d'être écrit.

---


# Cycle 77 — L'enrichissement audio n'atteignait que les lecteurs déjà dans le fil, et une page delta tronquée sautait des lignes

Deux défauts de la même famille, tous deux côté gateway, tous deux du type « la convergence
dépend de la ROUTE du lecteur plutôt que de son état » : le premier trouvé en balayant les
émetteurs qui n'adressent QUE `ROOMS.conversation(...)`, le second déjà instruit par la tête
du cycle 77 — dont la moitié SERVEUR se corrige sans toucher au client.

## D1 — `message:attachment-updated` devait trois audiences, en servait une

Whisper finit de transcrire une note vocale une à deux secondes après l'envoi ;
NLLB+Chatterbox rendent l'audio traduit langue par langue, plus tard encore. Chaque étape
écrit la pièce jointe en base et diffuse un delta — **dans la seule room de conversation**.

| Audience | Ce qu'elle perdait |
|---|---|
| lecteurs DANS le fil | rien — la seule servie |
| lecteurs sur la LISTE | iOS ne joint `conversation:<id>` qu'à **l'ouverture** du fil (`roomsToRejoinOnConnect`) : au lancement de l'app, un lecteur resté sur la liste n'est dans AUCUNE room de conversation |
| lecteurs HORS LIGNE | le `message:new` mis en file à l'ENVOI porte la pièce jointe SANS transcription ni audio traduit (ils n'existent pas encore) : sans rejeu, la copie rejouée à la reconnexion reste définitivement celle-là |

Vérifié, pas déduit : le SDK iOS applique ce delta **sans regarder quel fil est ouvert**
(`ConversationSyncEngine.handleAttachmentUpdated` patche le message en cache de n'importe
quelle conversation, no-op s'il est absent) — la room personnelle n'est donc pas une
audience plus large pour le principe, c'est là que l'écriture atterrit vraiment. Le web est
pareillement idempotent et clé par conversation (`use-socket-cache-sync`).

Même classe que les cycles 73/74 : le Prisme — « il s'applique à TOUT le contenu,
transcriptions audio comprises » — devenait fonction du fait d'avoir le fil ouvert au moment
où Whisper a fini.

Le correctif chaîne room de conversation + rooms personnelles (une seule copie par socket,
`emitToConversationParticipants`) et met l'enrichissement en file sous le nouveau
`eventType: 'attachment-updated'`, rejoué en `message:attachment-updated` au drain.

Deux points qui ne se devinent pas :

1. **`dedupKey` = l'id de la PIÈCE JOINTE.** L'identité par défaut `(messageId, eventType)`
   ferait superséder l'enrichissement de la première pièce jointe par celui de la seconde
   sur un message à deux audios. Par pièce jointe, la règle « le dernier payload gagne » est
   exactement la bonne : le payload porte l'état COMPLET de la pièce jointe.
2. **Aucun filtrage par langue du destinataire**, contrairement à `message:new`
   (`filterMessagePayloadForLanguages`). Les clients REMPLACENT la carte de traductions de
   la pièce jointe : un sous-ensemble par lecteur EFFACERAIT les langues qu'un fetch REST
   antérieur avait mises en cache. La bande passante n'est pas gratuite ; la corriger ici
   demanderait un contrat de fusion côté client, pas un filtre.

Une panne de la requête participants dégrade vers la room de conversation seule (l'audience
d'avant), jamais vers le silence.

## D2 — l'ordre d'une page delta décide si sa troncature est rattrapable

`GET /conversations?updatedSince=` plafonne à 100 et triait par `lastMessageAt` décroissant
— l'ordre de l'écran de liste, **sans aucun rapport avec le filtre**. Les deux clients
avancent pourtant leur watermark au max des `updatedAt` REÇUS : les lignes coupées étaient
enjambées **définitivement**, jusqu'à la réconciliation complète (1×/24 h sur iOS).

Trié par `updatedAt` croissant, les lignes coupées sont exactement celles d'`updatedAt`
SUPÉRIEUR à la dernière rendue : le watermark qui les enjambait pointe dessus. La troncature
devient une pagination naturelle, **sans aucun changement client** — la tête du cycle 77
proposait de câbler la détection côté iOS ; l'ordre serveur rend la détection presque sans
objet. `id` départage les égalités pour que deux appels identiques rendent la même page.

Résidu assumé, et il reste à la charge des clients (le web le couvre déjà via
`DELTA_PAGE_LIMIT` ⇒ relecture complète) : plus de 100 conversations portant la MÊME
milliseconde d'`updatedAt` (écriture en masse) débordent d'une page que la borne stricte
`gt` ne peut pas reprendre.

## Vérification

- **13 témoins neufs**, écrits AVANT le code, RED observé sur chacun :
  - `emitAttachmentUpdated.test.ts` (10) — l'audience chaînée dans l'ORDRE attendu, une
    seule émission pour un socket présent dans deux rooms, la mise en file des seuls hors
    ligne, l'auteur inclus (« Whisper et NLLB ne sont pas des gens »), la clé de dédup par
    pièce jointe, la réutilisation de la liste de participants (une requête, pas deux), et
    les deux dégradations : requête participants en panne ⇒ room de conversation seule,
    file en panne ⇒ l'émission live a quand même eu lieu.
  - `MeeshySocketIOManager.test.ts` (1) — `attachment-updated` rejoué en
    `MESSAGE_ATTACHMENT_UPDATED` au drain.
  - `conversation-core.test.ts` (3) — page delta triée par `updatedAt` croissant, page
    ordinaire et `updatedSince` illisible gardant l'ordre de récence.
- `tsc --noEmit` propre sur le gateway.

## Reste ouvert après ce cycle

- **Les deux têtes instruites pour le cycle 77 restent ouvertes** (voir ci-dessous), la
  première REDUITE par D2 : côté iOS il ne reste que la détection du résidu d'égalités,
  plus la perte systématique. La seconde (écrivains du cache PLAT côté web) est intacte.
- **`limit=500` demandé par `deltaSyncCore` reste un mensonge silencieux** — le plafond
  serveur est 100. Hygiène, sans effet sur le défaut, maintenant que la troncature se
  rattrape.
- **`message:attachment-updated` n'est pas filtré par langue** (voir D1 §2) : une
  conversation à N langues paie N diffusions complètes de la pièce jointe à tous les
  participants. Le rendre par destinataire suppose que les clients FUSIONNENT la carte de
  traductions au lieu de la remplacer — chantier de contrat client, à instruire avant tout
  code serveur.
- **`ATTACHMENT_STATUS_UPDATED` (`routes/messages.ts`) n'a pas été audité contre la même
  règle** — il porte un état par utilisateur (écouté/vu/téléchargé), donc sa room n'est
  peut-être pas la bonne non plus. À instruire, pas à déduire.
- **Aucun client iOS n'écoute `message:pending-delivered`** (le web s'en sert pour invalider
  les conversations touchées par un drain). Constaté en croisant les 110 `SERVER_EVENTS`
  avec les deux clients ; conséquence non mesurée.
- **`message:read-status-updated` n'a toujours aucun consommateur** : les deux clients
  écoutent le legacy `read-status:updated`, dual-émis depuis le 2026-07-05 avec une
  coexistence annoncée d'environ 3 mois (échéance ~2026-10-05). Migrer les clients est un
  geste par client, sûr tant que le serveur émet les deux ; retirer le legacy ne l'est pas
  avant qu'Android ait migré aussi.
- Les points hérités des cycles précédents restent ouverts tels quels (mentions du chemin de
  lien, `link:message:new` sans écouteur iOS, arbitrage `delete-for-me` du cycle 12, `eslint`
  impossible sur le gateway faute de `eslint.config.js`).

---
# Cycle 77 — Le retour d'onglet relisait la liste de conversations page par page, et l'écrasait

## Le défaut

`useInfiniteConversationsQuery` héritait du `refetchOnWindowFocus: 'always'` du QueryClient global.
Sur une `useInfiniteQuery`, ce réglage ne « rafraîchit » pas : il **rejoue TOUTES les pages
chargées et REMPLACE le cache**. Trois coûts distincts, pas un :

1. **Charge** — dix pages de scroll = dix requêtes à chaque retour d'onglet, sur une route qui
   charge participants, dernier message avec ses traductions et sa pièce jointe, et les compteurs
   de non-lus par curseur.
2. **Écrasement** — tout ce que la socket écrit pendant la séquence est remplacé par une réponse
   partie avant.
3. **Instabilité d'offset** — c'est le point qu'aucune note antérieure n'avait relevé. La route
   pagine par OFFSET sur un tri `lastMessageAt` DÉCROISSANT (`orderBy: { lastMessageAt: 'desc' }`,
   `services/gateway/src/routes/conversations/core.ts:498`). Les pages sont relues
   SÉQUENTIELLEMENT : un message arrivé entre la page k et la page k+1 promeut sa conversation en
   tête et décale toutes les pages suivantes d'un cran. Résultat : une ligne **dupliquée** à la
   frontière, une autre **disparue**. Sur une messagerie, ce n'est pas un cas rare — c'est le cas
   nominal dès qu'un onglet reprend le focus pendant qu'une conversation vit.

C'est exactement le réglage que `use-conversation-messages-rq.ts` avait désactivé pour le fil de
messages, motif écrit au-dessus de la ligne. La liste, elle, l'avait gardé.

## Ce qu'on ne pouvait PAS faire : basculer à `false`

Le refetch de focus était le SEUL chemin web qui purgeait une ligne **fantôme** — une conversation
hard-supprimée côté serveur. Le delta du cycle 76 est upsert-only : une ligne qui n'existe plus ne
revient dans AUCUNE réponse `updatedSince`, donc rien ne la retire. iOS avait rencontré ce cas
exact (E2E 2026-07-02, « Test Conv » épinglée et absente du serveur) et l'avait réglé par une
réconciliation complète bornée à 1× par 24 h. Le contenu du chantier était donc le **pendant web de
cette borne**, jamais la désactivation seule.

## Le correctif

- `refetchOnWindowFocus: false` sur `useInfiniteConversationsQuery`, dérogation documentée jumelle
  de celle du fil de messages.
- **Trigger 2 — focus** dans `useConversationsDeltaSync` : le focus tire le MÊME delta borné que le
  reconnect socket (une requête, fusion non destructrice), débouncé 1 s — la valeur de
  `FOCUS_CATCH_UP_DEBOUNCE_MS` du fil de messages, pour que les deux rattrapages répondent ensemble
  au même geste plutôt qu'en escalier. Il partage le garde anti-rafale de 5 s déjà en place.
- **Réconciliation complète bornée** : `invalidateQueries` sur la clé infinie, chaînée APRÈS un
  delta RÉUSSI, au plus 1× par 24 h. Pendant exact de `fullReconcileInterval` /
  `syncSinceLastCheckpoint` (SDK iOS). Horodatage dans `localStorage`
  (`meeshy_conversations_last_full_reconcile_at`, pendant de la clé `UserDefaults`
  `me.meeshy.lastFullReconcileAt`).

## Trois décisions qui ne se déduisent pas

**D1 — la réconciliation doit courir MÊME sur un delta VIDE.** L'ancien corps sortait tôt
(`if (conversations.length === 0) return;`). Y adosser la réconciliation aurait rendu la purge
**inatteignable** : une conversation hard-supprimée ne produit AUCUNE ligne de delta, donc le compte
calme — précisément celui qui garde son fantôme le plus longtemps — n'aurait jamais réconcilié. Le
corps a donc été restructuré : la fusion est conditionnelle, la réconciliation ne l'est pas.

**D2 — un delta ÉCHOUÉ ne réconcilie pas et ne consomme pas la fenêtre.** Même règle que
`syncSinceLastCheckpoint` sur iOS (`if ok && isFullReconcileDue`). Offline ou gateway en panne, on
garde le cache intact (local-first) plutôt que de déclencher une relecture complète qui échouera
aussi, et l'horodatage n'avance pas — le prochain déclenchement couvre la même fenêtre.

**D3 — la fenêtre de 24 h démarre au PREMIER delta, pas à l'époque zéro.** iOS part de
`.distantPast` et réconcilie donc au premier lancement. Le web ne peut pas copier ce choix : le
montage vient de lire le serveur en entier (`refetchOnMount: 'always'`), et réconcilier tout de
suite doublerait cette lecture pour rien. Un navigateur sans horodatage en reçoit donc un, daté de
maintenant, sans réconcilier.

Repli mémoire par QueryClient si `localStorage` jette (navigation privée, quota) : la borne dégrade
en « 1× par session », jamais en « à chaque focus » — le garde tient la valeur autoritaire, le
stockage n'en est que la persistance.

## Hygiène au passage

`mergeConversationDelta` était appelé avec un littéral portant **deux fois** la clé `hasMore`
(`{ hasMore, openConversationId, hasMore }`). Sans effet — la seconde écrasait la première avec la
même valeur — mais c'est le genre de ligne qui fait douter le prochain lecteur du contrat. Le corps
de la fusion a été sorti en helper de module (`mergeDeltaIntoCache`) au lieu de vivre dans le `try`,
et le doublon a disparu avec.

## Vérification

- `apps/web` : **562 suites, 12 095 tests verts** (0 régression). 7 tests neufs sur le delta
  (`use-conversations-delta-sync.test.tsx` : 16 → 26 avec les 4 du focus), 1 sur la liste
  (`use-conversations-query.test.tsx`).
- Le témoin de la liste a été vérifié ROUGE contre le code d'avant (`refetchOnWindowFocus` remis à
  l'hérité ⇒ `mockGetConversations` appelé au focus), puis vert après.
- `tsc --noEmit` : aucune erreur sur les trois fichiers touchés (le bruit préexistant du dossier
  `__tests__/admin` est hors lot).

## Reste ouvert après ce cycle

- **La réconciliation complète relit elle aussi les pages une par une**, donc porte la même
  instabilité d'offset décrite en 3 ci-dessus — mais 1× par 24 h au lieu d'à chaque focus, et c'est
  déjà le comportement de `fullSync()` sur iOS. La fermer demanderait une pagination par CURSEUR
  (`lastMessageAt` + id) côté gateway, chantier de contrat, pas correctif.
- **Les autres surfaces héritent toujours du `refetchOnWindowFocus: 'always'` global.** Le réglage
  n'est un défaut que sur les listes INFINIES temps réel ; les deux qui existent
  (`useInfiniteConversationsQuery`, `useConversationMessagesRQ`) y dérogent désormais toutes les
  deux. Une troisième qui naîtrait sans déroger reprendrait le défaut en silence — le noter dans
  `apps/web/CLAUDE.md` était le seul garde-fou disponible.
- **iOS n'a toujours pas la détection de page tronquée** — tête instruite du cycle 78 ci-dessus,
  inchangée par ce lot.

---

# Cycle 76 — La liste de conversations web restait figée après une coupure SOCKET

## Le défaut

Le QueryClient web tourne en `staleTime: Infinity` — Socket.IO EST la source de vérité
temps réel. Ce qui n'arrive pas par socket n'est rattrapé par rien tant que l'écran
reste monté.

Trois surfaces web pouvaient porter ce trou ; le cycle 75 avait établi le relevé :

| Messages d'une conversation | oui — `syncNewerMessages` sur le front `false → true` (« Trigger 1 ») |
| Notifications | oui depuis le cycle 75 — `onSyncDesync('reconnect')` |
| **Liste de conversations** | **non** — corrigé ici |

Ce qui semblait la couvrir : le QueryClient global pose `refetchOnReconnect: 'always'`.
Il écoute le `onlineManager` de React Query — la transition réseau du **navigateur**.
Un redémarrage gateway, un drop de load balancer ou un échec d'upgrade de transport
tuent la socket **sans bouger `navigator.onLine`** : rien ne se déclenche. Pendant cette
fenêtre, la sidebar garde ses compteurs de non-lus, ses aperçus de dernier message et
son effectif d'avant la coupure, et ne se corrige qu'au prochain focus ou remontage.

## Le correctif

`useConversationsDeltaSync` (`apps/web/hooks/queries/use-conversations-delta-sync.ts`),
monté DANS `useInfiniteConversationsQuery` — sur le propriétaire du cache
`conversations.infinite()`, pour qu'aucun consommateur ne puisse l'oublier.

Quatre arbitrages qui portent le correctif :

1. **Delta, pas `refetch()`.** `refetch()` rejoue TOUTES les pages chargées d'une route
   lourde (participants, dernier message avec traductions et pièce jointe, compteurs de
   non-lus par curseur). Le rattrapage est UNE requête bornée par ce qui a bougé —
   `GET /conversations?updatedSince=`, l'endpoint que le SDK iOS utilise déjà, avec son
   index dédié côté schema (`@@index([isActive, updatedAt])`). La capacité serveur
   existait ; seul le web ne s'en servait pas.
2. **Le watermark se DÉDUIT du cache, il ne se stocke pas.** Soit `T` le max des
   `updatedAt` en cache et `F` l'instant de la lecture serveur qui les a produits :
   `T <= F`, et tout changement postérieur à cette lecture porte un `updatedAt > F >= T`.
   `updatedSince=T` ne peut donc rien rater ; au pire il re-livre `]T, F]`, que l'upsert
   rend idempotent. Aucun curseur à persister, aucune horloge locale — et le repli sur
   `new Date()` quand rien n'est lisible est explicitement refusé (règle R15b d'iOS : un
   client en avance sur le serveur enjamberait des mises à jour réelles).
3. **Le cache est relu DANS `setQueryData`, pas avant l'`await`.** Un event socket
   arrivé pendant la requête doit survivre à la fusion — c'est la fusion atomique
   d'iOS (`cache.messages.mergeUpdate`), transposée.
4. **Une page PLEINE est une preuve d'incomplétude.** La route plafonne à 100 et trie
   par `lastMessageAt`, pas par `updatedAt` : les lignes coupées ne sont pas « les plus
   anciennes », et avancer le watermark par-dessus les perdrait. Le hook garde la fusion
   (correction immédiate de ce qu'il tient) et escalade vers l'invalidation complète.

Effet de bord assumé et utile : `rebuildInfiniteConversationPages` est sorti de
`use-socket-cache-sync.ts` vers `lib/conversations/infinite-cache.ts`. Les deux écrivains
du cache infinite partagent désormais UNE règle de repagination au lieu de deux, et le
`pagination: any` du passage est remplacé par la forme réelle (`GetConversationsResponse`).

## Vérification

- **27 témoins neufs** : 14 sur les valeurs pures (watermark, fusion), 13 sur le hook.
- **ROUGE prouvé par mutation, pas par inspection** — 9 mutations, toutes rouges,
  restauration verte à chaque fois :
  déclencher au PREMIER connect → 1 rouge ; capturer le cache avant l'`await` (la
  variante plausible-mais-fausse) → 1 rouge ; supprimer le throttle → 1 rouge ; replier
  le watermark sur l'horloge locale → 3 rouges ; upserter un delta `isActive: false` →
  3 rouges ; prendre le PREMIER `updatedAt` au lieu du plus récent → 3 rouges ; fusionner
  toutes les pages en une (le bug historique de repagination) → 1 rouge ; faire confiance
  à une page pleine → 1 rouge ; escalader sur CHAQUE delta → 1 rouge.
- **VERT exécuté** : suite web complète, `562/562` suites, `12070` tests (après
  `packages/shared → bun run build`, prérequis que la CI fait automatiquement).
- **Typecheck** : `1222` erreurs, exactement la ligne de base du projet, et **aucune** ne
  touche un fichier modifié par ce cycle.

## Portée établie, pas supposée

Le relevé des trois surfaces web est désormais complet — plus aucune n'est découverte au
reconnect socket. La liste PLATE (`useConversationsQuery`) n'est pas traitée : `grep` sur
tout `apps/web` ne rend **aucun consommateur** hors du module de hooks lui-même.


## Addendum — deux sessions ont livré ce cycle en parallèle

La tête du cycle 75 a été instruite par deux sessions à la fois. Les deux ont écrit le
même correctif, sur les mêmes fichiers, avec les mêmes arbitrages de fond (delta plutôt
que refetch, watermark déduit du cache, front `false → true` seul déclencheur, montage
sur le propriétaire du cache). La version ci-dessus est celle qui a atterri la première ;
la seconde s'aligne dessus et n'ajoute que ce qui manquait. Règle héritée du cycle 25b :
**comparer défaut par défaut, jamais « qui est arrivé en premier »**.

Ce que la version ci-dessus fait STRICTEMENT MIEUX, et qui est conservé tel quel :
- la démonstration `T <= F` du watermark, qui rend le clamp `now` de l'autre version
  inutile plutôt que faux ;
- le traitement de la page PLEINE comme preuve d'incomplétude, adossé au fait que la
  route trie par `lastMessageAt` et pas par `updatedAt`. L'autre version paginait par
  offset sur 5 pages : correct en régime stable, mais exposé au décalage d'offset si une
  ligne change de rang entre deux pages, et surtout moins bien argumenté ;
- la découverte du défaut iOS qui en découle (tête du cycle 77 ci-dessus).

Ce que la seconde version apporte, appliqué PAR-DESSUS :
- **la garde de la conversation OUVERTE** (`ConversationDeltaMergeOptions`). L'upsert
  intégral écrasait le compteur de non-lus avec la valeur serveur, y compris pour la
  conversation qu'on est en train de LIRE — rallumant un badge que le handler socket
  `conversation:unread-updated` prend déjà soin de clamper. Le delta est le second
  chemin d'écriture du même compteur ; il devait porter la même garde ;
- **la purge du cache de MESSAGES** d'une conversation retirée, à côté de la purge de son
  `detail` — miroir de `cache.messages.invalidate(for:)` sur iOS.

Ce que la seconde version proposait et qui est REJETÉ, preuve à l'appui : un cliquet plus
large (« le delta ne peut monter le compteur que s'il apporte un `lastMessageAt` plus
récent »), censé couvrir aussi la conversation fermée dont le `mark-as-read` traîne.
C'est la transposition de la règle 2 de `reconcileUnread` (iOS) — sauf que celle-ci
s'appuie sur `userState.lastReadAt`, et que **`markAsUnread` marche précisément parce
qu'il EFFACE cette frontière**, ce qui désarme la règle et rend la main au serveur. Un
cliquet basé sur `unreadCount` n'a pas cet interrupteur : il rendrait un « marquer comme
non lu » fait sur un autre appareil définitivement invisible sur le web. Un témoin
existant de la version ci-dessus (« the delta is server truth ») l'a fait tomber
immédiatement — c'est lui qui a révélé le défaut, pas une relecture. Un badge rallumé une
seconde après un reconnect se répare au `conversation:unread-updated` suivant ; un
mark-as-unread perdu, non.

Reste ouvert : faire voyager la frontière de lecture jusqu'au modèle web fermerait
l'écart pour de bon. Chantier de contrat, pas garde de fusion — noté dans
`ConversationSyncEngine.swift` en tête de `deltaSyncCore`.


---

# Cycle 76b — Addendum : TROIS sessions ont livré le cycle 76 en parallèle

Même défaut, même endpoint, même miroir iOS, jusqu'aux noms de fichiers à un mot près, découvert
trois fois sans que personne se voie : `upbeat-dirac-ozao52` (mergée la première, sa version vit
dans l'arbre), `keen-hamilton-jrysns` (mergée ensuite, addendum sur la même base), et celle-ci.
Chacune s'aligne sur ce qui est déjà mergé et n'ajoute que ce qui manquait — appliqué par-dessus,
jamais à la place (précédent du cycle 25b ; leçon du cycle 23 : comparer défaut par défaut, jamais
« qui est arrivé en premier »).

**Ce que la première version fait strictement mieux** que celle de cette session, et qui aurait
manqué autrement :
1. **Le plafond serveur est traité comme une preuve d'incomplétude.** Elle demande `limit = 100`
   (le plafond réel de `Math.min(limit, 100)`) et, sur page PLEINE, escalade vers une relecture
   complète. Cette session demandait le `limit` de la liste et prétendait, dans sa documentation,
   que « le reste est rattrapé au reconnect suivant » — **c'est faux**, pour la raison que la
   première a su nommer : la route trie par `lastMessageAt` décroissant et NON par `updatedAt`,
   donc les lignes tronquées ne sont pas les plus anciennes, et le watermark calculé sur ce qui a
   été fusionné passe définitivement par-dessus.
2. **Les caches dérivés sont purgés** (`removedIds` → `conversations.detail`, puis
   `messages.infinite` ajouté par la deuxième session).

**Ce que cette session ajoute par-dessus** — la borne de la fenêtre chargée. Une conversation
INCONNUE du cache et plus ancienne que la dernière ligne chargée était insérée par la fusion ; le
`fetchNextPage` suivant la rapporte à sa place réelle, donc **la même conversation apparaissait
deux fois**. `mergeConversationDelta` prend désormais `{ hasMore }` en plus de
`{ openConversationId }`, et l'écarte tant qu'il reste des pages ; une inconnue récente appartient
bien à la fenêtre et entre normalement, un retrait (`isActive: false`) n'est jamais écarté, et sans
borne fournie on insère — perdre une ligne serait pire que la dupliquer jusqu'au prochain montage.
Le plancher se mesure avec `orderKey`, la MÊME clé que le tri final : la borne signifie « sous la
dernière ligne visible », et la fenêtre est ordonnée par cette clé.

## Convergence indépendante sur la réconciliation du non-lu

Cette session avait écrit, testé, puis **retiré** une règle « non-lu local à 0 et aucun message plus
récent ⇒ garder 0 », au motif qu'elle confond un accusé de lecture en retard avec un `mark-unread`
délibéré fait depuis un autre appareil. La deuxième session est arrivée **indépendamment à la même
conclusion**, l'a écrite dans `ConversationDeltaMergeOptions` avec l'argument décisif que cette
session n'avait pas formulé — côté iOS, `markAsUnread` fonctionne parce qu'il EFFACE `lastReadAt`,
ce qui désarme la règle 2 et rend la main au serveur ; une transposition basée sur `unreadCount`
n'a pas cet interrupteur — et a livré le sous-ensemble sûr : forcer à zéro la seule conversation
OUVERTE, lue depuis `useNotificationStore.getState().activeConversationId`.

Le reste (conversation FERMÉE dont l'accusé de lecture traîne encore) demande de faire voyager la
frontière de lecture jusqu'au modèle web — chantier de contrat gateway, pas garde de fusion. Deux
sessions y sont arrivées séparément : ce n'est pas une opinion, c'est la borne du modèle actuel.

## Hors cycle — un flake d'une milliseconde dans le gateway

`PostFeedService` › « bounds the author archive to a finite window in the past » comparait
`before - floor` à `AUTHOR_ARCHIVE_WINDOW_MS` au millième près, alors que `before` est lu par le
TEST avant l'appel et le plancher calculé par le SERVICE après : les deux ne sont égales que si
l'horloge ne change pas de milliseconde entre elles. Rouge en CI sur une PR ne touchant pas le
gateway (604799999 contre 604800000). L'invariant réel est un encadrement entre les deux lectures
qui bornent l'appel — corrigé sans tolérance arbitraire.

---

# Cycle 75 — Le web ne décodait pas `_seq` : une notification manquée l'était pour la session entière

## Le défaut

Le gateway tamponne un numéro de séquence monotone PER-USER (`_seq`) sur ses émissions Socket.IO
user-scoped (`emitWithSeq`). iOS le suit depuis 2026-05 : `SyncSeqState` détecte le trou
(`next > lastSeq + 1`), `NotificationGapResyncCoordinator` re-tire la liste, et le reconnect
déclenche la même resync inconditionnellement (A5.4).

`grep -rn "_seq" apps/web` ne rendait **aucune occurrence**. Le singleton de notifications
reconstruit son objet champ par champ depuis le payload : le `_seq` tombait au sol sans être lu.

Ce qui rend l'absence coûteuse sur cette plateforme précisément : le QueryClient global tourne en
`staleTime: Infinity` — Socket.IO EST la source de vérité temps réel. Une notification qui n'arrive
pas n'est donc rattrapée par rien tant que l'écran reste monté. Elle manque dans la cloche, dans le
compteur et sur `/notifications`, **pour toute la session**.

Deux fenêtres aveugles distinctes, aucune couverte :
- **perte en vol** — des events arrivent, mais pas tous (le `_seq` saute) ;
- **coupure socket** — aucun event n'arrive, donc aucun `_seq` ne peut révéler quoi que ce soit.
  `refetchOnReconnect: 'always'` du QueryClient ne ferme PAS celle-là : il écoute le
  `onlineManager` (réseau navigateur), pas la socket. Un redémarrage gateway ne bouge pas
  `navigator.onLine`.

## Le correctif

`apps/web/lib/sync/sync-seq-state.ts` — miroir EXACT de `SyncSeqState.swift`, valeur pure :
`detectSyncSeqGap` avant `recordSyncSeq`, jamais de trou au premier event, jamais de régression du
curseur, `_seq` absent = no-op. Pas une seconde interprétation de la règle : les deux fichiers se
nomment mutuellement, et `emitWithSeq.ts` nomme désormais ses DEUX observateurs.

Le transport (`notification-socketio.singleton`) observe et expose `onSyncDesync(reason)` —
`'gap'` ou `'reconnect'`. La décision « quoi refetch » vit chez le consommateur
(`use-notifications-manager-rq`), débouncée 300 ms comme iOS. C'est le découpage SDK/app d'iOS,
transposé transport/hook.

Trois arbitrages qui portent le correctif :
1. **Le curseur SURVIT à la reconnexion automatique de socket.io** — c'est précisément ce qui
   permet au premier event d'après de révéler le trou. Il n'est purgé que sur `disconnect()`
   explicite (changement de token, logout, `reset()`), parce que le `_seq` est alloué par user et
   que le curseur d'un compte ne veut rien dire pour le suivant.
2. **Le premier `connect` ne signale rien** ; seul un RE-connect prouve une fenêtre aveugle. Au
   premier, les écrans montent déjà en `refetchOnMount: 'always'`.
3. **Un event sans `_seq` est un no-op, pas un trou.** `emitWithSeq` émet délibérément sans `_seq`
   quand l'allocation rejette ou dépasse son timeout : compter ce chemin dégradé comme un trou
   déclencherait une resync à chaque hoquet Mongo.

## Vérification

- **19 témoins neufs** : 15 sur la valeur pure + le câblage transport, 4 sur le consommateur.
- **ROUGE prouvé par mutation, pas par inspection** (5 mutations, toutes rouges, restauration verte) :
  neutraliser le signal de trou → 2 rouges ; signaler `reconnect` dès le premier connect → 7 rouges ;
  purger le curseur sur l'event `disconnect` de socket.io (la variante plausible-mais-fausse) →
  1 rouge ; supprimer le débounce → 3 rouges ; abonner un no-op → 3 rouges.
- **VERT exécuté** : suite web complète, `559/559` suites, `12043` tests (après
  `packages/shared → bun run build`, prérequis que la CI fait automatiquement).
- Typecheck : la ligne d'erreur touchant un fichier modifié
  (`notification-socketio.singleton.test.ts:45`, spread argument) est **antérieure** — vérifiée
  présente sur `main` stashé, parmi 1222 erreurs de base du projet.

## Portée établie, pas supposée

Le `_seq` n'a qu'UN émetteur (`NotificationService` → `notification:new`) : le lockstep
émission/observation est donc intact après ce cycle, et c'est la seule raison pour laquelle porter
l'observation d'un seul event est correct. Étendre `emitWithSeq` (A2.2) obligera à étendre
l'observation des DEUX clients dans le même train — noté en tête du fichier gateway.

---

# Cycle 74 — La ligne de liste gelait sur la traduction D'AVANT (portillon de mémoïsation iOS)

## Le défaut

Le cycle 73 a rendu `lastMessageTranslations` **vivant** : le gateway ré-émet désormais
`conversation:updated` quand une traduction atterrit, et — c'est le point — il ne l'émet QU'aux
lecteurs dont la carte d'aperçu porte cette langue (`PreviewUpdateScope.onlyIfPreviewCarriesLanguage`).
Le payload est donc, par construction, un payload où **seule la valeur traduite a changé** : même
`lastMessageId`, même `lastMessagePreview` (l'original ne bouge pas), même `lastMessageAt`.

`MeeshyConversation.renderFingerprint` est le portillon de mémoïsation de la ligne de liste :
`ThemedConversationRow.==` et `ConversationRowItem.==` ne comparent la conversation QUE par ce hash,
derrière `.equatable()`. Il repliait `translations.keys.sorted().joined(separator: ",")` — **les
clés, pas les valeurs**.

Conséquence : une RETRADUCTION (`["fr": "Bonjour"] → ["fr": "Salut"]`) produit le hash identique.
Le portillon renvoie `true`, SwiftUI n'appelle même pas `body`, et la ligne garde le texte d'avant
**définitivement**. Le seul champ qui bougeait était le seul non replié.

Le chemin produit qui le déclenche : `message:edit` lance `retranslateMessageAsync` (fire-and-forget,
`MessageHandler:845`) puis fane l'aperçu (`:889`). Quand l'émission d'aperçu gagne la course contre
la purge en base de `Message.translations`, elle porte la carte PÉRIMÉE sous la clé `fr` ; la
retraduction atterrit 1–2 s plus tard sous la MÊME clé. Un lecteur francophone lit alors, dans sa
liste, la traduction du texte d'AVANT l'édition.

Hasher les clés suffisait tant que la carte n'arrivait qu'une fois par message, au fetch de liste.
Le cycle 73 a levé cette hypothèse sans mettre le portillon à jour.

## Le correctif

Replier clé ET valeur, chacune combinée séparément (`Hasher.combine` par composant, pas une
concaténation qui confondrait `["a": "bc"]` et `["ab": "c"]`), en itérant les clés TRIÉES —
`Dictionary` n'a pas d'ordre d'itération stable, et un hash non déterministe ouvrirait le portillon
au hasard, ce qui annulerait le gain de `.equatable()`.

## Second trou du même contrat, fermé au passage

`lastMessageLocation` n'était replié **nulle part** dans le fingerprint, alors que la ligne en compose
son libellé — visuellement (`ThemedConversationRow`, branche `.standard`, quand un message
position-seule a un `lastMessagePreview` vide par construction) comme dans son label VoiceOver. Le
doc-comment du hash dit pourtant « mettre à jour ce hash quand un nouveau champ est affiché » : c'est
une violation du contrat déclaré, pas une approximation. La PRÉSENCE est repliée en plus du nom — une
position sans nom affiche quand même « Position », transition que `name` seul (nil des deux côtés)
raterait.

## Vérification

- **8 témoins neufs** (`ConversationRenderFingerprintTests`), dont 3 volontairement non-discriminants
  seuls (stabilité du hash, première traduction, langue ajoutée) : ils verrouillent ce qui ne doit
  PAS changer, et c'est leur seule fonction.
- **RED prouvé par inspection, pas par exécution** — aucune toolchain Swift dans ce conteneur Linux.
  La preuve est déterministe et vérifiable à la lecture : `["fr":"Bonjour"]` et `["fr":"Salut"]`
  rendent tous deux la chaîne `"fr"` par `keys.sorted().joined(separator: ",")`, et
  `lastMessageLocation` n'apparaissait pas une seule fois dans l'ancienne fonction. GREEN est exécuté
  par `sdk-tests.yml` en CI (macOS), seul chemin d'exécution disponible.

### Le témoin de stabilité a fait EXACTEMENT son travail — première passe CI rouge

La première rédaction de ce fichier partait vert à six témoins sur huit, et c'était faux.
`MeeshyConversation.init` défaute `lastMessageAt` à `Date()`, champ **replié dans le hash** : deux
instances construites séparément diffèrent donc TOUJOURS. Les trois témoins `_changes` passaient
sans rien prouver — ils auraient passé sur le code d'AVANT le correctif.

Seuls les deux témoins d'égalité (stabilité du hash, ordre d'insertion) pouvaient voir le problème,
et ils l'ont vu. C'est la démonstration littérale de pourquoi un lot de témoins « non-discriminants
seuls » n'est pas du remplissage : sans eux, ce fichier serait entré vert en verrouillant zéro
comportement.

Correctif du fichier de test : `lastMessageAt` épinglé à une date fixe, et toutes les variantes
dérivées d'une seule fabrique paramétrée — seul le champ testé varie, par construction.

## L'audit instruit par le cycle 73 est CLOS — aucun défaut

Le cycle 73 laissait ouvert : « `emitConversationPreviewUpdate` et les autres émetteurs par room
personnelle n'ont pas été audités contre la même clé `userId ?? id` ». Fait, par une recherche sur
`ROOMS.user(` (≈40 sites). **Rien à corriger** :

- Tous les fan-outs par participant passent par `participantUserRoomTargets` /
  `emitToConversationParticipants` — `emitConversationPreviewUpdate` compris.
- Les émetteurs qui adressent `ROOMS.user(userId)` en dur ciblent la room PROPRE de l'acteur
  (reset de badge multi-device, accusés, requêtes d'amitié, `user:updated`), où `userId` vient de
  `authContext.userId` — lequel vaut déjà `participant.id` pour un anonyme
  (`middleware/auth.ts:444`), c'est-à-dire exactement la room que rejoint le socket anonyme.
- `MessageReadStatusService._loadReadReceiptOptOuts` filtre sur `userId` seul à dessein : la
  préférence est stockée sur `User`, un participant sans compte n'en a pas et reste visible.

À ne PAS rouvrir sans fait neuf : la règle est portée par le type et par le helper, pas par la
vigilance des call sites.

## Reste ouvert après ce cycle

- **Android ne décode pas le Prisme de la ligne de liste** — tête du cycle 74 conservée ci-dessous.
  Toujours NON traité ici : le défaut vit entièrement dans `apps/android/`, lane d'une autre routine
  (`tasks/lane-cursor.md`). Vérifié encore ce cycle : `grep -rn lastMessageTranslations apps/android`
  ne rend toujours rien.
- Le web n'a aucun `_seq` — tête instruite du cycle 75 ci-dessus.

---

# Cycle 74b — iOS n'écoutait pas `user:updated`, et le contrat rendait l'écoute inutile

*Deux sessions ont tourné en parallèle sur le cycle 74. Celle-ci a travaillé sur une AUTRE
surface (le profil public d'un contact, pas le Prisme de l'aperçu) : aucun fichier commun, rien
à arbitrer. Les deux rapports sont conservés tels quels.*

## Le défaut

`emitUserUpdated` (`NotificationService:2858`) diffuse le profil public d'un
utilisateur à TOUS ses contacts — quatre appelants dans `routes/users/profile.ts`
(profil, avatar, bannière, handle). Le web l'applique
(`use-socket-cache-sync.ts:1107`). **iOS n'avait aucun `socket.on("user:updated")`.**

Surfaces figées côté iOS jusqu'au prochain refetch complet : la ligne de liste
d'une conversation directe (`title`, `participantAvatarURL`, `participantBanner`),
l'en-tête de conversation, `ForwardPickerSheet`, `GlobalSearchViewModel`,
`ProfileSheetUser`.

## Le contrat rendait l'écoute inutile

Brancher un listener n'aurait pas suffi. Le nom RENDU est
`displayName > « Prénom Nom » > username`, et un client ne stocke que le nom
**déjà composé** (`MeeshyConversation.title`) — pas ses composants. Un delta
partiel (« firstName vaut désormais Bob ») est donc **irrecomposable** chez le
destinataire : il lui manque toujours les autres composants.

Deux corrections possibles, une seule tenable :
- *Résoudre côté serveur et envoyer un `resolvedDisplayName`* — écarté : cela
  fabrique une QUATRIÈME copie de la règle (web, iOS, Android, serveur), qui
  diverge silencieusement dès qu'un client change la sienne.
- **Envoyer les quatre composants en GROUPE** — retenu : chaque client applique
  SON résolveur, déjà écrit, déjà testé. Aucun nouveau champ dans le contrat.

`null` sur `displayName`/`firstName`/`lastName` signifie EFFACÉ. Omettre la clé
se lirait « inchangé » et figerait l'ancien nom — c'est le seul moyen de faire
retomber l'affichage sur le composant suivant.

Le chemin `PATCH /users/me/username` demandait en plus d'élargir son `select`,
qui ne ramenait que `{ id, username }` : envoyer le groupe sans le sélectionner
aurait produit trois `undefined`, c'est-à-dire un groupe qui ment. Un témoin
verrouille le `select` lui-même, pas seulement l'emit.

## Ce qui a été VÉRIFIÉ, pas déduit

- **La présence de `username` est un marqueur de groupe FIABLE.** Les quatre
  appelants de `emitUserUpdated` ont été lus : `avatar` et `banner` partent
  seuls, le nom jamais. `hasNameGroup` peut donc se lire sur `changes.username`.
- **Le nom recomposé côté socket suit la règle du chemin REST**, pas celle de
  web. `title` d'une conversation directe est hydraté par
  `APIConversationUser.name` (`displayName ?? username`, sans first/last).
  Recomposer avec `displayName > « Prénom Nom » > username` aurait fait diverger
  la ligne selon le transport qui l'a remplie — un utilisateur sans
  `displayName` mais avec un prénom aurait vu son nom changer au rechargement.
- **`avatar`/`banner` sont tri-états**, comme `LastMessagePreviewTranslations` :
  clé absente ≠ `null`. Un `if let` sur la valeur aurait gardé l'ancienne image
  après une SUPPRESSION d'avatar — le défaut inverse de celui corrigé.
- **La liste persistée devait suivre.** Le store RAM seul laissait la ligne
  redevenir périmée au prochain démarrage à froid. `ConversationSyncEngine`
  délègue à la MÊME règle pure que le store, comme son jumeau
  `applyingConversationUpdate`.

## Vérification

- 5 témoins gateway (dont 2 neufs) — **RED prouvé par mutation** : le stash du
  seul `profile.ts` les fait tomber tous les cinq.
- 12 témoins Swift neufs (8 sur la règle pure et son décodage, 1 sur l'actor,
  1 sur le bridge, 2 sur les non-cibles groupe/autre-contact).
- Suite Jest complète du gateway : **652 suites, 16429 tests, verte**.
  `tsc --noEmit` gateway : vert. Le Swift est gaté par `sdk-tests` (pas de
  toolchain Swift sur cette machine).

## Suite du cycle — `main` est passé au ROUGE, puis au vert

Le merge a cassé la compilation Swift : `ConversationSyncEngine` ne détient pas un
`MessageSocketManager` mais un `MessageSocketProviding`, et le publisher n'était pas sur le
protocole. Corrigé par `5fcd634c` (publisher ajouté au protocole + aux deux `MockMessageSocket`).

**`sdk-tests` vert sur `main` (5fcd634c), `CI` vert.** Les 12 témoins Swift n'avaient RIEN prouvé
à la première passe : une erreur de compilation tue le build avant que la moindre cible de test
compile. Leçon 113.

## Reste ouvert après ce cycle

- **Le web a la même famille de défaut sur la LIGNE DE LISTE.** Son
  `handleUserUpdated` n'invalide que `queryKeys.users.detail(userId)` ; la ligne
  d'une conversation directe se nourrit du payload conversation, pas de cette
  requête. À instruire en lisant d'où `ConversationList` tire le nom et l'avatar
  d'un direct — pas en le déduisant. Non traité ici : une session parallèle
  travaille sur `apps/web` (PR #2836).
- **Android ne décode pas `user:updated` non plus** — lane d'une autre routine
  (`tasks/android-parity-ios-debt-agent-prompt.md`), comme le Prisme de la ligne
  de liste du cycle 73. Documenté, pas corrigé.
- **`conversation:online-stats` est déclaré, écouté par le web, JAMAIS émis.**
  Trouvé en balayant les 120 `SERVER_EVENTS` (émis gateway vs consommés
  iOS/web). Le web y branche `onActiveUsersUpdate` depuis
  `use-stream-socket.ts:244` — code mort tant que rien ne l'émet. À trancher :
  l'émettre ou le supprimer. `conversation:stats` (émis, lui) alimente déjà la
  même sortie, ce qui plaide pour la suppression.
- Les points hérités restent tels quels — voir « Reste ouvert » du cycle 73
  ci-dessous.

---

# Tête instruite pour le cycle 74 — Android ne DÉCODE pas le Prisme de la ligne de liste

*Trouvé en instruisant le cycle 73, vérifié, NON corrigé : le défaut est réel et user-visible, mais
il vit entièrement dans `apps/android/`, c'est-à-dire dans la lane d'une AUTRE routine
(`tasks/android-parity-ios-debt-agent-prompt.md`, curseur `tasks/lane-cursor.md`). Le corriger ici
aurait produit un conflit de fichiers avec une routine qui travaille sur les mêmes écrans.*

## Le fait

Le gateway sert `lastMessageTranslations` + `lastMessageOriginalLanguage` au niveau CONVERSATION,
sur les trois chemins (`GET /conversations` → `routes/conversations/core.ts:678`, la recherche →
`search.ts:277`, et le temps réel → `resolveLastMessagePreviewPrism`). Web les lit
(`transformers.service.ts:490`, `use-socket-cache-sync.ts:75`), iOS les lit
(`MeeshyConversation.resolvedLastMessagePreview`, `ConversationStore.merging`).

**Android ne les déclare nulle part.** `ApiConversation` (`core/model/.../Conversation.kt:6`) n'a
aucun des deux champs, `ApiConversationLastMessage` (`:55`) porte `content` et `originalLanguage`
mais aucune traduction, et `lastMessagePreview()`
(`feature/conversations/.../LastMessagePreview.kt:42`) rend `message.content` brut.

L'asymétrie est interne à Android et c'est ce qui la rend coûteuse : le FIL applique le Prisme
(`Message.resolvedContent` → `LanguageResolver.preferredTranslation`, `Message.kt:98`), la LISTE
non. Un lecteur francophone voit donc « Hello » dans sa liste et « Bonjour » dès qu'il ouvre — la
friction linguistique exacte que le principe produit interdit.

## Ce que le cycle 74 doit faire

1. Ajouter `lastMessageTranslations: Map<String, String>? = null` et
   `lastMessageOriginalLanguage: String? = null` à `ApiConversation`.
2. Un résolveur `resolvedLastMessagePreview` porté de `MeeshyConversation` (Swift) — **règle #3 du
   Prisme** : parcourir les langues du lecteur DANS L'ORDRE, la première servie gagne, par une
   traduction OU parce que le message est déjà écrit dedans. Ne jamais court-circuiter sur la
   langue d'origine.
3. Brancher `lastMessagePreview()` dessus, et le cache disque (`ConversationCacheSource.kt`) doit
   persister les deux champs — sinon le démarrage à froid re-perd le prisme.
4. La source socket : `conversation:updated` porte les deux champs par destinataire depuis le cycle
   69, et depuis CE cycle il en porte aussi après une traduction. Android doit les appliquer au même
   endroit que `lastMessagePreview`.

---

# Cycle 73 — Le Prisme de la ligne de liste dépendait de l'ORDRE D'ARRIVÉE

## Le défaut

`message:translation` n'est diffusé que dans `ROOMS.conversation(id)`
(`MeeshySocketIOManager._handleTextTranslationReady`). Le rafraîchissement de la LIGNE DE LISTE,
lui, n'existait pas : `conversation:updated` n'était émis que par l'envoi, l'édition, la
suppression et l'épinglage. Or l'aperçu est servi **à l'envoi**, à un instant où la traduction
n'existe pas encore — la traduction NLLB atterrit une à deux secondes plus tard, par ZMQ.

Résultat : la carte `lastMessageTranslations` posée sur la ligne vaut `null` au moment où elle est
servie, et **rien ne repasse jamais**. Un lecteur francophone garde « Hello » dans sa liste,
indéfiniment, jusqu'à un rechargement complet.

Ce qui rend le défaut coûteux, c'est qu'il est **conditionnel au parcours** : ouvrir la conversation
traduit la ligne (le fil reçoit `message:translation`, le refetch de liste suivant réhydrate), ne
pas l'ouvrir la laisse dans la langue de l'expéditeur. Le même compte, sur le même appareil, voit
deux comportements selon ce qu'il a fait avant. « Le prisme s'applique à TOUT le contenu — previews
comprises » : c'était la seule surface où il dépendait de l'ordre d'arrivée plutôt que des
préférences du lecteur.

## Le correctif

Le chemin de traduction devient le **troisième appelant** de `emitConversationPreviewUpdate` — le
fan-out qui existait déjà pour l'édition/suppression, avec son Prisme PAR destinataire, sa
recomputation du dernier message non supprimé et son contrat best-effort. Aucune copie.

Mais une traduction n'est pas une édition, et la différence est la moitié du travail : une édition
change la ligne pour TOUT LE MONDE, une traduction ne la change que pour **les lecteurs de cette
langue-là**, et seulement **tant que le message traduit est encore le dernier**. D'où
`PreviewUpdateScope`, deux bornes optionnelles que les appelants d'édition ne passent pas :

- `onlyIfLatestIs` — un message plus récent est arrivé pendant que la traduction volait ? Son propre
  chemin d'envoi a déjà servi l'aperçu. Ré-émettre l'ancien ferait **RECULER** la ligne de liste,
  c'est-à-dire pire que le défaut corrigé.
- `onlyIfPreviewCarriesLanguage` — le test porte sur la carte SORTIE, pas sur les préférences en
  entrée. C'est elle qui décide, et elle applique déjà les quatre exclusions de
  `buildLastMessagePreviewTranslations` (hors prisme, langue d'origine, traduction chiffrée, texte
  inexploitable). Un lecteur dont la carte ne bouge pas recevrait un payload **identique à l'octet
  près** : le filtrer n'est pas une optimisation opportuniste, c'est la définition de « qui est
  concerné par CETTE traduction ». Sans lui, une conversation à N langues paie N fan-outs complets
  par message, sur le chemin le plus chaud du service.

`updatedBy` est OBLIGATOIRE dans `ConversationUpdatedEventData` et une traduction n'a pas d'acteur
humain. L'auteur du message traduit est la seule identité honnête à porter là — et c'est déjà le
repli que le chemin d'envoi utilise (`senderUserId ?? message.senderId`). Les deux clients ignorent
le champ (web le destructure et le jette, iOS le décode en optionnel).

## Ce qui a été VÉRIFIÉ, pas déduit

- **Les deux clients appliquent bien un `conversation:updated` dont seul le prisme a changé.** Le
  payload garde le même `lastMessageId`, le même `lastMessagePreview`, le même `lastMessageAt` : un
  client qui ne réagirait qu'au changement d'identité du dernier message l'avalerait.
  - iOS : `ConversationStore.merging` compare `lastMessageAt >= conv.lastMessageAt` — **`>=`, pas
    `>`**, et le commentaire dit pourquoi (une édition garde le `createdAt`). L'égalité passe, donc
    tout le groupe d'aperçu est appliqué.
  - Web : `normalizeConversationPatch` traite `lastMessageTranslations` comme une clé toujours
    présente, `null` compris, et le cache applique `{ ...conv, ...patch }`.
- **Le lecteur sur l'écran de liste EST joignable.** `AuthHandler._joinUserConversations` fait
  rejoindre TOUTES les rooms de conversation à l'authentification — le lecteur reçoit donc bien
  `message:translation`, mais aucun client ne s'en sert pour patcher la ligne de liste : iOS le
  range dans `CacheCoordinator.cacheTranslation` (cache MESSAGE, jamais la liste), web ne l'écoute
  que depuis `ConversationLayout`/`bubble-stream-page`, c'est-à-dire depuis la vue conversation. La
  ligne de liste se nourrit exclusivement de `lastMessageTranslations`.

## Vérification

- **10 témoins neufs.** 6 sur `emitConversationPreviewUpdate` (la portée), 4 sur le manager (le
  câblage).
- **RED prouvé par mutation**, pas supposé : les deux gardes retirées ⇒ 3 témoins de portée rouges ;
  l'appel au fan-out neutralisé ⇒ le témoin de câblage rouge.
- Deux témoins de portée sont volontairement non-discriminants seuls (« fan-out normal quand le
  message EST le dernier », « les appelants d'édition restent intacts ») : ils verrouillent ce qui
  ne doit PAS changer, et c'est leur seule fonction.
- `tsc --noEmit` du gateway : vert. Suite Jest complète du gateway : verte.

## Reste ouvert après ce cycle

- **Android ne décode pas le Prisme de la ligne de liste** — tête instruite du cycle 74 ci-dessus.
  Lane d'une autre routine, pas un arbitrage.
- **Le coût des deux requêtes quand la garde `onlyIfLatestIs` échoue.** Le helper interroge
  participants et dernier message EN PARALLÈLE, puis abandonne. Sérialiser (dernier message d'abord,
  bail, puis participants) économiserait la requête participants sur ce chemin-là mais ralentirait
  l'appelant DOMINANT (l'édition, où les deux sont toujours nécessaires). Arbitrage assumé en faveur
  du chemin dominant ; mesuré ici pour que le prochain cycle n'ait pas à le redécouvrir.
- **Le chemin AUDIO n'est pas touché.** Une transcription/traduction audio ne change pas
  `Message.content` — l'aperçu d'un vocal est un libellé de type, pas un texte. À revérifier si
  l'aperçu venait un jour à porter la transcription.
- Les points hérités restent tels quels — voir « Reste ouvert » du cycle 72 ci-dessous.

---

# Tête instruite (cycle 73, NON traitée) — la fenêtre de transition dépasse la moitié du slide le plus court

*Reportée telle quelle : c'est un arbitrage PRODUIT, et cette routine tourne sans personne pour le
trancher. Elle reste intégralement valable pour le prochain cycle qui disposera d'un avis produit.*

*Trouvé en corrigeant le cycle 72, mesuré, NON corrigé : contrairement aux deux défauts de ce
cycle-là, celui-ci demande un arbitrage produit, pas un correctif mécanique. L'arithmétique est
faite ; la décision ne l'est pas.*

## Le fait

`StoryComposerViewModel+Slides.currentSlideDuration` borne la durée d'un slide à
`max(2, min(600, …))` — **2 secondes minimum**. `StoryRenderer.slideTransitionDuration` vaut
désormais **1,2 s**, partagée par l'ouverture ET la fermeture.

Sur un slide de 2 s :
- l'ouverture court de `0` à `1,2` ;
- la fermeture ouvre à `2,0 − 1,2 = 0,8`.

**Les deux fenêtres se chevauchent sur 0,4 s**, et le slide n'a aucun instant où il est simplement
lui-même. Le seuil est `2 × 1,2 = 2,4 s` : tout slide plus court chevauche. À 0,5 s le seuil valait
1 s, sous le plancher de 2 s — le chevauchement était donc *impossible* avant `fcd002ee`. C'est une
conséquence non instruite du passage à 1,2 s, pas une dette ancienne.

## Ce que le cycle 72 a fait, et pourquoi il s'est arrêté là

Le correctif du chevauchement des *animations* (`clearOpeningFill`) ne retire l'entrée qu'à partir
de `progress > 0`, donc à `0,8 s` sur un slide de 2 s — au milieu d'une ouverture qui en est aux
deux tiers. Le saut est réel : opacité ~0,67 → ~1,0 d'une frame à l'autre. Il est **moins grave que
le défaut qu'il remplace** (une fermeture jamais jouée), et c'est le seul arbitrage que le cycle 72
s'est autorisé sans instruction.

## Les trois options, et ce qu'elles coûtent

1. **Relever le plancher de durée à `2 × slideTransitionDuration`** (2,4 s). Une ligne, dérivée de
   la SSOT, aucune régression de rendu. Coût : refuse une durée que des slides existants portent
   déjà en base — il faut décider ce qu'on fait des projets déjà enregistrés à 2 s.
2. **Comprimer la fenêtre de sortie dans ce qui reste** :
   `start = max(slideTransitionDuration, totalDuration − slideTransitionDuration)` et normaliser la
   rampe sur `totalDuration − start`. Aucun slide refusé, mais **`closingProgress` change de
   contrat** — et `StoryAVCompositor` doit suivre au même instant, sinon l'export re-diverge de
   l'aperçu, exactement le défaut n°2 du cycle 72 sous une autre forme.
3. **Ne rien faire et l'assumer** : un slide de 2 s avec entrée ET sortie est un cas que l'auteur
   a construit à la main ; le saut est visible mais borné.

**Ne pas trancher ça sans l'avis produit.** Les options 1 et 2 sont toutes deux défendables et
n'ont pas le même effet sur les stories déjà publiées.

## Ce qui reste vrai de la contrainte d'environnement

`ios-tests.yml` reste hors de portée de cette routine (`403 Resource not accessible by
integration` — pas de `actions: write`). **`sdk-tests.yml` tourne sur les PR** et a gaté les deux
correctifs du cycle 72, y compris le Swift de production : c'est le seul gate Swift disponible, et
il suffit dès que le code vit dans `packages/MeeshySDK`. Seule la couche `apps/ios` reste aveugle.

---

# Cycle 72 — Deux défauts sur la même surface : `main` redevient vert, et l'aperçu cesse de mentir sur l'export

## Le fil instruit, tenu jusqu'au bout

Le cycle 71 laissait une tête entièrement instruite : `sdk-tests` rouge sur `main`, cause prouvée
par l'arithmétique, correctif décrit, « mécanique pour qui dispose d'un Mac ». Elle avait raison sur
tout **sauf sur la contrainte** : le cycle 71 s'était interdit d'écrire ce Swift faute de pouvoir le
compiler. Or `sdk-tests.yml` tourne **sur les PR**. Le gate existait ; il n'avait pas été reconnu
comme tel pour du code de production.

C'est la leçon dominante du cycle, et elle vaut au-delà de ce correctif : **la question n'est pas
« puis-je compiler ici ? » mais « existe-t-il un gate qui compile ceci ? »**. Les deux réponses ont
divergé pendant cinq cycles.

## Défaut n°1 — huit témoins figés sur une durée qui a bougé

`fcd002ee` fait passer `StoryRenderer.slideTransitionDuration` de 0,5 à 1,2 s. Il a relevé la borne
de `StoryOpeningParityTests` mais laissé, dans deux autres fichiers, des instants d'échantillonnage
choisis pour la fenêtre précédente. Aucun comportement n'avait changé : la rampe est toujours nulle
avant la fenêtre, linéaire dedans, plafonnée après. **Seuls les témoins mentaient.**

Recaler les littéraux sur 1,2 s aurait « marché » et re-cassé au prochain ajustement — c'est la
deuxième fois que cette constante bouge, et la deuxième fois qu'elle laisse des témoins rouges
décrivant un comportement inchangé. Les instants s'expriment donc en fonction de la SSOT
(`totalDuration − window`, `− window / 2`), et les valeurs dérivées aussi (`zoomTransitionScale`,
`slideTransitionTravelFraction`).

Contrepartie assumée : `test_badgeWidth_matchesSlideTransitionDuration` devient **tautologique** une
fois lié à la SSOT — l'implémentation est littéralement l'expression attendue. Deux témoins lui
rendent sa portée, tous deux indépendants de la durée : la largeur reste celle de la FENÊTRE et non
celle du slide (la régression que le commentaire de la lane documente), et elle respire avec le zoom.

## Défaut n°2 — celui que le premier a fait apparaître

En relisant `StoryRenderer` pour dériver les instants, une asymétrie s'est vue : `applyOpening` pose
des `CABasicAnimation` (`fillMode = .forwards`, `isRemovedOnCompletion = false`) là où `applyClosing`
écrit des valeurs **modèle**. Un remplissage `.forwards` non retiré recouvre la valeur modèle — donc
la fermeture est calculée, stockée, et jamais vue.

Vérifié, pas déduit : **zéro `removeAnimation` dans tout `MeeshyUI`**, et `rootLayer` est un `let`
stocké que `rebuildLayers()` ne remplace pas. Le remplissage vit aussi longtemps que le canvas.

Le balayage des trois chemins de rendu a donné la portée exacte — et c'est elle qui rend le défaut
coûteux :

| Chemin | Touché | Pourquoi |
|---|---|---|
| **Aperçu du composer** | **oui** | seul chemin qui traverse `applyOpening` (transition `edit → play`) |
| Lecteur | non | canvas né en `.play` ; `self.mode = mode` dans l'`init` ne déclenche pas les observateurs — fait déjà consigné par `StoryOpeningParityTests` |
| Export MP4 | non | `applyStaticOpening` n'écrit que des valeurs modèle, `layer.render(in:)` n'exécutant pas le moteur d'animation |

**La surface où l'auteur vérifie ses transitions est la seule qui les avale.** L'aperçu mentait sur
l'export.

Le conflit se joue par **keyPath**, pas par effet : `.zoom` et `.slide` écrivent tous deux
`sublayerTransform`, donc une entrée `.zoom` masque une sortie `.slide` aussi sûrement que la sienne.
Le retrait est en conséquence chirurgical (une entrée `.fade` sous une sortie `.zoom` est laissée
en place) et ne se déclenche qu'à `progress > 0`, pour ne pas tronquer une entrée encore en vol.

## Vérification

- **7 témoins neufs**, dont **3 rouges avant** le correctif n°2 (`dropsTheOpeningFadeFill`,
  `dropsTheOpeningZoomFill`, `dropsEveryOpeningFillOnTheRootLayer`) ; les 2 autres verrouillent ce
  qui ne doit PAS être retiré (`keepsTheOpeningFill` avant la fenêtre, `keepsTheUnrelatedOpeningFade`).
- Les témoins portent sur `animation(forKey:)` et non sur le pixel : `presentationLayer()` exige un
  render server qu'aucun test unitaire n'a, et le remplissage attaché **est** le défaut.
- Gate : `sdk-tests.yml` sur la PR #2826 — compile et exécute `MeeshyUITests`, code de production
  compris.

## Reste ouvert après ce cycle

- **La fenêtre de transition dépasse la moitié du slide le plus court** — tête instruite du cycle 73
  ci-dessus. Arbitrage produit, pas correctif mécanique.
- **`ios-tests.yml` reste hors de portée** (`403`, pas de `actions: write`). Inchangé depuis le
  cycle 68 — mais la portée réelle de cette dette s'est réduite : tout ce qui vit dans
  `packages/MeeshySDK` est gatable par PR. Seule la couche `apps/ios` reste aveugle.
- **`eslint` ne peut toujours pas tourner sur le gateway** (aucun `eslint.config.js` depuis ESLint
  v9). Condition préexistante, non couverte par la CI.
- Les points hérités des cycles précédents restent tels quels : `@Display Name` inextractible dans
  le domaine social, `createStoryCommentNotificationsBatch` et son `visibility?` optionnel, les deux
  scripts de réparation base en attente d'exécution humaine, l'arbitrage `delete-for-me` du cycle 12.

---

# Tête instruite pour le cycle 72 — `sdk-tests` est ROUGE sur `main`, cause trouvée et prouvée

# Cycle 71b — L'effectif était AUSSI faux à la SOURCE (session parallèle, intégrée)

*Deux sessions ont traité la tête du cycle 71 en même temps, et sont tombées sur la MÊME racine —
un nom d'événement pour deux faits. Celle-ci a rebasé sur l'autre plutôt que de la doubler. Ce
qui suit ne garde de ce côté-ci que ce que l'autre n'avait pas, et dit pourquoi.*

## Ce qui a été REPRIS de l'autre session, et pourquoi c'est meilleur

- **Un événement dédié (`conversation:participant-joined`) plutôt qu'un champ discriminant.**
  Cette session distinguait les deux sens de `conversation:joined` par la PRÉSENCE de
  `memberCount` dans le payload. Ça marche, mais ça fait porter une sémantique à une option, et
  ça élargit l'audience d'un événement que des clients déployés écoutent déjà. Un nom distinct
  ne demande rien à personne : `conversation:joined` reste intact, room et payload compris, et
  un témoin le fige. **Repris, et le `memberCount` de `ConversationParticipationEventData` a été
  RETIRÉ** — il y aurait entretenu l'idée que cet événement parle d'appartenance.
- **`conversation:left` est le MÊME piège, et cette session ne l'avait pas vu.** L'autre l'a
  trouvé : un seul émetteur, `socket.emit` après `socket.leave(room)`, c'est-à-dire la FERMETURE
  d'un fil. Le web y décrémentait — un membre en moins à chaque fermeture. Les deux erreurs se
  compensaient en partie, ce qui les cachait.
- **L'arrivant écarté de l'éventail** : son effectif lui vient de `conversation:new`, qui le
  compte déjà.

## Ce qui reste de CE côté-ci, parce que l'autre session ne l'avait pas

1. **La colonne `memberCount` est MORTE, et deux routes en dépendaient.** C'est le défaut le plus
   grave des deux, et il est en amont de tout le travail temps réel : le compteur que l'autre
   session vient de maintenir correctement en direct partait, sur la LISTE, d'une valeur qui vaut
   `0` pour toute conversation créée depuis la migration héritée. Détail ci-dessous.
2. **Le bannissement et la levée n'atteignaient pas non plus les écrans de liste.** L'autre
   session a élargi départ, retrait et ajout ; `ban.ts` était resté thread-only.
3. **L'effectif absolu dans le payload.** L'autre session laisse les clients faire ±1. Un delta
   ne converge pas — détail ci-dessous — et le total ne coûte rien : il est lu sur la requête qui
   sert déjà à nommer les rooms. Porté par les quatre événements d'appartenance, y compris le
   nouveau `conversation:participant-joined`.


## La question posée par le cycle 70, et sa réponse

Le cycle 70 instruisait : *avant d'élargir l'audience des trois émetteurs de
`participants.ts`, établir si la ligne de liste rend quelque chose qui dépende de ces faits.*

**Elle en rend.** `ThemedConversationRow.swift` :
- `:351` badge de groupe, affiché sous condition `conversation.memberCount > 1` ;
- `:66` intensité visuelle, `min(memberCount / 50, 1)` ;
- et surtout `ConversationContext(… memberCount:)` → `DynamicColorGenerator`, où l'effectif
  pilote le **saturation boost** de la couleur d'accent (`min(memberCount / 100, 1) × 0.2`).

C'est cette vérification qui a trouvé le vrai défaut, et il n'était pas où le cycle 70 le
cherchait : **l'effectif était déjà faux avant tout événement.**

## Défaut 1 — `Conversation.memberCount` est une colonne MORTE, et deux routes en dépendaient

`memberCount Int @default(0)` existe dans le schéma. Le gateway ne l'écrit **nulle part** :
la seule écriture du dépôt est `migrations/migrate-from-legacy.ts`, qui recopie la valeur du
document hérité. Aucun `conversation.create` ne la pose, aucun `update` ne la maintient.

Toute conversation créée par le code actuel porte donc `0` à vie. Or :

| Route | Ce qu'elle servait |
|---|---|
| `GET /conversations` (LISTE) | la colonne → **0** |
| `GET /conversations/:id` (DÉTAIL) | `_count` filtré `isActive` → l'effectif réel |
| `GET /conversations/search` | `_count` filtré → l'effectif réel |
| `GET /admin/users/:id/conversations` | la colonne → **0** |

Deux réponses portaient le même nom de champ pour deux valeurs différentes. Conséquences
visibles, et elles n'ont pas la signature d'un bug de compteur :
- le badge de groupe iOS ne s'affiche JAMAIS sur la liste (`0 > 1` est faux) ;
- **la couleur d'accent d'une conversation change quand on l'ouvre** — saturation 0 sur la
  liste, saturation réelle sur le fil. La règle « toute la surface d'une conversation utilise
  `accentColor` » était respectée partout ; c'est son entrée qui divergeait ;
- côté web, `transformers.service.ts` faisait `memberCount || _count?.participants ||
  participants.length` : le `0` tombait sur le repli, et la liste n'envoie que 5 participants —
  un groupe de 200 s'affichait « 5 ».
- l'écran admin annonçait « 0 membres » sur toute conversation post-migration.

Le fragment `_count` est hissé en `utils/active-member-count.ts` et partagé par le détail, la
liste et l'admin. Il vit dans son propre module et non dans `core.ts` : l'écran admin peut le
consommer sans importer un module de routes entier — l'import qui traîne ses dépendances
jusque dans les doubles jest des suites voisines est exactement la leçon 93.

## Défaut 2 — `conversation:joined` porte DEUX sens (trouvé des DEUX côtés ; c'est la forme de l'AUTRE session qui reste)

`SERVER_EVENTS.CONVERSATION_JOINED` est émis par :
- `routes/conversations/participants.ts:377` — « untel devient membre » (diffusion) ;
- `socketio/handlers/ConversationHandler.ts:144` — « ton socket vient d'entrer dans la room »,
  un accusé adressé au SEUL socket qui rejoint, réémis à **chaque ouverture de conversation**
  et à chaque reconnexion.

`use-socket-cache-sync.ts` faisait `memberCount + 1` sur cet événement. **Ouvrir cinq fois le
même fil ajoutait cinq membres au compteur de la ligne de liste**, et `staleTime: Infinity`
ne relit jamais de lui-même pour corriger. C'est un défaut vivant, reproductible sans réseau
dégradé ni concurrence.

Aucun client ne pouvait faire mieux : rien dans le payload ne distinguait les deux sens.

**Le correctif retenu est celui de l'autre session** — un événement dédié
`conversation:participant-joined`, `conversation:joined` laissé strictement intact. Cette session
proposait de discriminer par la présence de `memberCount` ; c'est moins bon, et le champ a été
retiré de `ConversationParticipationEventData` pour ne pas laisser croire l'inverse. L'autre
session a en outre trouvé le jumeau que celle-ci avait manqué : `conversation:left` est lui aussi
un accusé de ROOM, et le web y décrémentait à chaque fermeture de fil.

## Le correctif — un effectif ABSOLU dans le payload, pas un delta

Les quatre transitions d'appartenance (`participants.ts` ajout et retrait, `leave.ts`,
`ban.ts` ban et unban) portent désormais `memberCount`, compté APRÈS l'écriture, sur la même
requête qui sert déjà à nommer les rooms — aucune requête supplémentaire.

C'est ce qui rend l'effectif **convergent**, et c'est le point de fond du cycle :
- un delta ne se rattrape jamais d'un événement manqué (hors room, hors ligne, trou de
  reconnexion), et les deux clients PERSISTENT la dérive — cache disque iOS
  (`schedulePersist`), `staleTime: Infinity` côté web ;
- un compte absolu se rattrape à l'événement suivant ;
- il tranche `membershipEnded` / `membershipRestored` de lui-même : bannir un ex-membre ne
  retire personne, donc le compte est simplement inchangé. Les drapeaux restent pour les
  clients qui décomptent encore ;
- **et il sépare les deux sens de `conversation:joined`** : seul l'événement d'appartenance
  le porte. Son absence n'est pas « serveur ancien » mais « cet événement ne parle pas
  d'appartenance » — le web ne touche donc plus au compteur sur l'accusé de room.

## Le correctif — l'audience, comme au cycle 70

Départ, retrait, bannissement, levée et ajout passent par `emitToConversationParticipants` :
rooms personnelles des membres ACTIFS comprises. Le commentaire de `participants.ts` nommait
pourtant « ConversationListViewModel count » depuis sa création — l'intention était écrite, et
l'audience la contredisait.

Aucune question de confidentialité : l'audience passe de « les membres qui ont le fil ouvert »
à « les membres », soit les mêmes personnes sur d'autres sockets.

La liste des membres restants est lue APRÈS l'écriture, donc la personne retirée ou bannie en
est naturellement absente — elle n'apprend pas son retrait par une ligne de liste qui se
décrémente, mais par la notification que la route lui envoie déjà. À l'inverse, une levée de
bannissement qui RESTAURE l'appartenance remet la cible dans l'audience : elle apprend son
retour sur sa propre ligne de liste, ce que la room de conversation ne pouvait pas lui dire.
Le commentaire de `ban.ts` qui justifiait l'ordre « rebrancher AVANT de diffuser » par
« la diffusion ne va qu'à la room de conversation » est devenu faux : il est corrigé, pas
supprimé — l'ordre garde une raison (aucun événement de room manqué entre les deux).

## `PARTICIPANT_ROLE_UPDATED` reste thread-only, et c'est écrit dans le code

Le troisième émetteur du balayage du cycle 70. Vérifié plutôt que supposé : aucun écran de
liste ne rend un rôle. Les consommateurs sont `use-participants.ts` (web) et `ParticipantsView`
(iOS), qui ne vivent que le fil ouvert. Élargir ferait payer une diffusion par changement de
rôle sans rien mettre à jour. La note est dans le code, pour que le cycle 72 ne refasse pas
l'enquête.

## Témoins

- liste : l'effectif vient du `_count` et non de la colonne ; le `select` demande bien le
  compte filtré `isActive` ; `_count` ne fuit pas dans la réponse ;
- admin : même chose, sur la route d'un autre module ;
- ajout de membre : les rooms personnelles sont adressées — y compris celle d'un participant
  SANS compte, nommée par son `Participant.id` — et le payload porte l'effectif absolu ;
- départ : idem, et le compte est celui des restants ;
- web : l'accusé de room (sans `memberCount`) ne touche plus au compteur, même répété ;
  l'événement d'appartenance POSE la valeur ; et un `memberCount: 2` sur un cache à 5 rend 2 —
  c'est la propriété de rattrapage, qu'un décrément (qui rendrait 4) ne peut pas avoir.

Le double `io` des suites touchées CHAÎNE désormais (`__tests__/helpers/chainable-io.ts`,
extrait de `recordEmitChains`) : `io.to(fil).to(perso).emit()` est la forme de production, et
un double qui casse dessus décrit un autre programme. `expect(io.to).toHaveBeenCalledWith(room)`
ne prouvait de toute façon pas que la room appartenait à la chaîne qui a émis.

Un défaut de fixture trouvé en passant : `conversations-ban.test.ts` faisait
`{ participant: { …défauts, ...overrides.participant }, ...overrides }` — le second spread
réécrasait `participant` en entier, annulant la fusion par clé que le premier prétendait faire.

## Ce que ce cycle NE fait pas

- **iOS**. Aucune chaîne Swift dans ce conteneur, et `ios-tests.yml` reste indéclenchable
  depuis cette routine (`403 Resource not accessible by integration` — pas d'`actions: write`).
  Le client iOS continue de faire ±1 ; il reçoit désormais un `memberCount` qu'il ignore.
  C'est la tête du cycle 72, et elle est maintenant sans risque : le serveur est correct et
  se décrit lui-même.
- **La colonne morte elle-même**. Elle reste dans le schéma. Plus aucune route du gateway ne
  la lit ; `services/agent/src/scheduler/eligible-conversations.ts` la recopie encore dans un
  champ que rien ne consomme.

---


# Cycle 71 — L'effectif d'une conversation cesse de mentir : un événement pour l'adhésion, une audience pour les listes

## Contrainte d'environnement — inchangée depuis le cycle 68

Conteneur Linux distant : aucune chaîne Swift (`swift: command not found`), aucun SDK Android,
`node_modules` absent au démarrage. Les trois commandes de la leçon 102 se réutilisent telles
quelles (`bun install --ignore-scripts`, `prisma generate --generator client`, `shared: bun run build`).

**Le premier geste instruit par le cycle 70 — « faire tourner `ios-tests.yml` sur `main` » — reste
impossible** : l'intégration GitHub de cette routine n'a pas `actions: write`, et le workflow ne se
déclenche autrement que sur push vers `dev`. La dette est donc reportée telle quelle. Ce cycle la
limite autrement : **la moitié la plus grave du défaut a été trouvée sur le WEB**, qui est gaté par
jest ici. Le Swift écrit reste ungatable, mais il n'est plus la seule preuve.

## Le fil instruit : trois émetteurs thread-only de `participants.ts`

Le cycle 70 demandait d'ÉTABLIR, avant d'écrire, si la ligne de liste rend quelque chose qui dépende
de ces trois faits. Réponse, vérifiée dans le code des deux clients :

- **Oui pour l'adhésion et le départ.** iOS `ThemedConversationRow:351` rend `conversation.memberCount`,
  et web `use-socket-cache-sync` le tient dans le cache React Query.
- **Non pour le rôle.** `PARTICIPANT_ROLE_UPDATED` n'a que des consommateurs d'écrans de participants,
  tous ouverts DANS la conversation. Il reste thread-only, et la raison est désormais **écrite dans le
  code** (`participants.ts`) plutôt que redécouverte au cycle 72, exactement comme demandé.

## Le vrai défaut, plus grave que l'audience : `conversation:joined` porte DEUX faits

C'est la découverte du cycle, et elle ne se déduisait pas du balayage des rooms.

`conversation:joined` est émis à deux endroits, avec **le même nom et le même payload
`{conversationId, userId}`** :
- `ConversationHandler:144` — ack **self-only** d'un socket qui vient de REJOINDRE LA ROOM, produit
  à **chaque ouverture de fil**, et qui ne change aucune appartenance ;
- `participants.ts:377` — diffusion d'une **adhésion réelle**.

Un client ne peut pas les distinguer. Conséquences mesurées dans chaque client :

1. **Web — le compteur grossissait d'une unité à chaque ouverture du fil.** `handleConversationJoined`
   faisait `memberCount + 1` sur l'ack. Trois ouvertures affichaient un groupe de 4 comme un groupe
   de 7, et `staleTime: Infinity` ne relit jamais la valeur d'elle-même. C'est un défaut visible,
   quotidien, et il vivait dans le code gaté.
2. **iOS — le compteur ne pouvait que décroître.** Aucun `+1` n'existait (précisément parce qu'il
   aurait compté les ouvertures), alors que départ, retrait et bannissement soustraient tous. Dérive
   monotone vers le bas, **persistée** par `schedulePersist` dans le cache disque.

Les deux symptômes sont opposés et ont la même racine : un nom d'événement pour deux faits.

### Et le pendant, trouvé en corrigeant le premier : `conversation:left`

Une fonction plus bas dans le MÊME fichier web, `handleConversationLeft` **décrémentait**
`memberCount` sur `conversation:left` — qui n'a qu'un seul émetteur, `socket.emit` après
`socket.leave(room)` (`ConversationHandler.handleConversationLeave`). C'est la FERMETURE d'un fil,
jamais un départ.

Les deux erreurs se compensaient **en partie**, ce qui les a cachées — et c'est précisément ce qui
rendait la correction partielle dangereuse : retirer le `+1` sans retirer le `-1` aurait transformé
une dérive à peu près nulle en **une soustraction nette par fermeture de fil**. Elles ne se
compensaient d'ailleurs jamais exactement : une reconnexion socket rejoint la room sans avoir émis
de `leave`, l'appli fermée n'en émet pas non plus, et la soustraction était bornée à 0 quand
l'addition ne l'était pas. Les deux handlers ne gardent désormais que leur invalidation.

iOS n'était pas exposé : ni `ConversationSyncEngine` ni `ParticipantsView` ne touchent l'effectif
sur `conversationLeft`.

## Le correctif : séparer les faits, puis élargir l'audience

`conversation:participant-joined` — nouvel événement, **symétrique de `conversation:participant-left`
jusque dans son payload** (`{conversationId, userId, displayName, joinedAt}`).

- `conversation:joined` **n'est pas touché** : même émetteur, même room, même payload. Les
  consommateurs existants (ParticipantsView, ConversationSyncEngine, web) ne bougent pas, et aucun
  client déployé ne régresse. Un témoin le fige.
- Web : `handleConversationJoined` perd son `+1` et ne garde que l'invalidation, légitime dans les
  deux lectures. Le `+1` passe sur le nouvel événement.
- iOS : nouveau `participantJoined` (SDK) et `+1` dans `ConversationListViewModel`.
- **Le nouvel arrivant est écarté de l'éventail, des DEUX côtés.** Le serveur l'omet
  (`NOT: { userId }`) ; le client écarte aussi sa propre identité, parce que l'auto-join de room
  côté serveur est asynchrone et pourrait le faire entrer dans la room avant l'emit. Son effectif
  lui vient de `conversation:new`, qui le compte déjà — l'incrémenter le mettrait en trop.

Et l'audience, comme au cycle 70 : `leave.ts`, le retrait et l'ajout passent tous par
`emitToConversationParticipants` — chaînage des rooms (au plus une copie par socket), room d'un
participant sans compte nommée par son `Participant.id`, membres inactifs écartés. **La room de
conversation reste en tête de chaîne** : elle porte le partant / le retiré, encore dedans à cet
instant (l'éviction vient après l'emit), donc leur propre signal est strictement inchangé.

## Témoins

- gateway `participants-membership-fanout.test.ts` (5) : la chaîne de rooms de l'ajout et du
  retrait, l'exclusion du nouvel arrivant, le payload symétrique, et `conversation:joined` figé sur
  la seule room du fil ;
- gateway `leave.test.ts` (+2) : la chaîne du départ, et le fait que l'éventail ne lise que les
  membres ACTIFS. Le test socket qui existait n'assertait rien du tout sur l'audience ;
- web `use-socket-cache-sync.test.tsx` (+4) : le `+1` sur le nouvel événement, et surtout **trois
  `conversation:joined` d'affilée qui laissent l'effectif à 4**, plus deux `conversation:left` qui
  le laissent à 4 également — les deux défauts web exactement ;
- web `presence.service.test.ts` (+1) : le relais du nouvel événement ;
- iOS `ConversationListViewModelTests` (+3) : `+1`, garde sur soi-même, et le `-1` du départ qui
  n'avait aucun témoin jusqu'ici. **Non exécutés** (pas de chaîne Swift ici).

---


# Tête instruite pour le cycle 72 — `sdk-tests` est ROUGE sur `main`, cause trouvée et prouvée

*Découvert en gatant le cycle 71, diagnostiqué mais NON corrigé : le correctif est du Swift que ce
conteneur ne peut ni compiler ni exécuter, et la leçon 95 condamne précisément d'en poser sur `main`
sans gate. Ce qui suit rend la correction mécanique pour qui dispose d'un Mac — l'arithmétique est
déjà faite.*

## Le fait

`sdk-tests.yml` échoue sur `main` : **8 échecs / 7017 succès / 35 ignorés** — chiffres et valeurs
**identiques** sur la PR #2817, donc totalement indépendants d'elle (c'est ce qui a autorisé son
merge). Déterministe, pas un flake : les mêmes valeurs octet pour octet à deux runs distants de 2 h.

Fenêtre de régression : run `b100ccfd1` (04:05) **vert** → run `9477dd74` (07:25) **rouge**.

## La cause, prouvée

`fcd002ee` — *« feat(story): allonge les interludes de lecture à 1,2 s »* — fait passer
`StoryRenderer.slideTransitionDuration` de **0.5 à 1.2**. Ce commit a relevé la borne de
`StoryOpeningParityTests` (1.0 → 1.5), mais **a oublié `StoryClosingTests` et
`TransitionChromeLaneTests`**, qui codent en dur des valeurs dérivées de 0,5 s.

L'arithmétique referme le dossier sans compilateur :

- `test_badgeWidth_matchesSlideTransitionDuration` attend `25.0`, obtient `60.0`.
  **60 / 25 = 2,4 = 1,2 / 0,5.** La largeur du badge est proportionnelle à la durée.
- `test_closingProgress_beforeWindow_returnsZero` : `closingProgress(totalDuration: 6.0, at: 5.5)`.
  Avec 0,5 s la fermeture commence à `6,0 − 0,5 = 5,5` ⇒ progress 0. Avec 1,2 s elle commence à
  `4,8` ⇒ `(5,5 − 4,8) / 1,2 = 0,58333…` — **exactement la valeur observée** `0.5833333333333335`.
- `test_closingProgress_midWindow_returnsLinearRamp` : `at: 5.75` ⇒ `(5,75 − 4,8) / 1,2 = 0,79166…`
  — **exactement** `0.7916666666666669`.

Les 5 autres (`applyClosing_fade/reveal/slide/zoom`, `simulateTickAt_fadeClosingInsideWindow`)
échouent par le même mécanisme : un instant d'échantillonnage choisi pour une fenêtre de 0,5 s.

## Le correctif à écrire

**Lier les témoins à la SSOT plutôt que de recaler des littéraux** — exactement ce que l'auteur de
`fcd002ee` a fait pour `StoryOpeningParityTests`. Les instants d'échantillonnage s'expriment en
fonction de `StoryRenderer.slideTransitionDuration` :

- « avant la fenêtre » ⇒ `at: totalDuration - StoryRenderer.slideTransitionDuration` (progress 0) ;
- « mi-fenêtre » ⇒ `at: totalDuration - StoryRenderer.slideTransitionDuration / 2` (progress 0,5) ;
- largeur de badge ⇒ dériver de la même constante.

Recaler les littéraux sur 1,2 s « marcherait » et **re-casserait au prochain ajustement de durée** —
c'est la troisième fois que cette constante bouge. Fichiers :
`packages/MeeshySDK/Tests/MeeshyUITests/Story/Reader/Animation/StoryClosingTests.swift` et
`.../Timeline/Views/TransitionChromeLaneTests.swift`.

## Ce que ce cycle n'a PAS pu faire, et ce qu'il faudrait

`ios-tests.yml` reste hors de portée de cette routine (`403 Resource not accessible by integration`
— pas de `actions: write`). **`sdk-tests.yml`, lui, tourne sur les PR** : c'est le seul gate Swift
dont cette routine dispose, et il a bien servi au cycle 71 — les 7017 tests verts incluent les tests
de cache du SDK qui consomment `MockMessageSocket`, donc la moitié SDK du cycle a bien été compilée
et vérifiée. À garder en tête : **une PR suffit à gater le SDK ; seule la couche `apps/ios` reste
aveugle.**

---


# Tête instruite pour le cycle 72 — le client iOS compte encore par deltas, sur un serveur qui lui donne le total

*Vérifié dans le code de `main`, pas déduit. Aucune ligne de Swift écrite : `apps/ios` n'est ni
compilable ni gatable dans ce conteneur, et `ios-tests.yml` ne se déclenche que sur `dev` ou à la
main (`403` depuis cette routine, cf. cycle 70). Écrire du Swift invérifiable qui atterrit sur
`main` est ce que la leçon 95 condamne — d'où l'instruction plutôt que le correctif.*

## Le défaut : `ConversationListViewModel` fait ±1, et ne fait JAMAIS +1 sur un ajout

`apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift`, ~ligne 950 :

- `participantSelfLeft` → `memberCount -= 1` puis `schedulePersist()` ;
- `participantBanned` (si `didEndMembership`) → `-= 1` ;
- `participantUnbanned` (si `didRestoreMembership`) → `+= 1` ;
- **`conversationJoined` : aucun abonnement.** Le compteur ne peut donc que DESCENDRE.

Le second point est la conséquence directe du défaut 2 du cycle 71 : `conversation:joined`
portait deux sens, et iOS a choisi — raisonnablement — de n'en tirer aucun delta. Le web avait
choisi l'autre branche et gonflait son compteur à chaque ouverture.

**Ce qui a changé** : les cinq transitions portent maintenant `memberCount`, ABSOLU, et l'accusé
de room de `ConversationHandler` est le seul à ne pas le porter. Le correctif iOS est donc une
AFFECTATION, pas un abonnement de plus à arbitrer :

1. ajouter `memberCount: Int?` à `ParticipantLeftEvent`, `ParticipantBannedEvent`,
   `ParticipantUnbannedEvent` et `ConversationParticipationEvent`
   (`packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift`) — optionnel, un
   serveur plus ancien ne le porte pas ;
2. dans chaque `sink`, `if let count = event.memberCount { conversations[i].memberCount = count }`
   **avant** de retomber sur le delta existant. Poser plutôt que soustraire est ce qui rattrape
   une dérive au lieu de la continuer — et `schedulePersist()` écrit la valeur corrigée ;
3. s'abonner à `conversationJoined` UNIQUEMENT pour l'affectation, jamais pour un `+= 1` :
   l'événement sans `memberCount` est l'accusé de room, réémis à chaque ouverture. C'est le
   piège exact dans lequel le web était tombé — le reproduire à l'identique côté iOS serait la
   pire issue possible de ce cycle.

Les trois témoins à écrire sont symétriques de ceux du web : accusé de room répété ⇒ compteur
inchangé ; événement d'appartenance ⇒ valeur POSÉE ; cache à 5 + payload à 2 ⇒ 2.

## Second point, plus petit : la colonne morte

`Conversation.memberCount` n'est plus lue par aucune route du gateway. Restent deux gestes, à
arbitrer plutôt qu'à exécuter en aveugle :
- `services/agent/src/scheduler/eligible-conversations.ts:66` la recopie dans un champ
  `EligibleConversation.memberCount` que **rien ne consomme** (`conversation-scanner.ts` pose
  même `0` en dur sur l'autre chemin). C'est du code mort au sens strict.
- la colonne elle-même : la supprimer du schéma est une migration Mongo, donc un geste de
  déploiement, pas de code. La laisser coûte un champ trompeur que la prochaine route
  sélectionnera par mimétisme — c'est déjà arrivé deux fois.

## Points hérités, inchangés

- Les mentions du chemin de lien attendent toujours l'extraction qui écrit
  `Message.validatedMentions` ; aucun client iOS n'écoute `link:message:new` ; les pièces
  jointes du chemin de lien n'entrent pas dans le pipeline audio ; l'arbitrage `delete-for-me`
  du cycle 12 attend une validation humaine.
- `bun run lint` échoue toujours immédiatement (ESLint v9) — condition préexistante, la CI ne
  gate que `test:coverage`.
- La suppression de branche distante échoue depuis cette routine (`git push --delete` répond
  « Everything up-to-date » sans agir) — à faire depuis l'interface GitHub.

# Tête instruite pour le cycle 72 — le même « un nom, deux faits » ailleurs, et la réconciliation de l'effectif

*Deux pistes, la première vérifiée, la seconde à instruire.*

## 1. L'effectif n'a AUCUN chemin de réconciliation — ~~à instruire~~ **RÉPONDU, et corrigé (cycle 71b)**

*La question posée ici — « est-ce que `GET /conversations` renvoie `memberCount` à chaque page,
et le client l'écrase-t-il ? » — a été instruite par la session parallèle. La réponse était pire
que les deux branches envisagées, et elle est écrite au cycle 71b ci-dessus :*

**la liste renvoyait bien un `memberCount`… lu dans une colonne dénormalisée que le gateway
n'écrit NULLE PART.** Il n'y avait donc pas « rafraîchissement qui auto-corrige » ni « pas de
source de vérité » : il y avait une source de vérité qui MENTAIT, et qui valait `0` pour toute
conversation créée depuis la migration héritée. Un rafraîchissement de liste ne réparait pas la
dérive : il la remplaçait par zéro.

Les deux moitiés sont faites : la liste (et l'écran admin) comptent désormais les participants
actifs en base, et les quatre événements d'appartenance portent un `memberCount` **absolu** que
le web POSE au lieu de l'additionner. Reste la moitié iOS, instruite juste au-dessus.

## 2. Le balayage des événements surchargés est FAIT — et il est CLOS

*Exécuté à la fin du cycle 71, avec le critère mécanique que le défaut de ce cycle a fourni :
un `SERVER_EVENTS.X` émis à la fois par `socket.emit` (self-only) et par une diffusion
(`io.to(...)` / `emitToConversationParticipants`). 12 événements self-only croisés avec tous les
émetteurs de diffusion. **Trois intersections, aucun nouveau défaut de la classe du cycle 71.**

- `CONVERSATION_JOINED` — le défaut de ce cycle, corrigé.
- `CONVERSATION_UNREAD_UPDATED` — **résultat négatif, et il vaut d'être écrit** : ses quatre
  émetteurs « de diffusion » adressent tous `ROOMS.user(...)`, une room PERSONNELLE. Le fait porté
  est donc le même des deux côtés — « votre compteur non-lu pour cette conversation » — seule
  l'adresse change (ce socket-ci vs tous les appareils de la personne). Le `io.to(ROOMS.user(...))`
  est même le meilleur des deux : il couvre le multi-appareil. Rien à faire.
- `MESSAGE_TRANSLATION` — **même FAIT des deux côtés** (« voici la traduction du message X en
  langue Y » : une traduction n'est pas propre à un destinataire), donc pas le défaut du cycle 71.
  Mais **deux FORMES de payload sous un même nom** : `MeeshySocketIOManager:1342` émet
  `{messageId, translatedText, targetLanguage, confidenceScore}` (réponse à une demande à la
  volée, cache chaud) là où `:1509` diffuse `translationData`, qui porte un tableau
  `translations: [...]`. Chaque client doit donc décoder deux formes pour un seul événement.
  Défaut de contrat mineur, sans conséquence d'état observée — à traiter pour lui-même, pas
  comme une urgence.

**Ne pas refaire ce balayage.** S'il faut le rejouer après une évolution :
`grep -rhoE "socket\.emit\(SERVER_EVENTS\.[A-Z_]+" services/gateway/src` croisé avec les
émetteurs `.to(` — attention aux parenthèses imbriquées (`io.to(ROOMS.conversation(id))`), qu'un
`[^)]*` naïf manque.

## 3. Ancienne formulation, conservée pour mémoire — chercher les autres événements surchargés

`conversation:joined` et `conversation:left` sont traités — les deux sont **clos**. Le critère de
recherche se réutilise tel quel et n'a PAS été appliqué au-delà de ces deux-là : **un
`SERVER_EVENTS.X` émis à la fois par `socket.emit` (self-only) et par `io.to(...).emit`
(diffusion)**, ou dont le nom décrit un ÉTAT DE SOCKET là où un client lit un ÉTAT MÉTIER. Le
balayage complet reste à faire ; `grep -n "socket.emit(SERVER_EVENTS" services/gateway/src` en est
le point de départ, à croiser avec les émetteurs `io.to(`.

## Points hérités, inchangés

- Les mentions du chemin de lien attendent toujours l'extraction qui écrit `Message.validatedMentions` ;
  aucun client iOS n'écoute `link:message:new` ; les pièces jointes du chemin de lien n'entrent pas
  dans le pipeline audio ; l'arbitrage `delete-for-me` du cycle 12 attend une validation humaine.
- `bun run lint` échoue toujours immédiatement (ESLint v9) — condition préexistante, la CI ne gate
  que `test:coverage`.
- `ios-tests.yml` reste hors de portée de cette routine (`actions: write` manquant). Chaque cycle
  iOS repousse la même dette tant que le droit n'est pas accordé.
- La suppression de branche distante échoue depuis cette routine — à faire depuis l'interface GitHub.

# Cycle 70 — Le Prisme franchit la porte du ViewModel, et deux événements de conversation trouvent enfin les écrans de liste

## Contrainte d'environnement — un maillon de PLUS que les cycles précédents

Même conteneur Linux distant : aucune chaîne Swift (`swift: command not found`), aucun SDK Android,
`node_modules` absent au démarrage (`bun install --ignore-scripts` puis les deux commandes de la
leçon 102 : verifié, la note du cycle 68 se réutilise telle quelle).

**Nouveau, et il faut le lire avant d'instruire une lane iOS** : le cycle 69 laissait comme gate
« lancer `ios-tests.yml` à la main sur la branche (onglet Actions → Run workflow) ». **Cette
routine n'en a pas le droit.** `POST /actions/workflows/ios-tests.yml/dispatches` répond
`403 Resource not accessible by integration` — l'intégration GitHub de la routine n'a pas
`actions: write`. Le workflow ne se déclenche par ailleurs QUE sur push vers `dev`, et pousser sur
`dev` n'est pas autorisé depuis cette branche.

Conséquence à écrire noir sur blanc plutôt qu'à contourner : **la moitié iOS de ce cycle est
livrée SANS son gate**. Ni compilée, ni testée. Ce qui a été fait à la place, faute de mieux :
- toute inférence de type évitable a été retirée du Swift écrit (la closure immédiatement appliquée
  à type tuple étiqueté est devenue une `private static func` à type déclaré ; le ternaire
  `NSNull() : map` du helper de test porte `as Any` des deux côtés, sinon les deux branches n'ont
  pas de type commun) ;
- chaque API touchée a été relue dans son fichier source (`LastMessageFacet.init` accepte bien
  `translations:`/`originalLanguage:` ; `MeeshyConversation.lastMessageTranslations` est bien
  `public var` ; `MockMessageSocket.conversationUpdated` est bien un `PassthroughSubject`) ;
- `line_length` et les règles de style sont dans `disabled_rules` de `.swiftlint.yml` — rien à
  gagner de ce côté.

Cela ne remplace pas une compilation. **Premier geste du cycle 71 : faire tourner `ios-tests.yml`
sur `main` et corriger ce qui rougit.** Si la routine doit continuer à traiter des lanes iOS, il
faut lui accorder `actions: write` — sans quoi chaque cycle iOS repousse la même dette.

## Moitié iOS — la tête instruite du cycle 70, consommée

Le défaut décrit par le cycle 69 a été **revérifié dans le code de `main` avant la première ligne**
et la description était exacte : `ConversationListViewModel.conversationUpdated` ne lisait jamais
`lastMessageTranslations`.

- **Branche `else` (horodatage ÉGAL ⇒ ÉDITION)** : le nouveau texte était appliqué, la carte de
  traduction de l'ANCIEN restait. Le résolveur PRÉFÉRANT la traduction à `lastMessagePreview`, la
  ligne rendait le texte d'avant **indéfiniment**. C'était le défaut du cycle 69, toujours vivant
  sur le chemin que voit l'écran.
- **Branche `bumpToTop`** : la facette était construite sans `translations:` ni `originalLanguage:`
  — la carte que le gateway venait de résoudre POUR CE lecteur était jetée.

L'extraction du tri-état est faite **une seule fois**, avant les deux branches, en recopiant
`ConversationStore.merging` (SDK) : `.replaced` applique la paire (carte vide ⇒ `nil`),
`.unchanged` ne touche à rien. Le `>` strict du garde de bump **n'a pas bougé**, exactement comme
le cycle 69 l'avait instruit : il protège une facette délibérément neutre, et le relâcher ferait
perdre pièce jointe, expiration et « vue unique » à chaque édition.

Trois témoins : édition ⇒ carte périmée, nouveau message ⇒ carte servie, **métadonnées ⇒ carte
intacte**. Le troisième est le seul qui exerce la moitié `.unchanged` du tri-état, et il se trouve
que la moitié gateway de ce même cycle en dépend (voir ci-dessous) : les deux se prouvent
mutuellement le contrat.

Le helper `makeConversationUpdatedEvent` construit l'événement **depuis du JSON** — seule façon
d'exprimer « clé absente » face à « clé nulle ». Il a fallu l'élargir (`lastMessagePreview`,
`lastMessageTranslations`, `lastMessageOriginalLanguage`) : la note du cycle 69 disait que les deux
cas étaient déjà exprimables sans y toucher, ce n'était pas le cas.

## Moitié gateway — deux événements de conversation n'atteignaient QUE le fil ouvert

Trouvé en cherchant les autres émetteurs de `CONVERSATION_UPDATED`, gaté localement (jest).

`PUT /conversations/:id` et `DELETE /conversations/:id` n'adressaient leurs événements qu'à
`ROOMS.conversation(id)`. Or c'est **le cas exact que `emitConversationPreviewUpdate` documente
depuis sa création pour l'autre moitié du même payload** : un participant posé sur l'écran de liste
a QUITTÉ la room de conversation et n'est joignable que par sa room personnelle.

1. **Renommage** (et avatar, bannière, mode lent, canal d'annonce, traduction auto) : la ligne de
   liste de tous ceux qui n'avaient pas le fil ouvert gardait l'ancienne valeur jusqu'à un
   rechargement complet.
2. **Clôture** : le membre gardait la ligne dans sa liste et ne l'apprenait qu'en tapant dessus.
   Le commentaire du code annonçait pourtant « Broadcast closure to all members ». Les deux clients
   écoutent bien `conversation:closed` — web `use-socket-cache-sync.ts` (qui RETIRE la ligne du
   cache de liste), iOS `MessageSocketManager` — l'événement ne leur parvenait simplement jamais.

Les deux passent par `emitToConversationParticipants`, déjà la formulation de référence : chaînage
des rooms (au plus UNE copie par socket), room d'un participant sans compte nommée par son
`Participant.id` (`userId ?? id`), participants inactifs écartés. La clôture lit ses participants
**dans son écriture** (`include`), sans requête supplémentaire.

Un témoin fige que le payload ne porte **aucune clé `lastMessage*`** — et c'est ici que les deux
moitiés du cycle se rejoignent : le tri-état client distingue « clé absente » de « clé nulle », donc
un `lastMessageTranslations: null` posé par un renommage effacerait une traduction parfaitement
valide sur toutes les lignes de liste. Le témoin iOS n° 3 est l'autre bout de ce même contrat.

Le hard-delete de conversation **n'avait aucun témoin de route** jusqu'ici : le fichier de test
homonyme (`conversation-deleted-broadcast.test.ts`) couvre `delete-for-me`, une autre route.

## Retiré du backlog après enquête — l'audit `ROOMS.user(` est CLOS

Le backlog le portait depuis le cycle 69 : « la règle *adresser par `userId ?? id`* vaut pour tout
émetteur personnel, et rien ne garantit que les autres la respectent ». Instruit par recherche sur
`ROOMS.user(`, comme demandé, plutôt que par déduction. **Aucun défaut restant** :

- `emitConversationPreviewUpdate` passe déjà par `participantUserRoomTargets` (cycle 69) ;
- `emitUnreadCountsToRecipients`, `callEndedFanout`, `offlineParticipantQueue`, `MessageHandler`
  portent tous `userId ?? id` ;
- `core.ts:1238` (CONVERSATION_NEW) adresse des **User.id**, pas des lignes `Participant` — la
  règle ne s'y applique pas ;
- les `.map(p => p.userId)` restants sont **sémantiquement corrects** et non des oublis : contrôle
  de blocage (`MessageHandler:2029`, `messages.ts:1769` — un anonyme ne peut pas être bloqué),
  préférences d'accusés de lecture (`MessageReadStatusService:1080` — pas de `userId`, pas de ligne
  de préférence, donc visible par défaut), notifications push (il faut un compte).

C'est un résultat négatif, et il vaut d'être écrit : sans lui, le prochain cycle refait l'enquête.

---

# Tête instruite pour le cycle 71 — les mêmes écrans de liste, sur les événements de MEMBRES

*Repéré par le même balayage que ci-dessus (`to(ROOMS.conversation(`), NON traité faute d'avoir
vérifié ce que la ligne de liste rend réellement. C'est cette vérification qui doit précéder le
correctif, pas l'inverse : élargir une audience a un coût et une dimension de confidentialité.*

Trois émetteurs de `routes/conversations/participants.ts` sont thread-only, comme l'étaient le
renommage et la clôture :

- `:377` `CONVERSATION_JOINED` — un membre rejoint ;
- `:562` `CONVERSATION_PARTICIPANT_LEFT` — un membre part ;
- `:748` `PARTICIPANT_ROLE_UPDATED` — un rôle change.

**Ce qu'il faut établir AVANT d'écrire quoi que ce soit** : la ligne de liste rend-elle quelque
chose qui dépende de ces trois faits ? Si la ligne affiche un compteur de membres ou une pile
d'avatars, les deux premiers sont le même défaut que ce cycle vient de corriger et se corrigent
pareil (`emitToConversationParticipants`, participants actifs, payload inchangé). Si elle n'en rend
rien, ils sont thread-only à juste titre et il faut le NOTER dans le code plutôt que de le
redécouvrir au cycle 72. `PARTICIPANT_ROLE_UPDATED` est le plus douteux des trois : un rôle ne se
voit nulle part dans une liste.

Le reste des émetteurs thread-only du balayage est légitime et n'a pas besoin d'être réinstruit :
réactions, typing, position live, transcription/traduction audio, `MESSAGE_EDITED` (déjà doublé par
`emitConversationPreviewUpdate` pour la liste).

## Points hérités, inchangés

- Les mentions du chemin de lien attendent toujours l'extraction qui écrit `Message.validatedMentions` ;
  aucun client iOS n'écoute `link:message:new` ; les pièces jointes du chemin de lien n'entrent pas
  dans le pipeline audio ; l'arbitrage `delete-for-me` du cycle 12 attend une validation humaine.
- `bun run lint` échoue toujours immédiatement (ESLint v9) — condition préexistante, la CI ne gate
  que `test:coverage`.
- La suppression de branche distante échoue depuis cette routine (`git push --delete` répond
  « Everything up-to-date » sans agir) — à faire depuis l'interface GitHub.

# Cycle 69b — Solde d'une session parallèle, et la tête du cycle 70

*Deux sessions ont traité la tête instruite du cycle 68 en même temps. Celle-ci a rebasé sur
l'autre plutôt que de la doubler. Rien de nouveau n'est écrit ici : ce bloc note ce qui a été
comparé, et instruit le maillon qu'AUCUNE des deux n'a fermé.*

## L'intégration, faite dans le sens de la leçon des cycles 23/25b

Les deux implémentations ont été comparées **défaut par défaut**, jamais « qui est arrivé en
premier ». Celle du cycle 69 est **strictement meilleure partout où les deux se recouvrent**, et
c'est elle qui reste :

- unité partagée `lastMessagePreviewPrism.ts` (fragment `select` + résolveur), là où cette session
  câblait l'appel en ligne dans chaque émetteur ;
- `participantUserRoomTargets` avec `participantUserRooms` réécrit **comme une projection** de lui —
  cette session ajoutait une seconde fonction à côté, donc deux traversées à garder d'accord ;
- tri-état Swift `LastMessagePreviewTranslations` (`.unchanged` / `.replaced`), là où cette session
  portait un `Bool` parallèle à un `Optional` — deux champs à garder cohérents contre un seul ;
- `ConversationStore.merging` hissée en fonction pure `nonisolated` **partagée avec le writer de
  cache disque** : le store RAM et la liste persistée ne peuvent plus diverger sur ce que signifie
  un `conversation:updated`. Cette session n'avait pas vu ce second consommateur ;
- côté web, `extractPreviewTranslations` hissée et partagée avec le chemin REST, là où cette session
  se contentait d'un `?? undefined` ;
- côté témoins, `recordEmitChains` lie le payload à SA room. L'assertion de cette session comparait
  un ensemble non ordonné de payloads : elle ne pouvait pas prouver **qui** recevait **quelle**
  carte — exactement la propriété que « par destinataire » revendique.

Les deux sessions s'accordaient, indépendamment, sur les deux points les plus délicats : le
`>` → `>=` du garde monotone, et `container.contains` comme seul endroit où « clé absente » se
distingue de « clé nulle ». Le troisième émetteur (`MessageHandler.broadcastNewMessage`, l'envoi
WebSocket PRIMAIRE) manquait au cadrage initial « les deux émetteurs jumeaux » ; il a été greffé
sur `main` (`c74d82e9`) pendant que cette session le rédigeait, dans une version plus propre
(réutilise le type exporté `PreviewPrismParticipant`). Rien à ajouter.

---

# Tête instruite pour le cycle 70 — le Prisme s'arrête à la porte du ViewModel iOS

*Vérifié dans le code de `main` après le cycle 69, pas déduit. Aucune ligne de production écrite :
`apps/ios` n'est compilable ni gatable dans ce conteneur (aucune chaîne Swift ; `ios-tests.yml` ne
tourne que sur `dev` ou à la demande). Écrire du Swift invérifiable qui atterrit sur `main` est
précisément ce que la leçon 95 condamne — d'où l'instruction plutôt que le correctif.*

## Le défaut : la moitié cliente du cycle 69 ne touche pas l'écran de la liste

Le cycle 69 a corrigé `ConversationStore` (SDK). Mais l'écran de liste de l'app passe par
`ConversationListViewModel.conversationUpdated` (`apps/ios/.../ConversationListViewModel.swift`,
~ligne 800), qui **ne lit JAMAIS le Prisme** — `grep lastMessageTranslations` sur ce fichier ne rend
rien. Deux branches, deux symptômes distincts :

1. **Branche `else` (horodatage égal ⇒ ÉDITION).** Elle applique bien `lastMessageId`,
   `lastMessageLocation` et `lastMessagePreview`… et laisse `lastMessageTranslations` intacte.
   C'est **littéralement le défaut du cycle 69, toujours vivant** : nouveau texte + carte de
   l'ancien, et `resolvedLastMessagePreview` préfère la carte. Le gateway envoie désormais le
   `.replaced` qui périmerait la carte ; personne ne l'écoute ici.

2. **Branche `bumpToTop` (nouveau message).** La facette est construite en
   `LastMessageFacet(id:preview:senderName:at:location:)`, sans `translations:` ni
   `originalLanguage:` — donc `applyLastMessage` pose `nil`. Pas de texte périmé (c'est la vertu de
   la facette « en bloc »), mais la carte que le gateway vient de résoudre **pour ce lecteur** est
   jetée : la ligne montre l'original là où une traduction était disponible et payée.

## Ce qu'il faut écrire

`LastMessageFacet.init` accepte DÉJÀ `translations:` et `originalLanguage:`
(`packages/MeeshySDK/.../LastMessageFacet.swift`) — rien à élargir :

- **branche bump** : passer `translations:` / `originalLanguage:` depuis l'événement ;
- **branche `else`** : appliquer la paire au même titre que `lastMessagePreview`, en respectant le
  tri-état — `if case .replaced(let map) = event.lastMessageTranslations` ⇒ poser
  `map.isEmpty ? nil : map` **et** `lastMessageOriginalLanguage` ; `.unchanged` ⇒ ne rien toucher.
  `ConversationStore.merging` (SDK) est la formulation de référence, à recopier telle quelle plutôt
  qu'à réinventer.

**Ne PAS toucher au `>` strict de cette branche.** Il ne s'agit pas du même garde que celui du SDK :
ici il protège l'appel à `bumpToTop`, qui applique une facette **délibérément neutre**. Le relâcher
en `>=` ferait perdre à la ligne la pièce jointe, l'expiration et le drapeau « vue unique » du
message courant à chaque édition — le remède serait pire, et la branche `else` existe précisément
pour traiter ce cas sans réordonner.

**Témoins** : `ConversationListViewModelTests` a déjà `makeConversationUpdatedEvent`, qui construit
l'événement **depuis du JSON** — donc `"lastMessageTranslations": null` et une carte peuplée sont
tous deux exprimables sans toucher au helper. Deux témoins suffisent : édition ⇒ carte périmée,
nouveau message ⇒ carte servie.

**Gate** : `ios-tests.yml` ne se déclenche pas sur les PR. Lancer le workflow à la main sur la
branche (onglet Actions → « Run workflow ») avant de merger, sinon la vérification n'existe pas.

---

# Cycle 69 — Après une édition, la ligne de liste affichait le texte D'AVANT

## Contrainte d'environnement (identique aux cycles 61/63→68, revérifiée)

Même conteneur Linux distant. Aucune chaîne Swift (`swift: command not found`), aucun SDK Android
(`~/Android` absent). `tasks/lane-cursor.md` dit toujours `lane=ANDROID` et la lane reste
matériellement impossible ici : **le curseur n'a donc PAS été touché.** Lanes gatables localement :
gateway, web, shared. La lane SDK iOS est gatée par `sdk-tests.yml` en CI (précédent : cycles 65/68).

`node_modules` était de nouveau absent au démarrage. `bun install --ignore-scripts` passe et suffit
à tous les gates de ce cycle — la note du cycle 68 s'est vérifiée telle quelle, à réutiliser.

## La tête instruite a été consommée, et RE-PROUVÉE avant d'écrire

Le cycle 68 laissait cette tête « instruite, NON CONSOMMÉE ». Chaque maillon a été relu dans le code
réel avant la première ligne de production — la description était exacte, et l'enquête a trouvé
**deux maillons de plus** que le cadrage ne nommait pas (§ « Ce que l'enquête a ajouté »).

## Le défaut

Le symptôme n'est pas « la ligne n'est pas traduite » : c'est **la ligne affiche l'ANCIEN contenu**,
indéfiniment, jusqu'à un rechargement complet de la liste.

1. `GET /conversations` hydrate la ligne avec `lastMessagePreview` (l'original tronqué),
   `lastMessageTranslations` (la carte du prisme du lecteur) et `lastMessageOriginalLanguage`.
2. Le résolveur des deux clients — `resolvedLastMessagePreview` (iOS, `CoreModels.swift:238`) et
   `formatLastMessage` (web) — **PRÉFÈRE la traduction** à `lastMessagePreview`.
3. Une édition arrive. Le gateway **périme la colonne dans la même écriture** (`translations: null`,
   `routes/messages.ts`), délibérément atomique.
4. Les deux émetteurs de `conversation:updated` n'envoyaient que `lastMessagePreview` — **sans
   traductions, sans langue d'origine** (`emitConversationPreviewUpdate.ts:88-90` pour
   l'édition/suppression, `MeeshySocketIOManager.ts` pour l'envoi).
5. Les clients n'écrasaient donc que l'aperçu : `lastMessagePreview` = nouveau texte,
   `lastMessageTranslations` = **carte de l'ANCIEN texte**. Le résolveur rend l'ancien contenu.

**Qui le voit :** tout lecteur dont la langue primaire diffère de la langue d'origine du message et
pour qui une traduction existait — le cas NOMINAL du produit. Le serveur avait bien fait son
travail ; c'est le fil qui ne le disait pas.

## Pourquoi le correctif évident est faux (revérifié, pas recopié)

« Vider la carte côté client quand un nouvel aperçu arrive » **casserait le cycle 65** : le chemin
d'envoi émet aussi `conversation:updated`, derrière un `message:new` qui vient d'installer la carte.
Et raffiner en « vider seulement si `lastMessageId` diffère » ne marche pas : **une édition garde le
MÊME message**, donc le même id — c'est exactement le seul cas que ce raffinement laisse passer.

**Le client ne peut pas trancher seul.** Seul le serveur sait que la carte a été périmée.

## Ce que l'enquête a ajouté au cadrage

Deux maillons que la tête instruite ne nommait pas, tous deux **bloquants** :

1. **iOS jetait TOUT le groupe d'aperçu sur une édition.** `applyConversationUpdated` gardait
   `event.lastMessageAt > conv.lastMessageAt` — un `>` STRICT. Une édition ne crée pas de message :
   `createdAt` est inchangé, donc l'événement portait un timestamp ÉGAL et le groupe entier était
   silencieusement jeté. Le doc-comment de la fonction énonce pourtant la règle correcte (« un
   `lastMessageAt` plus ANCIEN décrit un message périmé ») : **le code était plus strict que sa
   propre spécification**, et `>=` est ce qu'elle dit. Sans ce correctif, la moitié iOS de ce cycle
   était inerte.
2. **`Optional` ne suffit pas à porter le signal.** « Clé absente » (renommage : ne pas toucher la
   carte) et « clé nulle » (le serveur DIT que la carte est périmée) demandent des actions opposées,
   et `decodeIfPresent` rend `nil` dans les deux cas. D'où le tri-état
   `LastMessagePreviewTranslations` (`.unchanged` / `.replaced`), décodé par
   `container.contains(...)` — la PRÉSENCE de la clé, seul endroit où la distinction existe.

## Le correctif

**Gateway — les deux émetteurs jumeaux, traités ensemble** (sinon l'aperçu redevient dépendant du
transport : traduit après une édition, brut après un envoi) :

- nouvelle unité partagée `socketio/utils/lastMessagePreviewPrism.ts` —
  `PREVIEW_PRISM_PARTICIPANT_SELECT` (le fragment `select` que tout émetteur d'aperçu doit charger)
  et `resolveLastMessagePreviewPrism(participant, message)`, qui délègue à
  `resolveUserLanguagesOrdered` + `buildLastMessagePreviewTranslations`, les unités que `core.ts`
  utilise DÉJÀ pour la même donnée. Aucune règle de prisme réimplémentée.
- **la question « payload PAR DESTINATAIRE » du cycle 60 est tranchée par le code existant** : la
  boucle par participant était déjà là, elle envoyait simplement le même objet à tout le monde. Elle
  devient `participantUserRoomTargets`, qui rend `{ room, participant }` — la règle de dédup
  `userId ?? id` reste dans UN seul endroit, `participantUserRooms` en étant désormais une projection.
- `null` est envoyé comme **valeur**, jamais omis : c'est ce vide REÇU qui périme la carte du client.

**Shared** : `ConversationUpdatedEventData` déclare les deux champs (ils circulaient jusque-là sur
l'`index signature`, donc sans contrat lisible).

**Web** : `normalizeConversationPatch` normalise les deux champs **avec la même unité que le chemin
REST** — `extractPreviewTranslations` est hissée de méthode privée à fonction de module et partagée.
Deux validations distinctes pour un même champ auraient laissé le cache détenir deux formes selon le
transport, exactement ce que le doc-comment du normaliseur reproche déjà aux dates. La clé reste
PRÉSENTE avec `undefined` (le cache applique `{ ...c, ...patch }` : une clé absente laisserait la
carte périmée en place).

**SDK iOS** : tri-état + application dans le MÊME groupe monotone que `lastMessagePreview`, et
`>` → `>=`.

## Vérification

- Gateway : **suite complète — 650 suites / 16 378 tests verts** (base cycle 68 : 650 / 16 371 ;
  l'écart est exactement les 7 témoins gateway ajoutés — 5 sur l'émetteur d'édition, 2 sur le
  jumeau d'envoi — aucun perdu). Les 13 autres témoins de ce cycle vivent hors de cette suite :
  5 côté web, 8 côté SDK iOS. Total 20.
- Gateway : RED observé avant implémentation — 5 témoins en échec sur
  `emitConversationPreviewUpdate.test.ts`, 7 préexistants verts.
- Gateway : `tsc --noEmit` — **0 erreur** (après `prisma generate --generator client` +
  `bun run build` du shared).
- Web : RED observé (3/5), puis **30 suites / 750 tests verts**. `tsc` : aucune erreur sur les
  fichiers touchés (les erreurs restantes préexistent, dans des fichiers de test non touchés).
- SDK iOS : **non gatable ici** (aucune chaîne Swift). 8 témoins écrits — 5 sur
  `applyConversationUpdated`, 3 sur le décodage tri-état. Gate = `sdk-tests.yml` en CI.

## Reste ouvert après ce cycle

- **Supprimer le DERNIER message ne met toujours pas la ligne à jour sur iOS.** Le nouveau dernier
  message est plus ANCIEN, donc le garde monotone le rejette — à raison selon sa règle. C'est un
  contrat distinct (« le dernier message recule »), pas une variante de celui-ci : le traiter
  demande de distinguer « événement en retard » de « le dernier message a changé pour un plus
  ancien », ce qu'un seul timestamp ne peut pas exprimer. **Candidat sérieux pour le cycle 70.**
- **`conversation:updated` du chemin d'envoi porte `lastMessagePreview: message.content` brut** —
  non tronqué, là où `GET /conversations` applique `truncateMessagePreview` (300 points de code).
  Un très long message gonfle donc chaque payload temps réel. iOS tronque à la réception
  (`meeshyPreviewTruncated`), le web non.
- Les points hérités du cycle 68 restent inchangés : le chemin REST/ZMQ n'emporte pas l'enveloppe de
  chiffrement ; `forwardedFromId` manque au payload REST ; `serializeAttachmentForSocket` est plus
  étroit que sa promesse ; `eslint` ne peut pas tourner sur le gateway (pas d'`eslint.config.js`
  depuis ESLint v9) ; `PinnedMessageBanner` n'affiche qu'UNE épingle ; `ConversationPicker.tsx`
  rend `lastMessage.content` brut ; le « mensonge de type » de `Message.translations` ; les deux
  scripts de réparation base attendent une exécution humaine ; l'arbitrage `delete-for-me` du
  cycle 12 attend une validation humaine.

---

# Cycle 68 — L'écho REST ne portait pas le `clientMessageId` que le client attendait

## Contrainte d'environnement (identique aux cycles 61/63/64/65/66/67, revérifiée)

Même conteneur Linux distant. Aucune chaîne Swift (`swift: command not found`), aucun SDK Android
(`~/Android` absent → pas de `./apps/android/meeshy.sh check`, seul gate de cette lane).
`tasks/lane-cursor.md` dit toujours `lane=ANDROID` et la lane reste matériellement impossible ici :
**le curseur n'a donc PAS été touché.** Lanes gatables : gateway, web, shared.

Note d'environnement, nouvelle : `node_modules` était absent au démarrage. `bun install` échoue sur
le postinstall de `grpc-tools` (`node-pre-gyp` → « Could not parse s3 bucket name from virtual host
url », le proxy sortant). **`bun install --ignore-scripts` passe** et suffit à tous les gates de ce
cycle. À réutiliser tel quel au prochain run plutôt que de rejouer le diagnostic.

## Le défaut

`MeeshySocketIOManager._broadcastNewMessage` — l'émetteur de `message:new` du chemin **REST/ZMQ** —
ne mettait `clientMessageId` **dans aucun payload**, et n'émettait qu'une seule copie à la room de
conversation.

Le contrat que la clé sert est écrit noir sur blanc dans le dépôt
(`socketio/utils/message-ack-shaping.ts`, invariants #1 et #2) et implémenté par les DEUX autres
transports : le chemin socket (`MessageHandler.broadcastNewMessage`, `:1199-1265`) sépare un
`senderPayload` cid-aware adressé à `ROOMS.user(sender.userId)` d'un `broadcastPayload` cid-strippé
adressé à la room `.except()` cette room personnelle ; les deux routes de lien appellent
`stripClientMessageId` (`routes/links/messages.ts:392`, `:676`). Le chemin REST/ZMQ n'avait ni l'une
ni l'autre moitié.

## Pourquoi ça compte, prouvé côté client et non supposé

Ce n'est pas un chemin secondaire. `ConversationViewModel.sendMessage` (iOS) n'emprunte le
socket-first que si `socketFirstEligible` — qui exige `!isEncrypted && (attachmentIds?.isEmpty ??
true) && resolvedExpiresAt == nil && !resolvedIsViewOnce && resolvedBlur != true &&
!pendingEffects.hasAnyEffect`. **Tout le reste part en REST** : chaque pièce jointe, chaque DM
chiffré (l'E2EE est appliqué automatiquement dès `isDirect`), chaque vue-unique, chaque éphémère,
chaque message à effets — plus tout raté du socket-first.

Et le client avait écrit une garde POUR CETTE COURSE, qui ne pouvait pas se déclencher.
`MessagePersistenceActor.upsert` (`:1710-1718`) place `clientMessageId` en **branche 0**, avant
`PendingIdRecord` et avant l'id serveur, avec ce commentaire :

> « catches an echo that races ahead of `applyEvent(.serverAck)` … Without it, an echo arriving
> before the REST ACK falls through to the insert branch and produces a duplicate `cid` /
> server-id pair (Sprint 2 RC2.3b). »

« an echo arriving before the REST ACK » : la course nommée est exactement celle du chemin REST. Le
gateway ne posait jamais la clé sur laquelle cette branche indexe — la défense était **inatteignable
par construction**.

Le pire cas n'est pas le doublon, c'est la bulle bloquée. La route saute délibérément le broadcast
sur un renvoi idempotent (garde `!isDuplicate`, `routes/conversations/messages.ts:1843`). Quand la
réponse HTTP du premier POST se perd (app mise en fond, cellulaire coupé, crash) et que l'outbox
durable renvoie avec le même `clientMessageId`, le gateway déduplique et **n'émet rien**. Les deux
seules voies de promotion étaient la réponse HTTP (perdue) et un `message:new` porteur du cid
(jamais envoyé) : la ligne optimiste restait en `.sending` indéfiniment alors que le message était
stocké et distribué à tout le monde. Seul un rechargement complet la réconciliait.

## Le correctif

Le split du chemin socket, à l'identique, en réutilisant les unités qui existaient déjà :

- `clientMessageId` entre dans le payload (même accès que `MessageHandler._buildMessagePayload:1813`) ;
- `stripClientMessageId(messagePayload)` produit la copie des pairs — **sans cast** en
  `Record<string, unknown>`, le helper étant générique et préservant (cycle 7), donc l'emit typé
  `message:new` reste vérifié par le compilateur ;
- `io.to(room).except(ROOMS.user(senderUserId))` pour les pairs, `io.to(ROOMS.user(senderUserId))`
  pour l'expéditeur — le `.except()` est ce qui empêche un appareil de l'expéditeur présent dans la
  room de recevoir DEUX `message:new` ;
- expéditeur sans compte (invité de lien) : une seule émission room-wide cid-strippée, comportement
  strictement inchangé ;
- `_emitMessageNewByLanguage` du manager reçoit l'option `excludeUserId` que son jumeau de
  `MessageHandler` avait déjà, pour que `SOCKET_LANG_FILTER=true` ne réintroduise pas le doublon ;
- le rejeu hors ligne (`deliveryQueue.enqueue`) stocke désormais le corps **destinataire** : même
  règle que `enqueueOfflineLinkMessage`, dont le doc-comment la formule déjà (« a replay carrying
  the author's `clientMessageId` would leak their local optimistic id into another user's id
  space »).

## Vérification

- Gateway : **suite complète — 650 suites / 16 371 tests verts.** Base du cycle 67 : 650 / 16 366.
  L'écart est exactement les 5 témoins ajoutés — aucune régression, aucun témoin perdu.
- Gateway : RED observé avant implémentation sur 2 des 5 (`toSender` vide ; `excepted` vide). Les
  3 autres passaient **à vide** avant le correctif — le cid n'étant nulle part, son absence chez les
  pairs était trivialement vraie. Ils deviennent portants une fois la clé sur le fil : ils tombent
  si un futur changement oublie le `strip`.
- Gateway : `tsc --noEmit` — **0 erreur sur tout le service** (après `prisma generate --generator
  client` + `bun run build` du shared, prérequis CI documentés dans `CLAUDE.md`).

## Reste ouvert après ce cycle

- **Le chemin REST/ZMQ n'emporte toujours pas l'enveloppe de chiffrement.** `_broadcastNewMessage`
  omet `isEncrypted` / `encryptionMode` / `encryptedContent` / `encryptionMetadata` /
  `encryptedPayload`, que `_buildMessagePayload` porte tous. Or `MessageProcessor.saveMessage:396`
  stocke `content: ''` pour un message chiffré, et le web lit `encryptedContent` +
  `encryptionMetadata` **sur le payload socket** pour déchiffrer
  (`messaging.service.ts:229-247`) : un message chiffré posté en REST arriverait en bulle VIDE.
  **Latent aujourd'hui** — le web ne chiffre que sur le chemin socket, et iOS met son cryptogramme
  dans `content` sans jamais poster `encryptedContent`, si bien que le gateway le range en clair.
  Ce dernier point mérite sa propre enquête : c'est un désaccord de contrat entre `SendMessageRequest`
  (iOS) et `SendMessageBodySchema` (gateway), pas une omission de broadcast.
- **`forwardedFromId` / `forwardedFromConversationId` / le snapshot `forwardedFrom` manquent aussi
  au payload REST**, alors que la route les accepte (`messages.ts:1648`, `:1802`) et que le chemin
  socket les construit (`MessageHandler:1121-1143`). Un message transféré via REST arriverait en
  temps réel sans marqueur « Transféré ». Même famille que ce cycle, même fichier — traité à part
  pour ne pas mélanger deux contrats dans un diff.
- **`lastMessagePreview: message.content` (brut) dans `CONVERSATION_UPDATED` du même chemin** —
  hors Prisme, et vide pour un message chiffré. **C'est exactement le jumeau que la tête instruite
  ci-dessous (reportée au cycle 69) nomme** : `MeeshySocketIOManager.ts:2181` doit être traité avec
  `emitConversationPreviewUpdate.ts:88`, sinon l'aperçu redevient dépendant du transport. La
  question « payload PAR DESTINATAIRE » du cycle 60 y est tranchée — la boucle par participant
  existe déjà.
- **`serializeAttachmentForSocket` est un whitelist strictement plus étroit que `attachmentFullSelect`** :
  il laisse tomber l'enveloppe de chiffrement, les compteurs de consommation, le couple de
  transfert et l'état vue-unique/flou/effets, alors que son doc-comment promet la « parité avec le
  payload REST `/messages` ». Le chemin socket sélectionne `attachmentMediaSelect`, qui ne les
  charge pas non plus : élargir le sérialiseur seul ne changerait rien. Instruit, non écrit —
  demande de trancher quelles pièces jointes ont besoin de quoi sur le fil.
- Les points hérités restent inchangés : `eslint` ne peut pas tourner sur le gateway (pas
  d'`eslint.config.js` depuis ESLint v9) ; `PinnedMessageBanner` n'affiche qu'UNE épingle ;
  `ConversationPicker.tsx` (admin) rend `lastMessage.content` brut ; le « mensonge de type » de
  `Message.translations` est instrumenté mais pas résolu ; `isDuplicate` n'est protégé par aucun
  témoin au niveau du spread ; les deux scripts de réparation base attendent une exécution humaine ;
  l'arbitrage `delete-for-me` du cycle 12 attend une validation humaine ;
  `getMentionsForMessage` / `getRecentMentionsForUser` n'ont toujours aucun écran.

---

# Tête instruite, NON CONSOMMÉE — reportée au cycle 69

> **Note d'intégration (cycle 68).** Ce bloc a été écrit par une session parallèle et a atterri sur
> `main` *pendant* que le cycle 68 ci-dessus était déjà en cours d'écriture sur une autre branche.
> Il n'a donc pas été consommé — il n'est pas périmé pour autant : rien de ce que le cycle 68 a
> touché ne recoupe `emitConversationPreviewUpdate` ni les résolveurs d'aperçu de liste. Il reste
> le candidat le plus étayé du backlog et **le cycle 69 doit le prendre en tête**, sans refaire
> l'enquête. Conservé mot pour mot ci-dessous.


*Enquête menée pendant l'attente de la CI du cycle 67. Rien n'est supposé ci-dessous : chaque
maillon a été lu dans le code. Aucune ligne de production n'a été écrite — la correction est
cross-stack (gateway + SDK iOS + web) et méritait son propre cycle plutôt qu'une fin de course.*

## Le défaut : après une édition, la ligne de liste affiche le texte D'AVANT

Le symptôme n'est pas « la ligne n'est pas traduite ». C'est **la ligne affiche l'ANCIEN contenu**,
indéfiniment, jusqu'à un rechargement complet de la liste.

La chaîne, maillon par maillon :

1. `GET /conversations` hydrate la ligne avec `lastMessagePreview` (l'original tronqué),
   `lastMessageTranslations` (la carte du prisme du lecteur) et `lastMessageOriginalLanguage`
   — cycles 61/64, `routes/conversations/core.ts:659-664`.
2. Le client résout par `resolvedLastMessagePreview(preferredLanguages:)`
   (`CoreModels.swift:238`) / `resolveLastMessagePreview` (web) : si une traduction sert le prisme,
   **c'est elle qui s'affiche**, pas `lastMessagePreview`.
3. Une édition arrive. Le gateway **périme la colonne dans la même écriture** —
   `translations: null` (`routes/messages.ts:361`, et le commentaire adjacent explique que
   c'est délibérément atomique).
4. Le gateway émet `conversation:updated` avec, en tout et pour tout,
   `lastMessagePreview: latest?.content` — le NOUVEAU texte, **sans traductions, sans
   `lastMessageOriginalLanguage`** (`socketio/emitConversationPreviewUpdate.ts:88-90`).
   Le chemin d'envoi fait pareil (`MeeshySocketIOManager.ts:2181-2183`).
5. Les deux clients appliquent le patch **en n'écrasant que l'aperçu** :
   - iOS : `applyConversationUpdated` pose `conv.lastMessagePreview` et ne touche jamais
     `lastMessageTranslations` (`ConversationStore.swift:436`). Le type d'entrée
     `ConversationUpdatedStoreEvent` (`:759-772`) **n'a même pas de champ traductions**.
   - web : `{ ...c, ...patch }` avec un patch construit par `normalizeConversationPatch` à partir
     des seules clés reçues (`use-socket-cache-sync.ts:1086-1089`).
6. Résultat : `lastMessagePreview` = nouveau texte, `lastMessageTranslations` = **carte de
   l'ANCIEN texte**. Le résolveur, qui préfère la traduction, rend l'ancien contenu.

**Qui le voit :** tout lecteur dont la langue primaire diffère de la langue d'origine du message et
pour qui une traduction existait — c'est-à-dire le cas NOMINAL du produit. Le serveur, lui, a bien
fait son travail : il a périmé la colonne. C'est le fil qui ne le dit pas.

## Pourquoi le correctif ÉVIDENT est faux — vérifié avant de l'écrire

Réflexe naturel : « quand `conversation:updated` apporte un nouvel aperçu, vider la carte de
traductions côté client ». **Ça casserait le cycle 65.**

Le chemin d'ENVOI émet les deux événements. `message:new` installe `lastMessageTranslations` via
`previewTranslations(from:viewerLanguages:)` — c'est précisément ce que le cycle 65 a construit —
et le `conversation:updated` jumeau arriverait derrière pour l'effacer. Un vide inconditionnel
échange un défaut contre un autre.

Raffiner en « vider seulement si `lastMessageId` diffère » ne marche pas non plus : **une édition
garde le MÊME message**, donc le même id. C'est exactement le cas à traiter, et le seul que ce
raffinement laisse passer.

**Conclusion : le client ne peut pas trancher seul.** Seul le serveur sait si la carte a été
périmée. Le correctif appartient au fil.

## Le correctif attendu — et la question du cycle 60, enfin tranchée

`conversation:updated` doit porter `lastMessageTranslations` + `lastMessageOriginalLanguage`, à
parité avec ce que `GET /conversations` sert déjà. Après une édition la carte fraîchement
construite est **vide**, et c'est ce vide — reçu, pas déduit — qui périme proprement la carte du
client. Les trois champs s'appliquent alors **en groupe monotone**, comme iOS le fait déjà pour
`lastMessageAt` / `lastMessageId` / `lastMessagePreview`.

Le backlog portait ce point depuis le cycle 60 sous l'étiquette « payload PAR DESTINATAIRE,
question de conception non tranchée ». **Elle est tranchée, et par le code existant :**
`emitConversationPreviewUpdate` **boucle déjà par participant**
(`for (const room of participantUserRooms(participants))`, `:97`). Un payload par destinataire n'est
pas une architecture à inventer — la boucle est là, elle envoie simplement le même objet à tout le
monde. Il reste à résoudre le prisme de chaque participant et à appeler
`buildLastMessagePreviewTranslations`, que `core.ts` utilise déjà pour la même donnée.

## Périmètre, et pourquoi il n'a pas été écrit ici

Trois étages, tous gatables :

| Étage | Fichier | Gate |
|---|---|---|
| gateway | `emitConversationPreviewUpdate.ts` + le jumeau `MeeshySocketIOManager.ts:2181` | suite gateway, locale |
| SDK iOS | `ConversationUpdatedStoreEvent`, `applyConversationUpdated`, `ConversationStoreSocketBridge` | `sdk-tests.yml` en CI (précédent : cycle 65) |
| web | `normalizeConversationPatch` / `handleConversationUpdated` | suite web, locale |

**Deux émetteurs, pas un** — la règle des « sources de vérité jumelles » impose de les traiter
ensemble, sinon l'aperçu dépend à nouveau du transport (envoi vs édition).

Écrire ça correctement demande un cycle entier ; le cycle 67 était déjà livré et mergé. Le bâcler
en fin de course aurait produit exactement ce que la leçon 95 condamne : un correctif dont personne
n'a vérifié la moitié. **Instruit ici pour que le cycle 68 commence par écrire des témoins, pas par
enquêter.**

---

# Cycle 67 — Épingler un message rendait la route d'épingles inexploitable

## Contrainte d'environnement (identique aux cycles 61/63/64/65/66, revérifiée)

Même conteneur Linux distant. Aucune chaîne Swift (`swift: command not found`), aucun SDK Android
(`~/Android` absent → pas de `./apps/android/meeshy.sh check`, seul gate de cette lane).
`tasks/lane-cursor.md` dit toujours `lane=ANDROID` et la lane reste matériellement impossible ici :
**le curseur n'a donc PAS été touché.** Lanes gatables : gateway, web, shared.

## Le candidat de backlog a été RE-PROUVÉ, et il a mené ailleurs

Le cycle 66 nommait comme tête « le mensonge de type qui a rendu ce défaut possible » :
`message-types.ts:211` annonce `translations?: readonly MessageTranslation[]` alors que la valeur
qui sort de Prisma est une **carte Mongo** (`Message.translations Json?`). Il ajoutait, prudemment,
« le chantier n'est pas mécanique ».

Le balayage d'ouverture a cherché ce que ce mensonge PRODUIT plutôt que de démêler le type :
tous les sites qui sélectionnent `Message.translations` puis servent le résultat à un client. Sur
les dix routes de messages, huit passent par `transformTranslationsToArray`. **Deux ne le font
pas**, et l'une d'elles ne dégrade pas — elle casse.

## Le défaut, prouvé et non supposé

`GET /conversations/:id/pinned-messages` déclare `data: { type: 'array', items: messageSchema }`,
et `messageSchema.properties.translations` vaut `{ type: 'array' }`
(`packages/shared/types/api-schemas.ts:834`). La route y versait `translations: message.translations`
— la carte Mongo brute.

`fast-json-stringify`, le sérialiseur de Fastify, **ne coerce pas** :

```
MAP   => THREW: The value of '#/properties/data/items/properties/translations'
                does not match schema definition.
NULL  => {"success":true,"data":[{…,"translations":[]}]}
ARRAY => {"success":true,"data":[{…,"translations":[{"targetLanguage":"fr",…}]}]}
```

L'échec de sérialisation remonte en **500 sur la route entière**. Meeshy traduit automatiquement
chaque message : la colonne est peuplée dès que le Prisme a tourné. **Épingler un message traduit
rendait donc la liste d'épingles inaccessible** — pas une dégradation partielle, l'endpoint entier.

## Pourquoi personne ne l'a vu

Les quatre témoins du groupe 9 de `messages-routes.test.ts` posent tous `translations: null` — le
SEUL cas qui ne déclenche pas le défaut. Le fixture de `threads.test.ts` posait `translations: []`,
une forme que Prisma ne rend jamais. Les deux suites décrivaient donc fidèlement un monde où le
défaut n'existe pas.

## Le second défaut, au même endroit — la bannière ne s'était jamais affichée

`apps/web/components/conversations/PinnedMessageBanner.tsx` lisait `data?.messages?.[0]` alors que
l'enveloppe du dépôt est `{ success, data: [...] }` (`sendSuccess`). `data.messages` vaut toujours
`undefined` : **la bannière rendait `null` même sur un 200 parfaitement valide**. Elle est pourtant
montée en production (`ConversationView.tsx:319`) — et les deux suites qui montent
`ConversationView` / `ConversationLayout` la remplacent par `() => null`. Aucun témoin n'avait
jamais exercé son chemin de données.

Les deux défauts se masquaient l'un l'autre : sur un compte sans message épinglé traduit, la route
répondait 200 et la bannière restait vide « parce qu'il n'y a rien à épingler ». Sur un compte avec,
la requête échouait en 500 et React Query gardait la bannière vide pareillement.

## Le troisième — le Prisme

La bannière rendait `pinnedMessage.content` brut : la ligne restait dans la langue de l'expéditeur
pour tout le monde, sur une surface que `CLAUDE.md` couvre nommément (« le prisme s'applique à TOUT
le contenu »). Une fois le premier défaut corrigé, les traductions sont réellement sur le fil ; les
résoudre n'est pas un supplément, c'est la conséquence directe du correctif.

La résolution délègue à `resolveLastMessagePreview` (`@meeshy/shared`) — jumelle de
`MeeshyConversation.resolvedLastMessagePreview` côté iOS — et l'ordre du prisme vient de
`getUserLanguagePreferences`, seul point d'entrée autorisé côté web (il injecte la `deviceLocale`
en 4e priorité, ce qu'un appel direct au shared perdrait).

**Une exclusion a été ajoutée dans le même geste, et elle appartient à ce cycle et pas à un autre :
les traductions CHIFFRÉES sont écartées.** `transformTranslationsToArray` recopie `isEncrypted`, et
c'est ce correctif-ci qui met ces entrées sur le fil de la bannière pour la première fois. Sans
l'exclusion, corriger le Prisme aurait affiché du base64 dans la bannière des conversations
chiffrées — le défaut exact que le cycle 65 venait de fermer sur la ligne de liste iOS. Sans
traduction lisible, `resolveLastMessagePreview` rend l'original, ce que prescrit la règle #1 du
Prisme.

## La copie du même défaut, corrigée dans le même cycle

`routes/conversations/threads.ts` sert le résultat Prisma verbatim, donc la même carte brute. Son
schéma de réponse est `additionalProperties: true` : pas de 500, la carte part telle quelle sur le
fil. `APIMessage.init(from:)` décode `translations` avec `try` et non `try?`
(`MessageModels.swift:521`) — un message de fil serait **indécodable EN ENTIER**, pas seulement
privé de ses traductions. Aucun consommateur client de cette route aujourd'hui (`grep` sur web,
SDK, iOS, Android : rien) ; c'est précisément pourquoi il fallait la corriger maintenant, avant que
le premier appelant hérite du défaut.

## Le témoin qui nomme la cause plutôt que le symptôme

`message-translations-response-contract.test.ts` fait passer les deux formes à travers le VRAI
`messageSchema` compilé par `fast-json-stringify` : la carte jette, la sortie du transformateur se
sérialise. Il ne dépend d'aucune route — il épingle l'invariant que le compilateur ne peut pas
tenir, et il protégera toute route future déclarant `messageSchema`. C'est la réponse la plus utile
au « mensonge de type » du cycle 66 : on ne peut pas le faire disparaître sans démêler deux formes
qui circulent réellement sous le même nom, mais on peut le rendre **détectable**.

## Vérification

- Gateway : `tsc --noEmit` propre après `prisma generate --generator client` + `bun run build` du
  shared (prérequis CI documentés dans `CLAUDE.md`).
- Gateway : **suite complète — 650 suites / 16 366 tests verts.** Base du cycle 66 : 649 / 16 358.
  L'écart est exactement ce que ce cycle ajoute (1 suite, 8 témoins : 3 de contrat, 2 sur
  `pinned-messages`, 3 sur `threads`) — aucune régression, aucun témoin perdu.
- Gateway : RED observé avant implémentation sur les 5 témoins de route. `pinned-messages` rendait
  `{"fr": {…}}` là où le témoin attend le tableau API ; `threads` idem sur le parent ET les
  réponses, plus `null` au lieu de `[]` sur colonne vide.
- Web : `__tests__/components/conversations` — 32 suites / 607 tests verts (dont les 6 neufs).
  RED observé : 4 des 5 premiers témoins échouaient sur un DOM vide (« Unable to find an element »),
  la bannière ne rendant rien du tout.
- Web : `tsc --noEmit` — zéro erreur sur le fichier modifié (le dépôt en porte 1 190 préexistantes).

## Reste ouvert après ce cycle

- **Le mensonge de type lui-même n'est pas résolu**, il est seulement instrumenté. Les deux formes
  circulent toujours sous `Message.translations`. Le démêler demande de nommer la forme de stockage
  (`MessageTranslationJSON`, déjà exportée par le transformateur) dans les types de retour Prisma
  côté gateway — chantier de contrat, à instruire avant d'être écrit.
- **`PinnedMessageBanner` n'affiche qu'UNE épingle** (`limit: 1`) sans compteur ni accès à la liste.
  Signal produit, pas défaut : à trancher avec un humain.
- **Piste voisine INSTRUITE puis ÉCARTÉE — `messageAttachmentSchema` va bien.** Cherché pendant ce
  cycle une seconde source de 500 sur la même route, du côté des pièces jointes. Il n'y en a pas :
  le schéma déclare `translations` en entier (`api-schemas.ts:467`), carte langue → traduction V2.
  Noté ici parce que le mécanisme mérite d'être connu : la sous-entrée porte
  `required: ['type', 'transcription', 'createdAt']`, et `fast-json-stringify` **fait respecter
  `required` en jetant**, exactement comme pour le type de ce cycle. Une entrée à laquelle il
  manquerait l'un des trois ferait donc tomber `GET /conversations/:id/messages` — la liste
  principale. Les deux écrivains les posent tous les trois (`AudioTranslateService.ts:867-880`,
  `AttachmentTranslateService.ts:378/435/484`) : **pas de défaut de code.** Le risque résiduel est
  une ligne Mongo héritée d'avant la forme V2, donc une question de DONNÉES, à instruire par une
  requête et non par une lecture de code.
- **`ConversationPicker.tsx` (admin) rend `lastMessage.content` brut** (cycle 64) — dernier rendu
  d'aperçu web hors Prisme identifié.
- **`emitConversationPreviewUpdate` n'emporte toujours pas le prisme** (cycle 60) — **la question
  de conception est TRANCHÉE et le défaut est PROUVÉ : voir la tête du cycle 68 en haut de ce
  fichier.** Ce n'est pas une lacune de traduction, c'est l'ANCIEN contenu qui reste affiché après
  une édition.
- **`isDuplicate` n'est protégé par aucun témoin au niveau du spread** (cycle 66).
- Les points hérités restent inchangés : `eslint` ne peut pas tourner sur le gateway (pas
  d'`eslint.config.js` depuis ESLint v9) ; les deux scripts de réparation base attendent une
  exécution humaine ; l'arbitrage `delete-for-me` du cycle 12 attend une validation humaine ;
  `getMentionsForMessage` / `getRecentMentionsForUser` n'ont toujours aucun écran.

# Cycle 66 — Le chemin socket avait sa propre copie du sérialiseur de traductions

## Contrainte d'environnement (identique aux cycles 61/63/64/65)

Même conteneur Linux distant. Ni macOS ni Xcode : aucun Swift compilable ici (`swift: command not
found`). `tasks/lane-cursor.md` dit toujours `lane=ANDROID`, et la lane Android reste
matériellement impossible (`dl.google.com` refusé au CONNECT → pas de `sdkmanager`, donc pas de
`./apps/android/meeshy.sh check`). **`tasks/lane-cursor.md` n'a donc PAS été touché.**

Ce cycle a pris la tête de backlog nommée **explicitement par le cycle 65** — sur la lane gatable
ici, gateway.

## Reprise du cycle 65 avant toute chose

La PR #2789 (cycle 65) était restée **ouverte** : la session précédente s'est terminée pendant
l'attente de son gate `sdk-tests` (~50 min de build Swift sur macOS). Motif déjà documenté dans
`tasks/android-parity-ios-debt-agent-prompt.md` — travail complet, finalisation en suspens. Reprise
et menée au merge avant d'ouvrir ce cycle, conformément au protocole.

## Le défaut

`MessageHandler._parseTranslations` portait une **seconde copie** du sérialiseur de traductions,
divergente de la seule référence : `transformTranslationsToArray`, qu'utilise le chemin REST/ZMQ
(`MeeshySocketIOManager._broadcastNewMessage`, `:1990`, et `broadcastMessageEdited`, `:2334`).

Là où la référence produit `id` / `messageId` / `translatedContent`, cette copie répandait l'entrée
Mongo telle quelle :

```ts
Object.entries(translations).map(([lang, data]) => ({ targetLanguage: lang, ...data }))
```

Il en sortait `text`, jamais `translatedContent`, et **ni `id` ni `messageId`**. Les trois sont NON
optionnels dans `APITextTranslation` (`packages/MeeshySDK/.../MessageModels.swift:300-308`), et
`APIMessage.init(from:)` décode le tableau avec `try` et non `try?` (`:521`) : une seule entrée mal
formée fait échouer le décodage du `message:new` **ENTIER**. Le message n'apparaîtrait pas du tout
en temps réel sur iOS — il ne lui manquerait pas seulement ses traductions — alors que le même
message rechargé par `GET /messages` s'affiche normalement.

## La portée a été TRACÉE, pas supposée — et elle nuance le défaut

Le cycle 65 annonçait ce point comme « latent aujourd'hui, non théorique ». Vérifié
exhaustivement avant d'écrire une ligne, la formule exacte est plus précise, et plus intéressante :

**Latent, à UNE garde près.**

Les deux seuls appelants de production de `broadcastNewMessage` (`MessageHandler.ts:355` et `:580`)
reçoivent un résultat `include` de Prisma dont `translations` vaut `null` sur une création fraîche
(`MessageProcessor.saveMessage` `:393-478` ne pose jamais la clé `translations` dans `messageData`).
La carte peuplée n'atteint donc PAS le sérialiseur aujourd'hui.

Mais les deux objets du système qui portent une carte Mongo **peuplée** existent bien, et passent à
une ligne de là :

| Objet | Origine | Ce qui l'écarte |
|---|---|---|
| doublon séquentiel | `MessagingService.ts:137-183`, `findFirst` + `include` après que le traducteur a tourné | `isDuplicate = true` (`:170`) |
| doublon concurrent P2002 | `MessageProcessor.ts:481-553`, idem | `isDuplicate = true` (`:547`) |

Les deux gardes sont la même ligne, dupliquée : `!(response.data as {isDuplicate?}).isDuplicate`
(`MessageHandler.ts:352` et `:577`). Le drapeau ne survit que parce que **deux `spread`** le
transportent (`MessageProcessor.ts:616`, `MessagingService.ts:490`). Remplacer l'un des deux par une
liste de champs explicite, ou sérialiser la réponse quelque part, suffirait à rendre le défaut
vivant — sans que rien ne le signale, puisque le symptôme est un message **absent**, pas une erreur.

**Rayon d'action : une ligne.** C'est ce qui justifie de fermer la divergence en supprimant la
copie, plutôt que de s'en remettre à la garde.

## Ce que le traçage a AUSSI écarté

Quatre hypothèses de reachability, toutes testées et toutes fausses — notées pour qu'un cycle futur
ne les repose pas :

- **Le transfert ne recopie pas la carte.** `messageData` (`MessageProcessor.ts:393-418`) n'a pas de
  clé `translations` ; un message transféré part de `null` et est retraduit. Seul
  `MessageAttachment.translations` est recopié (`:697`) — autre colonne, autre modèle.
- **Aucun chemin ZMQ ne re-broadcaste par ici.** La complétion de traduction écrit en base
  (`MessageTranslationService.ts:728`) puis émet `MESSAGE_TRANSLATION` (`MeeshySocketIOManager.ts:1504`),
  jamais un `message:new`.
- **L'édition n'y passe pas non plus.** `handleMessageEdit` émet `MESSAGE_EDITED` avec un
  `translations: []` en dur (`MessageHandler.ts:871`) ; son jumeau manager utilise le bon
  transformateur (`:2334`).
- **`MeeshySocketIOManager` ne délègue PAS à `MessageHandler.broadcastNewMessage`.** Le commentaire
  `MessageHandler.ts:1547` (« qui délègue ici ») induit en erreur : la délégation réelle ne porte que
  sur `autoDeliverToOnlineRecipients`.

## Correctif

`_parseTranslations` délègue à `transformTranslationsToArray` — **la seconde copie disparaît**,
conformément au principe de source unique de vérité. Elle prend `messageId` en premier argument (les
`id`/`messageId` synthétiques en dépendent), fourni par les deux sites de `_getMessageTranslations`.

Deux invariants conservés délibérément :

- **Un tableau déjà au format API passe intact.** C'est ce que promet le type partagé
  `Message.translations` (`message-types.ts:211`, `readonly MessageTranslation[]`) ; le
  re-transformer produirait `targetLanguage: "0"`, les clés d'un tableau étant ses index.
- **Les entrées inexploitables de la carte sont ÉCARTÉES** (valeur nulle, primitive, `text` non
  textuel — une colonne `Json` n'a pas de schéma pour l'interdire). Les émettre mutilées recréerait
  exactement le défaut corrigé. Les filtrer ICI plutôt que de laisser `transformTranslationsToArray`
  déréférencer `null` garde en plus les traductions VALIDES de la même carte : un `throw` remonterait
  au `.catch(() => [])` de l'appelant (`MessageHandler.ts:1107`) et les perdrait **toutes**.

## Tests

**5 témoins neufs** (`MessageHandler.test.ts`), RED observé avant implémentation — le fil sortait
bien `{ createdAt, targetLanguage: 'es', text: 'Hola', translationModel: 'premium' }`, sans `id`,
`messageId` ni `translatedContent`. Ils verrouillent **la forme du fil, pas l'implémentation** : ils
passent avec n'importe quel sérialiseur respectant le contrat REST. Couvrent la carte portée par le
message, la carte relue en base, `isEncrypted` explicite à `false`, le tableau déjà transformé laissé
intact, et les formes vides.

**Deux témoins préexistants réécrits** (`MessageHandler.core.test.ts`) : ils verrouillaient la forme
brute — ils *pinnaient donc précisément le défaut*, et c'est ce qui l'a laissé vivre aussi longtemps.
Un test de couverture qui assert le comportement observé plutôt que le contrat voulu transforme un
bug en spécification. Réécrits sur le contrat réel : l'un sur la forme API, l'autre sur le fait
qu'une entrée inexploitable est écartée **sans emporter les entrées valides qui l'accompagnent**.

**Vérification** : suite gateway complète — **649 suites / 16 358 tests verts**, couverture globale
95,11 % instructions / 95,78 % lignes. `tsc --noEmit` propre. Sweep ciblé
`MessageHandler|translation-transformer|MeeshySocketIOManager` : 11 suites / 846 tests verts.

## Reste ouvert après ce cycle

- **Le mensonge de type qui a rendu ce défaut possible.** `message-types.ts:211` déclare
  `translations?: readonly MessageTranslation[]` — un tableau au format API — alors que la valeur
  runtime venue de Prisma est une **carte Mongo**. C'est pourquoi une copie artisanale du
  sérialiseur a pu vivre des années sans que le compilateur objecte, et pourquoi la branche
  `Array.isArray` reste nécessaire. **Tête du prochain cycle si rien de plus grave n'apparaît** —
  mais le chantier n'est pas mécanique : les deux formes circulent réellement sous ce nom, et les
  démêler touche les deux transports.
- **`isDuplicate` n'est protégé par aucun témoin de non-régression au niveau du spread.** Les deux
  gardes tiennent parce que deux `spread` transportent le drapeau ; rien ne le verrouille. Un test
  qui prouve que `createSuccessResponse` préserve `isDuplicate` fermerait le dernier fil de ce cycle.
- Les points hérités des cycles précédents restent inchangés (voir cycles 64 et 26 pour la liste
  complète) : `eslint` ne peut toujours pas tourner sur le gateway (pas d'`eslint.config.js` depuis
  ESLint v9) ; les deux scripts de réparation base attendent une exécution humaine ; l'arbitrage
  `delete-for-me` du cycle 12 attend une validation humaine ; `getMentionsForMessage` /
  `getRecentMentionsForUser` n'ont toujours aucun écran.

# Cycle 65 — L'aperçu de liste servi par socket pouvait afficher un cryptogramme

## Contrainte d'environnement (identique aux cycles 61/63/64, revérifiée)

Même conteneur Linux distant. `tasks/lane-cursor.md` dit toujours `lane=ANDROID` et la lane
Android reste matériellement impossible ici (`dl.google.com` refusé au CONNECT → pas de
`sdkmanager`, donc pas de `./apps/android/meeshy.sh check`, le seul gate de cette lane). Aucune
chaîne Swift non plus (`swift`/`swiftc` absents). **`tasks/lane-cursor.md` n'a donc PAS été
touché.**

Ce cycle prend la tête de backlog nommée explicitement par le cycle 64, et il la prend **parce
qu'elle est gatable ici** : `sdk-tests.yml` se déclenche sur `pull_request` vers `main` pour
`packages/MeeshySDK/**`. Le correctif est donc vérifié par la CI même sans Xcode local.

## La question que le cycle 64 laissait ouverte, tranchée

Le cycle 64 refusait d'écrire le correctif avant d'avoir établi la forme réelle du payload
`message:new`, parce que deux lectures semblaient s'exclure : `buildLastMessagePreviewTranslations`
(REST) lit `data.text`, `previewTranslations` (socket) lit `$0.translatedContent`.

**Les deux sont vraies, et ce n'est pas une contradiction — ce sont deux objets différents.**

| Étage | Forme | Champ texte |
|---|---|---|
| Colonne Mongo `Message.translations` | carte `{ "fr": { text, isEncrypted, … } }` | `text` |
| Fil `message:new` (REST/ZMQ) | tableau, via `transformTranslationsToArray` | `translatedContent` |

`transformTranslationsToArray` (`services/gateway/src/utils/translation-transformer.ts:56`) mappe
`text` → `translatedContent` **et recopie `isEncrypted`**. Le helper REST lit la colonne brute, le
SDK lit le fil. Aucun mappage de clés manquant.

## Le défaut

**`APITextTranslation` ne décode pas `isEncrypted`** (`MessageModels.swift:300`). Le drapeau est
sur le fil depuis toujours ; le client ne le lit pas. `previewTranslations` posait donc
`translatedContent` dans `lastMessageTranslations` **sans jamais regarder s'il s'agissait de texte
ou d'un cryptogramme**, là où le helper REST l'exclut nommément (son exclusion #3 : « son `text`
est un cryptogramme ; le poser dans un aperçu afficherait du base64 dans la liste ; la clé de
déchiffrement ne transite pas par ce chemin »).

Conséquence : une conversation chiffrée dont le dernier message arrive **par socket** affiche du
base64 dans la ligne de liste, quand la MÊME conversation rechargée par `GET /conversations`
affiche correctement l'original. **Le texte de la ligne dépendait du transport qui l'avait
apportée** — exactement ce que la règle « sources de vérité jumelles » du Prisme interdit.

## Les trois écarts mineurs, corrigés dans le même geste

Le cycle 64 les avait listés sous condition (« à traiter dans le même geste s'ils survivent à
l'enquête »). Ils survivent, et ce sont les trois autres exclusions du helper REST :

1. **Hors prisme du lecteur** — la carte socket portait les N langues de la conversation ; le
   résolveur n'en affiche qu'UNE. Le reste n'alourdit que le cache de la liste.
2. **Langue d'origine** — elle EST déjà `lastMessagePreview` ; la republier double l'octet.
3. **Plafond d'aperçu** — le REST tronque chaque traduction à 300 points de code, pas le socket.
   Non corrigé, le poids d'une ligne aurait dépendu de la langue du lecteur — même famille que le
   second défaut du cycle 64.

Une quatrième exclusion (texte vide ou blanc) est reprise par symétrie.

**L'exclusion #2 n'était sûre qu'après vérification, et elle a été vérifiée.** Retirer la clé de la
langue d'origine serait une régression du cycle 62 (« la langue d'origine concourt à son RANG »)
si la facette socket ne transportait pas `lastMessageOriginalLanguage` : le lecteur dont la langue
primaire EST la langue d'origine sauterait son rang 1 et se verrait servir une traduction de rang
inférieur. `LastMessageFacet.init(message:preview:…)` pose bien `originalLanguage:
message.originalLanguage` (`LastMessageFacet.swift:99`) et `applyLastMessage` l'écrit sur la ligne
(`:138`). Un témoin épingle ce point précis dans les deux ordres de prisme.

## Le correctif

- `APITextTranslation` gagne `isEncrypted: Bool?` — optionnel, donc un payload qui l'omet ne
  suppose PAS le chiffrement et ne casse aucun décodage existant.
- `previewTranslations(from:)` devient `previewTranslations(from:viewerLanguages:)` et applique
  les quatre exclusions + le plafond, dans l'ordre du prisme.
- `ConversationSyncEngine.currentPreferredLanguages()` lit
  `MeeshyUser.preferredContentLanguages` — seule autorité iOS sur l'ordre du prisme, jamais
  réimplémentée localement. Vide sans session : la carte vaut `nil` et la ligne rend l'original,
  comportement identique au chemin REST pour un participant anonyme.

Le rang « dernière entrée gagne » du `uniquingKeysWith` d'origine est conservé (`last(where:)`)
pour un payload qui répéterait une langue.

## Vérification

14 témoins neufs dans `ConversationSocketPrismeTests` — un par exclusion, plus les invariants
conservés (clés minuscules, `nil` jamais `[:]`, absence de traductions, doublon de langue) et le
témoin de non-régression du rang de la langue d'origine dans les deux ordres.

**Swift non exécuté localement** : aucune chaîne Swift sur ce conteneur (`swift: command not
found`). C'est `sdk-tests.yml` qui gate — déclenché automatiquement par cette PR, puisqu'elle ne
touche que `packages/MeeshySDK/**`.

Aucun changement gateway ni web : le correctif est au bon étage. Un client ne doit jamais rendre un
cryptogramme, quelle que soit la générosité du serveur.

## Reste ouvert après ce cycle

- **`MessageHandler._parseTranslations` produit une forme de traduction INDÉCODABLE par iOS — tête
  du prochain cycle.** Trouvé en établissant la forme du fil, et c'est le seul point de cette
  enquête qui reste ouvert. Le chemin WS `message:send`
  (`services/gateway/src/socketio/handlers/MessageHandler.ts:1732`) **répand l'entrée Mongo telle
  quelle** (`{ targetLanguage, ...data }`) au lieu de passer par
  `transformTranslationsToArray` comme le fait le chemin REST/ZMQ
  (`MeeshySocketIOManager._broadcastNewMessage:1990`). Il en sort
  `{ targetLanguage, text, translationModel, … }` — sans `id`, sans `messageId`, sans
  `translatedContent`, tous NON optionnels dans `APITextTranslation`. Or
  `APIMessage.init(from:)` décode ce tableau avec `try` et non `try?`
  (`MessageModels.swift:521`) : **le message:new ENTIER échouerait à décoder**, pas seulement ses
  traductions. Le message n'apparaîtrait pas du tout en temps réel sur iOS.

  **Latent aujourd'hui, non théorique** : sur ce chemin le message vient d'être créé, donc
  `_getMessageTranslations` rend `[]` (colonne `null`, et le repli DB rend `null` aussi). La forme
  fautive n'est jamais peuplée — pour l'instant. Le jour où un message part par WS avec des
  traductions déjà en base (transfert qui recopierait la carte, re-broadcast, dédup qui
  re-broadcasterait), le tableau se remplit et le défaut devient un message invisible.
  **Correctif attendu : appeler `transformTranslationsToArray(message.id, …)` sur les deux
  chemins** — gatable ici (gateway), petit, et il supprime la deuxième copie du transformateur.
  Vérifier au passage qu'aucun client web ne lit `text` sur ce chemin (`grep` n'a rien trouvé).
- **`emitConversationPreviewUpdate` n'emporte toujours pas le prisme** (cycle 60). Question de
  conception — payload PAR DESTINATAIRE — non tranchée.
- **`ConversationPicker.tsx` (admin) rend `lastMessage.content` brut** (cycle 64) — dernier rendu
  web d'aperçu non prismé connu.
- **`normalizeConversation` reste un constructeur manuel de `Conversation` sans aucun appelant**
  (cycle 62) : trancher s'il vit ou meurt.
- **Un participant ANONYME n'a pas de prisme** — vrai sur les deux chemins désormais, donc
  cohérent, mais toujours non résolu sur le fond (cycle 60).
- **Aucune traduction rétroactive de l'aperçu** (cycle 60, inchangé).
- Hérités et non traités : `DELETE /sessions/:sessionId` ne coupe aucune socket (pont client
  `sessionToken` au handshake) ; l'auth REST ne vérifie pas `UserSession.isValid` ; la suppression
  de compte ne révoque aucune session ; `auth:session-revoked` n'est écouté ni par iOS ni par
  Android ; `MaintenanceService.cleanupOrphanedAttachments` reste inerte ; les ~12 copies inline de
  `unsetOrNull` ; `TrackingLink.messageId` est une colonne morte ; l'arbitrage `delete-for-me` du
  cycle 12 attend une validation humaine ; `eslint` ne peut pas tourner sur le gateway (aucun
  `eslint.config.js` depuis ESLint v9) ; `tsc` ne passe pas sur le web (1 190 erreurs
  préexistantes, non gatées par la CI).

---

# Cycle 64 — La recherche de conversations était la dernière ligne hors Prisme

## Contrainte d'environnement (identique aux cycles 61/63, revérifiée)

Même conteneur Linux distant. `tasks/lane-cursor.md` dit toujours `lane=ANDROID` et la lane
Android reste **matériellement impossible** ici (`dl.google.com` refusé au CONNECT → pas de
`sdkmanager`, donc pas de `./apps/android/meeshy.sh check`, le seul gate de cette lane). Ni macOS
ni Xcode pour compiler du Swift. **`tasks/lane-cursor.md` n'a donc PAS été touché.**

Ce cycle a pris la tête de backlog nommée par le cycle 62, sur la lane gatable ici — gateway. Il
emporte AUSSI un correctif iOS, délibérément : voir §« Pourquoi du Swift dans un cycle sans Xcode ».

## Le défaut

**`GET /conversations/search` était la dernière route qui servait une ligne de conversation sans
Prisme.** Le cycle 62 l'avait nommée « tête du prochain cycle » et annonçait un correctif
« mécanique ». Il l'était — et le diagnostic tenait, vérifié point par point avant d'écrire une
ligne :

| Fait annoncé par le cycle 62 | Vérifié |
|---|---|
| `conversationMinimalSchema` DÉCLARE déjà les deux champs | oui (`api-schemas.ts:1294-1305`) |
| la route construit son `lastMessage` à la main et ne les remplit jamais | oui (`search.ts:201`) |
| même `include` Prisma, même helper, même `viewerLanguages` que `core.ts` | oui |

Le point qui donne sa gravité au défaut : **la donnée était déjà payée**. Le `messages` de cette
route utilise `include` (et non `select`), donc Prisma rapporte TOUS les scalaires du message —
`translations` (colonne `Json?`) et `originalLanguage` compris. Le mapping manuel les jetait sans
que rien ne le signale. Même famille que `metadata.location` avant le Lot 3, et le fichier
documentait déjà cette leçon à trois lignes de l'endroit exact où elle se répétait.

Conséquence utilisateur : un lecteur francophone qui cherche une conversation lit « Hello » dans le
résultat, puis « Bonjour » sur la même conversation dans sa liste. Le serveur avait la traduction
dans les deux cas.

## Un second défaut, trouvé en le corrigeant

`core.ts` tronque son aperçu (`truncateMessagePreview`, plafond 300 points de code) ; `search.ts`
servait `msg.content` **brut**. Tant que la ligne n'avait pas de prisme, c'était une simple
divergence de poids entre deux routes. Le correctif la rendait incohérente **à l'intérieur d'une
même réponse** : `buildLastMessagePreviewTranslations` plafonne chaque aperçu traduit, donc un
lecteur servi en français aurait reçu 300 caractères et un lecteur servi dans la langue d'origine
le blob entier. Le poids de la ligne aurait dépendu de la langue du lecteur. Corrigé dans le même
geste — ce n'est pas un élargissement de périmètre, c'est la conséquence directe du premier
correctif.

## Pourquoi du Swift dans un cycle sans Xcode

La leçon du cycle 62 est qu'un champ posé sur le fil ne sert à rien tant que le client ne le lit
pas — « quatre couches à câbler, pas une ». Vérifié ici avant de conclure quoi que ce soit :

- **Web** : rien à faire. `searchConversations` (`crud.service.ts:159`) passe déjà ses résultats
  par `transformConversationData`, que le cycle 62 a appris à propager les deux champs. Et
  `SearchPageContent.tsx` ne rend aucun aperçu de dernier message (seulement `lastMessageAt`).
- **iOS** : la chaîne s'arrêtait à un pas de l'arrivée. `APIConversation.toConversation` propage
  bien les deux champs (`ConversationModels.swift:382-398`), mais `GlobalSearchViewModel` posait
  `lastMessagePreview: conv.lastMessagePreview` — l'aperçu BRUT — sur ses **deux** chemins (cache
  local et réseau), là où `ThemedConversationRow` résout via
  `resolvedLastMessagePreview(preferredLanguages:)`. La ligne de résultat de recherche EST une
  ligne de conversation ; elle affichait un autre texte que la liste pour la même conversation.

Le correctif Swift est un remplacement d'appel, pas une conception : `resolvedLastMessagePreview`
ne rend `nil` que si `lastMessagePreview` l'est déjà (relu ligne par ligne, `CoreModels.swift:234`),
donc c'est un substitut exact. `MeeshyUser.preferredContentLanguages` fournit le prisme ordonné —
seule autorité iOS sur cet ordre, jamais réimplémentée localement.

**Ce Swift n'est pas gaté par la CI de PR** : `ios-tests.yml` ne tourne automatiquement que sur les
push vers `dev` (décision du 2026-07-27, file d'attente macOS saturée), et `sdk-tests.yml` ne se
déclenche que sur `packages/MeeshySDK/**`. Le gate a donc été demandé explicitement par
`workflow_dispatch` sur la branche — voir §Vérification. Livrer le gateway seul aurait laissé la
moitié client du cycle 62 se reproduire à l'identique une route plus loin.

## Vérification

**Rouge observé avant correctif** : 7 des 8 témoins gateway neufs rouges. Le 8e
(« ne fait jamais fuiter le blob `translations` brut dans `lastMessage` ») passait déjà — c'est un
garde-fou assumé, pas un témoin de défaut : il interdit qu'une future réécriture remplace le
mapping manuel par un spread et renvoie le cryptogramme complet à chaque ligne de résultat.

**Sondes de fidélité** — chaque défaut réintroduit, restauration par copie :

| Défaut réintroduit | Témoins qui tombent |
|---|---|
| les deux champs ne sont jamais posés (le défaut d'origine) | 6 |
| carte non restreinte au prisme (toutes les langues servies) | 3 |
| aperçu original non tronqué (le second défaut) | 1 |
| `deviceLocale` ignorée (prisme amputé de son 4e rang) | 1 |

**Un témoin voisin est tombé, et c'est un fait à retenir** :
`conversations-search-routes.test.ts` doublait `@meeshy/shared/utils/conversation-helpers` avec un
mock qui n'exposait QUE `generateDefaultConversationTitle`. Ajouter un import à la route rendait
`resolveUserLanguagesOrdered` `undefined` → 500 sur 4 témoins. Réparé comme
`conversation-core.test.ts` le fait déjà : `...jest.requireActual(...)` puis surcharge du seul
double voulu. Un mock d'objet-module qui énumère ses exports est un couplage caché à la liste des
imports de la cible.

**Gate gateway** : **649 suites / 16 353 tests**, 0 échec, couverture lignes **95,78 %** —
strictement identique au relevé du cycle 62, donc inchangée. `routes/conversations/search.ts` :
100 % lignes / 100 % fonctions, 95,23 % branches (la seule branche non couverte, ligne 246, est le
`?? ''` de `senderPresenceVis.get` — préexistante, hors correctif). `tsc --noEmit` gateway :
0 erreur.

**Swift** : non exécuté localement (aucune chaîne Swift sur ce conteneur). 3 témoins ajoutés à
`GlobalSearchViewModelTests` — langue primaire servie, refus de retomber sur une langue tierce
(règle #1), langue d'origine au rang 2 qui ne rétrograde pas la primaire (règle #3, cycle 62).

## Reste ouvert après ce cycle

- **`ConversationPicker.tsx` (admin) rend `lastMessage.content` brut** — trouvé en auditant les
  consommateurs web de `searchConversations`. Surface d'outillage admin, faible valeur, et le
  fichier traîne une dette de typage voisine (`(conv as unknown).lastMessage`). Non pris pour ne
  pas mélanger deux sujets ; c'est le dernier rendu web d'aperçu non prismé connu.
- **`ConversationSyncEngine.previewTranslations` (iOS, chemin socket) — audité ce cycle, et c'est
  la TÊTE DU PROCHAIN CYCLE.** Le point hérité du cycle 62 demandait de le vérifier contre la règle
  de rang. Sur ce plan il est sain : le résolveur ne consulte que les langues du prisme, donc des
  clés supplémentaires ne changent pas le texte affiché. Mais l'audit en trouve un autre, plus
  grave, et **gatable ici** (`sdk-tests.yml` se déclenche sur `pull_request` pour
  `packages/MeeshySDK/**`) :

  `buildLastMessagePreviewTranslations` (REST) écarte explicitement les traductions **chiffrées**
  — son exclusion #3, « son `text` est un cryptogramme ; le poser dans un aperçu afficherait du
  base64 dans la liste ». `previewTranslations` (socket) **n'a pas cette exclusion**, et ne peut
  pas l'avoir : `APITextTranslation` (`MessageModels.swift:300`) **ne décode pas `isEncrypted`**.
  Or `MessageHandler._parseTranslations` (`:1732`) **répand l'entrée stockée telle quelle**
  (`...data`) dans le payload `message:new` — le drapeau est donc bien SUR LE FIL, seul le client
  ne le lit pas. Une traduction chiffrée arrivée par socket peut ainsi atterrir dans
  `lastMessageTranslations` et faire rendre un cryptogramme par `resolvedLastMessagePreview` dans
  la ligne de liste, là où le même message servi par REST est correctement filtré.

  **Question à trancher AVANT d'écrire le correctif** (non résolue par cet audit, ne pas la
  supposer) : la forme exacte de l'entrée sur le fil. `buildLastMessagePreviewTranslations` lit
  `data.text`, alors que `previewTranslations` lit `$0.translatedContent` — et
  `APITextTranslation.translatedContent` est un `String` NON optionnel, donc un décodage de tout
  l'`APIMessage` échouerait si la clé manquait. Les deux lectures ne peuvent pas être vraies du
  même objet sans un mappage de clés quelque part. **Commencer par établir la forme réelle du
  payload `message:new`** (relire `translation-transformer.ts` et les `CodingKeys` d'
  `APITextTranslation`), puis décider si le correctif est côté client (décoder `isEncrypted` et
  filtrer, jumeau de l'exclusion #3) ou côté gateway (ne jamais mettre de traduction chiffrée sur
  le fil d'un aperçu).

  Trois écarts mineurs constatés au passage, à traiter dans le même geste s'ils survivent à
  l'enquête ci-dessus : la carte socket n'est **pas restreinte au prisme du lecteur** (le REST
  l'est), **pas tronquée** (le REST plafonne à 300), et **n'exclut pas la langue d'origine**. Aucun
  des trois ne change le texte affiché — le résolveur les absorbe — mais tous les trois alourdissent
  le cache de la liste d'autant de langues que la conversation en compte.
- **`emitConversationPreviewUpdate` n'emporte toujours pas le prisme** (cycle 60). Question de
  conception — payload PAR DESTINATAIRE — non tranchée.
- **`normalizeConversation` reste un constructeur manuel de `Conversation` sans aucun appelant**
  (cycle 62) : trancher s'il vit ou meurt.
- **Un participant ANONYME n'a pas de prisme sur ce chemin** — vrai ici aussi :
  `authContext.registeredUser` est `undefined` pour lui, donc `viewerLanguages` est vide et
  `lastMessageTranslations` vaut `null`. Comportement identique à `GET /conversations`, donc
  cohérent, mais toujours non résolu sur le fond (cycle 60, inchangé).
- **Aucune traduction rétroactive de l'aperçu** (cycle 60, inchangé).
- Hérités et non traités : `DELETE /sessions/:sessionId` ne coupe aucune socket (pont client
  `sessionToken` au handshake) ; l'auth REST ne vérifie pas `UserSession.isValid` ; la suppression
  de compte ne révoque aucune session ; `auth:session-revoked` n'est écouté ni par iOS ni par
  Android ; `MaintenanceService.cleanupOrphanedAttachments` reste inerte ; les ~12 copies inline de
  `unsetOrNull` ; `TrackingLink.messageId` est une colonne morte ; l'arbitrage `delete-for-me` du
  cycle 12 attend une validation humaine ; `eslint` ne peut pas tourner sur le gateway (aucun
  `eslint.config.js` depuis ESLint v9) ; `tsc` ne passe pas sur le web (1 190 erreurs
  préexistantes, non gatées par la CI).

---

# Cycle 63 — « Toutes les sessions ont été déconnectées » était faux

> **Collision de numérotation, résolue à la main — même patron que celle du relevé ci-dessous.**
> Ce relevé a été écrit sous le numéro 62 avant que `main` ne porte déjà un cycle 62 (« La langue
> d'origine rétrogradait la langue primaire du lecteur »). Ce ne sont PAS deux versions d'une même
> question : l'autre traite le Prisme de la ligne de liste, celle-ci la révocation de session. Le
> relevé arrivé sur `main` le premier garde le 62 ; celui-ci prend le 63. **Les deux sont
> conservés intégralement — rien n'a été fusionné ni écrasé.**

## Contrainte d'environnement (identique au cycle 61, revérifiée)

Même conteneur Linux distant. `tasks/lane-cursor.md` dit toujours `lane=ANDROID` et la lane
Android reste **matériellement impossible** ici : `curl https://dl.google.com/...` rend un code
`000` (CONNECT refusé par la politique réseau), donc pas de `sdkmanager`, pas de
`platforms;android-35`, pas de `./apps/android/meeshy.sh check` — le seul gate de cette lane. Ni
macOS ni Xcode pour la lane IOS_DETTE. **`tasks/lane-cursor.md` n'a donc PAS été touché** : la lane
Android reprend telle quelle au prochain run sur une machine capable de la construire.

Ce cycle a travaillé la seule lane gatable ici — gateway + web — sur une capacité qui est autant du
temps réel que de la sécurité.

## Le défaut

**`auth:session-revoked` n'avait aucun émetteur.** L'événement est déclaré dans
`packages/shared/types/socketio-events.ts:539` avec une énumération `reason`
(`password_changed | logout_all_devices | admin_revoke`) écrite exactement pour les appelants
ci-dessous, et le web l'écoute depuis qu'il existe (`connection.service.ts:225`). La moitié serveur
n'a simplement jamais été écrite : `grep -rn "AUTH_SESSION_REVOKED\|auth:session-revoked"
services/gateway/src` rendait **zéro**.

Or **une socket ne s'authentifie qu'une fois, à la connexion, et n'est plus jamais revérifiée**
(`AuthHandler._authenticateJWTUser`). Invalider `UserSession` en base ne ferme donc rien du tout :
l'appareil révoqué continue de recevoir `message:new`, `conversation:updated`, `reaction:added` et
tout le reste, indéfiniment.

Deux chemins de révocation TOTALE étaient concernés, et ce sont précisément les deux chemins de
reprise de compte — ceux qu'on emprunte quand on pense être compromis :

1. **`GET /auth/revoke-all-sessions`** — le lien « ce n'était pas moi » envoyé par email sur une
   connexion suspecte. Il affichait *« All sessions disconnected — N session(s) have been
   revoked »* alors qu'aucune n'avait été déconnectée.
2. **`POST /auth/reset-password`** — `PasswordResetService.completePasswordReset` invalide
   **toutes** les sessions dans la transaction qui écrit le nouveau hash de mot de passe
   (`PasswordResetService.ts:418`). L'intrus qui tenait une socket ouverte continuait de lire les
   conversations de sa victime après la réinitialisation.

**Et la chaîne web s'arrêtait elle aussi à mi-parcours.** `SocketIOOrchestrator.onSessionRevoked`
traduit l'événement serveur en `meeshy:session-revoked` sur `window` — un événement DOM plutôt
qu'un appel direct, pour éviter un import circulaire entre la couche socket et le store d'auth. **Rien
ne l'écoutait** (`grep -rn "meeshy:session-revoked" apps/web` ne rendait que l'émetteur). L'onglet
journalisait un avertissement, lançait l'événement dans le vide et restait « connecté », jeton en
localStorage.

## Le correctif

**Un point d'appel unique**, `socketio/disconnectRevokedSessions.ts` : émet
`auth:session-revoked` sur chaque socket de `ROOMS.user(userId)`, puis `disconnect(true)`.

- **L'émission n'est pas le contrôle, la déconnexion l'est.** `disconnect(true)` ferme la connexion
  sous-jacente, pas seulement le namespace ; un client modifié ignorerait l'event. L'event précède
  la fermeture pour qu'un client conforme purge sa session locale — même ordre que
  `AuthHandler` pour `auth:token-expired`.
- **Best-effort, ne lève jamais.** La révocation est déjà commise quand l'éventail part : une
  socket morte ou un adaptateur indisponible ne doit pas transformer une réinitialisation réussie
  en 500. Isolation par socket : un appareil déjà parti n'épargne pas les autres.
- Côté web, `components/common/SessionRevocationHandler.tsx` monté une fois au layout racine
  termine la chaîne : il écoute `meeshy:session-revoked` et appelle `useAuthStore.logout()` — le
  seul chemin de déconnexion du store, pas une seconde copie.
- `completePasswordReset` rend désormais `userId` en cas de succès **et uniquement là** : la route
  est la seule couche qui puisse couper les sockets, et elle ne peut pas le faire si on ne lui dit
  pas de qui il s'agit. Il ne quitte jamais le serveur — un témoin le vérifie (`never leaks the
  reset user id to the caller`).

## Portée : ce qui N'A PAS été branché, et pourquoi

`DELETE /sessions/:sessionId` et `DELETE /sessions` (« déconnecter mes autres appareils »)
**n'appellent pas** cet éventail, délibérément. Ces deux-là **épargnent une session**, et rien ne
permet aujourd'hui de savoir laquelle : une socket enregistrée s'authentifie avec le seul JWT
(`extractJWTToken`), alors que `UserSession.sessionToken` stocke le hash d'un **autre** jeton,
opaque et longue durée (`generateSessionToken()`), qu'aucun client ne transmet au handshake — le
web n'envoie que `auth: { token }` (`connection.service.ts:107`).

Deux fausses pistes écartées, plutôt que livrées à moitié :

- **Adresser tout `ROOMS.user(userId)` quand même** : déconnecterait l'appareil depuis lequel
  l'utilisateur fait justement le ménage.
- **Hacher le JWT à l'authentification de la socket pour reconnaître l'appelant** : un client qui
  rafraîchit son JWT par REST sans reconnecter sa socket porterait un hash périmé, et se
  déconnecterait lui-même. Le pont manquant est côté client (transmettre le `sessionToken` au
  handshake), donc multi-plateforme — hors d'atteinte d'un cycle gatable ici.

## Vérification

- `disconnectRevokedSessions` : 6 témoins neufs, écrits AVANT l'implémentation, RED observé
  (`Cannot find module '../disconnectRevokedSessions'`). Couvrent l'ordre émettre-puis-fermer, la
  charge utile, l'isolation par socket, l'échec de `fetchSockets`, et le no-op sans `io` / sans
  `userId` (aucun `io.in('user:')` ne doit partir).
- Routes : 3 témoins sur `revoke-all-sessions`, 3 sur `reset-password`, RED observé sur les deux
  (`rooms` vide au lieu de `['user:usr-123']`). Ils vérifient aussi que la révocation se confirme
  quand aucun Socket.IO n'est câblé et quand l'éventail échoue.
- `PasswordResetService` : 1 témoin sur le `userId` rendu, RED observé.
- Web : 4 témoins sur `SessionRevocationHandler`, RED observé (module absent). Couvrent le
  désabonnement au démontage — un remontage ne doit pas déconnecter deux fois.

## Reste ouvert après ce cycle

- **`DELETE /sessions/:sessionId` et `DELETE /sessions` ne coupent toujours aucune socket.** Le
  chantier est le pont client : transmettre le `sessionToken` au handshake (web, iOS, Android) pour
  qu'une socket sache de quelle `UserSession` elle relève. Tant qu'il n'existe pas, révoquer un
  appareil depuis la liste des sessions le laisse en ligne jusqu'à expiration de son JWT.
- **L'auth REST ne vérifie pas `UserSession.isValid`** : un JWT non expiré reste accepté après
  révocation (`middleware/auth.ts` ne consulte la table que sur le chemin JWT-expiré-plus-session-
  de-confiance). C'est un arbitrage assumé du JWT sans état, mais il mérite d'être nommé : la
  révocation ne mord sur REST qu'à l'expiration du jeton. Le fermer coûterait une lecture par
  requête — **décision de conception, à instruire séparément.**
- **La suppression de compte ne révoque aucune session** (`routes/me/delete-account.ts` bascule
  `isActive`/`deletedAt` sans toucher `UserSession`) et ne coupe aucune socket. Le cycle de vie y
  est différent (période de grâce, annulation possible) : brancher l'éventail y demande d'abord de
  trancher ce que devient la socket d'un compte en attente de suppression.
- **`auth:session-revoked` n'est écouté ni par iOS ni par Android.** `grep -rn
  "auth:session-revoked" packages/MeeshySDK apps/ios apps/android` rend zéro. Le serveur ferme
  désormais leur socket — ce qui est le contrôle — mais leur session locale n'est pas purgée : ils
  se reconnecteront avec un JWT encore valide. Lot mobile, non gatable ici.
- **L'éventail est attendu (`await`) avant la réponse HTTP.** Voulu : le client ne doit pas
  s'entendre dire « c'est fait » avant que les sockets soient fermées. `fetchSockets()` est borné
  par le `requestsTimeout` de l'adaptateur, donc sans risque de blocage indéfini — mais c'est une
  hypothèse sur l'adaptateur, à revoir si un jour on en change.
- **Audit croisé des émetteurs par room personnelle : rien à corriger.** Le point porté depuis le
  cycle 44 (« `emitConversationPreviewUpdate` et les autres émetteurs par room personnelle n'ont pas
  été audités contre la même clé ») a été instruit par `grep -rn "ROOMS.user("` sur tout le
  gateway. `emitConversationPreviewUpdate` passe par `participantUserRooms`. Les trois sites qui
  n'adressent que `.userId` sont justes et documentés : `callEndedFanout` (exception écrite dans le
  fichier), `conversations/core.ts:1056` (DM, donc deux comptes), `MessageReadStatusService:1080`
  (préférence stockée, inexistante sans compte). **Point retiré du backlog.**
- Les points hérités des cycles précédents restent ouverts tels quels (compilation locale des 20
  suites rouges, `timeout-minutes` du job `quality`, borne de la passe soft-delete,
  `softDeleteRetentionMs` mort, `createStoryCommentNotificationsBatch` à `visibility` optionnel,
  arbitrage `delete-for-me` du cycle 12, `eslint` gateway sans config v9).

---

# Cycle 62 — La langue d'origine rétrogradait la langue primaire du lecteur

> **Collision de numérotation, résolue à la main.** Deux sessions ont tourné en parallèle depuis le
> cycle 60 et ont toutes deux nommé leur travail « cycle 61 ». Ce ne sont PAS deux versions d'une
> même question — l'autre traite l'absence d'auditeur mobile sur `link:message:new`, celle-ci le
> Prisme de la ligne de liste. Aucune des deux n'est un addendum de l'autre (le suffixe `b` des
> cycles 25b/32b/36b/38b désigne deux sessions sur la MÊME question). L'autre étant arrivée sur
> `main` la première, elle garde le 61 ; ce relevé prend le 62. Rien n'a été fusionné ni écrasé.

Le cycle 60 laissait un candidat nommé en tête : « le web rend toujours `lastMessage.content`
brut ; il manque le résolveur côté web, jumeau de `resolvedLastMessagePreview`. **Candidat direct
pour le prochain cycle.** »

Ce cycle l'a pris — et le backlog **sous-estimait** le défaut sur deux axes.

## Ce que le backlog annonçait, et ce qui était vrai

Il n'y avait pas « un résolveur manquant ». La donnée n'arrivait même pas jusqu'à un endroit où un
résolveur aurait pu la lire. Balayage de `lastMessageTranslations|lastMessageOriginalLanguage` sur
tout le dépôt, avant correctif :

| Site | État |
|---|---|
| `gateway/routes/conversations/core.ts` | **écrit** les deux champs (cycle 60) |
| `shared/types/api-schemas.ts` | **déclare** les deux champs (cycle 60) |
| `MeeshySDK/.../CoreModels.swift` | **lit** via `resolvedLastMessagePreview` |
| `shared/types/conversation.ts` (`Conversation`) | **aucun champ** |
| `web/services/conversations/transformers.service.ts` | objet à la main → **jette** |
| `web/.../conversation-item/message-formatting.tsx` | `return lastMessage.content` **brut** |

**Zéro occurrence des deux noms sous `apps/web/`.** Quatre couches à câbler, pas une.

## Le vrai défaut, trouvé en écrivant le jumeau

Le jumeau TypeScript a d'abord été écrit en miroir strict d'iOS. Ses témoins passaient. C'est le
témoin de CÂBLAGE de la ligne de liste qui a refusé de verdir : prisme `['fr', 'en']` (jsdom pose
`navigator.language = 'en-US'`, donc `'en'` entre en 4e priorité), message anglais, traduction
française disponible → rendu « Hello everyone ».

Ce n'était pas un défaut de câblage. C'était **la règle**, et elle était fausse des deux côtés.

iOS court-circuitait dès que la langue d'origine appartenait **quelque part** au prisme :

```swift
if let original = lastMessageOriginalLanguage?.lowercased(),
   preferred.contains(original) {
    return lastMessagePreview   // ← rétrograde la langue PRIMAIRE
}
```

Cette formulation par **appartenance** est correcte tant que le prisme n'a qu'une entrée, ou que la
langue d'origine en est la tête. Dès qu'elle occupe un rang inférieur, elle bat la langue primaire
du lecteur — et c'est exactement ce que produit mécaniquement la locale appareil, entrée en 4e
priorité depuis 2026-05-26. La population touchée est précisément celle pour qui cette feature
existe : les comptes dont la locale de l'appareil diffère de la langue de l'app.

`CLAUDE.md` tranche noir sur blanc, et depuis le début :

> « Un utilisateur francophone avec un iPhone en anglais voit **toujours** ses messages en français
> (priorité 1) ; la locale anglaise n'intervient que si aucune traduction française n'est
> disponible ET qu'une traduction anglaise existe. »

Et le chemin du **corps** des messages appliquait déjà la bonne règle : `use-message-translations`
compare `originalLanguage` à `preferredLanguage` — la **seule langue de tête**, pas la liste. La
ligne de liste était la dernière surface à en diverger, et elle divergeait sur les deux clients.

## Le correctif

Le prisme est parcouru **par rang** ; la langue d'origine y concourt à sa place :

```
pour chaque langue L du prisme, dans l'ordre :
  L est la langue d'origine   ⇒ l'aperçu brut (le message EST en L)
  une traduction existe en L  ⇒ cette traduction
aucune ⇒ l'aperçu brut
```

Se réduit au comportement du corps des messages quand on ne regarde que le rang 1, et lui ajoute la
descente que celui-ci n'a pas. Règle #3 inchangée : jamais de repli sur `translations.first`.

Appliqué aux **deux** plateformes — `resolveLastMessagePreview` (`@meeshy/shared`, neuf) et
`MeeshyConversation.resolvedLastMessagePreview` (iOS, corrigé). Aucun témoin iOS existant
n'encodait le défaut (les deux témoins « langue d'origine » utilisent un prisme à une entrée, donc
survivent tels quels) ; 4 témoins de rang ont été ajoutés côté Swift, jumeaux des témoins TS.

## Livré

- [x] T1/T2 — `resolveLastMessagePreview` dans `packages/shared/utils/conversation-helpers.ts`,
      20 témoins (17 de miroir iOS + 3 de rang/locale appareil)
- [x] T3 — `Conversation.lastMessageTranslations` / `.lastMessageOriginalLanguage`
- [x] T4/T5 — `transformConversationData` propage les deux champs (`extractPreviewTranslations`
      rejette non-objet, tableau, valeurs non-chaînes, et ne matérialise jamais `{}`)
- [x] T6/T7 — `formatLastMessage(lastMessage, prism?)` applique le prisme au TEXTE seul
- [x] T8 — `ConversationItem` câble `getUserLanguagePreferences(currentUser)` (le seul point
      d'entrée web autorisé — il injecte la `deviceLocale` en 4e priorité, ce qu'un appel direct au
      shared perdrait, cf. `apps/web/CLAUDE.md`)
- [x] T9 — correctif de RÈGLE sur shared + iOS, `CLAUDE.md` § « Règles critiques du Prisme » gagne
      la règle 3
- [x] T10 — changeset, ce relevé, leçon 93

## Vérification

**Rouge observé avant correctif** : 17/17 témoins shared rouges (fonction absente) ; 2 témoins
transformer rouges ; 1 témoin `formatLastMessage` rouge ; 2 témoins de câblage `ConversationItem`
rouges.

**Sondes de fidélité** — chaque défaut réintroduit, restauration par copie :

| Défaut réintroduit | Témoins qui tombent |
|---|---|
| court-circuit par APPARTENANCE (le défaut de règle de ce cycle) | **2 shared + 2 web** |
| repli sur `translations.first` (violation règle #3) | 2 shared |
| le transformer rejette les deux champs (le défaut d'origine) | **2** |
| `formatLastMessage` rend le contenu brut | 3 |
| la ligne ne passe aucune langue de lecteur | 2 |
| la ligne ne passe QUE `systemLanguage` (ordre du prisme ignoré) | **1** |

Deux lignes apprennent quelque chose. La **première** : le défaut de règle n'est visible côté web
QUE parce que jsdom injecte `navigator.language` — c'est-à-dire que le témoin de câblage reproduit
la condition réelle (locale appareil ≠ langue in-app) au lieu de la neutraliser. Un test qui aurait
figé `navigator.language` pour « isoler » n'aurait rien vu.

La **troisième** : seuls 2 témoins voient le transformer amputé, et aucun n'est un témoin de
composant — les témoins de `ConversationItem` construisent leur `Conversation` directement et ne
peuvent donc pas savoir si la couche de transformation a laissé passer la donnée. Même famille de
trou que la leçon 105 : ces 2 témoins sont le SEUL garde-fou de cette couche.

**Gate** : `@meeshy/shared` **50 fichiers / 1 484 tests**, 0 échec. Web **515 suites / 11 745
tests** (21 skipped), 0 échec. Gateway **648 suites / 16 332 tests**, 0 échec, couverture lignes
**95,78 %** (mesuré sur l'état MERGÉ, qui inclut le cycle 61 de l'autre session). `tsc --noEmit` gateway : 0 erreur. `tsc --noEmit` web : **1 190 erreurs avant comme
après** — condition préexistante non gatée par la CI, zéro erreur introduite (mesuré par
`git stash`, avant/après identiques au unité près). Swift : **non exécuté localement** — aucune
chaîne Swift sur ce conteneur Linux ; les 4 témoins `ConversationPrismeRankOrderTests` sont validés
par `sdk-tests.yml` en CI.

Le gateway n'était pas censé bouger (ce cycle n'y touche pas) mais il consomme
`conversation-helpers.ts` : la suite complète a été passée pour prouver que l'ajout de
`resolveLastMessagePreview` et des deux champs optionnels sur `Conversation` ne déplace rien chez
son plus gros consommateur.

## Reste ouvert après ce cycle

- **`ConversationSyncEngine.previewTranslations` (iOS, chemin socket) n'a pas été audité contre la
  règle de rang.** Il dérive la même carte d'un `message:new` ; c'est `resolvedLastMessagePreview`
  qui la consomme, donc le correctif de règle le couvre. Mais la carte elle-même pourrait porter
  des langues hors prisme, là où le chemin REST les filtre côté gateway — à vérifier.
- **`routes/conversations/search.ts` reste hors prisme** (hérité du cycle 60, non pris). Le
  `conversationMinimalSchema` DÉCLARE pourtant déjà les deux champs : la route construit son
  `lastMessage` à la main et ne les remplit jamais. Le correctif est mécanique — même `include`
  Prisma, même `buildLastMessagePreviewTranslations`, même `viewerLanguages`. **Tête du prochain
  cycle** : c'est la dernière route qui sert une ligne de conversation sans prisme.
- **`emitConversationPreviewUpdate` n'emporte toujours pas le prisme** (cycle 60). Question de
  conception — payload PAR DESTINATAIRE — non tranchée.
- **`normalizeConversation` (`packages/shared/types/migration-utils.ts`) est un deuxième
  constructeur manuel de `Conversation` qui jette les deux champs — et il n'a AUCUN appelant.**
  Balayage `\bnormalizeConversation\b` sur tout le dépôt (hors `node_modules`/`dist`) : une seule
  occurrence, sa propre déclaration. Il n'a donc pas été câblé — corriger un constructeur mort
  aurait été du geste pour du geste (leçon 92). Le vrai reste est de trancher s'il vit ou meurt ;
  tant qu'il vit, il divergera un peu plus à chaque champ ajouté.
- **Un participant ANONYME n'a pas de prisme sur ce chemin** (cycle 60, inchangé).
- **Aucune traduction rétroactive de l'aperçu** (cycle 60, inchangé).
- Hérités et non traités : `MaintenanceService.cleanupOrphanedAttachments` reste inerte,
  délibérément ; les ~12 copies inline de l'idiome `unsetOrNull` ; `TrackingLink.messageId` est
  une colonne morte (3 écrivains, 0 lecteur) ; l'arbitrage `delete-for-me` du cycle 12 attend une
  validation humaine ; `eslint` ne peut pas tourner sur le gateway (aucun `eslint.config.js`
  depuis ESLint v9) ; `tsc` ne passe pas sur le web (1 190 erreurs préexistantes, non gatées).

---

---
---

# Cycle 61 — Un message de lien de partage n'arrivait sur aucun mobile

## Contrainte d'environnement (à lire avant de juger le choix de lane)

Ce run a démarré sur un conteneur Linux distant, pas sur la machine habituelle de la routine.
`tasks/lane-cursor.md` disait `lane=ANDROID`, mais la lane Android y est **matériellement
impossible** : `dl.google.com` est refusé par la politique réseau du conteneur (403 au CONNECT,
confirmé sur la recette d'amorçage de `ROUTINE.md` §Environment recipe **et** sur un `curl` nu),
donc pas de `sdkmanager`, pas de `platforms;android-35`, pas de `./apps/android/meeshy.sh check`
— le seul gate de cette lane. `maven.google.com` et `repo1.maven.org` répondent, mais les
plateformes/build-tools ne s'y trouvent pas. La lane IOS_DETTE est hors d'atteinte pour la raison
symétrique (ni macOS ni Xcode).

**`tasks/lane-cursor.md` n'a donc PAS été touché** : la lane Android reprend telle quelle au
prochain run sur une machine capable de la construire. Ce cycle a travaillé la seule lane
gatable ici — le temps réel côté gateway, qui est le cœur de la mission du prompt planifié — avec
son propre gate complet (jest gateway + tsc + vitest shared).

## Le défaut

`link:message:new` n'a jamais eu qu'un seul auditeur : le web. iOS
(`MeeshySDK/Sockets/MessageSocketManager.swift:2658`) et Android
(`sdk-core/socket/MessageSocketManager.kt:101`) n'enregistrent qu'un listener de création,
`message:new` — `grep -rn "link:message:new" packages/MeeshySDK apps/ios apps/android` rend zéro.

Or l'envoi par lien est le **seul** transport d'envoi dont dispose un participant anonyme. Un
invité qui écrivait dans une conversation partagée n'apparaissait donc chez aucun membre mobile de
cette conversation, **y compris les membres inscrits** : ni en direct (`broadcastLinkMessage` →
room `conversation:<id>`), ni au reconnect (`_drainPendingMessages`, qui rejouait le même event
unique). Le message ne surgissait qu'au prochain refetch complet, que rien ne déclenchait.

Deux diffuseurs, deux décisions d'event prises séparément : c'est là que la divergence est née.
Et le contrat de la file (`packages/shared/types/delivery-queue.ts`) portait un argument juste mais
trop large — « `message:new` envoie l'objet, `link:message:new` l'enveloppe `{ message }` », donc
ne rien rejouer sous `message:new`. L'argument ne vaut que pour l'**enveloppe**, pas pour le
message déballé.

## Le correctif

Un seul point d'appel public, `socketio/linkMessageEmissions.ts`, partagé par les deux diffuseurs,
qui met les **deux** events sur le fil, chacun dans sa forme : `link:message:new` avec son
enveloppe, `message:new` avec le message déballé. Garde de forme incluse (pas de `message:new` si
l'enveloppe ne porte pas d'objet — absent, `null`, chaîne, **tableau**).

Additif, jamais substitutif. Les deux copies portent le même `id` et les deux gestionnaires web
dédupent dessus, donc le second arrivé est un no-op quel que soit l'ordre ; la pastille de non-lus
vient de la valeur absolue de `conversation:unread-updated`, rien à double-compter.

**Un test existant a changé de verdict, délibérément et documenté** : `routes link-message entries
to LINK_MESSAGE_NEW, not MESSAGE_NEW` affirmait sa clause pour un motif correct (l'enveloppe n'est
pas routable sous `message:new`) que le correctif **préserve** en déballant. La clause « jamais
`message:new` » est remplacée par une assertion plus forte (les deux events, chacun avec sa forme)
plus un nouveau témoin qui garde l'ancien comportement pour une entrée sans enveloppe. Aucune
assertion relâchée.

## Trois pistes du backlog rouvertes et CLASSÉES SANS SUITE — preuve à l'appui

Le prompt de routine exige de re-prouver avant de corriger. Trois notes portées depuis des cycles
antérieurs se sont révélées périmées ; aucune n'a donné lieu à du code, et c'est le résultat :

1. **« `emitConversationPreviewUpdate` et les autres émetteurs par room personnelle n'ont pas été
   audités contre la clé `userId ?? id` »** (laissée ouverte par le cycle précédent, à instruire
   par une recherche sur `ROOMS.user(`). Recherche faite, tous les sites lus :
   `emitConversationPreviewUpdate` passe par `participantUserRooms` (ligne 96),
   `emitUnreadCountsToRecipients`, `MessageHandler:1345`, `MeeshySocketIOManager:2179` et
   `callEndedFanout` aussi. Les émetteurs restants (mentions, demandes d'ami, notifications,
   `emitWithSeq`) sont user-scoped par nature — un participant sans compte n'a ni notification ni
   demande d'ami. **Audit clos, rien à corriger.**
2. **« Les mentions du chemin de lien attendent l'extraction qui écrit `Message.validatedMentions` »**
   — les deux routes de lien appellent `resolveMessageMentions` depuis un cycle antérieur
   (`routes/links/messages.ts:318` et `:609`). Seule la **note** de `messageNotificationFanOut`
   en était restée à l'ancien état ; elle aurait envoyé un futur lecteur réparer un trou bouché.
   Corrigée dans ce cycle.
3. **Les participants anonymes exclus de l'éventail d'appel** (`CallEventsHandler`, requête filtrée
   `userId: { not: null }`) ressemblaient au même défaut de clé de room. **C'est intentionnel** :
   `denyAnonymous` (Audit P1-20 / CVE-004) refuse aux anonymes d'initier comme de rejoindre un
   appel, en parité avec les routes REST `allowAnonymous: false`. Ne pas « réparer ».

## Gates

`services/gateway` : `bun run test:coverage` → **647 suites / 16 309 tests verts**, exit 0.
`npx tsc --noEmit` → 0 erreur. `packages/shared` : vitest → 49 fichiers / 1 462 tests verts.
Couverture des fichiers touchés : `linkMessageEmissions.ts` **100/100/100/100** (neuf),
`broadcastLinkMessage.ts` **100/100/100/100** (déjà à 100 % de branches avant — la nouvelle branche
« aucun serveur Socket.IO monté » a reçu son propre témoin plutôt que de laisser le chiffre
glisser), `MeeshySocketIOManager.ts` inchangé à 88.01/90.65/81.64/92.68.

**Piège d'environnement à retenir** : `bun install` échoue sur le postinstall de `grpc-tools`
(binaire précompilé refusé par le proxy) et laisse `node_modules` à moitié peuplé sans le dire —
`bun install --frozen-lockfile --ignore-scripts` passe. Et `npx prisma generate --generator client`
DOIT être re-vérifié (`ls packages/shared/prisma/client`) : un premier appel silencieusement sans
effet a fait échouer 21 suites sur un `TS2347` dans `PostReactionService` qui n'avait rien à voir
avec le diff.

## Suivi laissé ouvert

- **Consolider vers un seul event de création.** `link:message:new` n'existe que par accident
  d'histoire ; `handleNewMessage` côté web est d'ailleurs meilleur que le handler dédié (il
  réconcilie la bulle optimiste de l'auteur, ce que `handleLinkMessageNew` ne fait pas). Retirer
  l'event dédié est un incrément à part, avec sa propre vérification web.
- **Effet de bord bénin observé, non traité** : `handleNewMessage` déclenche un
  `GET /conversations/:id` quand la conversation n'est pas dans le cache de liste — un invité
  anonyme sur la page de lien peut donc l'émettre. Gardé et attrapé, et la route autorise les
  contextes anonymes (`canAccessConversation`), donc il a de bonnes chances d'aboutir et
  d'enrichir le cache. À mesurer avant d'y toucher.
- **`emitWithSeq` n'a qu'UN call site** (`NOTIFICATION_NEW`). La détection de gap exacte du
  SyncEngine ne couvre donc qu'un event sur tous ceux qui partent en room personnelle ; l'étendre
  demande le fan-out per-user A2.2, chantier à part.
- Lane ANDROID intacte, à reprendre sur une machine avec SDK Android (cf. §Contrainte
  d'environnement).

# Cycle 60 — L'aperçu de la liste ne parlait la langue de personne

Le backlog du cycle 59 laissait un candidat nommé en tête : `updateTrackingLinksMessageId`
(chemin de PARTAGE) « écrase sans aucune garde », et maintenant que le cycle 59 a rendu le binder
du chemin d'ENVOI réellement écrivant, « les deux se disputent la colonne pour de bon ».

**Ce cycle ne l'a pas pris, et l'écarte du backlog.** La dispute est réelle et sans conséquence :
un balayage de `TrackingLink.messageId` sur tout le dépôt — gateway, web, `packages/shared`, SDK
iOS — ne rend **aucun lecteur**. Trois chemins écrivent la colonne, zéro ne la lit. Le
`messageRemovalEffects.ts` qui documente le défaut explique lui-même pourquoi il ne s'y fie pas
(un `TrackingLink` est PARTAGÉ par URL, la colonne ne désigne pas de propriétaire) et dérive la
propriété du contenu des messages vivants. Ajouter une garde à un écrivain que personne ne lit,
c'est 20 lignes pour zéro défaut observable. Le vrai reste : la colonne est morte, et c'est ça
qu'un cycle futur devrait trancher — la remplir correctement OU la retirer.

La question posée à la place : **quel contenu le client sait afficher mais ne reçoit jamais ?**

## Le défaut

Le principe fondateur du produit dit : « le prisme s'applique à TOUT le contenu — messages texte,
transcriptions audio, métadonnées, **previews** ». La ligne de la liste de conversations était la
seule surface où il ne s'appliquait pas.

Pas faute de client. Le SDK iOS porte depuis longtemps :

- `MeeshyConversation.resolvedLastMessagePreview(preferredLanguages:)` — la résolution du Prisme
  ligne par ligne, avec la règle #3 (« ne jamais retomber sur `translations.first` ») ;
- ses **douze** témoins (`ConversationPrismeResolutionTests.swift`) ;
- `LastMessageFacet.translations` / `.originalLanguage`, membres d'une facette conçue pour que les
  onze champs `lastMessage*` s'écrivent en bloc.

Rien de tout cela ne recevait de données par le chemin REST. Le `select` du dernier message dans
`GET /conversations` ne chargeait **ni `Message.translations` ni `Message.originalLanguage`**, et
`APIConversationLastMessage` n'avait aucun champ où les décoder. La documentation du champ SDK
l'écrivait elle-même :

> *« When the gateway starts shipping these in `/conversations` it will be wired through the
> API → domain converter; until then the field stays `nil` and the list falls back to the raw
> `lastMessagePreview`. »*

Elle renvoyait à un contournement applicatif, `ConversationListViewModel.attachLastMessageTranslations`,
qui **n'existe nulle part dans le dépôt** — la seule occurrence de ce nom est la phrase qui le cite.

Le chemin socket, lui, est bien câblé : `ConversationSyncEngine.previewTranslations(from:)` dérive
la carte du `message:new` reçu. Il ne comble rien pour autant — les traductions arrivent **après**
le message, par `message:translation`, si bien que l'`APIMessage` du `message:new` les porte
rarement.

**Conséquence** : à chaque démarrage à froid et à chaque rafraîchissement de liste, toutes les
lignes affichent le dernier message dans la langue de son expéditeur. Un francophone voyait
« Hey, are you free tonight? » sur une conversation que le serveur avait pourtant traduite, et dont
il lirait la version française une fois la conversation ouverte.

## Le correctif

`GET /conversations` porte désormais, au niveau conversation, `lastMessageOriginalLanguage` et
`lastMessageTranslations` — une carte `{ langue: aperçu }`.

Elle n'est pas le contenu brut de la colonne. Quatre exclusions
(`routes/conversations/utils/last-message-preview.ts`), chacune fermant un cas distinct :

| Exclusion | Ce qu'elle évite |
|---|---|
| hors prisme du LECTEUR | envoyer les N langues de la conversation pour un champ dont le client lit UNE valeur |
| langue d'origine | elle EST déjà `lastMessage.content` |
| traduction **chiffrée** (`isEncrypted`) | son `text` est un cryptogramme — du base64 dans la liste |
| `text` non exploitable | la colonne est un JSON libre côté Mongo |

Le prisme du lecteur est résolu **une fois par page** par `resolveUserLanguagesOrdered` (seule
autorité du dépôt sur l'ordre `systemLanguage → regionalLanguage → customDestinationLanguage →
deviceLocale`), depuis l'utilisateur déjà chargé et mis en cache par le middleware d'auth :
**aucune requête supplémentaire** sur ce hot path. Et `Message.translations` est une colonne JSON
du **même document** — pas une relation — donc le `select` élargi ne coûte ni jointure ni requête.

Rendu `null` et jamais `{}` quand il ne reste rien : le client doit pouvoir retomber sur
l'original, ce qui EST la règle #3.

Deux détails qui ne sont pas des détails :

- **`truncateMessagePreview` et son plafond déménagent** dans le module du nouveau constructeur.
  La troncature de l'aperçu a maintenant un propriétaire unique, et une traduction de 5 000
  caractères ne peut plus contourner un plafond posé pour le seul `content`.
- **Le spread `...msg` est déstructuré.** Sans ça, `translations` (blob complet, une entrée par
  langue, avec modèle, score et champs de chiffrement) partait dans chaque ligne de liste.

Côté SDK, le câblage que la doc annonçait : `APIConversation` décode les deux clés,
`toConversation` les pose sur le domaine en minuscules — même convention que le chemin socket,
sans quoi la résolution dépendrait du chemin par lequel la ligne est arrivée.

---

# Journal de transcription d'appel — displayName (heure) + tag langue + transport WebRTC/serveur

## Objectif
Chaque segment de transcription à la volée doit transiter avec les métadonnées de
journalisation (`id` stable, `speakerDisplayName`, `capturedAtMs` horloge murale,
`language` de transcription) et s'afficher des deux côtés sous forme journalisée
`displayName (heure): message` avec badge de langue. Transport : data channel WebRTC
`"transcription"` quand il est ouvert (P2P instantané), relais serveur systématique en
fallback et pour la traduction (pipeline ZMQ existant). Fusion par `id` côté récepteur.
Prépare l'étape suivante : traduction live + resynthèse TTS (les champs `language`,
`text`/`translatedText` séparés alimentent ce futur pipeline sans retravail du modèle).

## Plan
- [x] Explorer l'existant (iOS, web, gateway, shared) — 2 agents
- [x] `packages/shared` : étendre `CallTranscriptionSegmentEvent`/`CallTranslatedSegmentEvent`
      (`id`, `speakerDisplayName`, `capturedAtMs`), nouveau `CallTranscriptEntryPayload` +
      message data channel `transcript-entry`, util `formatCallTranscriptLine` (+ tests vitest)
- [x] `services/gateway` (TDD jest/bun) : schéma zod (id/capturedAtMs optionnels),
      estampillage serveur de `speakerDisplayName` (via getCallSession, anti-usurpation,
      même principe que speakerId), passthrough id/capturedAtMs dans les 6 branches
      d'émission (factorisées)
- [x] `apps/web` : hook journal `useCallTranscriptJournal` (fusion par id, ordre capturedAt),
      panneau `CallTranscriptPanel` (`displayName (HH:MM): message` + badge langue),
      réception data channel (`ondatachannel`) dans webrtc-service, toggle UI
- [x] `packages/MeeshySDK` : payloads socket enrichis (émission + décodage)
- [x] `apps/ios` : envoi data channel (P2PWebRTCClient/WebRTCService), décodage
      `DataChannelInbound.transcriptEntry`, émission enrichie (id/capturedAtMs),
      fusion par id dans CallTranscriptionService, rendu `displayName (heure)` + badge
      langue dans CallView, persistance `language` dans CallTranscriptSegment
- [x] Docs : spec `docs/superpowers/specs/2026-08-13-call-transcript-journal-design.md`
- [x] Tests : shared (vitest), gateway (bun jest), build shared ; iOS non exécutable ici
      (Linux) — tests écrits, à valider par `./apps/ios/meeshy.sh test` sur macOS
- [x] Commit + push sur `claude/transcription-metadata-language-d6bawp`

## Itération 2 (exigences produit reçues en cours de chantier)
- [x] Réception liée au panneau : caché ⇒ désabonnement réception + émission
      (gardes isShowingOverlay iOS, option `active` du hook web)
- [x] Journal conservé panneau fermé, revisitable à la réouverture ; purge
      uniquement dans resetForCallEnd
- [x] Stream de corrections : partiels transmis en P2P (data channel seul),
      wireId d'énoncé partagé, remplacement en place, final = dernière valeur
      dite, fusion à trois régimes (miroir shared ↔ iOS)
- [x] Panneau en réception seule sur échec moteur local, fermable au tap
      suivant ; retrait de l'auto-révélation (caduque)

## Revue
- shared : 1523 tests vitest verts (53 fichiers), build tsc OK
- gateway : 534 tests verts sur les 28 suites CallEventsHandler + schémas ;
  tsc --noEmit propre
- web : 113 tests verts (13 suites video-calls + hooks) ; les nouveaux
  fichiers sont sans erreur tsc (les ~1760 erreurs --noEmit du package web
  sont un existant hors périmètre)
- iOS : tests écrits/mis à jour (service, manager, décodage data channel,
  SDK) — à exécuter sur macOS via ./apps/ios/meeshy.sh test (non exécutable
  dans cet environnement Linux)

## Itération 3 (signal de présence + règle donnée sensible)
- [x] `call:transcription-active` : signal estampillé gateway (silent-drop,
      émetteur exclu) quand un participant active/ferme sa transcription
- [x] Badge d'invitation sur l'icône sous-titres : iOS (dot statique,
      remoteTranscriptionActive, reset teardown) + web
      (useRemoteTranscriptionActive, Set par speaker, dot pulsant, aria-label)
- [x] Émission du signal : iOS au start/stop effectif du moteur ; web à
      l'ouverture/fermeture du panneau (transitions réelles uniquement)
- [x] Historique depuis l'activation uniquement : garanti par l'absence de
      replay réseau (gateway relaie sans stocker) + abonnement lié au panneau
- [x] Règle donnée sensible gravée dans la spec : replay UNIQUEMENT depuis la
      sauvegarde locale (GRDB chiffré iOS ; rien au repos côté web), aucun
      texte de transcription dans les logs (audité)
