# Cycle 128 — le geste qui persistait sans rien annoncer

Audit de synchronisation temps réel. Point de départ : le cycle 127, qui a posé
la règle « une garde d'admission se pose sur CHAQUE chemin, pas sur le plus
fréquenté ». Ce cycle applique la même question à une autre famille — non plus
les gardes d'une notification, mais les DIFFUSIONS d'un état par utilisateur.

## 1. Le défaut

`POST /user-preferences/communities/reorder` — le glisser-déposer d'une
communauté — persiste `orderInCategory` et **n'émet rien**.

Son jumeau conversation, `reorderConversationPreferences`, diffuse
`USER_PREFERENCES_REORDERED` sur la room personnelle depuis toujours, et son
module écrivain unique porte la raison en tête de fichier :

> The row is per-USER, not per-device, so every write owes three things that
> only work as a set: persist the change; bump `version`; broadcast the
> resulting snapshot to `user:{id}` so the user's other devices converge.

`UserCommunityPreferences` est par utilisateur au même titre. Un
réordonnancement fait sur l'iPhone n'atteignait donc jamais l'onglet web ouvert,
qui tient sa liste en `staleTime: Infinity` avec le socket pour source primaire :
l'ordre divergeait jusqu'à un rechargement complet de la page.

## 2. Ce qui l'a tenu hors de vue

Deux choses, et la seconde est la plus intéressante.

**Un lot avait fermé cette classe de défaut, et n'avait pas énuméré ce site.**
`community-preferences-broadcast.test.ts` (lot F71) le dit dans son en-tête :

> PUT/DELETE on community preferences didn't emit anything, so a second
> tab/device for the same user never learned that a community was
> pinned/muted/archived/hidden.

Le lot a énuméré les verbes qui **changent une préférence**. Le
réordonnancement n'en est pas un dans la langue de cet inventaire : c'est un
geste d'ORDRE. Il écrit pourtant la même ligne, dans le même fichier, avec le
même coût.

**Et le handler fautif CITE son jumeau** — dix lignes de commentaire, pour lui
emprunter son filtre d'appartenance :

```ts
// L'`upsert` corrige cela et EXIGE en retour le filtre d'appartenance —
// c'est la raison que porte le jumeau conversation
// (`reorderConversationPreferences`) …
```

La jumelle a donc été OUVERTE, LUE, et à moitié reprise. Ce n'est pas une
inattention : la question posée en l'ouvrant était « comment borner cet
upsert ? », et la réponse trouvée y répondait exactement. La diffusion, elle,
ne répondait à aucune question qu'on se posait ce jour-là.

> **Reprendre le correctif d'une jumelle ne se fait pas en cherchant la réponse
> à sa propre question dans son code.** Le corollaire du cycle 85 disait déjà
> « on le prend en entier » ; ce cycle mesure le mécanisme par lequel on ne le
> fait pas. La question juste n'est pas *« que fait la jumelle pour mon
> problème ? »* mais **« que fait la jumelle, tout court, après cette
> écriture ? »** — et elle se répond en lisant sa suite ligne à ligne, pas en
> cherchant un mot-clé.

## 3. La décision de contrat, et pourquoi elle a été mesurée avant d'être prise

La forme naturelle était d'élargir `UserPreferencesReorderedEventData` en y
admettant `communityId` : même geste, même charge, un discriminant de plus —
c'est exactement ce que fait `USER_PREFERENCES_UPDATED`, qui porte trois scopes
sur un seul nom.

Relevé des décodeurs AVANT d'écrire quoi que ce soit :

| décodeur de `USER_PREFERENCES_REORDERED` | face à un item `{communityId, orderInCategory}` |
|---|---|
| iOS — `UserPreferencesReorderedSocketEvent.Update.conversationId: String`, **non optionnel** | le décodage de l'ÉVÉNEMENT ENTIER échoue ; les réordonnancements de conversation qui voyagent dans le même lot partent avec |
| web — `applyRemoteReorder` → `preferencesMap.has(update.conversationId)` | filtré en silence |
| Android | aucun consommateur |

L'élargissement casse donc le cas NOMINAL pour en servir un neuf, et il le casse
par le mécanisme le plus discret qui soit : un `catch` de décodage côté client.
C'est la forme du cycle 92 bis (`ParticipantRoleUpdatedEvent`, `role` contre
`newRole`, `MissingFieldException` avalée par un `runCatching`).

**Un nom neuf — `user:preferences-community-reordered` — est INERTE pour les
deux consommateurs existants par construction.** Le précédent
`USER_PREFERENCES_UPDATED` ne le contredit pas : il a été conçu multi-scope, avec
des décodeurs qui discriminent. Un événement le devient rétroactivement au prix
d'un décodeur strict quelque part.

> La règle du cycle 105 (« avant de changer la forme d'un événement DIFFUSÉ,
> relever ses consommateurs sur les trois clients ») a une suite qu'il faut
> écrire : **le relevé ne sert pas seulement à mettre les clients à jour, il
> sert à décider s'il faut changer la forme du tout.** Un décodeur strict rend
> l'élargissement plus cher que le nom neuf, et c'est une mesure, pas un goût.

## 4. Le correctif

- `packages/shared/types/socketio-events.ts` —
  `USER_PREFERENCES_COMMUNITY_REORDERED`, son type de charge (dont le
  doc-comment porte le tableau ci-dessus), et son entrée dans
  `ServerToClientEvents` : la porte d'émission typée en dérive, donc l'émetteur
  est vérifié sans qu'aucune signature ne soit réécrite.
- `routes/community-preferences.ts` — `applicable` (dédup + filtre
  d'appartenance) est calculé AVANT les écritures, puis diffusé tel quel.
  **La charge nomme ce qui a été ÉCRIT, jamais ce qui a été DEMANDÉ** : sans ce
  bornage, la diffusion enverrait les autres appareils appliquer un ordre que la
  base ne porte pas, et confirmerait au passage l'existence d'une communauté que
  l'appelant n'a pas le droit de nommer. Rien d'écrit ⇒ rien d'émis.
- web — le seau d'écoute (`preferences-sync.service` → orchestrateur → façade)
  et le consommateur dans `use-socket-cache-sync`. Les préférences de communauté
  vivant dans React Query et non dans un magasin Zustand, le levier est
  l'invalidation : la LISTE, plus chaque communauté NOMMÉE — `orderInCategory`
  appartenant aussi à la ligne de détail. C'est ce qui rend la charge utile
  nécessaire, et pas seulement le fait que l'événement ait eu lieu.

## 5. Le cliquet, et ce qu'il mesure vraiment

`preference-writer-sweep.ts` fige les SITES D'ÉCRITURE des deux tables de
préférences par utilisateur. Six sites, tous ouverts et vérifiés, chacun avec
l'émission qui le suit.

Il ne prouve pas qu'un site diffuse — un émetteur peut vivre dix lignes plus
bas, dans une branche, ou déléguer. **Sa valeur est de forcer la question au lot
suivant** : une entrée en trop signifie « un écrivain neuf est apparu, et
celui-là, il diffuse ? ».

C'est la question qui a manqué deux fois, dans les deux familles :

- côté CONVERSATION, les trois routes de `user-deletions.ts` écrivaient
  `deletedForUserAt` / `clearHistoryBefore` sans rien émettre — d'où le module
  écrivain unique ;
- côté COMMUNAUTÉ, ce cycle.

Les deux fois, le site fautif n'était pas caché. Il était VOISIN, et il
n'appartenait simplement pas à la phrase du lot qui a fermé les autres.

Le collecteur est exercé sur une arborescence fabriquée — écrivain neuf,
plusieurs sites par fichier, lectures ignorées, commentaires dépouillés, doubles
de test exclus. **Un cliquet dont le collecteur ne trouve jamais rien reste vert
quoi qu'on écrive** : montrer qu'il TOMBE fait partie de sa livraison.

## 6. Un double partiel retiré au passage

`preferences-sync.service.test.ts` portait une fabrique
`jest.mock('@meeshy/shared/types/socketio-events')` énumérant six constantes de
`SERVER_EVENTS` à la main. Elle était INERTE — le `moduleNameMapper` du web
réécrit `@meeshy/shared/*` vers `packages/shared/dist` (cf. `apps/web/CLAUDE.md`),
donc le service recevait déjà les vraies valeurs.

Retirée plutôt que complétée, et pour la raison que le dépôt écrit déjà : quand
le module doublé n'expose que des CONSTANTES pures, la bonne réponse n'est pas
`jest.requireActual`, c'est **pas de double du tout**. Le jour où la fabrique
redeviendrait vivante, la septième constante — celle de ce lot — sortirait à
`undefined` sur ses DEUX adresses, et les témoins d'écoute resteraient verts :
ils assertent le NOM depuis la même constante que l'écouteur.

C'est le quatrième exemplaire de cette famille (cycles 86, 91, 93, 104).

## 7. Ce qui reste ouvert, et pourquoi ce n'est pas un oubli

**iOS et Android ne consomment pas le nouvel événement.** Ni l'un ni l'autre n'a
aujourd'hui de surface de réordonnancement de communautés — le seul émetteur de
`POST …/communities/reorder` du dépôt est `communities.service.ts` (web). Poser
un décodeur iOS maintenant, c'est écrire un consommateur sans producteur, que
rien ne fera tomber s'il dérive. Le contrat est en place et le doc-comment porte
la raison ; le décodeur appartient au lot qui apportera le geste.

**Le suivi du cycle 127 reste ouvert et non instruit** : la fenêtre de rappel
push est rétrécie, pas fermée — la fermer demanderait un rappel APNs
`content-available` + suppression côté NSE, lot à part touchant les trois
clients.

## 8. Gates

| gate | mesure |
|---|---|
| témoins RED prouvés (gateway) | 2 rouges sur l'émission manquante, 7 verts après |
| témoins RED prouvés (web) | 3 rouges (`is not a function`), 51 verts après |
| suite gateway complète | **861/861 suites, 19564 témoins**, exit 0 — couverture 95,47 %, identique au cycle 127 |
| suite `packages/shared` | 109 fichiers, 2587 témoins (dont les 4 gates CI) |
| gardes CI non-jest | `check-type-debt --self-test`, `check-law-literals` (+ self-test), `check-swift-viewbuilder` (+ self-test) — exits 0 |
| `tsc --noEmit` gateway | exit 0 (code de retour lu SANS pipe) |
| build `packages/shared` | exit 0 |
| suites web voisines | 21 suites, 670 témoins |
| cliquet de dette de types web | 1196 — inchangé |
