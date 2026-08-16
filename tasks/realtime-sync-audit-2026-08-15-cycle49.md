# Cycle 49 — un `PATCH` qui n'a jamais été partiel, et l'écran qui contredisait le serveur

Reprise de la piste 3 du cycle 48. Elle a tenu ses promesses — et l'enquête pour
la corriger a mis au jour un défaut BEAUCOUP plus large, qui la contenait.

## 1. Ce que le cycle 48 laissait ouvert

1. `resolveSocketIO` lit encore un champ privé en repli.
2. iOS ne consomme pas le scope catégorie de `user:preferences-updated`.
3. **Les deux `GET` ne passent pas par le résolveur du cycle 46.**

La piste 3 était nommée « symétrie exacte du cycle 46, dans l'autre sens », avec
une population bornée (six jours de janvier). Elle est bien réelle. Mais elle
n'était que la moitié visible d'un défaut qui, lui, touche TOUT LE MONDE.

## 2. Défaut A — `PATCH` n'a jamais été une mise à jour partielle

`ZodObject.partial()` enveloppe chaque champ dans `optional()` mais **ne lui
retire pas son `default()`**. Sondé contre les sept schémas réels :

| Catégorie | Clés du schéma | Clés écrites par un `PATCH` **vide** |
|---|---|---|
| notification | 33 | **33** |
| application | 22 | **17** |
| privacy | 16 | **16** |
| message | 16 | **16** |
| document | 16 | **15** |
| video | 17 | **14** |
| audio | 14 | **13** |

La fusion `{ ...existant, ...validé }` était donc **inerte** : le second terme
couvrait le premier de bout en bout. Toucher un interrupteur remettait
silencieusement tous les autres réglages de la catégorie à leur défaut.

Le coût n'est pas cosmétique. Couper ses accusés de lecture, puis activer
« bloquer les captures d'écran » un mois plus tard, **rallume les accusés** — et
le serveur se remet à diffuser, pendant que l'écran confirme l'inverse. Un
consentement détruit par un geste qui ne le visait pas.

Aucun schéma appelant ne porte d'objet imbriqué (vérifié sur les sept) : la
réduction de premier niveau est donc complète, pas partielle.

## 3. Défaut B — l'écran contredisait le serveur

Le dépôt porte deux rangements pour la même préférence (cf. l'en-tête de
`services/preferences/privacy-storage.ts`). Depuis le cycle 46, les six portes de
diffusion lisent les DEUX. Les routes `/me/preferences` ne lisaient que le
document.

Pour la population de janvier — un opt-out posé, aucun document depuis — le
serveur taisait et l'écran affichait le défaut « tout visible ».

**Les deux défauts se composent, et le composé est pire que la somme.** Le
`PATCH` reconstruisait sa base sur le défaut affiché ; le défaut A garantissait
que cette base écrase tout. Le premier réglage touché posait donc un document
tout-à-`true` — lequel **gagne** alors sur les lignes de janvier
(`fromJsonDocument` non nul ⇒ le rangement hérité n'est plus consulté). Les
quatre portes coupées se rouvraient **définitivement**, sans qu'aucune trace ne
subsiste de ce qui avait été demandé.

## 4. Défaut C — `GET /me/preferences` rendait sept objets VIDES

Le schéma de réponse Fastify déclarait chaque catégorie en `{ type: 'object' }`,
sans `properties` ni `additionalProperties` : fast-json-stringify sérialise `{}`,
effaçant à la sortie tout ce que la route avait chargé.

Le `GET` d'une CATÉGORIE, lui, a toujours déclaré `additionalProperties: true` —
deux portes voisines rendaient donc des choses différentes.

Trouvé par accident : un témoin du défaut B lisait `data.privacy.showReadReceipts`
et recevait `undefined` là où `false` était attendu. Le témoin qui couvrait cette
route affirmait `toHaveProperty('privacy')` — vrai d'un objet vide.

## 5. Défaut D, mineur — `GET` et `PATCH` ne complétaient pas pareil

Le `GET` rendait le document brut ; le `PATCH` le complétait par les défauts. Un
document partiel se lisait donc autrement selon le verbe qui le regardait. Les
deux passent désormais par une seule lecture (`resolveComplete`).

## 6. Correctifs

- [x] `utils/partial-update.ts` — `submittedKeysOnly(validé, corps)` : la
      validation de Zod est conservée, sa SORTIE réduite aux clés que le corps
      nomme
- [x] Câblé sur les sept catégories (`preference-router-factory`) **et** sur
      `PATCH /admin/agent/topics/:id`, où `TopicPatchSchema` défaille
      `examples`, `cooldownMinutes` et `isActive` — renommer un topic remettait
      son délai à 60 min, le réactivait et vidait ses exemples
- [x] `CategoryStorage<T>` injecté : `readStored` + `afterWrite`, composés pour
      `privacy` au site d'enregistrement
- [x] `resolveStoredPrivacyPreferences` sert le `GET` d'une catégorie, le `GET`
      global et la base de fusion du `PATCH` — NON mémoïsé, à dessein
- [x] `retireLegacyPrivacyRows` après chaque écriture de la catégorie, y compris
      la remise à zéro globale de `routes/me/preferences/index.ts`
- [x] `additionalProperties: true` sur les sept catégories du schéma de réponse
- [x] `loadLegacyPrivacyRows` extrait : la lecture d'un seul utilisateur
      réemprunte le second temps de la résolution au lieu de le réécrire

## 7. Ce qui a été vérifié plutôt que supposé

Le comportement de `partial()` face aux `default()` n'a pas été déduit de la
documentation : sondé contre les sept schémas compilés, table du § 2 à l'appui.
L'hypothèse initiale était l'inverse — que `optional()` court-circuite le défaut
et que la clé serait simplement absente. Elle est fausse, et c'est précisément ce
qui rend le défaut invisible à la lecture du code.

Balayage de `services/gateway/src` pour la forme `.partial()` : **deux** sites,
tous deux corrigés. Aucun troisième.

Les lecteurs vivants du rangement hérité : `privacy-storage.ts` seul.
`AffiliateTrackingService` écrit dans la même table sous d'autres clés —
`retireLegacyPrivacyRows` ne touche que les huit clés de confidentialité.

## 8. Écarté délibérément

**Retirer les `default()` des sept schémas.** Ils servent au `PUT`, dont le
contrat EST « remplace complètement, comble ce qui manque ». Les retirer
déplacerait le défaut d'un verbe à l'autre.

**Déballer les `ZodDefault` avant `partial()`.** Demande de parcourir des `_def`
internes, casse à chaque nouvelle enveloppe (`nullable`, `catch`, `pipe`), et ne
dit rien des clés imbriquées — que la voie retenue ne prétend pas traiter non
plus, mais en le disant.

**`if (category === 'privacy')` dans la factory**, comme le fait déjà
`invalidateServerCache`. Chaque catégorie à histoire y ajouterait une branche.
Le rangement est injecté ; la factory demande à qui sait.

**Mémoïser la lecture des routes dans le cache des portes.** Ce cache tolère cinq
minutes de retard parce qu'une écriture le purge. Un écran de réglages qui
affiche une valeur qu'un AUTRE processus vient de changer est exactement le
défaut qu'on referme, sous un autre nom.

**Faire échouer `afterWrite` en silence sur `PUT`/`PATCH`.** Là, des lignes
survivantes seraient inoffensives (le document gagne). Sur la remise à zéro, non
— elles ressusciteraient le réglage effacé. Un seul contrat, qui rend 500 sans
diffuser ; les trois verbes sont idempotents.

## 9. Gates

- [x] 11 témoins discriminants vus ROUGES avant correctif (8 sur le rangement
      hérité, 3 sur la fusion partielle), plus 1 sur la route admin
- [x] Gardes : une valeur envoyée qui COÏNCIDE avec le défaut est bien appliquée
      (sans quoi le correctif se réduirait à « ignorer les défauts ») ; une clé
      inconnue reste écartée ; une valeur invalide rend toujours 400 ; les
      catégories non-`privacy` ne touchent jamais au rangement hérité
- [x] `bunx tsc --noEmit` gateway : 0
- [x] Suite gateway complète verte — **733 suites / 17 862 témoins**
      (cycle 48 : 731 / 17 836 — +2 suites, +26 témoins)
- [x] CHANGELOG + 2 ADR `services/gateway/decisions.md` + leçon 207

## 10. Quatre doubles ne modélisaient qu'un seul rangement

Cinquième cycle consécutif où un double de test ne modélise qu'un état du
rangement : `me-preferences.test.ts`, `preferences-encryption.test.ts`,
`preferences-security.e2e.test.ts` et `me/preferences/index.test.ts` n'avaient
pas de `userPreference` du tout — la table existait dans le schéma, pas dans les
doubles. Les quatre la portent désormais.

Le motif n'est plus une coïncidence : il mérite d'être nommé (leçon 207 § 4).

## 11. Pistes pour le cycle 50 — repérées, NON livrées

1. **La fusion profonde.** `submittedKeysOnly` ne descend pas dans les objets
   imbriqués. Aucun schéma appelant n'en porte aujourd'hui — le premier qui en
   portera héritera silencieusement du défaut du § 2, un niveau plus bas.
   Un témoin de forme sur les sept schémas ferait rougir cet ajout.
2. **`PUT` avec un corps partiel.** Zod comble par les défauts, ce qui EST le
   contrat de `PUT` — mais aucun témoin ne le fige, et rien ne vérifie que les
   clients envoient bien l'objet complet. Un `PUT` partiel venu de l'outbox iOS
   se comporterait exactement comme le `PATCH` d'avant ce cycle.
3. **Les deux pistes 1 et 2 du cycle 48 restent ouvertes** (repli sur champ
   privé de `resolveSocketIO` ; iOS ne consomme pas le scope catégorie).
