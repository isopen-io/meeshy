# Analyse — Itération 251 : le web comparait des codes de langue bruts (« lot jest web »)

## Current state

L'audit langue ouvert par l'itération 247 route, un site à la fois, toutes les
comparaisons de codes de langue par la SSOT `normalizeLanguageForDedup`
(`packages/shared/utils/language-normalize.ts`). Les itérations 248 (porte de
lien partagé, PR #3352), 249 (scoring d'affinité des réels) et 250 (retrait du
code mort `_findUsersForLanguage`, PR #3368) ont clos les suivis côté **gateway**.

Le **suivi web** — nommé « lot jest web dédié » par les itérations 249 et 250 —
restait ouvert : quatre sites côté `apps/web` comparaient des codes verbatim sans
passer par la SSOT. Cette itération l'instruit, et l'instruction révèle un
cinquième site (le VRAI, vivant) plus un cas de code mort.

## Problems identified

Quatre sites nommés + une découverte :

1. **`components/v2/CanvasV3Scene.tsx` (`sameLanguage`, l.312-313).** Comparaison
   par `a.split('-')[0]?.toLowerCase() === b.split('-')[0]?.toLowerCase()`. `split('-')`
   ne réduit **ni le séparateur `_`** (`'fr_FR'` reste `'fr_fr'`), **ni les codes
   ISO 639-2/3** (`'fra'` ≠ `'fr'`), **ni les alias legacy** (`'iw'` ≠ `'he'`). Le
   Prisme par objet (Canvas V3, story) manque alors une traduction keyée sous une
   forme divergente, et — pire — rétrograde la langue PRIMAIRE du lecteur : objet
   français (locale `'fr'`), lecteur `['fr_FR','en']`, une traduction anglaise
   existe ⇒ l'anglais était servi au lieu de l'original français (violation directe
   de la règle 3 du Prisme).

2. **`components/v2/TranslationToggle.tsx` (l.71).** Correspondance par
   `t.languageCode.toLowerCase().startsWith(userLanguage.toLowerCase())`. Un préfixe
   **sur-matche** (`'fry'` Frisian matche une préférence `'fr'` ; `'fil'` Filipino
   matche `'fi'` — exactement la collision que la SSOT existe pour éliminer) **et
   sous-matche** (l'alias legacy `'iw'` ne matche pas `'he'`). C'était le défaut le
   plus sévère du lot : un lecteur finnois pouvait se voir servir du Filipino.

3. **`hooks/use-stream-translation.ts` (l.105-106 et 142-143).** La clé de fusion
   des traductions temps réel (`t.targetLanguage === targetLang`) crée un **doublon**
   en cache dès que `'fr'` et `'fr-FR'` désignent la même langue ; la détection de
   pertinence (`userLanguages.includes(t.targetLanguage)`) **ne compte jamais** une
   traduction taguée pour une préférence canonique.

4. **`components/common/BubbleMessage.tsx` — le site nommé par l'it. 249 est du
   CODE MORT.** Le `currentContent` (useMemo, l.149-158) portait la comparaison
   brute `===`, mais **n'était lu nulle part** (une seule occurrence textuelle du
   symbole dans tout le fichier). La résolution vivante du contenu affiché vit dans
   `useMessageDisplay` (`hooks/use-message-display.ts`), consommé par
   `BubbleMessageNormalView` via `currentDisplayLanguage`.

5. **Découverte : `hooks/use-message-display.ts` est le VRAI défaut vivant.** Ce
   hook — que le `currentContent` mort de BubbleMessage dupliquait — porte la même
   comparaison brute `===` sur les sites CONSOMMÉS `displayContent` (l.33/38) et
   `replyToContent` (l.58/63), lus par `BubbleMessageNormalView` et `FocalRow`.
   (Son `missingLanguages` porte aussi un `Set` brut, mais cette sortie du hook
   n'est destructurée par AUCUN appelant — même catégorie que le `currentContent`
   mort ; non touchée ici, cf. Future improvements. La logique missing-languages
   RÉELLEMENT vivante est le `useMemo` local de `LanguageSelectionMessageView`.)

## Root causes

Même classe que les itérations 243/246/247/248/249 : des sites de comparaison de
codes de langue plus récents que la SSOT, jamais routés par elle. La
canonicalisation s'était arrêtée aux surfaces gateway et à un hook web
(`use-message-translations.ts`, qui portait DÉJÀ le pattern de référence
`sameLanguage` délégant à `normalizeLanguageForDedup`) — les composants v2 et les
hooks de stream/display étaient restés sur `split('-')`, `startsWith` et `===`.

Le cas BubbleMessage illustre la leçon de méthode posée par l'itération 250 :
**vérifier qu'un site de comparaison a un appelant avant de le canonicaliser** —
un défaut de forme sur du code mort se résout par SUPPRESSION, et le vrai défaut
se trouve sur le chemin vivant que le mort dupliquait.

## Business impact

- **Prisme dégradé, silencieux, sur trois surfaces produit majeures** : stories
  (Canvas V3), toggle de traduction des commentaires/posts, et le fil de messages
  temps réel. Le produit se traduit tout : une langue d'origine ou une clé de
  traduction taguée (`'fr-FR'` d'une locale iOS, `'en-US'` d'un `Accept-Language`)
  est le cas COURANT, pas marginal.
- **Le pire cas est un contenu servi dans la MAUVAISE langue** (Filipino à un
  lecteur finnois via `startsWith`, anglais à un lecteur francophone via le rang
  Prisme cassé de Canvas V3), pas seulement une traduction manquée.

## Technical impact

Surface minimale et homogène : un import + un helper `sameLanguage` (copie du
pattern déjà éprouvé dans `use-message-translations.ts`) par fichier, quelques
substitutions de prédicat, une suppression de code mort. Aucun schéma, aucun
contrat de fil, aucune signature publique modifiée (les exports ajoutés sur
`CanvasV3Scene` — `resolveText`, `translationFor` — ne servent qu'au test et
n'ont pas d'appelant runtime hors module).

## Risk assessment

Faible. La canonicalisation ne peut qu'ÉLARGIR des correspondances légitimes
(une forme taguée matche enfin sa langue canonique) et ne franchit jamais entre
deux langues distinctes (SSOT à réduction stricte + garde anti-troncature
`fil`/`swe`). Contre-épreuves en place dans chaque suite (langues distinctes ⇒
pas de match). Le retrait de `currentContent` est sans risque (zéro lecteur).

## Proposed improvements (implemented)

1. `CanvasV3Scene.sameLanguage` → `normalizeLanguageForDedup(a) === normalizeLanguageForDedup(b)` ;
   export de `resolveText`/`translationFor` pour test.
2. `TranslationToggle` → helper `sameLanguage`, `startsWith` remplacé.
3. `use-stream-translation` → helper `sameLanguage` sur la clé de fusion ET la
   détection de pertinence.
4. `use-message-display` (le vivant) → helper `sameLanguage` sur `displayContent`
   et `replyToContent` (les deux sorties consommées). `missingLanguages` laissé
   intact (sortie non consommée — on ne canonicalise pas ce que rien ne lit).
5. `BubbleMessage` → suppression du `currentContent` mort, avec commentaire
   pointant la source vivante et la méthode de l'it. 250.

## Expected benefits

- Le Prisme devient indépendant de la forme sous laquelle un code de langue a été
  stocké/émis, sur stories, toggle et fil temps réel.
- Un site de comparaison de plus routé par la SSOT sur cinq surfaces web ;
  convergence de l'audit langue quasi complète (reste le backfill base).

## Implementation complexity

Triviale par site ; le lot tient dans un helper répété + substitutions.

## Validation criteria

- RED prouvé site par site en restaurant l'ancien prédicat :
  Canvas V3 4/8 rouges (formes `fr_FR`/`fra`/`iw` + rang Prisme), use-message-display
  4/5, use-stream-translation 2/4, TranslationToggle 3/4. Verts après fix.
- 5 suites langue neuves/voisines : 73/73. Directory `__tests__/components/v2/` :
  275/275 (34 suites). Suites Prisme/canvas existantes : 74/74.
- BubbleMessage : les 2 échecs de suite sont PRÉ-EXISTANTS et identiques sur le
  code d'origine (`Cannot find module '@meeshy/shared/utils/languages'` dans un
  `jest.mock` — cf. `apps/web/CLAUDE.md` § jest.mock inerte) ; les 77 tests
  exécutés passent avant comme après.

## Future improvements (audit langue, restant)

1. **`LanguageSelectionMessageView` — missing-languages vivant.** Son `useMemo`
   local (l.228) construit `existingLangs` depuis `availableVersions.map(v => v.language)`
   (codes verbatim) et filtre contre `lang.code` canonique : un message déjà en
   `'fr-FR'` propose `'fr'` comme « à traduire ». Surface plus large (construction
   de `availableVersions`, dédup) et suite affectée par l'échec de résolution
   `jest.mock` pré-existant (`@meeshy/shared/utils/languages`) — lot séparé.
2. **`missingLanguages` non consommé de `use-message-display`** — sortie de hook
   sans lecteur (comme le `currentContent` retiré) ; à supprimer dans une passe de
   nettoyage dédiée, pas à canonicaliser en aveugle.
3. **Backfill base des codes tagués** (`Message.originalLanguage`, clés de
   `translations`, `Post.originalLanguage`, `ConversationShareLink.allowedLanguages`)
   — supprimerait la classe de défaut à la SOURCE (écriture). Décision produit +
   fenêtre de migration. Dernier suivi structurel de l'audit 247.
4. **Promotion possible d'un `isSameLanguage` partagé** : le helper `sameLanguage`
   (délégant à `normalizeLanguageForDedup`) est désormais recopié dans cinq
   fichiers web + le gateway. Un export unique dans `language-normalize.ts`
   fermerait la duplication — à peser (SSOT vs surface partagée touchée par
   plusieurs PR en vol).
