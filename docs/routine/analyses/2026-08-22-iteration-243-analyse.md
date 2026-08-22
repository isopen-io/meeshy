# Iteration 243 — `resolveLastMessagePreview` rétrogradait la langue PRIMAIRE quand la langue d'origine était région-taguée

## Protocole (démarrage)

`main` @ `6ad84d52` (`fix(gateway): la banniere push ne dit plus deux fois la meme
phrase`). Branche `claude/brave-archimedes-3orp03` réalignée sur `origin/main` au
départ (0 avance / 0 retard).

Environnement : Linux, **aucune toolchain Swift/Xcode** → surface exécutable =
TypeScript (web/shared/gateway). Setup parité : `bun install --ignore-scripts`
(3861 paquets). La suite vitest de `packages/shared` tourne directement sur les
sources TS (esbuild), sans `prisma generate` ni build préalable — vérifié :
`__tests__/utils/resolve-last-message-preview.test.ts` verte au départ (20 tests).

**Audit anti-doublon** (22 PRs ouvertes au départ, toutes de cycles antérieurs).
Aucune ne touche `packages/shared/utils/conversation-helpers.ts`
(`resolveLastMessagePreview`) ni son jumeau
`MeeshyConversation.resolvedLastMessagePreview` (CoreModels.swift). La plus proche,
#3280 (`normalizeLanguageForDedup strip la région des codes irréductibles`), touche
`language-normalize.ts` — la SSOT que ce lot CONSOMME, sans la modifier. Zéro
chevauchement de fichier.

## Sélection : **Priorité 1 — feature récente (Prisme sur la ligne de liste,
cycles 60/61) dont une frontière de normalisation réintroduit la violation qu'elle
combat**

## Current state (avant correctif)

`resolveLastMessagePreview` (`conversation-helpers.ts`) applique le Prisme
Linguistique à l'aperçu du dernier message d'une ligne de liste de conversations.
Elle descend les langues du lecteur DANS L'ORDRE ; la première servie gagne — par
une traduction, ou parce que le message est déjà écrit dedans (la langue d'origine
concourt à SON rang). Jumeau iOS : `MeeshyConversation.resolvedLastMessagePreview`.

La liste `preferredLanguages` arrive **déjà normalisée** (région strippée) —
c'est la sortie de `resolveUserLanguagesOrdered`, qui réduit `'en-US'` → `'en'` via
`normalizeLanguageCode`. Mais `originalLanguage` arrive **brut** du fil : le
résolveur ne lui appliquait qu'un `.toLowerCase()`. Asymétrie de normalisation.

## Problems identified

1. **Rétrogradation silencieuse de la langue PRIMAIRE.** Quand
   `Message.originalLanguage` est région-tagué (`'en-US'`, `'pt-BR'`) et que la
   langue d'origine occupe le rang 1 du prisme du lecteur (sous sa forme
   normalisée `'en'` / `'pt'`), la branche « le message EST déjà dans ma langue ⇒
   aperçu brut » ne se déclenchait pas (`'en'` ≠ `'en-us'`). Le résolveur tombait
   alors sur une traduction de rang INFÉRIEUR.

   Scénario mesuré : prisme `['en', 'fr']` (anglais primaire), message `'en-US'`,
   traduction française disponible ⇒ le lecteur anglophone voyait **« Bonjour »**
   au lieu de l'anglais original. C'est mot pour mot la violation du Prisme (#3 /
   règle 2026-08-10) que ce résolveur a été écrit pour empêcher.

2. **Clé de traduction / langue in-app région-taguée non appariée.** Symétriquement,
   une clé de carte héritée `'fr-FR'` ou une préférence in-app persistée verbatim
   (`systemLanguage = 'pt-BR'`, jamais normalisée à l'écriture) ne matchait pas le
   rang normalisé correspondant.

3. **Jumeau iOS porteur du même défaut.** `preferredContentLanguages`
   (AuthModels.swift) préserve la casse des niveaux in-app et ne normalise que
   `deviceLocale` ; `resolvedLastMessagePreview` lowercasait ensuite `preferred` et
   `original` sans stripper la région. Même bug pour un `lastMessageOriginalLanguage`
   région-tagué.

## Root causes

Une **frontière de normalisation**. Le write-boundary (`MessagingService.ts:256`)
canonicalise désormais `Message.originalLanguage`
(`normalizeLanguageCode(claimedLanguage)`), mais son propre commentaire note que
les consommateurs « étaient forcés de re-normaliser défensivement à la lecture » —
et que les messages écrits AVANT ce write-boundary portent encore un
`originalLanguage` région-tagué non backfillé. `resolveLastMessagePreview` est un
de ces consommateurs qui n'avait jamais reçu la re-normalisation défensive.

## Business / Technical impact

- **Business** : violation directe et visible du Prisme sur la ligne de liste —
  la surface la plus consultée de l'app. Un lecteur anglophone (ou lusophone, etc.)
  voit l'aperçu de son dernier message dans une AUTRE langue que sa primaire, sur
  les messages hérités. Silencieux, jamais un crash — donc jamais signalé comme bug.
- **Technical** : atteint les DEUX plateformes depuis la MÊME charge REST ; deux
  clients rendaient potentiellement deux textes différents pour un même compte.

## Risk assessment

Faible. Le correctif canonicalise les trois sources de codes comparées via la SSOT
existante `normalizeLanguageForDedup` (`normalizeLanguageCode(x) ?? x.toLowerCase()`),
**idempotente sur les codes déjà canoniques** — donc zéro régression sur tous les
témoins existants (codes région-less, casse seule). Signature inchangée : aucun
appelant impacté.

## Proposed improvements (implémentées)

1. `resolveLastMessagePreview` canonicalise `preferred`, `original` ET les clés de
   la carte via `normalizeLanguageForDedup`, au POINT de comparaison — robuste
   quelle que soit la normalisation de l'appelant.
2. Miroir strict dans `MeeshyConversation.resolvedLastMessagePreview`, réutilisant
   `MeeshyUser.normalizeLanguageCode` (public static, même module — le miroir Swift
   tésté de la SSOT TS).

## Expected benefits

- Le Prisme tient sur les messages hérités région-tagués : la langue primaire n'est
  plus jamais rétrogradée par une origine région-taguée.
- Contrat interne-cohérent : les trois tokens comparés partagent une seule
  normalisation.
- Parité cross-platform préservée (comportement identique sur les cas canoniques,
  extension identique sur les cas région-tagués).

## Implementation complexity

Faible. 1 fichier TS (import + 3 lignes de corps + docstring), 1 fichier Swift
(mirror), 4 témoins TS + 4 témoins Swift.

## Validation criteria

- [x] RED : 4 témoins TS prouvent la rétrogradation AVANT correctif (origine
      `'en-US'` rang 1 ⇒ « Bonjour » servi au lieu de l'anglais, etc.).
- [x] GREEN TS : `resolve-last-message-preview.test.ts` **24/24 verts** (20 existants
      + 4 nouveaux).
- [x] Non-régression shared : suite vitest complète **2372/2372 verte** (98 fichiers).
- [x] `tsc --noEmit` propre sur `packages/shared`.
- [x] Miroir Swift + 4 témoins XCTest posés (ConversationPrismeResolutionTests).
- [ ] **Suite Swift NON exécutée** — aucune toolchain Xcode dans cet environnement.
      Le miroir réutilise `MeeshyUser.normalizeLanguageCode` (déjà testée) et mime
      le corps TS un-pour-un ; à re-vérifier via `./apps/ios/meeshy.sh test` dès
      qu'un runner Swift est disponible.
- [ ] CI verte sur la PR (gate lint/bun réel).

## Améliorations futures (hors périmètre)

- **`buildLastMessagePreviewTranslations`** (gateway,
  `socketio/utils/lastMessagePreviewPrism.ts`) filtre la carte de traductions par
  `viewerLanguages` région-strippées ; auditer qu'une clé de traduction héritée
  région-taguée n'y soit pas droppée AVANT d'atteindre le résolveur client. Le
  correctif de ce lot rend le résolveur robuste ; le pré-filtre amont reste à
  vérifier séparément.
- **Backfill** de `Message.originalLanguage` région-tagué en base (migration) —
  supprimerait la classe de défaut à la source plutôt qu'à la lecture. Décision
  produit + fenêtre de migration, hors d'un lot de résolveur.
- **Divergence pré-existante des jumeaux** : le TS filtre les traductions vides
  (`text.trim() === ''`), pas iOS. Non touché ici (hors périmètre région).
