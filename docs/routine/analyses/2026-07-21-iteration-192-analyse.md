# Iteration 192 — `formatConversationDate` (web) : un timestamp futur (décalage d'horloge client) s'affiche avec un jour de semaine au lieu de l'heure seule

## Protocole (démarrage)
`main` @ `b8265154` (derniers merges : #2266 web/link-name dette documentaire —
itération **191** ; #2267 android/auth recovery). Branche
`claude/brave-archimedes-eql36f` alignée sur `origin/main`. Ce cycle prend
**192**.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (web/shared/gateway). PRs ouvertes au démarrage : swarm iOS a11y
(`laughing-thompson`, #2261/#2263 CallView VoiceOver duration) — gérées par un
autre swarm, **non touchées** (aucune ne concerne la surface TypeScript).

Sélection : **Priorité 1/2 (correctness sur helper de rendu de date actif)**.
`formatConversationDate` a été unifié à l'itération 44 (extraction de
`calendarDayDiff` dans `packages/shared/utils/calendar-date.ts`, source unique de
l'arithmétique « jour calendaire local »). En repassant sur cette surface, un
défaut de comportement réel exposé sur la **branche future/décalage d'horloge**,
jamais couvert par les tests existants (qui ne testent que des dates passées).

## Current state
`apps/web/utils/date-format.ts` → `formatConversationDate` formate la date d'un
dernier message pour la liste de conversations et deux widgets dashboard :
- Aujourd'hui → `"HH:mm"`
- Hier → `"Hier HH:mm"`
- < 7 jours → `"Jour HH:mm"` (ex. `"Mer. 00:10"`)
- ≥ 7 jours → date complète

Consommateurs réels (3 sites) : `ConversationItem.tsx:187`,
`ConversationsWidget.tsx:79`, `CommunitiesWidget.tsx:80`.

La décision de branche repose entièrement sur
`diffDays = calendarDayDiff(messageDate, now)`, où
`calendarDayDiff(target, now) = localDayIndex(now) − localDayIndex(target)` :
**positif = passé, négatif = futur**.

## Problems identified
1. **Aucun garde pour `diffDays < 0` (timestamp futur).** Les branches sont :
   `diffDays === 0` (aujourd'hui), `=== 1` (hier), `< 7` (semaine), sinon date
   complète. Un `diffDays` **négatif** (message daté sur un jour calendaire local
   **postérieur** à `now`) rate `=== 0` et `=== 1`, mais **matche `< 7`**
   (`-1 < 7` est vrai) → rendu avec un **jour de semaine** au lieu de l'heure
   seule.

   Reproduction (prouvée en test, RED) : horloge client en retard sur le serveur
   à cheval sur minuit → un message tout juste reçu porte un timestamp
   « demain 00:10 » relatif au client. `calendarDayDiff` renvoie `-1` →
   `formatConversationDate` rend **`"Mer. 00:10"`** au lieu de **`"00:10"`**.

## Root causes
- Sur-spécification passé-only : les 3 gardes (`=== 0`, `=== 1`, `< 7`) ont été
  écrites en supposant `diffDays ≥ 0`, sans traiter le domaine négatif que
  `calendarDayDiff` peut légitimement produire (décalage d'horloge, skew
  serveur/client, timestamp optimiste local en avance).
- Asymétrie avec le sibling `formatRelativeDate` (même fichier) : celui-ci est
  **immunisé** par accident — son garde `diffMinutes < 1 → justNow` (ligne 50)
  capture tout timestamp futur **avant** d'atteindre sa propre branche
  `diffDays < 7` identique. `formatConversationDate` n'a **aucun** garde
  antérieur équivalent.

## Business impact
Direct et visible : la liste de conversations est l'écran d'entrée principal. Un
horodatage aberrant (« Mer. 00:10 » pour un message de l'instant) sur la ligne du
dernier message dégrade la confiance et la lisibilité. Le décalage d'horloge
client sur frontière de minuit est un cas réel et récurrent sur mobile/web.

## Technical impact
Surface strictement localisée (1 helper + son fichier de test). Aucune signature,
aucun type modifié. Le fix aligne `formatConversationDate` sur l'intention
documentée (« Aujourd'hui : HH:mm ») en traitant « aujourd'hui **ou dans le
futur** » de manière homogène (heure seule) — dégradation gracieuse identique en
esprit à celle du sibling (`justNow` pour le futur).

## Risk assessment
Minimal. Le changement est un élargissement de garde : `if (diffDays === 0)` →
`if (diffDays <= 0)`. Les dates passées (`diffDays ≥ 1`) empruntent exactement
les mêmes branches qu'avant — aucun des 25 tests existants (tous sur du passé) ne
change de résultat (prouvé : suite verte avant/après). Seule la branche future,
auparavant boguée, est corrigée.

## Proposed improvements
1. Traiter `diffDays <= 0` (aujourd'hui **ou** futur) → heure seule dans
   `formatConversationDate`.
2. Ajouter une assertion RED→GREEN prouvée : un timestamp « demain 00:10 » doit
   rendre `"HH:mm"` (heure seule), pas un jour de semaine.

## Expected benefits
- La liste de conversations n'affiche plus jamais un jour de semaine pour un
  message à l'horodatage futur/décalé — heure seule, cohérent avec « aujourd'hui ».
- Couverture réelle de la branche future (jusqu'ici non testée).
- Homogénéité de doctrine avec `formatRelativeDate` (le futur dégrade vers un
  rendu « présent », jamais vers un faux passé).

## Implementation complexity
Triviale — un opérateur de comparaison + 1 test + commentaire d'intention.
Aucune migration, aucun changement d'API.

## Validation criteria
- RED prouvé : le test « future date » échoue sur le code actuel
  (`"Mer. 00:10"` ≠ `/^\d{2}:\d{2}$/`).
- GREEN : suite `date-format.test.ts` verte (26/26).
- Non-régression : `__tests__/utils/` (976 tests) vert hormis
  `user-language-preferences.test.ts` — échec **préexistant/environnemental**
  (mock `@meeshy/shared` non résolu car dist non buildé dans le sandbox ;
  reproduit sans mes changements ; CI build shared en amont).

## Options écartées ce cycle
- **Étendre le fix à `formatRelativeDate`** : déjà immunisé par le garde
  `diffMinutes < 1 → justNow` — le futur y rend `justNow`, bénin (jamais de faux
  jour de semaine). Le toucher serait du bruit sans gain de correction. Non touché.
- **Clamp/rejet des timestamps futurs en amont (validation d'entrée)** : hors
  scope d'un helper de présentation pur ; le rendu doit rester tolérant aux
  entrées légitimement futures (skew) sans exiger de pré-validation des callers.

## Future improvements (itération 193+)
- **`getLanguageInfo` (shared) — fallback `region: 'Europe'` pour langue
  inconnue** : sémantiquement faux (un code inconnu n'est pas européen), mais
  actuellement **inerte** (`getLanguagesByRegion` ne filtre que
  `SUPPORTED_LANGUAGES`). À revisiter seulement si un consommateur observe la
  `region` du fallback.
- **`getLanguageInfo` normalisation BCP-47** : `getLanguageInfo('fr-FR')` tombe
  sur le fallback globe au lieu du français, là où `normalizeLanguageCode`
  canonise déjà `'fr-FR' → 'fr'`. Le câbler créerait un **import circulaire**
  (`language-normalize` importe `languages`) — nécessiterait d'extraire la table
  `SUPPORTED_CODES` en amont. Reporté (refactor structurel, pas trivial).
- **Parité sentinelle `'unknown'` iOS/Android** (reporté de 190/191) : vérifier
  l'insensibilité à la casse côté miroirs.
