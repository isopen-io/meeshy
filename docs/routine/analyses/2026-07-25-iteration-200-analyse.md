# Iteration 200 — Dashboard agent : 4 réimplémentations locales de la classification « temps relatif » (échelle `Math.floor(diff/…)` copiée-collée) → convergence sur le SSOT `classifyRelativeTime` via un helper de présentation i18n partagé

## Protocole (démarrage)
`main` @ `5d54f9c5` (derniers merges : #2290 android/auth RegistrationViewModel ;
accumulateur de visibilité des messages ; mark-as-read). Branche
`claude/brave-archimedes-lp5wlq` déjà alignée sur `origin/main`. Ce cycle prend **200**.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (web/shared/gateway). `bun install` effectué ; `packages/shared`
construit (`dist`) car le jest web mappe `@meeshy/shared/(.*)` →
`packages/shared/dist/$1`.

PRs ouvertes au démarrage : #2292 (android/auth availability probe), #2291
(web/v2 flags — **itération 199**, ferme la cible #1 du backlog 198), #2282 /
#2276 / #2275 (swarms iOS a11y VoiceOver). **Aucune non touchée** — la cible de
ce cycle ne recoupe aucun de leurs fichiers.

Sélection : **Priorité 1 / 2 — cible #2 explicitement mise en file par le backlog
de l'itération 198.** Le plan 198 (`Future improvements`, rang #2) nommait :
> « Time ago » réimplémenté localement malgré le SSOT `classifyRelativeTime`.
> […] `admin/agent/{AgentOverviewTab,AgentConversationsTab,AgentMessagesModal}.tsx`
> […] `admin/agent/ScanLogTable.tsx:37`. Convergence : `classifyRelativeTime` +
> un helper de présentation i18n partagé (comme `AgentLiveTab` le fait déjà).

La cible #1 (cartes drapeau/nom de langue v2) est déjà traitée par la PR #2291
ouverte — donc ce cycle prend la **cible #2** (dashboard agent). La cible #2's
sous-cas `v2/CommentItem.tsx` est **écarté** : toute la surface v2 est en anglais
codé en dur (`PostDetail` code « likes »/« comments » en dur, aucun composant v2
n'utilise de hook i18n) — internationaliser `CommentItem` seul serait incohérent
et exigerait de câbler `t` à travers 4 couches de composants. Le dashboard agent,
lui, reçoit déjà `t` partout → convergence propre et sans nouvelle plomberie i18n.

## Current state

La classification d'un délai écoulé (« maintenant » / N minutes / N heures / N
jours) possède un SSOT unique — `packages/shared/utils/relative-time.ts`
→ `classifyRelativeTime(targetMs, nowMs, { beyondDays })` — pur, déterministe
(le « maintenant » injecté), couvert par tests. **Un seul** des cinq sites du
dashboard agent l'utilisait : `AgentLiveTab.tsx` (convergé à l'itération ~198).

Les **quatre autres** réimplémentent l'échelle à la main, à l'identique :

### `AgentOverviewTab.formatTimeAgo`, `AgentConversationsTab.formatTimeAgo`, `AgentMessagesModal.formatTimeAgo` (style « phrasé »)
```ts
const diff = Date.now() - new Date(dateStr).getTime();
const minutes = Math.floor(diff / 60000);
if (minutes < 1) return t('agent.overview.timeAgo.justNow');
if (minutes < 60) return t('agent.overview.timeAgo.minutes').replace('{{count}}', String(minutes));
const hours = Math.floor(minutes / 60);
if (hours < 24) return t('agent.overview.timeAgo.hours').replace('{{count}}', String(hours));
const days = Math.floor(hours / 24);
return t('agent.overview.timeAgo.days').replace('{{count}}', String(days));
```
Rendu : « Just now » / « 5min ago » / « 3h ago » / « 2d ago » (clés
`agent.overview.timeAgo.*`).

### `ScanLogTable.formatTimeAgo` (style « compact »)
```ts
const diff = Date.now() - new Date(dateStr).getTime();
const mins = Math.floor(diff / 60000);
if (mins < 1) return t('timeAgo.now');
if (mins < 60) return `${mins}${t('timeAgo.minutes')}`;
…
```
Rendu : « just now » / « 5min » / « 3h » / « 2d » (clés `timeAgo.*`).

## Problems identified

1. **Quatre copies de la même échelle `Math.floor(diff / …)`.** Logique de
   classification dupliquée 4× (5× avec `AgentLiveTab` avant sa convergence),
   chacune susceptible de dériver indépendamment du SSOT.
2. **Dérives déjà présentes entre les copies.** `AgentMessagesModal` n'a pas de
   cas `never` (dateStr non-nullable) ; `AgentConversationsTab` rend `'-'` pour
   null au lieu de `never` ; `ScanLogTable` recalcule `hours` depuis `mins` alors
   que le SSOT part des ms — micro-divergences qui prouvent que les copies
   évoluent séparément.
3. **Deux styles de présentation dans le même dashboard** (`…timeAgo ago`
   phrasé vs suffixe compact) — non résolu ici (décision produit), mais la
   **classification** doit être unique quel que soit le style.
4. **Dette : 4ᵉ→1ʳᵉ copie d'une logique déjà centralisée** — même classe de
   défaut que les itérations 190-199 (réimplémentation locale d'un SSOT existant).

## Root causes

Helpers écrits localement avant/à côté de la centralisation de
`classifyRelativeTime` (itération 43) et jamais recâblés, sauf `AgentLiveTab`.
Le backlog 198 avait explicitement identifié cette cible.

## Business impact

Dashboard d'administration agent (rôles ADMIN/MODERATOR/AUDIT/ANALYST). Aucun
défaut d'affichage visible **aujourd'hui** (les 4 copies sont fonctionnellement
correctes), mais chaque copie est un risque de dérive future — un correctif
d'échelle appliqué au SSOT (ex. seuil « à l'instant », arrondi) ne se propagerait
pas aux copies. Portée admin, impact = maintenabilité + cohérence.

## Technical impact

- **+1 helper de présentation partagé** `apps/web/utils/relative-time-format.ts`
  (`formatPhrasedTimeAgo`, `formatCompactTimeAgo`), pur, `nowMs` injecté,
  déléguant la classification au SSOT (`beyondDays: Infinity` — jamais de
  débordement vers une date absolue, conforme au comportement historique).
- **−~40 lignes** de classification dupliquée sur 5 fichiers (les 4 copies + la
  refonte de l'inline switch d'`AgentLiveTab`).
- Présentation (clés i18n, style) **inchangée** par site → zéro changement
  visible.

## Risk assessment

**Faible.** Changement web-only, aucune API/schéma/migration/clé i18n
(réutilise les clés existantes). Chaque site conserve exactement son style et sa
gestion du null (`never` / `'-'` / aucun) dans un wrapper local ; seule la
classification passe par le SSOT testé. Comportement identique prouvé par
équivalence arithmétique : `floor(floor(ms/60000)/60) === floor(ms/3600000)`
pour tout délai ≥ 0, et un délai < 0 (futur) → `now` des deux côtés.

## Proposed improvements

Extraire `formatPhrasedTimeAgo` / `formatCompactTimeAgo` dans un util web
partagé, adopté par les 5 sites (`AgentOverviewTab`, `AgentConversationsTab`,
`AgentMessagesModal`, `ScanLogTable`, `AgentLiveTab`).

## Expected benefits

- Une seule source de classification pour tout le dashboard agent (SSOT).
- Présentation identique partout (zéro régression visuelle).
- −4 copies divergentes ; dette réduite ; helper unit-testé (13 tests).

## Implementation complexity

**Faible** — 1 nouveau fichier util + 1 fichier de test ; 5 fichiers de prod
(remplacement du corps de `formatTimeAgo` + import).

## Validation criteria

- Nouveau `relative-time-format.test.ts` : 13 tests verts (phrasé & compact,
  bornes 60min/24h, débordement 400j sans date absolue, futur → « now »).
- Suites `AgentOverviewTab` / `AgentConversationsTab` / `AgentMessagesModal` /
  `AgentLiveTab` vertes (159/159 avec le nouveau test).
- Aucune nouvelle erreur `tsc` (11 erreurs pré-existantes dans des fixtures de
  test, hors périmètre, inchangées).

## Future improvements (backlog — mis en file pour cycles suivants)

1. **Décision produit sur l'unification des deux styles** du dashboard agent
   (phrasé « 5min ago » vs compact « 5min »). La classification est désormais
   unique ; reste à décider si les tableaux « scan log » / « live » doivent
   adopter le style phrasé ou l'inverse. Touche des clés i18n visibles → hors
   périmètre d'une convergence sans-régression.
2. **Cible #1 du backlog 198 restante** : `apps/web/utils/language-utils.ts`
   (Copie A, `en → 🇺🇸`) — convergence gelée sur une décision produit du drapeau
   canonique `en` (SSOT 🇬🇧 vs 🇺🇸). La PR #2291 a fermé la Copie B (v2/flags).
3. **Cible #3 du backlog 198** : copies `formatDate` ad-hoc vs
   `apps/web/utils/date-format.ts` (~15 sites) — consolidation des dates absolues.
4. **`v2/CommentItem.tsx:formatTimestamp`** : réimplémente aussi la
   classification, mais son i18n est bloqué par l'absence totale de câblage `t`
   sur la surface v2 (anglais codé en dur partout). À traiter dans une
   itération dédiée à l'i18n de la surface v2.
