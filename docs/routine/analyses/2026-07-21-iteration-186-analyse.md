# Iteration 186 — `deepCleanTranslationOutput` (web) : l'apostrophe ASCII traitée comme guillemet corrompt les contractions françaises (`d'accord` → `d"accord`) + le strip des caractères de contrôle efface `\n`/`\t` et colle les lignes adjacentes

## Protocole (démarrage)
`main` @ `db02dac` (derniers merges : #2221 android/auth signup gate, #2218
android/auth device-locale inference, #2215 gateway/auth Unicode name
normalization — itération **185**). Branche `claude/brave-archimedes-ezoyfg`
réinitialisée sur `origin/main`. Ce cycle prend **186**.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (web/shared/gateway). Dépendances via `bun install` ; Prisma client
régénéré (`packages/shared --generator client`) ; `dist` shared rebuild.
Harnais validé ce cycle : `apps/web` jest (`translation-cleaner`).

Sélection : revue Priorité 1/3 « correctness sur le chemin Prisme ». Une revue
exhaustive de la surface TS live (utils partagés `mention-parser`,
`conversation-helpers`, `calendar-date`, `duration-format`, `language-normalize`,
`attachment-validators`, `translation-transformer`, `bounded-cache`,
`pagination`, la nouvelle route admin messages + son modal…) confirme qu'elle est
**exceptionnellement durcie** — chaque util porte les cicatrices des itérations
précédentes et est correct. Les défauts reproductibles restants vivent dans un
util **exporté mais non encore câblé** (`translation-cleaner.ts`), au cœur du
contrat « nettoyer la sortie de traduction NLLB » du Prisme.

## Current state
`apps/web/utils/translation-cleaner.ts` expose deux helpers post-traitant la
sortie de traduction NLLB avant affichage (retrait des tokens `<extra_id_N>`,
`▁`, `<pad>`…). `deepCleanTranslationOutput` applique en plus, lignes 42-48 :

```ts
.replace(/([.,!?;:])([A-Za-zÀ-ÖØ-öø-ÿ])/g, '$1 $2')  // espace après ponctuation
.replace(/["']([^"']*?)["']/g, '"$1"')                // ← ligne 44 : « normaliser guillemets »
.replace(/[\x00-\x1F\x7F-\x9F]/g, '')                 // ← ligne 46 : strip contrôle
.replace(/\s+([.,!?;:])/g, '$1');                     // espace avant ponctuation FR
```

## Problems identified
1. **Corruption des contractions françaises (ligne 44) — langue primaire du Prisme.**
   La classe `["']` traite l'apostrophe ASCII `'` comme délimiteur de guillemet.
   Or le français (langue primaire ET fallback `'fr'` de `resolveUserLanguage`)
   l'emploie massivement dans ses contractions (`l'`, `d'`, `c'`, `qu'`, `n'`).
   Tout texte à **≥2** apostrophes voit le segment entre elles réécrit en
   guillemets doubles :
   - `d'accord, c'est l'ami de Jean` → **`d"accord, c"est l'ami de Jean`**
     (le regex matche de la 1re à la 2e apostrophe : `'accord, c'` → `"accord, c"`).
   Sortie manifestement fausse sur la langue primaire.
2. **Effacement des sauts de ligne / tabulations (ligne 46).**
   `[\x00-\x1F\x7F-\x9F]` retire TOUS les caractères de contrôle C0/C1 — y compris
   `\t` (0x09), `\n` (0x0A), `\r` (0x0D). Un message multi-ligne voit ses lignes
   **collées** : `ligne un\nligne deux` → `ligne unligne deux` (mots fusionnés).
3. **Aucune couverture de test.** `translation-cleaner.ts` n'avait **aucun** fichier
   de test — les deux défauts passaient entre les mailles depuis l'origine.

## Root causes
1. Classe de caractères trop large : `'` inclus dans un normaliseur de *guillemets
   doubles*, sans distinguer apostrophe (intra-mot) et guillemet (délimiteur) — ce
   qui est impossible par simple regex, donc l'apostrophe doit être exclue.
2. Strip « caractères non imprimables » qui englobe les whitespace de contrôle
   légitimes (`\t\n\r`) au lieu de les préserver.

## Business impact
Meeshy est multilingue par conception, avec le français comme langue
primaire/fallback. Un util exporté nommé `deepCleanTranslationOutput`, dont le
but évident est de nettoyer la sortie de traduction avant affichage Prisme,
corrompt le français dès qu'il est câblé — landmine latente sur le chemin le plus
sensible du produit.

## Technical impact
Défaut de correctness dans un util public exporté, non testé. Blast radius live
nul aujourd'hui (aucun importeur — vérifié), mais le contrat est faux et se
déclencherait au premier câblage. Corriger + couvrir transforme la landmine en
util correct et protégé.

## Risk assessment
Très faible. Deux littéraux regex dans une seule fonction, sans importeur → aucune
régression possible sur d'autres modules. Le comportement légitime (retrait des
tokens NLLB, espacement de ponctuation, normalisation des guillemets DOUBLES) est
préservé et désormais caractérisé par des tests.

## Proposed improvements
1. Ligne 44 : `/["']([^"']*?)["']/g` → `/[«»“”"]([^«»“”"]*?)[«»“”"]/g`. Normalise
   les guillemets français `« »` et courbes `“ ”` vers le guillemet droit `"`,
   sans jamais toucher `'` (ni l'apostrophe courbe `’`, hors classe).
2. Ligne 46 : `/[\x00-\x1F\x7F-\x9F]/g` → `/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g`.
   Strippe les contrôles non imprimables MAIS préserve `\t` (0x09), `\n` (0x0A),
   `\r` (0x0D).
3. Nouveau `apps/web/__tests__/utils/translation-cleaner.test.ts` (13 cas).

## Expected benefits
- `d'accord, c'est l'ami de Jean` reste verbatim.
- `ligne un\nligne deux` conserve son saut de ligne (plus de mots collés).
- `«bonjour»` / `“bonjour”` → `"bonjour"` (intention originale préservée).
- Couverture de test créée pour un util auparavant nu.

## Implementation complexity
Triviale : 2 classes de caractères + docstrings + 1 fichier de test.

## Validation criteria
- `apps/web` jest `translation-cleaner` : 4 RED avant fix (apostrophe ×1,
  `\n`, `\t`, guillemets), 13/13 GREEN après.
- `tsc --noEmit` : aucune erreur sur les fichiers touchés (les erreurs
  préexistantes de `__tests__/admin/users/[id]/page.test.tsx` sont hors périmètre).

## Statut : COMPLETED

## Future improvements (hors périmètre, corroborations)
- `packages/shared/utils/validation.ts:1869` (`VoiceModelSchemas.create.language`)
  et `:2201` (`AnonymousParticipantSchemas.join.language`) : bare `z.string().min(2).max(5)`
  divergent de `CommonSchemas.language` (`.max(6).regex(...)`, relevé itér. 184 pour
  `bas-CM`). Schémas actuellement **non référencés** (dead code) → délégation à
  `CommonSchemas.language` = nettoyage de dette, à confirmer comme cycle futur.
- `translation-cleaner.ts` reste non câblé : si un futur cycle confirme qu'il ne
  sera jamais utilisé, envisager sa suppression (réduction de dette) plutôt que
  son maintien.
