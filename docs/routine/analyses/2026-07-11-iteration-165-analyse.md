# Iteration 165 — Analyse d'optimisation (2026-07-11)

## Protocole (démarrage)
`main` @ `c358be9` (dernier merge : PR #1823 — Android per-post Prisme language switch).
Branche `claude/brave-archimedes-u2e8sb` recréée sur `origin/main`. Ce cycle prend **165**
(164 = PR #1819, source-of-truth réactions `getPostInteractions`).

Fan-out : deux agents Explore parallèles — (a) `services/gateway/src`, (b) `apps/web` +
`packages/shared`. Consigne : **un** défaut de logique quasi-pure, haute confiance,
**actuellement en production**, non couvert par les tests. Priorité 1 = features récemment
développées (Prisme linguistique / feed social / notifications / calls).

Candidats retournés (rejetés ce cycle mais versés au backlog ci-dessous) :
- web : `markAsRead` décrémente `unreadCount` sans garde « déjà lu » (les handlers frères gardent).
- gateway : signaux d'affinité reel case-sensitive (`reelAffinity.ts`), digest email clobbe `pushSent`.

---

## Cible retenue : F165 — le filtre self-translation de `MessageTranslationService` compare la langue source **verbatim** (`'FR'`, `'fr-FR'`) à des cibles déjà normalisées lowercase → un aller-retour NLLB `fr→fr` réécrit les mots exacts de l'auteur en paraphrase machine (violation Prisme règle #1)

### Current state
`services/gateway/src/services/message-translation/MessageTranslationService.ts`, deux sites
identiques (chemin envoi `:457`, chemin retraduction `:602`) :

```ts
const filteredTargetLanguages = targetLanguages.filter(targetLang => {
  const sourceLang = message.originalLanguage;               // ← stocké verbatim
  if (sourceLang && sourceLang !== 'auto' && sourceLang === targetLang) {
    return false;                                             // ← comparaison sensible à la casse
  }
  return true;
});
```

- `targetLanguages` provient de `_extractConversationLanguages`, qui **normalise tout** en
  lowercase (`resolveUserLanguagesOrdered` + `normalizeLanguageCode(...)?.toLowerCase()` — testé :
  `'EN'→'en'`, `'fr-FR'→'fr'`). La branche participant anonyme (`:797`) documente déjà cette
  classe de bug (« un target uppercase/locale-cased qui ne matche jamais le store lowercase …
  un miss Prisme règle #1 »).
- `message.originalLanguage` est écrit **tel quel** depuis le client : schema socket
  `originalLanguage: z.string().optional()` (`validation/socket-event-schemas.ts:24,49`), stocké
  via `MessageHandler.ts:267` `originalLanguage: validated.originalLanguage` — jamais normalisé.

### Problems identified
Un client francophone qui envoie avec `originalLanguage = 'FR'` (ou `'fr-FR'`, cas réel iOS
`Locale.current.identifier` / web `Accept-Language`) dans une conversation dont l'audience
produit la cible `['fr', …]` : le prédicat évalue `'FR' === 'fr'` → `false` → `'fr'` **n'est pas
filtré**. Le gateway lance un aller-retour NLLB `FR→fr` et écrit la paraphrase machine dans
`translations.fr`. Le destinataire francophone résout sa traduction `fr` et voit la **paraphrase**
(« Salut … ») au lieu des mots exacts de l'auteur (« Bonjour ») — plus une requête de traduction
gaspillée.

### Root cause
Asymétrie de normalisation entre les deux opérandes du filtre : cibles normalisées, source brute.
Exactement la même classe que le fix story-caption déjà valorisé par l'équipe
(`__tests__/unit/services/PostService.storyCaptionSourceFilter.test.ts` : « self-translation NLLB
round-trip (`fr`→`fr`) … overwrites `Post.translations.fr` with a paraphrase … a Prisme
Linguistique violation »). Le chemin message portait la même garde mais comparait sans normaliser.

### Scénario input → output erroné
1. A envoie « Bonjour » avec `originalLanguage='FR'` dans conv-1 (audience → target `['fr']`).
2. Filtre : `'FR' !== 'fr'` → `'fr'` conservé → requête ZMQ `FR→fr` émise.
3. NLLB paraphrase, `translations.fr = 'Salut'` écrit.
4. **Output** : le destinataire francophone voit « Salut ». **Attendu** : « Bonjour » (original).

### Business impact
Prisme Linguistique (principe produit fondamental, Priorité 1). Le contenu traduit doit s'afficher
comme du natif ; ici l'auteur voit ses propres mots réécrits par la machine pour tout recipient
partageant sa langue, dès que son appareil rapporte un code cased/locale. Coût réseau/ML gaspillé.

### Technical impact
Divergence silencieuse : aucune erreur, une `MessageTranslation.fr` parasite est créée et prime
sur l'original côté client (règle Prisme #1 : absence de traduction = afficher l'original).

### Risk assessment
Faible. Le correctif rend le filtre plus permissif d'exclusion (il exclut désormais correctement
`'FR'`/`'fr-FR'` en plus de `'fr'`) ; il n'ajoute jamais de nouvelle cible. Sémantique `'auto'`
préservée (`normalizeLanguageCode('auto')→undefined→'auto'`, exclu par la garde `!== 'auto'`, y
compris `'AUTO'`). Aucun changement de schéma, d'API, d'état persistant.

### Proposed improvements
Factoriser les deux blocs identiques en un helper privé `_isSelfTranslation(rawSourceLang,
targetLang)` qui normalise la source en miroir de `_extractConversationLanguages`
(`normalizeLanguageCode(x) ?? x.toLowerCase()`) avant comparaison. Élimine aussi la duplication
(risque de dérive futur entre les deux sites).

### Expected benefits
- Prisme règle #1 respectée : plus de paraphrase `fr→fr` quand la source est cased/locale.
- Convergence des deux sites de filtre vers une seule source de vérité (helper).
- Économie de requêtes NLLB self-translation.

### Implementation complexity
Triviale — 1 helper (~7 lignes) + 2 sites réécrits en 1 ligne chacun.

### Validation criteria
- RED d'abord : `originalLanguage='FR'` + target `'fr'` → `sendTranslationRequest` NON appelé
  (échoue avant : appelé). Idem `'fr-FR'`. Unit `_isSelfTranslation('FR','fr')===true`,
  `('fr-FR','fr')===true`, `('en','fr')===false`, `('auto','fr')===false`, `(null,'fr')===false`.
- Suite `MessageTranslationService.audio` verte (131/131), `.test` + `.branches` vertes (105/105).
- `tsc` : aucune nouvelle erreur dans le fichier touché.

### Tests — absence de couverture confirmée
`MessageTranslationService.audio.test.ts:699` (« skips ZMQ when source lang equals only target
lang ») n'exerçait que des valeurs **lowercase** correspondantes ; aucun test ne faisait passer une
source uppercase/locale-cased dans le filtre. Ajout de 2 tests comportementaux (chemin
retraduction, mirror harness :699) + 6 tests unitaires sur `_isSelfTranslation`.

---

## Suivis (backlog, non traités ce cycle)
- **web `markAsRead` — décrément `unreadCount` inconditionnel** (`use-notifications-query.ts:90,96`).
  `onMutate` décrémente pour chaque page et pour la query `unreadCount` sans vérifier que la notif
  ciblée était non-lue (ni présente dans ce cache). Les handlers frères gardent (socket
  `use-notifications-manager-rq.tsx:188`, delete `:198`). Marquer lu une notif déjà lue fait passer
  le badge sous le compte réel. Non couvert (le test ne peuple pas les pages).
- **gateway `reelAffinity` — signaux langue case-sensitive** (`reelAffinity.ts:110,123`).
  `viewerLanguages` construit raw (pas de lowercase) ; `seedSameLanguage`/`viewerLanguage`
  mis-rankés si casse divergente. Signal de ranking soft → sévérité moindre.
- **gateway digest — `delivery.pushSent` clobbé** (`notification-digest.ts:238`). `updateMany`
  écrase `delivery` en bloc, resettant `pushSent:false` pour une notif déjà push-délivrée.
- **web réactions — identité participantId vs userId cross-session** (report iter 164, toujours
  ouvert) : `event.participantId` (Participant.id) comparé à `currentUserId` (User.id) dans
  `use-reactions-query.ts:411,444`. Nécessite de plomber un `currentParticipantId` aux call sites —
  invasif, cycle dédié.
