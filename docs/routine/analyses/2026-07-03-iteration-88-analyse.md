# Iteration 88 — Analyse d'optimisation (2026-07-03)

## Protocole (démarrage)
`main` @ `0c18b8a6` (« bump build number 1210 » — HEAD au démarrage). Branche de travail
`claude/brave-archimedes-0rozu9` recréée à neuf depuis `origin/main` (working tree propre, aucun
commit non-mergé à préserver).

PR ouvertes au démarrage : #1404 (iOS scroll `ConversationListView`), #1402 (gateway push
fan-out parallèle — touche `PushNotificationService.ts`), #1401 (calls rate-limit + dead code web),
#1400 (gateway security — routes debug notifications + dead code cleanup notifications/), #1399
(iOS a11y `CameraView`). Cible retenue **hors de tous ces fichiers** : `PostTranslationService.ts`
(feature sociale récente, Priorité 1). Aucun conflit de merge attendu.

## Cible : garde `isUrlOnly` uniforme sur les 3 points d'entrée de traduction posts/commentaires

### Current state
`PostTranslationService` alimente le pipeline de traduction NLLB (via ZMQ) pour les posts et
commentaires du feed social. Trois méthodes envoient du contenu au translator :
- `translatePost(postId, content, …)` — traduction auto d'un post vers le top-5 langues.
- `translateOnDemand(postId, targetLanguage)` — traduction à la demande (tap « traduire »).
- `translateComment(commentId, postId, content, …)` — traduction auto d'un commentaire.

Une seule des trois — `translatePost` (l.71) — porte la garde `isUrlOnly` :
```ts
if (isUrlOnly(content)) {
  log.info('PostTranslation: skipping URL-only post (links preserved verbatim)', { postId });
  return;
}
```
Le helper `isUrlOnly` (`utils/url-content.ts`) existe précisément parce que « links … must be
preserved verbatim and never sent to NLLB (which would corrupt them) ».

### Problems identified
`translateOnDemand` (l.105-145) et `translateComment` (l.151-176) n'ont **aucune garde
`isUrlOnly`**. Elles envoient le contenu brut au translator sans filtrage :
- **`translateOnDemand`** : un post composé uniquement d'un lien (ex. lien partagé) tapé
  « traduire » → l'URL brute part vers NLLB, qui la mutile, et le résultat corrompu est **persisté**
  (`translations[targetLanguage]`) puis **broadcasté** à tous les viewers.
- **`translateComment`** : un commentaire URL-only subit exactement le même sort à la création.

`translatePost` (le chemin auto d'un post) est immunisé ; les deux autres chemins ne le sont pas —
incohérence comportementale au sein d'un même fichier, sur la même classe de bug.

### Root cause
La garde `isUrlOnly` a été ajoutée à `translatePost` lors d'un fix ciblé (préservation des liens),
mais n'a jamais été rétro-portée sur les deux points d'entrée frères. Les trois méthodes convergent
toutes vers `zmqClient.translateToMultipleLanguages(content, …)` — le contrat « ne jamais envoyer un
contenu URL-only à NLLB » doit donc s'appliquer **uniformément** aux trois, pas à une seule.

### Business impact
Corruption de liens partagés côté feed social, visible par tous les viewers d'un post/commentaire.
Le feed social est en développement actif (feature récente). Un lien mutilé après traduction est un
bug utilisateur direct et perçu — il casse le partage de liens, l'un des usages les plus courants.
Cohérence directe avec le **Prisme Linguistique** : le contenu traduit doit rester fidèle à
l'original ; un lien n'est pas du texte traduisible et doit passer verbatim.

### Technical impact
2 gardes conditionnelles (une par méthode), réutilisant le helper `isUrlOnly` déjà importé. Zéro
nouvelle dépendance, zéro changement de signature, zéro requête supplémentaire (`translateOnDemand`
teste le `post.content` déjà chargé ; `translateComment` teste le `content` déjà en paramètre).

### Risk assessment
TRÈS FAIBLE. Ajout de gardes en amont d'un envoi ZMQ fire-and-forget. Aucun impact sur le contenu
non-URL-only (comportement inchangé pour tout post/commentaire textuel). Aligne les trois méthodes
sur le comportement déjà éprouvé et testé de `translatePost`.

### Proposed improvements
1. `translateOnDemand` : après le garde `!post?.content`, ajouter
   `if (isUrlOnly(post.content)) { log…; return; }`.
2. `translateComment` : en tête de méthode, ajouter
   `if (isUrlOnly(content)) { log…; return; }`.

### Expected benefits
- Les liens partagés (posts + commentaires) ne sont jamais corrompus par NLLB, quel que soit le
  chemin (auto post, à la demande, auto commentaire).
- Cohérence : les trois points d'entrée de traduction appliquent la même règle URL-only.

### Implementation complexity
TRÈS FAIBLE — 2 gardes conditionnelles + 2 tests neufs (miroir du test URL-only existant de
`translatePost`).

### Validation criteria
- `PostTranslationService.test.ts` : suite verte (2 tests neufs inclus).
- RED prouvé : sans les gardes prod, les 2 nouveaux tests échouent (ZMQ appelé sur contenu URL-only).
- `tsc --noEmit` gateway : pas de nouvelle erreur.

## Améliorations futures (report)
- **F51** : supprimer/fusionner `FirebaseNotificationService` (dead code FCM parallèle) — reporté
  car recouvrement avec PR #1400 (cleanup dead code notifications/) au démarrage de cette itération.
- **F49/F50** : résidus lost-update in-process sur caches stats (auto-guéris par TTL / `recompute()`).
