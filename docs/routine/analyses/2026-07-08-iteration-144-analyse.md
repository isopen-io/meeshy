# Iteration 144 — Analyse d'optimisation (2026-07-08)

## Protocole (démarrage)
`main` @ `d36707e5` (dernier merge des bumps dépendances translator, PR #1673). Branche
`claude/brave-archimedes-9t9tl2` recréée depuis `origin/main`. PRs ouvertes : dependabot (#1677-1691)
+ deux PRs humaines (#1684 android, #1685 gateway realtime) — hors périmètre autonome. Ce cycle prend
**144** et corrige **deux bugs de fonctions pures indépendants** découverts par fan-out multi-agents
(Priorité 3 : homogénéisation qualité des helpers, avec impact UX/observabilité direct).

Fan-out : deux agents Explore parallèles sur (a) `services/gateway/src/{services,routes}`, (b)
`packages/shared/utils` + `apps/web/{utils,hooks}`. Chacun devait remonter **un** bug de logique pure,
haute confiance, non couvert par les tests existants. Deux cibles retenues : **F111** (web) et **F112**
(gateway).

---

## Cible F111 — `groupNotificationsByDate` : le bucket « This week » s'effondre chaque jour d'ancrage (dimanche)

### Current state
`apps/web/utils/notification-helpers.ts:292`. Fonction pure qui regroupe les notifications du centre de
notifications (`components/notifications/NotificationList.tsx`) en 5 tranches : *today / yesterday /
this week / this month / older*. Avant fix :

```ts
const now = new Date();
const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
const startOfYesterday = new Date(startOfToday.getTime() - 86400000);
const startOfWeek = new Date(startOfToday.getTime() - startOfToday.getDay() * 86400000); // ← ligne 299
const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
```

Puis affectation en cascade `today → yesterday → thisWeek (time >= startOfWeek) → thisMonth → older`,
les groupes vides étant supprimés.

### Problems identified
`Date.getDay()` vaut **0 le dimanche**. Le dimanche, `startOfWeek = startOfToday - 0 = startOfToday` :
le test « this week » (`time >= startOfWeek`) couvre exactement la même borne que « today » (testé en
premier). Le bucket **« This week » devient structurellement inatteignable chaque dimanche** ; toute
notification vieille de 2 à 6 jours tombe directement dans « This month ».

Défaut secondaire même quand `getDay() != 0` : l'ancien calcul était une **semaine calendaire ancrée
au dimanche**, donc le bucket variait selon le jour de la semaine (un mercredi, une notif de vendredi
dernier — J-5 — retombait déjà dans « This month »). Comportement incohérent d'un jour à l'autre.

Défaut tertiaire : `startOfYesterday`/`startOfWeek` dérivés par soustraction d'un `86400000` fixe depuis
un minuit local — dérive d'une heure les jours de transition DST. Le fichier importait *déjà*
`startOfLocalDayMs` de la SSOT DST-safe `packages/shared/utils/calendar-date.ts` (utilisée par
`formatContentPublishedAt` dans le même fichier), mais `groupNotificationsByDate` ré-implémentait
l'arithmétique à la main — violation de la règle SSOT (CLAUDE.md « Single Source of Truth »).

### Root causes
Regroupement écrit avant l'introduction de la SSOT `calendar-date.ts` (iter 44) et jamais migré. Le
mélange de sémantiques (today/yesterday relatifs à *now*, mais week ancré au calendrier) a créé
l'angle mort du jour d'ancrage.

### Business impact
Reproductible **chaque dimanche** pour tout utilisateur : les notifications des jours récents de la
semaine écoulée sautent « This week » et apparaissent sous « This month », noyées loin en bas de la
liste. Perte de discoverabilité du contenu récent un jour sur sept, plus une incohérence perçue de
regroupement selon le jour de consultation.

### Technical impact
Bucket mort + dépendance à `getDay()` fragile + arithmétique DST-non-safe dupliquée hors SSOT.

### Proposed improvement
Basculer le découpage jour-à-jour sur la SSOT `calendarDayDiff(targetMs, nowMs)` (déjà DST-safe,
déterministe, injectable) et faire de « This week » une **fenêtre glissante de 7 jours** (jours J-2 à
J-6) au lieu d'une semaine calendaire ancrée :

```ts
const dayDiff = calendarDayDiff(time, nowMs);
if (dayDiff <= 0)        today
else if (dayDiff === 1)  yesterday
else if (dayDiff <= 6)   thisWeek
else if (time >= startOfMonth) thisMonth
else                     older
```

`now` devient un 3e paramètre optionnel (`= new Date()`) — non-breaking, rend le regroupement
déterministe en test (même convention d'injection que `calendarDayDiff`).

### Expected benefits
- Bucket « This week » atteignable **tous les jours** (plus d'effondrement dominical).
- Regroupement cohérent quel que soit le jour de consultation et la locale (fin du débat dimanche vs
  lundi : fenêtre glissante = neutre).
- DST-safe et aligné sur la SSOT (`calendarDayDiff`), suppression de l'arithmétique manuelle dupliquée.

### Validation criteria
- Un item J-3 est classé `thisWeek` **même un dimanche** (RED sur l'ancien code → `thisMonth`).
- Un item J-5 un mercredi est classé `thisWeek` (cohérence milieu de semaine).
- Bornes today/yesterday/thisWeek/thisMonth/older correctes ; ordre canonique + suppression des
  groupes vides préservés.

### Complexity / Risk
Faible. Une fonction pure, signature élargie de façon rétro-compatible, 15 assertions ajoutées.

---

## Cible F112 — `mergeClientHeaders` : `location` incohérente avec un override `country`/`city` partiel

### Current state
`services/gateway/src/services/GeoIPService.ts:266-281`. Fusionne le geo déduit IP/UA avec les headers
`X-Meeshy-*` envoyés par le client iOS. Contrat documenté (l.229-230) : *« Les valeurs client ont
priorité sur la déduction UA/IP »*. Avant fix :

```ts
location: city && country ? `${city}, ${country}` : (geoData?.location ?? null),
```

### Problems identified
`location` n'est recalculée que si **`city` ET `country`** sont tous deux présents *dans les headers*.
Un override partiel (ex. `x-meeshy-country: US` seul, cas VPN) écrase bien `country`, mais `location`
retombe sur la valeur stale déduite de l'IP — l'objet fusionné se contredit :
`country === 'US'` alors que `location === 'Paris, FR'`.

### Root causes
Le calcul de `location` lisait le **couple brut des headers** plutôt que le résultat post-fusion.
`GeoIPService.ts` exposait déjà un helper `formatLocation(city, country)` (l.289) — la logique correcte
existait mais n'était pas réutilisée ici (duplication + divergence).

### Business impact
Modéré. Tout consommateur affichant `geoData.location` (ligne « lieu de connexion » du contexte
sécurité/session via `getRequestContext`) montre le pays IP au lieu du pays affirmé par le client —
incohérence visible pour les utilisateurs VPN / à locale déclarée.

### Technical impact
Objet auto-contradictoire ; logique de format dupliquée hors du helper dédié.

### Proposed improvement
Recalculer `location` depuis la city/country **fusionnées** (post-priorité) via le helper existant :

```ts
const mergedCity    = city    || geoData?.city    || null;
const mergedCountry = country || geoData?.country || null;
location: formatLocation(mergedCity, mergedCountry) ?? geoData?.location ?? null,
```

### Expected benefits
`location` toujours cohérente avec le `country`/`city` gagnant de la fusion ; réutilisation du helper
`formatLocation` (DRY).

### Validation criteria
- Override `country` seul sur un geoData existant → `location` reflète le nouveau country (RED avant
  fix → stale).
- Override `city` seul → `location` reflète la nouvelle city.
- Cas existants (les deux headers, aucun header) inchangés.

### Complexity / Risk
Très faible. Fonction pure, réutilisation d'un helper déjà présent, 2 assertions ajoutées.

---

## Vérification
- `apps/web` : `bunx jest __tests__/utils/notification-helpers.test.ts` → **78/78** (dont 15 nouveaux).
- `services/gateway` : `bunx jest src/__tests__/unit/services/GeoIPService.test.ts` → **6/6** (dont 2
  nouveaux).
- `tsc --noEmit` : aucune erreur nouvelle référençant les fichiers modifiés (les 1203 erreurs
  pré-existantes du typecheck web concernent des fichiers de test admin non liés, présentes à
  l'identique sur `main`).
