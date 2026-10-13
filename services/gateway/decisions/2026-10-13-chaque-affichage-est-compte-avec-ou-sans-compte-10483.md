# Chaque affichage est compté, avec ou sans compte : une porte, une clé de lecteur HMAC, une garde d'audience (2026-10-13, #10483)

## Contexte

Un lecteur sans compte (invité d'un lien de conversation, visiteur web public, visiteur iOS ouvrant un lien universel) ne fait monter ni `viewCount` ni `impressionCount`. Sa seule trace est `AnonymousPostOpen(postId, sessionKey)` + `postOpenCount`, où `sessionKey` est la valeur BRUTE de `X-Session-Token` — pour un invité de lien, son jeton de session, que `Participant` ne garde pourtant qu'en hash. Le filtre de comptage anonyme (`filterPublicPostIds`) ne regarde que `visibility = PUBLIC`, quand la garde de lecture (`isServableToAnonymous`) regarde aussi l'expiration, l'auteur actif et l'original d'un repost. Les impressions anonymes sont refusées aux deux bouts (client web, 403 passerelle). Cartographie complète : #10483.

## Décision

1. **Une porte** : `POST /api/v1/social/events` reste le cœur unique (`ingestSocialEvents`). Corps, réponse `{ recorded, rejected }`, plafond de 200 événements : inchangés.
2. **Clé de lecteur** : un acteur anonyme est identifié par
   `readerKey = HMAC-SHA256(READER_KEY_HMAC_SECRET, préfixe + valeur)` en hex,
   `préfixe = participant:<participantId>` si `X-Session-Token` résout un invité (même invité ⇒ même clé, quel que soit l'appareil), sinon `token:<valeur de l'en-tête>` (visiteur `visitor_<uuid>`). La valeur brute ne quitte jamais la requête. Secret absent en production ⇒ la passerelle refuse de démarrer (fail-closed) ; en test, secret de processus.
3. **Types anonymes** : `view` et `impression`. `dwell` et `download` restent refusés en 403, comme avant.
4. **Vue anonyme** : `AnonymousPostOpen` garde son nom et son unicité `(postId, sessionKey)` ; `sessionKey` porte désormais la `readerKey`. Champs additifs : `durationMs Int?` (la plus longue gardée), `expiresAt DateTime` (index TTL Mongo, 90 jours). Au PREMIER insert, en une écriture `incrementPostCounters` : `viewCount +1`, `anonymousViewCount +1` (nouveau), `postOpenCount +1` (gardé : les anciens lecteurs du champ continuent de le voir bouger). La racine d'un repost est créditée par les mêmes règles, sous la même garde. Un anonyme n'entre pas dans « vu par » : l'auteur y lit « et N visiteurs » depuis `anonymousViewCount`.
5. **Impression anonyme** : compteurs seulement — `impressionCount +1`, `anonymousImpressionCount +1` (nouveau) ; aucune ligne `PostImpression` (elle sert au classement par compte, inutile pour un anonyme, et coûteuse). Dédoublonnée par `(readerKey, postId)` sur 30 minutes : Redis `SET NX EX 1800`, repli en mémoire borné.
6. **Garde d'audience anonyme** = `isServableToAnonymous` (`routes/posts/anonymousPostGate.ts`), lue en une passe pour tout le lot. `filterPublicPostIds` et le filtre interne de `recordAnonymousOpen` disparaissent au profit de cette source unique.
7. **Débit anonyme** : 60 événements par minute par `readerKey` ET 120 par minute par empreinte d'IP tournante (`anonymousVisitorFingerprint`, `routes/links/utils/link-visitor.ts`) — l'empreinte sert de CLÉ de limiteur, elle n'est jamais écrite en base.
8. **Surface** : un champ facultatif `surface` s'ajoute à l'impression et à la vue (`feed | reels | profile | bookmarks | hashtag | community | nearby | sound | story_rail | mood_avatar | citation | detail | story | visitor`). `IMPRESSION_SOURCES` ne bouge pas : un ancien serveur ignore `surface` (objet Zod non strict), un nouveau la range dans `PostImpression.surface` (nouveau, facultatif). Un client neuf ne dépend donc jamais d'un serveur neuf.
9. **Alias** : les six routes restent montées. `POST /posts/:postId/impression` et `POST /posts/impressions/batch` passent en auth FACULTATIVE (branche anonyme sur `X-Session-Token`, même cœur) ; `/posts/:postId/anonymous-view` délègue au même cœur. `/posts/:postId/view` reste `requiredAuth`.
10. **Migration** : script idempotent qui hache les `sessionKey` existants (toute valeur qui n'est pas 64 hex) et pose `expiresAt = createdAt + 90 j`. Staging d'abord ; production au feu vert du porteur, sauvegarde vérifiée.

## Rétrocompatibilité

Ancien client ⇒ nouveau serveur : mêmes routes, même corps, mêmes réponses ; un ancien lot anonyme `view` compte désormais aussi dans `viewCount`. Nouveau client ⇒ ancien serveur : `surface` est ignoré ; une impression anonyme reçoit 403 et le client web la retire de sa file (comportement déjà en place pour un 403), sans rejeu.

## Hors lot

Commentaires (aucun modèle de portée : décision produit), écran « fil de communauté » web (inexistant), `TrackingLinkClick.ipAddress` en clair (issue séparée), exclusion de l'auteur de ses impressions (#10407), client Kotlin (gelé).
