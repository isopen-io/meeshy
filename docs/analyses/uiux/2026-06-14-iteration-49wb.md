# UI/UX Analysis — Iteration 49wb (2026-06-14)

> **Note de réconciliation (collision parallèle)** : un autre agent a livré en parallèle une
> itération également numérotée **49w** (i18n + dark mode du flux d'appel vidéo —
> `CallNotification`/`VideoCallInterface`, déjà mergée dans `main`). Les deux périmètres sont
> **disjoints** (appel vidéo vs surface admin Ranking) et tous deux utiles : aucun fichier code
> commun. Pour éviter d'écraser l'historique, **cette itération est renommée `49wb`** ; l'analyse
> appel-vidéo `49w` reste la version canonique pour ce périmètre-là.

## Scope
**Web exclusivement**. Base : `main` HEAD post-merge iter-48i (puis re-synchronisé sur `main`
incluant la 49w appel-vidéo). Itération dédiée au lot différé **`RANKING_CRITERIA` labels FR durs**
tracé depuis 47w/48w, élargie à une **découverte majeure** : la surface admin Ranking utilise un
préfixe de namespace i18n cassé qui affiche les clés brutes.

## Anti-repetition check (étapes 1–3 de la routine)
- **Doublons analyses** : aucun. Audit automatisé — chaque analyse 1→49w possède un plan homonyme
  ET une annotation de clôture. Sous-itérations par plateforme (42/42b, 44/44b, 45/45i/45w,
  46/46i/46w, 48i/48w) distinctes. La collision 49w (appel vidéo) vs 49wb (ranking) est tracée
  ci-dessus (périmètres disjoints, pas un doublon).
- **Complétude** : 48w a soldé le dark mode des charts ; 47w l'i18n admin agent ; 49w (parallèle)
  le flux d'appel vidéo. NON ré-audités.
- **Exclusions intentionnelles respectées** : share-affiliate-modal, AudioPostComposer,
  use-voice-recording, StoryViewer select-none, `/v2` ThemeProvider, `hooks/useI18n.ts` re-export.

## Web Findings

### Critical : namespace i18n cassé sur la surface admin Ranking (clés brutes affichées)
Le loader `useI18n(ns)` (`hooks/use-i18n.ts:82`) n'extrait le wrapper de namespace **que si**
`ns in translations`. `admin.json` n'a **pas** de clé racine `admin` (racine = `{ranking, scanLog,
…, rankingPage, …}`), donc la racine reste l'objet complet. Conséquence :
- `t('ranking.X')` / `t('rankingPage.X')` → **résolvent** (clés racine réelles).
- `t('admin.ranking.X')` → **échouent** (`admin` n'est pas une clé racine) → renvoient la **clé
  littérale** affichée à l'écran.

`RankingFilters.tsx` utilisait le préfixe cassé `admin.ranking.*` sur **13 libellés** (titre du
filtre, labels type d'entité + 4 options, label critère, recherche, vide, période, comptage ×2,
+ template `period{...}`). Toutes ces chaînes s'affichaient en **clé brute** (`admin.ranking.
filterTitle`, etc.) dans **toutes** les langues, y compris le français. (RankingTable/RankingPodium
utilisaient déjà le préfixe correct `ranking.*`/`rankingPage.*` — incohérence interne confirmée.)

**Correction** : migration des 13 appels `admin.ranking.*` → `ranking.*` (préfixe qui résout).
Vérifié par simulation node du loader sur les 4 locales : 100 % des clés résolvent.

### High : `RANKING_CRITERIA` — 33 labels de critères FR durs (carry-over 47w/48w)
`components/admin/ranking/constants.ts` portait un champ `label` FR dur par critère (« Messages
envoyés », « Réactions reçues », … ×33). Affichés dans : les 4 RankCards (User/Conversation/
Message/Link), le dropdown + recherche de `RankingFilters`, et les tooltips de charts
`RankingStatsImpl`. Un admin en/es/pt voyait du français.

**Correction** : le champ `label` redondant est **supprimé** de `constants.ts` (source unique =
i18n). Helper `criterionLabelKey(value) = ranking.criteria.${value}` ; chaque consommateur résout
via `t()`. Clés `ranking.criteria.*` ajoutées ×33 ×4 locales (fr préserve les libellés d'origine).

### Medium : LinkRankCard — 7 chaînes FR dures adjacentes (même fichier)
En migrant le label de critère de `LinkRankCard`, chaînes FR dures voisines internationalisées :
badge `🔍 Tracké`/`📤 Partage`, préfixe `Conversation :`, unités `visites`/`uniques`/
`utilisations`/`max`. Clés `ranking.linkTrackedBadge|linkShareBadge|conversationPrefix|
unitVisits|unitUnique|unitUses|unitMax` ×4 locales.

### Hygiène test (découverte, fichier de test mort réanimé)
`components/admin/ranking/__tests__/RankingComponents.test.tsx` ne s'exécutait **jamais** :
(1) `import` ES **à l'intérieur** d'un `it()` (ligne 421) = Syntax Error SWC bloquant tout le
fichier ; (2) absence de mock `useI18n` → chaîne `stores → socketio → @meeshy/shared/encryption`
non résoluble par jest. Masqué par `continue-on-error: true` sur le job web CI (`ci.yml:211,224`).
**Correction** : import remonté en tête ; mock `useI18n` adossé au locale fr réel (coupe la chaîne
+ rend les libellés français attendus) ; 2 assertions de séparateur de milliers rendues
locale-agnostiques (NBSP/espace/virgule). Résultat : **30/30 verts** (validation directe des
corrections i18n ci-dessus).

### Vérifiés conformes (pas des violations)
- `RankingTable`/`RankingPodium` : déjà sur `ranking.*`/`rankingPage.*` — non touchés.
- `getTypeLabel` (`utils.tsx`) renvoie `Groupe`/`Publique` en dur : codes de type de conversation
  côté admin — hors périmètre de cette passe (à arbitrer ultérieurement, voir différés).
- `MEDAL_COLORS`, fills or/argent/bronze : sémantique podium, conservés.

## Parité plateformes
Surface admin web only (pas d'équivalent iOS/Android). Pas de propagation requise.
La règle « préférée vs original » du Prisme ne s'applique pas (libellés d'UI, pas du contenu
utilisateur traduit). Aucun impact sur la résolution `resolveUserLanguage`.

## Différés (50+) — reportés dans branch-tracking.md
- `getTypeLabel`/`getMessageTypeIcon` (`ranking/utils.tsx`) labels FR durs (`Groupe`/`Publique`).
- `page.test.tsx` (ranking) et autres tests web touchant `stores` : échec env-local sur la
  résolution `@meeshy/shared/encryption` (`.js` en source TS) — config jest, non bloquant.
- Retrait dépendance orpheline `next-themes` ; consolidation notifications/preferences ;
  réactions par pièce jointe ; deep links `/v2/chats?id=`, swipe-back ; audit dark admin (reste).

## ✅ Status : itération soldée — corrections implémentées, voir plan 2026-06-14-plan-iteration-49wb
NE PAS retraiter les findings ci-dessus (préfixe `admin.ranking.*`, labels `RANKING_CRITERIA`,
chaînes LinkRankCard, syntax error/mock du test ranking).
