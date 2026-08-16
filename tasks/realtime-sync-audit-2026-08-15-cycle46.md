# Cycle 46 — l'écran Confidentialité écrivait dans un tiroir que le serveur n'ouvrait pas

## 1. D'où vient la piste

Le cycle 45 laissait une question précise : `_loadReadReceiptOptOuts` ignore les
participants sans `userId` (`if (!participant.userId) continue`) — un invité de
lien partagé n'est donc jamais retiré à la lecture. La conclusion « un invité ne
peut pas couper ses accusés » ne tenait que si `PATCH /me/preferences/privacy`
lui est inaccessible. **Réponse : il l'est.** `userPreferencesRoutes` pose son
middleware avec `allowAnonymous: false` (`routes/me/preferences/index.ts`) — une
session anonyme est refusée avant d'atteindre la moindre catégorie. Les deux
bouts s'accordent, la piste héritée se referme sans correctif.

Mais l'aller-retour pour l'établir a fait passer sous les yeux les deux moitiés
du chemin en même temps — l'écriture et la lecture — et elles ne parlaient pas
de la même table.

## 2. Le constat

Le dépôt possède **deux rangements** pour la même préférence :

| Rangement | Modèle Prisma | Forme |
|---|---|---|
| Document | `UserPreferences.privacy` | un JSON par utilisateur, clés camelCase |
| Clé/valeur | `UserPreference` | une ligne par clé, kebab-case (`show-read-receipts`) |

Et ils ne se croisent jamais :

| | Écrit | Lit |
|---|---|---|
| `PUT`/`PATCH`/`GET /me/preferences/privacy` (`preference-router-factory.ts`) | **document** | **document** |
| `PrivacyPreferencesService.fetchFromDatabase` / `fetchManyFromDatabase` | — | **clé/valeur** |
| `MessageReadStatusService._loadReadReceiptOptOuts` | — | **clé/valeur** |
| `PreferencesService.updatePrivacyPreferences` | clé/valeur | clé/valeur |

La dernière ligne est la seule à écrire le rangement que tout le monde lit — et
**elle n'a aucun appelant** : `services/preferences/PreferencesService.ts` n'est
importé nulle part dans le service.

Côté clients, la seule porte appelée est celle du haut : web
`stores/user-preferences-store.ts` (`fetch('/me/preferences/privacy')`), iOS
`OutboxDispatcher` (`PATCH /me/preferences/:category`). Donc :

> **Aucun réglage de l'écran Confidentialité n'atteignait le serveur.**

## 3. Pourquoi c'était invisible

Trois raisons se sont additionnées, et c'est leur somme qui a tenu si longtemps.

**Le `GET` relit le document.** L'écran affiche fidèlement ce que l'utilisateur
a coché. Le réglage « tient » entre deux lancements de l'app, se synchronise
entre appareils, survit à une réinstallation. Rien, côté utilisateur, ne
suggère qu'il ne fait rien — c'est un aller-retour complet et cohérent, qui ne
touche simplement jamais la couche qui décide.

**Le défaut est `true`.** Une préférence non lue vaut « diffuse » : la panne ne
produit ni erreur, ni log, ni comportement anormal. Elle produit *exactement* le
comportement d'un utilisateur qui n'aurait rien réglé.

**Les tests modélisaient un seul tiroir.** Le double de `MessageReadStatusService`
déclarait `userPreference` et pas `userPreferences` ; celui de
`PrivacyPreferencesService` idem. Un témoin qui ne connaît qu'un rangement ne
peut pas voir que la porte consulte l'autre — il confirme la lecture, jamais son
adressage. *Troisième cycle consécutif où le double, et non le code, est ce qui
cachait le défaut* (cf. cycle 43, garde de contrat sur un vrai Fastify).

## 4. Portée

Ce que `PrivacyPreferencesService` et `_loadReadReceiptOptOuts` gouvernent — donc
ce qui était muet :

| Préférence | Porte | Effet réel avant ce cycle |
|---|---|---|
| `showReadReceipts` | `broadcastReadStatus`, `MessageHandler` (accusés de livraison), `_loadReadReceiptOptOuts` (5 lecteurs de statut) | accusés de lecture ET de livraison diffusés malgré l'opt-out |
| `showOnlineStatus` | `_broadcastUserStatus`, `_applyPresencePrefs` | statut en ligne diffusé malgré l'opt-out |
| `showLastSeen` | `_applyPresencePrefs` | `lastActiveAt` servi malgré l'opt-out |
| `showTypingIndicator` | `StatusHandler` | indicateur de frappe diffusé malgré l'opt-out |

Quatre préférences de confidentialité, toutes inertes. C'est une fuite de
métadonnées au sens de la phase 10 : la donnée sort du serveur alors que
l'utilisateur a demandé qu'elle ne sorte pas, et l'interface lui confirme que sa
demande est enregistrée.

**Aucun filet côté client.** Les deux applications ont retiré leur gate local
*délibérément*, en s'appuyant sur celui du serveur — et elles ont eu raison de
le faire, le gate client cassant la synchronisation des non-lus entre appareils
(`ConversationViewModel.swift` : « PAS de gate client sur `showReadReceipts` :
le gateway gate déjà le broadcast aux pairs selon la préférence » ;
`ConversationListViewModel.swift` : « the old client-side `showReadReceipts`
gate was redundant for privacy »). Le raisonnement était juste ; sa prémisse ne
l'était pas. Rien, sur aucune des deux plateformes, ne rattrapait le serveur.
Ce qui reste de `showReadReceipts` côté client relève de la RÉCIPROCITÉ — qui ne
partage pas ses accusés ne voit pas ceux des autres (`DeliveryIndicator.tsx`) —
et ne gouverne pas ce qui sort de l'appareil.

## 5. Le correctif

Un résolveur unique, `services/preferences/privacy-storage.ts` :

```
loadStoredPrivacyPreferences(prisma, userIds) → Map<userId, StoredPrivacyPreferences>
```

- il lit le **document** pour tous les utilisateurs demandés ;
- il n'interroge les **lignes héritées** que pour ceux qui n'ont pas de document
  exploitable ;
- il ne rattrape aucune erreur — chaque appelant garde son repli, et surtout ne
  met pas un échec en cache.

Les deux lecteurs passent par lui. `PrivacyPreferencesService.buildPreferences`
se réduit à `{ ...défauts, ...stocké }` : l'énumération manuelle des huit champs
était un second endroit à tenir à jour à chaque ajout de préférence — et un
second endroit où oublier de le faire.

**Pourquoi garder le repli hérité.** L'endpoint `/user-preferences/privacy`, qui
écrivait les lignes clé/valeur, a existé du 12 au 18 janvier 2026 (`1eff9afc8`
→ `673a0bab8`) et a été retiré sans reprise de données. Les lignes qu'il a
écrites sont peut-être encore en base. Les ignorer rouvrirait en silence, pour
cette population précise, la fuite exacte que ce cycle ferme — un correctif de
confidentialité qui régresse la confidentialité de quelqu'un est un correctif
raté. Le document primant, le repli ne peut jamais contredire un réglage
courant : il ne parle que pour les utilisateurs qui n'en ont aucun.

**Pourquoi `fromJsonDocument` rend `null` sur un document vide.** Un `{}` n'est
pas un réglage, c'est une absence de réglage. Le laisser occuper la place du
document ferait taire le repli et effacerait un opt-out de janvier.

## 6. Gates

- [x] 6 témoins discriminants vus ROUGES avant correctif
      (4 sur `PrivacyPreferencesService`, 2 sur `MessageReadStatusService`)
- [x] Gardes de non-régression : les lignes héritées restent servies en
      l'absence de document ; le document prime quand les deux existent et se
      contredisent, dans les deux sens
- [x] Doubles de test corrigés pour modéliser les DEUX rangements
- [x] `bunx tsc --noEmit` gateway : 0
- [x] Suite gateway complète verte
- [x] CHANGELOG + ADR `services/gateway/decisions.md` + ce journal + leçon 283

## 7. Écarté délibérément

**Faire écrire les deux rangements par la route.** C'est la correction
symétrique, et la plus petite en diff. Elle installe durablement deux sources de
vérité pour une même donnée, à charge pour chaque futur lecteur de deviner
laquelle fait foi — exactement la situation qui a produit ce défaut. La règle du
dépôt tranche (`CLAUDE.md` § Single Source of Truth) : c'est la LECTURE qui
rejoint l'écriture, pas l'inverse.

**Supprimer `services/preferences/PreferencesService.ts`.** Ce fichier est
intégralement orphelin, et son `updatePrivacyPreferences` est le seul écrivain
survivant du rangement hérité — donc le piège tout prêt pour recréer la
divergence. Le retirer est justifié, mais il porte aussi des préférences de
langue et de notification, et son propre fichier de tests : c'est une tranche à
part entière, pas un à-côté de celle-ci. Un commentaire le nomme désormais comme
non branché. **Piste du cycle 47.**

**Invalider les caches à l'écriture.** `PUT`/`PATCH /me/preferences/privacy`
n'appelle ni `PrivacyPreferencesService.invalidateCache` (TTL 5 min) ni le cache
d'opt-out de `MessageReadStatusService` : un réglage met jusqu'à cinq minutes à
prendre effet. C'est un défaut réel, mais BORNÉ — et il n'existait pas avant ce
cycle, puisque le réglage ne prenait jamais effet du tout. Le traiter demande de
raccorder la route à l'instance du manager (`fastify.socketIOHandler`), donc de
toucher au câblage : tranche distincte, à faire avec ses propres témoins.
**Piste du cycle 47 également.**

## 8. Piste pour le cycle 47 — repérée, NON livrée

Outre les deux ci-dessus : `getPreferencesForUsers` sert les anonymes par les
défauts **sans jamais consulter la base**, ce qui est correct aujourd'hui
puisqu'un anonyme ne peut pas atteindre la route (§ 1). Mais le raisonnement
repose sur `allowAnonymous: false` posé à un seul endroit, sans témoin qui le
garde. Établir si un test verrouille cette valeur ; sinon, un futur assouplissement
de la route rendrait des préférences enregistrées et jamais relues — le même
motif, sur la population que le cycle 45 avait justement laissée en question.
