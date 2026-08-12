# Iteration 105 — Analyse d'optimisation (2026-07-05)

## Protocole (démarrage)
`main` @ `cb2ba06` (« Merge PR #1494 — brave-archimedes-fo6hrw / F68 initiales emoji »), working tree
propre après `git checkout -B main origin/main`. Branche de travail `claude/brave-archimedes-5sc6q5`
recréée depuis `origin/main`, 0 commit non-mergé à préserver.

**2 PR ouvertes au démarrage :**
- **#1497** (`claude/ecstatic-archimedes-lthq8x`) — gateway `community-preferences.ts` +
  web `use-socket-cache-sync.ts` + shared `socketio-events.ts` (F71, broadcast de préférences
  communauté). Cette PR a réservé le libellé « itération 104 ».
- **#1496** (`claude/apps/android/profile-stats-room-cache`) — Android uniquement (`apps/android/**`).

Les deux sont **disjointes** de la cible retenue ici (`services/gateway/src/utils/normalize.ts`).
Pour éviter la collision de numéro avec #1497, ce cycle est **itération 105**.

### Revue d'ingénierie (constat de démarrage)
Balayage ciblé (agent d'exploration) des fonctions **pures** peu contestées, hors zones déjà traitées
en itérations 100-103 (`truncate`, `format-number`, `initials`, `xss-protection`,
`translation-cleaner`, `calendar-date`, `mention-parser`, `conversation-helpers`, `duration-format`,
`relative-time`, `time-remaining`, `presence-format`, `date-format`) et hors fichiers des PR ouvertes.
Trois défauts non ambigus remontés, dont deux **dans le même fichier**
(`services/gateway/src/utils/normalize.ts`) et sur le **même chemin métier** (normalisation des données
d'inscription `normalizeUserData` → `AuthService.registerUser`). Regroupés ici sous **F72**.

Candidats écartés (documentés) : `validatePhoneNumber` web (rejet des E.164 à 15 chiffres — réel mais
laissé pour un cycle dédié, module web distinct) ; `getUserStatus` (comportement « stale online → away »
explicitement asserté comme intentionnel) ; `mention-display.ts` (divergence réelle mais **code mort**,
0 appelant).

## Cible : F72 — `capitalizeName` et `normalizeDisplayName` mutilent les noms composés et laissent passer `\r`

### Current state
`services/gateway/src/utils/normalize.ts` normalise les champs d'inscription. Deux helpers **purs**,
tous deux consommés par `normalizeUserData` (l.196-220), lui-même appelé par
`AuthService.ts:471-473` à la création de compte (dont dérive `displayName`) :

**F72a — `capitalizeName` (l.165-174)** : mettait la 1ʳᵉ lettre de chaque **mot séparé par un espace**
en majuscule, le reste en minuscules. Découpe `.split(' ')` **uniquement sur l'espace** :
```ts
name.trim().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
```

**F72b — `normalizeDisplayName` (l.181-183)** : devait garantir un affichage **sur une seule ligne**
(JSDoc : « Enlève … les retours à la ligne/tabulations ») mais la classe `[\n\t]` **omet `\r`** :
```ts
displayName.trim().replace(/[\n\t]/g, '');
```

### Problems identified
- **[LIVE, produit francophone] Casse-mixte faux pour tout nom à tiret ou apostrophe.**
  `capitalizeName('Jean-Pierre')` → `'Jean-pierre'` ; `"O'Brien"` → `"O'brien"` ;
  `'Marie-Claire'` → `'Marie-claire'`. Ces noms **passent** la validation d'inscription
  (`AuthSchemas.register` firstName/lastName = `/^(?=.*\p{L})[\p{L}\s'.-]+$/u`,
  `validation.ts:337-339`) puis sont mal capitalisés et persistés.
- **[LIVE] Incohérence intra-utilisateur prouvée.** Le test d'intégration existant
  (`normalize.test.ts` scénario « French user data ») alimentait `firstName: 'JEAN-PIERRE'` et
  `displayName: 'Jean-Pierre Dupont'` sur **le même enregistrement** : le `firstName` ressortait
  `'Jean-pierre'` tandis que le `displayName` (via `normalizeDisplayName`, qui ne touche pas la casse)
  restait `'Jean-Pierre Dupont'`. Deux graphies du même nom pour un seul compte — la preuve que
  `'Jean-pierre'` est un **défaut**, pas une intention.
- **[LIVE, fins de ligne Windows] `\r` survit dans le displayName.**
  `normalizeDisplayName('Test\r\nUser')` → `'Test\rUser'` (caractère de contrôle embarqué, casse le
  rendu mono-ligne). Un `\r` seul (Mac historique / copier-coller) survit également. Le test existant
  « should remove carriage return-newline combination » **assertait la sortie buggée** `'Test\rUser'`
  alors que son intitulé décrit le comportement correct.

### Root cause
- **F72a** : la découpe ne reconnaissait qu'**un seul** séparateur de segment (l'espace), alors que
  l'ensemble des caractères non-lettres autorisés dans un nom est `[\s'.-]` (source : le charset de
  `AuthSchemas.register`). Tout segment après `-`, `'` ou `.` était forcé en minuscules.
- **F72b** : classe de caractères incomplète — `[\n\t]` ignore `\r`, alors que `\r\n` (Windows) et `\r`
  seul (Mac historique) sont des fins de ligne courantes.

### Business impact
Noms composés omniprésents en clientèle francophone (Jean-Pierre, Marie-Claire, O'Brien, noms bretons
à apostrophe). Chaque inscription concernée stocke une graphie dégradée, visible partout où le prénom
est rendu (profil, listes de membres, mentions, en-têtes). Atteinte directe à la qualité perçue et à la
confiance (« mon nom est mal écrit »).

### Technical impact
Corrige la **source unique** de capitalisation et de mono-ligne des données d'inscription — aucune
autre couche ne re-corrige la casse en aval. Rétablit la cohérence `firstName`/`displayName`.

### Risk assessment
Très faible. Deux fonctions pures, sans I/O, sans changement de signature. La nouvelle
`capitalizeName` **préserve à l'identique** tout le comportement existant vérifié par la suite
(mots multi-espaces, préfixes non-alphabétiques `'3john'`, casse simple, trim). Seuls deux tests
**codifiaient le bug** (`'Jean-pierre'`, `'Test\rUser'`) et sont corrigés vers l'intention documentée.

### Proposed improvements
- **F72a** : capitaliser la 1ʳᵉ lettre de chaque segment via
  `.toLowerCase().replace(/(^|[\s'.-])(\p{L})/gu, (_, sep, l) => sep + l.toUpperCase())` — reconnaît
  début-de-chaîne + espace/tiret/apostrophe/point, préserve accents (`\p{L}`), multi-espaces et
  préfixes numériques.
- **F72b** : `replace(/[\r\n\t]/g, '')` — ajoute `\r` à la classe.
- JSDoc des deux fonctions mise à jour (contrat explicite).
- Mock `normalize` de `AuthService.test.ts` (l.118-124) réaligné sur la nouvelle implémentation réelle
  pour éviter toute dérive mock/prod.

### Expected benefits
- Noms composés correctement capitalisés partout (`Jean-Pierre`, `O'Brien`, `Marie-Claire D'Arc`).
- Cohérence `firstName` ↔ `displayName` rétablie.
- Aucun caractère de contrôle de fin de ligne (`\r`) dans un displayName.

### Implementation complexity
Faible (2 fonctions pures, ~4 lignes nettes + 8 tests). Aucun changement de signature/contrat public.

### Validation criteria
- [x] RED prouvé d'abord (repro Node, impl copiée verbatim) : `capitalizeName('Jean-Pierre')` →
      `'Jean-pierre'`, `normalizeDisplayName('Test\r\nUser')` → `'Test\rUser'`.
- [x] GREEN Node (fix + non-régression sur 11 cas ASCII/accents/multi-espaces) : toutes correctes.
- [x] GREEN jest gateway : `normalize.test.ts` **126/126** (dont 6 nouveaux cas `capitalizeName`
      tiret/apostrophe/accent + 1 cas `normalizeDisplayName` `\r` seul + 1 assertion d'intégration
      corrigée), `AuthService.test.ts` **115/115**, `profile-extended.test.ts` **36/36**.

## Candidats écartés ce cycle (documentés)
- **`validatePhoneNumber` (`apps/web/utils/phone-validator.ts:38`)** : plafond `length > 15` compte le
  `+` comme un caractère → rejette les E.164 à **15 chiffres** (16 car. avec `+`). Réel, appelé à
  l'inscription web (`use-register-form.ts:133`). Laissé à un **cycle dédié** (module web distinct,
  requiert de trancher entre plafond en chiffres vs caractères et l'alignement du commentaire de spec).
- **`getUserStatus`** : « stale isOnline=true → away » asserté intentionnel (`user-status.test.ts:66`).
- **`mention-display.ts`** : divergence de word-boundary vs le parser SSOT, mais **0 appelant** (mort).

## Améliorations futures (report)
- **F73** (LOW, neuf) : `validatePhoneNumber` web — plafond E.164 en chiffres, pas en caractères.
- **F69** (LOW) : `sanitizeFileName` plafond 255 sur nom sans extension (latent, 0 appelant).
- **F70** (LOW) : `deepCleanTranslationOutput` apostrophes FR (code mort, 0 appelant).
- **F72c** (LOW, neuf) : parité iOS/Android de la capitalisation des noms composés à l'inscription
  (vérifier que les clients natifs ne re-capitalisent pas naïvement sur l'espace seul).
