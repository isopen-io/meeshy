# Iteration 193 — `v2/flags` (web) : quatre copies divergentes de `FLAG_MAP`/`getFlag` → le même code de langue rend un drapeau différent selon le type de média (image/audio vs vidéo)

## Protocole (démarrage)
`main` @ `8f81d209` (derniers merges : #2268 web/date-format rendu heure-seule
pour timestamp futur — itération **192** ; #2270 android/auth JWT-expiry decoder).
Branche `claude/brave-archimedes-rchx4f` réinitialisée sur `origin/main`. Ce
cycle prend **193**.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (web/shared/gateway). PRs ouvertes au démarrage : swarm iOS a11y
(`laughing-thompson`) — gérées par un autre swarm, **non touchées** (aucune ne
concerne la surface TypeScript de cette itération).

Sélection : **Priorité 1 (feature récemment développée) + correctness +
duplication**. Les composants média v2 (`MediaImageCard`, `MediaAudioCard`,
`MediaVideoCard`) rendent le drapeau de la langue de traduction/transcription.
En auditant la résolution de langue (continuité des itérations 190-192 sur les
utilitaires de langue), un défaut de duplication actif a été exposé : **quatre
copies indépendantes** de la même paire `FLAG_MAP` + `getFlag`, dont une a
divergé.

## Current state
`apps/web/components/v2/flags.ts` exporte la paire canonique `FLAG_MAP` (20
langues) + `getFlag(code)` (+ `LANGUAGE_NAMES` + `getLanguageName`). Elle est le
point de vérité déclaré (« Extracted from MessageBubble for reuse across
TranslationToggle, PostCard, etc. ») et est effectivement importée par
`MessageBubble`, `TranslationToggle`, `PostCard`, `PostDetail`, `StatusBar`.

Mais **trois** composants média redéclarent localement leur propre `FLAG_MAP` +
`getFlag`, byte-identiques dans le corps de `getFlag` (`slice(0,2)` + lookup) :
- `MediaImageCard.tsx:36` / `:59`
- `MediaAudioCard.tsx:62` / `:89`
- `MediaVideoCard.tsx:46` / `:78`

## Problems identified
1. **Divergence active des tables → drapeau incohérent selon le type de média.**
   Les 4 copies ont chacune 20 clés, mais **pas le même ensemble** :
   - `flags.ts`, `MediaImageCard`, `MediaAudioCard` : contiennent `id`
     (Indonésien 🇮🇩), **pas** `no` (Norvégien).
   - `MediaVideoCard` : contient `no` (Norvégien 🇳🇴), **pas** `id` (Indonésien).

   Conséquence observable, à code de langue identique :
   - `getFlag('id')` → 🇮🇩 sur une carte image/audio, mais 🌐 (globe) sur une
     carte vidéo.
   - `getFlag('no')` → 🇳🇴 sur une carte vidéo, mais 🌐 (globe) partout ailleurs
     (message bubble, image, audio, PostCard).

   Le Norvégien **et** l'Indonésien sont deux langues Meeshy supportées
   (`packages/shared/utils/languages.ts` : `no`/🇳🇴, `id`/🇮🇩). Une transcription
   audio norvégienne affiche donc un globe, tandis que la même langue sur une
   vidéo affiche le drapeau — pure incohérence inter-composants.

2. **Table canonique incomplète.** `flags.ts` (la SSOT déclarée) **omet** `no`,
   une langue pourtant supportée. `MediaVideoCard` avait raison de l'inclure ;
   c'est `flags.ts` qui est en défaut.

3. **Quadruple duplication (DRY).** La même paire map+fonction existe en 4
   exemplaires. Toute évolution (ajout de langue, correction d'un drapeau)
   doit être répétée 4 fois — mécanisme même de la divergence constatée en (1).

## Root causes
- (1)(2) Copies figées à des instants différents : les trois `getFlag` locaux
  ont été copiés-collés depuis des révisions distinctes de la table, l'une
  ayant `no`, les autres `id`. Sans source unique, les tables ont dérivé.
- (3) Le refactor d'extraction (`flags.ts`, « for reuse across … ») n'a jamais
  été propagé aux trois cartes média, qui ont conservé leurs copies locales
  antérieures.

## Business impact
Direct et visible : les cartes média (image/audio/vidéo) sont un contenu de
premier plan du fil. Un badge langue qui affiche un globe pour une langue
pourtant reconnue (Norvégien sur audio, Indonésien sur vidéo) dégrade la lecture
du Prisme Linguistique — l'utilisateur ne voit pas de quelle langue provient la
piste, et l'incohérence image↔vidéo pour la même langue érode la confiance dans
l'indicateur.

## Technical impact
Réduction 4→1 des copies de `FLAG_MAP`/`getFlag`. Les trois cartes importent la
fonction canonique unique. La table canonique devient un **sur-ensemble** (ajout
de `no`), donc aucune carte ne perd de drapeau : image/audio **gagnent** le
Norvégien, vidéo **gagne** l'Indonésien — strictement additif, zéro régression.

## Risk assessment
Minimal.
- Ajout de `no` à `flags.ts` : additif pur (une clé absente devient présente ;
  toutes les autres inchangées, valeurs identiques byte-à-byte — vérifié).
- Suppression des 3 copies locales : `FLAG_MAP` local n'est référencé **que**
  dans le `getFlag` local (grep confirmé — aucune autre occurrence dans les 3
  fichiers). Remplacer par l'import de `getFlag` depuis `./flags` préserve la
  signature `(code: string) => string` et le comportement (le corps est
  identique), sauf la correction de couverture `id`/`no` (élargissement).
- `getFlag` conserve `slice(0,2)` — inchangé ce cycle (les codes qui atteignent
  ces cartes sont des cibles de traduction canoniques Meeshy 2-lettres ; la
  question BCP-47/3-lettres est distincte et hors scope, cf. « Options écartées »).

## Proposed improvements
1. Compléter la table canonique `flags.ts` : ajouter `no: '🇳🇴'` à `FLAG_MAP` et
   `no: 'Norsk'` à `LANGUAGE_NAMES` (maintien du parallélisme documenté des deux
   tables).
2. Supprimer les 3 `FLAG_MAP` + `getFlag` locaux (MediaImageCard, MediaAudioCard,
   MediaVideoCard) et importer `getFlag` depuis `./flags`.
3. Créer `flags.test.ts` (aucun test n'existait) : garder la couverture `id`
   **et** `no` (drapeaux réels, non-globe), un code connu, un code inconnu
   (globe), et l'insensibilité à la casse — verrouille la non-divergence future.

## Expected benefits
- Même langue → même drapeau partout (image = audio = vidéo = message bubble).
- Norvégien et Indonésien affichent leur drapeau sur **tous** les types de média.
- Source unique : une seule table à faire évoluer, la classe de divergence est
  structurellement éliminée.
- −~60 LOC dupliquées (3 × [table 20 lignes + fonction]).

## Implementation complexity
Triviale — 2 ajouts de clé + 3 suppressions de bloc + 3 imports + 1 fichier de
test. Aucune signature, aucun type, aucun changement d'API publique.

## Validation criteria
- RED prouvé : `getFlag('no')` retourne le globe sur le code **actuel** (clé
  absente) ; passe au drapeau 🇳🇴 après l'ajout.
- GREEN : `flags.test.ts` vert ; suites v2 existantes
  (`post-card-enhanced.test.tsx`, etc.) inchangées.
- `tsc --noEmit` : aucune erreur nouvelle sur les 4 fichiers touchés.
- Les 3 cartes média ne référencent plus aucun `FLAG_MAP` local (grep = 0).

## Options écartées ce cycle
- **Remplacer `slice(0,2)` par `normalizeLanguageCode` (SSOT shared)** : la
  troncature aveugle est le défaut documenté que `language-normalize.ts`
  corrige, mais aucun code 3-lettres/BCP-47 à collision (`fil`→`fi`) n'atteint
  `getFlag` en pratique (cibles de traduction = codes canoniques Meeshy). Le
  câbler serait un changement sémantique plus large, mieux isolé dans une
  itération dédiée. Non touché — `slice(0,2)` conservé tel quel, en un seul
  endroit désormais.
- **Fusionner `flags.ts` dans le `getLanguageInfo` shared** : `flags.ts` expose
  des noms **romanisés** distincts (« Francais », « Nihongo », « Zhongwen ») et
  un sous-ensemble curé de 20 langues — sémantiquement différent de la SSOT
  shared (noms anglais, 60+ langues). Ce sont deux vues volontairement
  distinctes ; ne pas les confondre.

## Future improvements (itération 194+)
- **`getFlag` / `getLanguageName` BCP-47 & 3-lettres** : brancher
  `normalizeLanguageCode` si un code non-canonique (locale device, ISO 639-3)
  se met à atteindre les badges média.
- **`getLanguageInfo` (shared) BCP-47** (reporté de 192) : `getLanguageInfo('fr-FR')`
  tombe sur le globe ; nécessite de casser le cycle d'import
  `languages` ↔ `language-normalize` (lazy-init du set `SUPPORTED_CODES`).
- **Parité sentinelle `'unknown'` iOS/Android** (reporté de 190-192).
