# Iteration 197 — Dernière copie divergente **active** du libellé « dernière connexion » : `contacts/page.tsx` réimplémente localement `formatLastSeen` (isOnline brut → désaccord avec la pastille, math de jour en fenêtres de 24 h écoulées, heure perdue au-delà de 24 h) ; + suppression de la copie **morte** jumelle dans `lib/contacts-utils.ts`

## Protocole (démarrage)
`main` @ `49d5f591` (derniers merges : #2281 web/users délègue display-name/
initials/last-seen aux SSOT — itération **196** ; #2280 android/auth content-
language picker ; #2279 gateway/email + web/v2 normalize language codes —
itération 195). Branche `claude/brave-archimedes-evtjjq` réinitialisée sur
`origin/main`. Ce cycle prend **197**.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (web/shared/gateway). `packages/shared` construit (`dist`) car le jest
web mappe `@meeshy/shared/(.*)` → `packages/shared/dist/$1`. (Prisma non généré
dans ce conteneur — download engine bloqué par le proxy ; sans impact : le
correctif est **web-only** et ne touche aucun type Prisma.)

PRs ouvertes au démarrage : #2284/#2282/#2278/#2276/#2275 (swarms iOS story/
a11y), #2283 (android/auth token-refresh core), #2269 (CI iOS release ANDP) —
toutes gérées par d'autres swarms, **non touchées** (aucune ne concerne la
surface TypeScript de cette itération).

Sélection : **Priorité 1 — continuation directe et explicitement mise en file
par l'itération 196.** Le plan 196 (`Future improvements`) nommait exactement ces
deux cibles :
> - `apps/web/lib/contacts-utils.ts:formatLastSeen` est une 3ᵉ copie divergente
>   **morte** (aucun importeur) — candidate à suppression.
> - `app/(connected)/contacts/page.tsx:54` porte une 4ᵉ `formatLastSeen` locale
>   **active** — à recâbler sur `formatPresenceLabel` dans un cycle suivant.

L'itération 196 a recâblé `users.service.ts` (3 SSOT). Cette itération ferme la
**même classe de défaut** (libellé de présence divergent) sur les **deux
derniers sites** connus.

## Current state

Le libellé « dernière connexion » (« En ligne » / « Vu il y a X » / « Vu hier à
HH:mm ») possède un SSOT web unique — `apps/web/utils/presence-format.ts`
→ `formatPresenceLabel` — déjà adopté par `users.service.ts`, `u/[id]/page.tsx`
et `ContactLastSeenLabel.tsx` (itérations ≤196). Deux copies locales le
réimplémentent encore et en ont divergé.

### 1. `app/(connected)/contacts/page.tsx:54` — copie ACTIVE (impact réel)
```ts
function formatLastSeen(t, locale, isOnline: boolean, lastActiveAt?: string): string {
  if (isOnline) return t('status.online');                          // isOnline BRUT
  if (!lastActiveAt) return t('status.neverSeen');
  const last = new Date(lastActiveAt).getTime();
  if (Number.isNaN(last)) return t('status.offline');
  const diffMin = Math.floor((Date.now() - last) / 60_000);
  if (diffMin < 1) return t('status.justNow');
  if (diffMin < 60) return t('status.minutesAgo', { count: diffMin });
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return t('status.hoursAgo', { count: diffH });
  const diffD = Math.floor(diffH / 24);                             // jours ÉCOULÉS
  if (diffD < 7) return t('status.daysAgo', { count: diffD });
  return t('status.lastSeenDate', { date: new Date(lastActiveAt).toLocaleDateString(locale) });  // PAS d'heure
}
```
Consommée à la l.230 (`meta={formatLastSeen(...)}`) sur **chaque ligne de
contact** de la route `(connected)/contacts`. Divergences réelles :

- **`isOnline` brut → libellé désaccordé de la pastille juste à côté.** La même
  ligne rend la pastille via `useLiveUserStatus` → `getUserPresenceStatus`
  (règle canonique 1/3/5) et `<OnlineIndicator isOnline={status === 'online'} …>`.
  Or `formatLastSeen` teste `isOnline` brut :
  - **Input** `{ isOnline: true, lastActiveAt: il y a 10 min }` : le libellé dit
    « En ligne », mais `getUserPresenceStatus` traite le `isOnline` périmé
    (>5 min) comme **offline** → la pastille dit « hors ligne ». Texte et point
    se contredisent sur la même ligne.
  - **Input** `{ isOnline: false, lastActiveAt: il y a 30 s }` : le libellé dit
    « À l'instant » (bucket passé), mais `getUserPresenceStatus` classe
    l'activité < 60 s comme **online** → la pastille est verte. Incohérence
    inverse.
- **Math de jour en fenêtres de 24 h écoulées (`diffH/24`), non calendaire.**
  `calendarDayDiff` (SSOT, DST-safe) n'est pas utilisé → off-by-one vs le reste
  de l'app (`u/[id]`, `ContactLastSeenLabel` affichent « hier » là où la liste
  affiche « il y a 1 j »).
- **Heure perdue au-delà de 24 h.** La branche finale rend `status.lastSeenDate`
  (date seule) là où le SSOT rend `status.lastSeenYesterday` / `…BeforeYesterday`
  / `…DateTime` **avec l'heure exacte** — contrat partagé avec iOS
  `RelativeTimeFormatter`. Le même utilisateur affiche « Vu le 14/01 » dans la
  liste et « Vu hier à 23:00 » ailleurs.
- **Famille de clés i18n dupliquée** (`justNow`/`minutesAgo`/`hoursAgo`/
  `daysAgo`/`lastSeenDate`) vs celle du SSOT (`lastSeenMinutes`/`lastSeenHours`/
  `lastSeenYesterday`/`lastSeenBeforeYesterday`/`lastSeenDateTime`) — deux jeux
  de traduction pour un seul concept.

### 2. `lib/contacts-utils.ts:formatLastSeen` — copie MORTE jumelle
Même classe de divergence (`isOnline` brut, `Math.floor(diffMs/86400000)`
jours écoulés, « daysAgo » jusqu'à 7 puis date sans heure, aucune garde NaN).
**Zéro importeur** : `grep -rn "contacts-utils"` (hors le fichier) ne renvoie
rien ; l'autre export du fichier (`getUserDisplayName`) est également mort et se
contentait de déléguer à `@/utils/user-display-name`. Précédent identique :
`apps/web/utils/time-remaining.ts` documente une copie morte supprimée à l'iter
60. Le fichier entier est du code mort divergent → suppression.

(Le composant `components/contacts/ContactsList.tsx` reçoit `formatLastSeen` en
**prop** — il n'importe pas `contacts-utils` — et n'est lui-même monté nulle
part ; il reste hors périmètre ici, indépendant de cette suppression. Noté en
`Future improvements`.)

## Root causes
`formatLastSeen` écrite dans la page (et dans `contacts-utils`) avant
l'extraction du SSOT `presence-format.ts` (itérations profil/last-seen 2026-06),
jamais recâblée lors des vagues de convergence 196. Le SSOT a depuis reçu la
règle de présence partagée (`getUserPresenceStatus`, garde contre `isOnline`
périmé) + la math de jour calendaire + l'heure exacte, que les copies locales
n'ont pas suivies → dérive silencieuse.

## Business impact
- **Moyen-élevé.** Sur une surface sociale, la liste de contacts est un écran
  à fort trafic. Un libellé « En ligne » collé à une pastille « hors ligne » (ou
  l'inverse) érode la confiance dans la donnée de présence — cœur d'un produit
  de messagerie. La perte de l'heure exacte au-delà de 24 h dégrade
  l'information (« Vu le 14/01 » vs « Vu hier à 23:00 »).

## Technical impact
- Élimine les **2 derniers** sites divergents connus du libellé de présence →
  convergence totale sur `formatPresenceLabel`.
- Toute évolution future de la règle de présence / des clés i18n ne se propage
  plus qu'en **un** point.
- Introduit `formatLastSeenLabel` (wrapper tolérant nullable/illisible) dans le
  SSOT — empêche la ré-émergence de la garde `!lastActiveAt → neverSeen` /
  `NaN → offline` en copies locales (l'anti-pattern même combattu ici).

## Risk assessment
**Faible.**
- `formatPresenceLabel` + `getUserPresenceStatus` sont des SSOT purs, testés,
  déjà en prod. Le nouveau wrapper `formatLastSeenLabel` ne fait qu'ajouter les
  gardes null/NaN puis déléguer.
- Les clés i18n canoniques (`status.lastSeenMinutes/Hours/Yesterday/
  BeforeYesterday/DateTime` + `online`/`neverSeen`/`offline`) existent **déjà**
  dans les 4 locales sous le namespace `contacts` utilisé par la page
  (`useI18n('contacts')`) → migration transparente, aucune clé ajoutée.
- Signature publique de la page inchangée (helper local supprimé, remplacé par
  un appel au SSOT). Suppression de `contacts-utils.ts` sans importeur → aucun
  blast radius.

## Proposed improvements
1. **`presence-format.ts`** : ajouter `formatLastSeenLabel(o)` — nullable/illisible
   tolérant : `lastActiveAt` absent → `status.online` si la règle canonique
   classe en ligne (backend `isOnline` autoritatif) sinon `status.neverSeen` ;
   NaN → `status.offline` ; sinon délègue à `formatPresenceLabel`.
2. **`contacts/page.tsx`** : supprimer le helper local `formatLastSeen` + le type
   `TFn` (devenu inutilisé) ; importer et appeler `formatLastSeenLabel`.
3. **`lib/contacts-utils.ts`** : supprimer le fichier (code mort divergent, zéro
   importeur).

## Expected benefits
- Libellé de présence de la liste de contacts toujours accordé à la pastille.
- Math de jour calendaire + heure exacte alignées sur le reste de l'app et iOS.
- Zéro copie divergente restante du libellé de présence ; un seul chemin.

## Implementation complexity
**Faible.** 2 fichiers de production modifiés (`presence-format.ts`,
`contacts/page.tsx`), 1 fichier supprimé (`contacts-utils.ts`), 1 fichier de
test nouveau. Aucun changement de schéma, d'API, de dépendance, ni de clé i18n.

## Validation criteria
- **Comportement corrigé prouvé** (`presence-format.test.ts`) : isOnline périmé
  (10 min) → `lastSeenMinutes:10` (≠ ancien `status.online`) ; activité 30 s
  isOnline=false → `status.online` (≠ ancien `status.justNow`) ; « hier » /
  « avant-hier » / date **avec heure**.
- Gardes : absent+online → `online`, absent+offline → `neverSeen`, NaN →
  `offline`.
- Suites existantes vertes : `users.service.test.ts`, `ContactLastSeenLabel.test`,
  `UserPresenceLabel.test`, `use-contacts-filtering.test` (63/63).
- Aucune erreur `tsc` introduite sur les fichiers modifiés (le bruit de fond
  `TS7031` dans `__tests__/admin/**` est pré-existant, indépendant, dû à la
  config tsc directe — ne référence aucun fichier de cette itération).
