# Iteration 173 — `parseMessageLinks` : chevauchement URL ⊃ `m+<token>` (violation F91)

## Protocole (démarrage)
`main` @ `7c2910d` (dernier merge : PR #1892 — android/settings Help & Support).
Branche `claude/brave-archimedes-i7te1n` réinitialisée sur `origin/main` (0/0).
PRs ouvertes laissées intactes : #1889 (call-signaling d'une autre session, en
cours) et #1842 (bump majeur TypeScript 6→7 par dependabot, risqué). Ce cycle
prend **173**.

Environnement : Linux, aucune toolchain Swift/Xcode → surface testable =
TypeScript (web/gateway/shared). Cible retenue par revue d'ingénierie de la
couche utilitaire pure : `apps/web/lib/utils/link-parser.ts` (chemin chaud —
rendu de **chaque** message texte web via `preprocessContent` /
`MessageWithLinks`).

## Symptôme
`parseMessageLinks()` produisait deux parts **chevauchantes** quand une URL
contenait une sous-chaîne de forme `m+<token>` dans son chemin ou sa query
string. Exemple `https://ex.com/m+abcde` :

```
[ { type: 'url',       content: 'https://ex.com/m+abcde', start: 0,  end: 22 },
  { type: 'mshy-link', content: 'm+abcde',                start: 15, end: 22 } ]
```

La concaténation des `content` valait `https://ex.com/m+abcde` **+** `m+abcde`
— le suffixe de l'URL était dupliqué et le renderer affichait une puce de lien
`m+abcde` parasite en fin d'URL. Query string touchée aussi (`?ref=m+promo` :
`=` est une frontière de mot valide pour `\bm\+`).

## Cause racine
Le dédoublonnage des matches des trois regex (`MSHY_SHORT`, `TRACKING_LINK`,
`URL`) reposait **uniquement sur l'égalité stricte d'index de début** :

```ts
const isAlreadyProcessed = matches.some((m) => m.match.index === urlMatch!.index);
```

Un match **contenu à l'intérieur** d'un autre mais démarrant à un index
différent n'était jamais éliminé. `MSHY_SHORT_REGEX` (`\bm\+([\w-]{2,50})\b`)
matche `m+xxxx` partout où une frontière de mot précède `m` — y compris dans le
chemin d'une URL. L'URL (index 0) et le `m+token` interne (index 15) ayant des
index différents, les deux survivaient. La priorité voulue (une vraie URL
absorbe un `m+token` tombant dedans) n'était donc **pas** exprimée par le
dédoublonnage — seule l'égalité exacte d'index l'était.

## Correctif (TDD)
- **RED** : 5 tests ajoutés dans `__tests__/lib/link-parser.test.ts` (bloc
  « chevauchement m+TOKEN à l'intérieur d'une URL (régression F91) »). Vérifié :
  exactement ces 5 échouent sur le code d'origine, les 14 existants passent.
- **GREEN** : remplacement du dédoublonnage exact-index par une **résolution de
  chevauchement par balayage glouton** :
  1. Collecte de tous les candidats des 3 regex, chacun avec `{start, end,
     priority}` (mshy=0, tracking=1, url=2). Garde-fou largeur-nulle inclus.
  2. Tri par début croissant, puis **span le plus large d'abord** (l'URL absorbe
     le `m+token` interne), puis priorité (départage uniquement à span
     identique — cas `tracking` vs `url` sur le même `https://…/l/<token>`).
  3. Balayage : on ne retient qu'un match dont `start >= coveredEnd` (fin du
     dernier accepté). Garantit des intervalles **disjoints** et l'invariant de
     reconstruction sans perte (F91).
- **Bonus tech-debt (même fichier)** : `createTrackingLink` retournait
  `trackingLink?: unknown`, ce qui faisait échouer `result.trackingLink.token`
  dans `replaceLinksWithTracking` (`TS2339 Property 'token' does not exist on
  type '{}'`, erreur **pré-existante** sur `main`). Typé en `{ token: string }`.

## Vérification
- `link-parser.test.ts` : 19/19 (14 existants + 5 nouveaux).
- `components/messages/preprocessContent.test.ts` (consommateur) : 8/8.
- Toute la suite `__tests__/lib/` : 34 suites / 826 tests verts (2 skip).
- `tsc --noEmit` : plus aucune erreur `link-parser` (l'erreur pré-existante est
  résolue, aucune nouvelle introduite).

## Impact
- **Correction** : rendu correct de toute URL contenant un segment
  `m+<token>` ; fin des puces mshy parasites ; invariant F91 restauré.
- **Robustesse** : la résolution gloutonne remplace une heuristique fragile
  (index exact) par une sémantique d'intervalles bien définie, réutilisable
  pour tout futur type de lien.
- **Périmètre** : un seul fichier + son test. Comportement inchangé pour tous
  les cas non-chevauchants (couverts par les 14 tests existants + 826 de la
  couche lib).

## Notes
- Non examiné (exclusions de la revue) : reactions endpoints, CallEventsHandler,
  ZMQ audio, comment-like state.
- Candidats connexes repérés mais **déjà tracés** (non repris ici) :
  `getTranslationFromJSON` lookup casse-sensible (iter-130),
  `sanitizeFileName` overlong sans extension (F69).
