# Iteration 237 — `normalizeLanguageForDedup` fuyait le tag région/script des codes irréductibles

## Protocole (démarrage)
`main` @ `f935f91b` (dernier commit : `Merge feat/ios-list-scroll-fluidity`). Branche
`claude/brave-archimedes-3hrs02` réalignée sur `origin/main` (0 avance / 0 retard au départ).

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable = TypeScript.
La suite **web (jest)** ne résout PAS `@meeshy/shared/*` dans ce sandbox : `next/jest` ne
régénère pas le `moduleNameMapper` depuis les `paths` tsconfig sous jest v30 + install bun
isolé (`jest.mock('@meeshy/shared/…')` lève « Cannot find module » avant tout test) — surface
testable réelle limitée à **shared (vitest)** et **gateway (bun)**, celles que les itérations
précédentes validaient déjà. Setup parité : `bun install --ignore-scripts` (ok), puis pour la
validation cross-package `npx prisma generate --generator client` + `bun run build` dans
`packages/shared`.

**Audit anti-doublon** (15 PRs ouvertes au départ, toutes de `jcnm`) : #3275 (formatFileSize),
#3270 (resolveRiverLaneAt), #3266 (SignalSchemas.iv), #3263 (RTCPeerConnection), #3262
(removingHandle), #3259 (formatTime expiresAt), #3257 (VoiceOver), #3255 (MyMentionsQuerySchema),
#3253 (chunk size<1), #3250 (iOS CTA), #3249 (role casefold), #3247 (Focal grouping), #3245
(convertisseur v1→v3 timing), **#3243 (source unique `endMs>=startMs` — le `timeRangeMsSchema`
que les itérations 234→236 réservaient aux « améliorations futures » est DÉJÀ en vol)**, #3242
(écoute continue endMs≤startMs). **Aucune PR ouverte ne touche
`packages/shared/utils/language-normalize.ts` ni son test.** Zéro chevauchement de fichier.

## Sélection : **Priorité 2 — feature modernisée dont un chemin du contrat porte encore un défaut**

Le candidat « future » récurrent (extraction `timeRangeMsSchema`) étant pris par #3243, et la
surface des micro-fix shared-util étant saturée par les PRs `jcnm` en vol, une revue fraîche des
utilitaires shared consommant de la donnée utilisateur a révélé une **fuite de déduplication**
dans `normalizeLanguageForDedup` — SSOT du couple « normalise-ou-replie » utilisé pour agréger et
dédupliquer des codes de langue verbatim.

## Current state (avant correctif)

```ts
export function normalizeLanguageForDedup(code: string): string {
  return normalizeLanguageCode(code) ?? code.toLowerCase();
}
```

Le repli `code.toLowerCase()` conserve la chaîne ENTIÈRE — tags région/script inclus — dès que
`normalizeLanguageCode` retourne `undefined`, c'est-à-dire pour tout code irréductible inconnu.

- `'en-US'` → `normalizeLanguageCode` réduit à `'en'` (région strippée) ✅
- `'xyz'`  → repli `'xyz'` (irréductible, pas de région) ✅
- `'xyz-AB'` → repli **`'xyz-ab'`** ❌ (tag région conservé)
- `'yue-HK'` (Cantonais, hors catalogue) → repli **`'yue-hk'`** ❌

## Problems identified

1. **Contrat de dedup incohérent.** La docstring promet « collapses casing **and region tags**
   to one canonical dedup key ». Cette garantie ne tenait QUE pour les codes que
   `normalizeLanguageCode` sait réduire. Un code irréductible tagué région échappait au strip.
2. **Fuite de comptage dans deux consommateurs.**
   - `services/gateway/src/routes/anonymous.ts` — agrégat `spokenLanguages` : `'yue'` et
     `'yue-HK'` déclarés par deux participants comptent pour DEUX langues parlées distinctes.
   - `packages/shared/utils/conversation-helpers.ts` — dedup des préférences de langue in-app :
     une préférence héritée `'yue-HK'` ne collapse pas avec `'yue'`.
   C'est exactement la fuite que le cas `'en'`/`'en-US'` interdit, appliquée aux codes hors
   catalogue (Cantonais et autres langues réelles non encore ajoutées à `languages.ts`).

## Root causes
- Le repli a été écrit comme un simple `.toLowerCase()` défensif « ne jamais perdre la donnée ».
  Correct sur l'axe « ne pas dropper », mais il omet le second axe du contrat de dedup :
  « région-aveugle ». Les codes réductibles masquaient le trou (leur strip venait de
  `normalizeLanguageCode`, pas du repli), si bien que le seul test d'irréductible existant
  (`'xyz'`) ne portait pas de tag région et ne révélait rien.

## Business impact
- **Faible mais réel et croissant.** Aujourd'hui la plupart des locales fréquentes sont dans le
  catalogue et donc réductibles. La fuite ne se manifeste que pour les langues hors catalogue
  taguées région (Cantonais `yue-*`, et toute langue future avant son ajout). Impact : compteurs
  et listes de langues légèrement sur-comptés, badges « langues parlées » dupliqués. Aucun crash,
  aucune corruption — un défaut de justesse d'agrégation.

## Technical impact
- **Aucun changement pour les codes réductibles** (chemin `normalizeLanguageCode`, inchangé) ni
  pour les irréductibles sans région (`'xyz'` reste `'xyz'`). Seul le repli des irréductibles
  TAGUÉS région change (`'xyz-AB'` → `'xyz'`).
- **Garde « ne jamais perdre la donnée » préservée** : quand le sous-tag primaire est vide
  (`'-US'`) ou non-alphabétique (`'@@@'`), le repli retombe sur la chaîne entière lowercased,
  jamais sur `''`.
- **`normalizeLanguageCode` non touché** → la parité Swift (`language-normalize-swift-parity.test.ts`)
  est intacte (le helper de dedup est TS-only, sans miroir Swift).
- **Types inchangés.**

## Risk assessment
- **Négligeable.** Recherche exhaustive : aucun test (shared ou gateway) n'assertait le
  comportement région-fuyant d'un code IRRÉDUCTIBLE (les assertions `'zh-Hant-HK' → 'zh'`
  existantes portent sur un code RÉDUCTIBLE, hors du chemin modifié). Les deux consommateurs
  ne gagnent qu'un dedup plus correct.
- **Rollback :** revert du commit unique (2 fichiers).

## Proposed improvements
1. **RED** : 2 nouveaux tests dans `packages/shared/__tests__/language-normalize.test.ts` —
   (a) `strips region/script tags from irreducible unknown codes too` (`'xyz-AB'`, `'xyz_CD'`,
   `'yue-HK'`, `'YUE-Hant-HK'`) → primaire nu ; (b) `never drops a datum when the primary subtag
   is empty or malformed` (`'-US'`, `'@@@'`, `''`) → chaîne entière préservée (garde de
   non-régression, verte avant fix).
2. **GREEN** : le repli extrait le sous-tag primaire (`code.trim().split(/[-_]/)[0]?.toLowerCase()`)
   quand `normalizeLanguageCode` retourne `undefined`, avec retour à la chaîne entière si le
   primaire est vide. Docstring mise à jour (cas `'yue-HK'` documenté + garde).

## Expected benefits
- Contrat de dedup **cohérent sur TOUS les codes** (réductibles ET irréductibles) : région-aveugle
  partout, gelé par test.
- Compteurs `spokenLanguages` et dedup de préférences corrects pour les langues hors catalogue.

## Implementation complexity
- **Triviale.** 1 fichier de production (repli + docstring), 1 fichier de test (+2 cas).

## Validation criteria
- [x] RED prouvé (`'xyz-AB'` attendait `'xyz'`, recevait `'xyz-ab'`).
- [x] GREEN : `language-normalize.test.ts` + parité Swift → 29/29.
- [x] Suite shared vitest complète : **2358/2358** (98 fichiers).
- [x] `tsc --noEmit` (shared) : 0 erreur.
- [x] Consommateurs gateway (`anonymous`, `links-admin`, `links/types`, `viewed-languages`) sous
      bun après `bun run build` shared : **215/215** (14 suites).
- [ ] CI verte sur la PR.

## Améliorations futures (hors périmètre)
- **Dépouillement des 24 fabriques `jest.mock('@meeshy/shared/…')` mortes** (doc `apps/web/CLAUDE.md`) :
  toutes des mocks de SOUS-CHEMIN (aucune racine `@meeshy/shared`), donc inertes ; certaines
  recopient un contrat partagé (catalogue de langues, socketio-events, email-validator) qui dérive
  en silence. Cleanup réel mais **non validable dans ce sandbox** : la suite web (jest) n'y résout
  pas `@meeshy/shared/*`. À reprendre dans un contexte web-ready.
- **Miroir Swift du dedup région-aveugle** : si un jour iOS agrège des `spokenLanguages` verbatim,
  il devra strip la région des codes irréductibles de la même façon.
