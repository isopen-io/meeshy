# Iteration 109 — Analyse d'optimisation (2026-07-05)

## Protocole (démarrage)
`main` @ `930f4811` (« Merge pull request #1514 … »), working tree propre. Branche de travail
`claude/brave-archimedes-4masof` recréée depuis `origin/main` (`git checkout -B … origin/main`),
0 commit non-mergé à préserver. `git config user.email/name` positionné (`noreply@anthropic.com` / `Claude`).

**8 PR ouvertes au démarrage**, toutes issues de sessions parallèles et **disjointes** de la cible retenue :
- **#1518** realtime — suppression event `NOTIFICATION` mort + fix import Prisma (F77 dans leur numérotation),
- **#1517** Android DND schedule editor,
- **#1516** gateway `circuitBreaker.ts` `failureWindowMs` (F77),
- **#1515** web `phone-validator.ts` E.164 digit count (F80),
- **#1513** gateway typing indicators blocking,
- **#1510** web `language-detection.ts` `es` (F79),
- **#1498** calls GC qualityDegradedStreaks + web toast.

La cible retenue ici (`sanitizeText` — strip zero-width) est **strictement disjointe** de tous ces
fichiers. Numérotée **109** (107 mergé dans `main`, 108 en vol dans #1510/#1516).

### Revue d'ingénierie (constat de démarrage)
Balayage ciblé (agent d'exploration, 54 tool-uses) des helpers **purs/quasi-purs** de
`services/gateway/src/utils`, `apps/web/utils`, `apps/web/lib` et `packages/shared/utils`, **hors** les
fichiers des 8 PR ouvertes et hors zones déjà traitées itérations 100-108. Vérifiés corrects et écartés :
`pagination`, `response` (`validatePagination`, `buildPaginationMeta`, `buildCursorPaginationMeta`),
`etag`, `bounded-cache`, `lru-cache`, `rate-limiter`, `normalize` (`capitalizeName`),
`language-normalize`, `call-summary`, `notification-strings`, `lib/user-status`
(`getUserStatus` — `return 'away'` prouvé **intentionnel** par le test `user-status.test.ts:66-71`).
Une racine de défaut remonte, présente dans **deux** fonctions pures indépendantes à appelants **live**
persistants → **F82** (impact réel, Unicode/i18n, cœur produit multilingue).

## Cible : F82 — `sanitizeText` supprime U+200C (ZWNJ) et U+200D (ZWJ) → corruption emoji/persan/indic

### Current state
Deux fonctions de sanitisation « texte brut » partagent la **même** ligne défectueuse — strip du range
`[​-‍﻿]` :
- **web** : `apps/web/utils/xss-protection.ts` → `sanitizeText` (ligne 77 avant fix) ;
- **gateway** : `services/gateway/src/utils/sanitize.ts` → `SecuritySanitizer.sanitizeText` (ligne 40).

Le range `​-‍` englobe **trois** points de code : U+200B (ZWSP, réellement invisible),
U+200C (ZWNJ) et U+200D (ZWJ). Or **ZWNJ et ZWJ sont sémantiquement significatifs** :
- **ZWJ (U+200D)** joint les séquences emoji : famille `👨‍👩‍👧‍👦`
  (`1F468 200D 1F469 200D 1F467 200D 1F466`), drapeaux (`🏳️‍🌈`), emoji-métier (`🧑‍💻`).
  Strip ⇒ `👨👩👧👦` (quatre personnes distinctes), `🏳️🌈` (drapeau blanc + arc-en-ciel).
- **ZWNJ (U+200C)** est **orthographiquement requis** en persan/farsi (langue supportée `fa`) :
  `می‌روم` → `میروم` (mot mal orthographié).
- ZWJ/ZWNJ pilotent la **formation des conjoints** dans les scripts indiens (hindi `hi`, bengali `bn`…).

Le défaut est manifestement **non intentionnel** : la **même** fonction web a été récemment corrigée pour
**cesser** de strip le range de contrôle C0 (commentaire `xss-protection.ts:78-80` : « Stripping the whole
C0 range silently deleted every line break on edit ») — mais la ligne ZWNJ/ZWJ juste au-dessus a été laissée.

### Problems identified
- **[LIVE — web] Corruption du contenu de message persisté à l'édition.**
  `apps/web/hooks/conversations/useMessageActions.ts:67` (`handleEditMessage`) exécute
  `const sanitizedContent = sanitizeText(newContent)` puis l'envoie à `messageService.editMessage(...)`
  **et** l'applique en optimiste. Éditer un message contenant un emoji ZWJ ou du persan **persiste le
  texte corrompu** au backend (pas seulement un preview).
- **[LIVE — web] Corruption de tout preview de notification temps réel.**
  `apps/web/utils/socket-validator.ts:142` → `sanitizeNotification(parsed)` appelle `sanitizeText` sur
  `title`/`content`/`messagePreview` (`xss-protection.ts:310-312`) pour **chaque** notification entrante.
- **[LIVE — gateway] Corruption de noms/métadonnées persistés en base (irréversible côté rendu).**
  `SecuritySanitizer.sanitizeText` est appelé au **bord de persistance MongoDB** :
  - `routes/anonymous.ts:219-220` — `firstName`/`lastName` d'un participant anonyme (un prénom farsi perd
    son ZWNJ avant stockage) ;
  - `routes/communities/core.ts:435,437` — `name`/`description` de communauté (`Pride 🏳️‍🌈` → `Pride 🏳️🌈`) ;
  - `routes/links/creation.ts` + `links/management.ts`, `tracking-links/creation.ts`, `friends.ts` —
    `name`/`description` de liens de partage.
  Écrit corrompu en base ⇒ re-servi à **toutes** les plateformes (iOS/web) ⇒ non réparable au rendu.

### Root cause
Le range `[​-‍]` a été écrit comme si « zéro-largeur » ⟺ « à supprimer », en confondant
l'**invisible** (ZWSP U+200B, ZWNBSP/BOM U+FEFF — aucun usage textuel légitime) avec le **fonctionnel**
(ZWNJ/ZWJ — porteurs de sens). La norme de l'état de l'art (Unicode TR39, sanitizers modernes) ne strip
**jamais** ZWJ/ZWNJ précisément parce qu'ils sont requis par des scripts vivants et par les emoji.

### Business impact
Corruption **silencieuse** du contenu utilisateur sur le cœur de la proposition Meeshy (produit de
messagerie **multilingue**, usage emoji massif, locuteurs RTL/indic). Un utilisateur persan voit son
message ré-orthographié à l'édition ; un nom de communauté avec drapeau/famille emoji est cassé de façon
permanente en base. Violation directe du principe de **transparence** (le contenu doit s'afficher comme
natif, pas mutilé).

### Technical impact
Correction **d'une seule ligne** dans **deux** fichiers SSOT, sans changement de signature/contrat :
range `[​-‍﻿]` → `[​﻿]` (strip **uniquement** ZWSP + BOM). Tous les appelants
(édition message, previews notif, persistance noms/communautés/liens) héritent automatiquement du correctif.

### Risk assessment
Très faible. Fonctions pures. La **posture de sécurité XSS est inchangée** : la défense XSS primaire reste
le strip HTML par DOMPurify / `<[^>]*>` ; le strip zéro-largeur n'était qu'une mesure anti-obfuscation
secondaire, et conserver ZWNJ/ZWJ est précisément le compromis retenu par l'état de l'art pour un produit
multilingue. Aucun contenu actuellement accepté n'est nouvellement rejeté ; ZWSP (invisible, obfuscation)
et BOM restent supprimés. Seul comportement modifié : ZWNJ/ZWJ **survivent** désormais (correct).

### Proposed improvements (implémenté ce cycle)
- `apps/web/utils/xss-protection.ts:83` et `services/gateway/src/utils/sanitize.ts:46` : range réduit à
  `[​﻿]` + commentaire expliquant le *pourquoi* (ZWJ emoji, ZWNJ persan, conjoints indic).

### Expected benefits
- Messages édités CJK/emoji/persan/indic **non corrompus** — restaure le Prisme Linguistique.
- Noms/communautés/liens persistés intacts en base sur toutes les plateformes.
- Aucun coût : même nombre d'opérations (un `replace` + les suivants), classe de caractères plus courte.

### Implementation complexity
Très faible (1 constante de range × 2 fichiers + commentaires ; 4 tests neufs + 1 test buggé corrigé).

### Validation criteria
- [x] RED prouvé d'abord (repro Node autonome, impls copiées verbatim) : famille emoji → 4 segments,
      ZWNJ persan supprimé.
- [x] GREEN Node (fix) : ZWNJ persan conservé, séquence ZWJ intacte, ZWSP + BOM toujours supprimés.
- [ ] GREEN jest web : `xss-protection.test.ts` (existants + BOM, ZWJ emoji, ZWNJ persan).
- [ ] GREEN jest gateway : `sanitize.test.ts` (test « remove zero-width » réécrit ZWSP+BOM,
      + ZWJ emoji, + ZWNJ persan).
- [ ] Suites complètes vertes après install bun + CI.

## Candidats écartés ce cycle (documentés)
- **`lib/user-status.ts` `getUserStatus`** : `return 'away'` pour `isOnline && >30min` — **intentionnel**
  (assertion explicite dans `user-status.test.ts:66-71` : « away, not offline, since socket connected »).
- **`notification-helpers.ts` `groupNotificationsByDate`** (le dimanche, `startOfWeek = startOfToday`
  car `getDay()===0`, rendant le bucket « cette semaine » inatteignable ⇒ notifs Lun-Sam classées
  « ce mois-ci ») : **réel mais cosmétique** (mauvais label de section 1 jour/7). Reporté (§ futur, F83).

## Améliorations futures (report)
- **F51b** (LOW) : réécriture des docs `notifications/`.
- **F56b** (LOW) : `likeCount` absolu sur `post:reaction-added/removed`.
- **F60b** (LOW) : parité parsing mention iOS/Android sur `MENTION_HANDLE_CHARS` (tiret).
- **F67b** (LOW) : audit découpage jour-calendaire iOS.
- **F68b** (LOW) : contrepartie iOS des initiales (parité point-de-code).
- **F69** (LOW) : `sanitizeFileName` plafond 255 sur nom sans extension (latent, 0 appelant).
- **F70** (LOW) : `deepCleanTranslationOutput` apostrophes FR (code mort, 0 appelant).
- **F74** (LOW) : lookbehind manquant dans `resolveDisplayContent` (dead code, 0 appelant).
- **F75** (LOW) : suffixe `generateCommunityIdentifier` non garanti à 6 car. (proba négligeable).
- **F83** (LOW, neuf) : `groupNotificationsByDate` bucket « cette semaine » inatteignable le dimanche
  (`getDay()===0`) — cosmétique.
</content>
