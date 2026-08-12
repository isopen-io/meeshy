# Iteration 201 — Corruption de données dans le SSOT des langues : le `nativeName` et le `translateText` arméniens ont été écrasés par le mot ASCII « delays » (find/replace raté), dans le SSOT TS **et** son miroir Python

## Protocole (démarrage)
`main` @ `00d0b4d1` (derniers merges : #2292/#2290 android/auth). Branche
`claude/brave-archimedes-vp8ua9` réinitialisée sur `origin/main`. Ce cycle prend **201**.

**Pivot documenté (anti-duplication).** La cible initialement retenue par
l'itération 198 pour le cycle 199 — convergence `apps/web/components/v2/flags.ts`
→ SSOT `getLanguageInfo` — est **déjà couverte par la PR ouverte #2291** (créée
plus tôt le 2026-07-25 par un swarm concurrent, même itération 199, même approche,
y compris le correctif drapeau `pt` 🇧🇷→🇵🇹). La cible #2 (agent-dashboard
`classifyRelativeTime`) est couverte par la **PR #2293** (itération 200). Conformément
à la règle « ne jamais refaire un travail déjà accompli / fermer les doublons »,
le travail v2/flags de ce cycle a été **abandonné** (branche réinitialisée) et
l'itération pivote vers une cible **non réclamée et plus haute en valeur** :
un vrai bug de données dans le SSOT lui-même, explicitement signalé par #2291
comme « hors périmètre, à corriger dans un commit SSOT dédié ».

Environnement : Linux, aucune toolchain Swift/Xcode/Android. Surface testable =
TypeScript (`packages/shared`, runner **vitest**). Le miroir Python est un
littéral de chaîne trivial (non exécuté ici, mais mécaniquement identique au TS).

Sélection : **Priorité 1 — bug de données actif sur le SSOT central**, la source
de vérité la plus haute du système (consommée par web/gateway/iOS/Android + miroir
translator). Défaut d'exactitude visible pour **tout** utilisateur arménien.

## Current state

Le SSOT des langues — `packages/shared/utils/languages.ts` (61 langues) — porte
pour chaque langue son `nativeName` (endonyme) et un `translateText` (« Traduire ce
message en X », dans la langue cible). L'entrée arménienne (`hy`) était corrompue :

```ts
{
  code: 'hy',
  name: 'Armenian',
  nativeName: 'Հdelays',                                            // ← corrompu
  flag: '🇦🇲',
  translateText: 'Թdelays delays այdelays delays delays delays հdelays', // ← corrompu
  …
}
```

La corruption est **mirroir** dans le service Python translator :
`services/translator/src/services/language_capabilities.py:175`
```py
("hy", "Armenian", "Հdelays", TTSEngine.MMS, False, STTEngine.WHISPER),  # ← corrompu
```

Aucune autre langue n'est touchée (grep `delays` = ces 2 sites uniquement).

## Problems identified

1. **Endonyme arménien détruit.** `nativeName: 'Հdelays'` — le mot ASCII « delays »
   a écrasé les caractères arméniens ; l'endonyme correct est **`Հայերեն`** (Hayeren).
   Rendu partout où l'app affiche le nom natif d'une langue (sélecteurs, badges,
   listes de préférences).
2. **Prompt de traduction arménien détruit.** `translateText` réduit à un charabia
   « Թdelays delays այdelays … » au lieu de **`Թարգմանել այս հաղորդագրությունը հայերեն`**
   (« Traduire ce message en arménien »). Rendu par `getLanguageTranslateText('hy')`.
3. **Corruption dupliquée cross-service.** Le même artefact « delays » existe dans
   le SSOT TS **et** dans le miroir Python — signe d'un find/replace global raté
   propagé aux deux fichiers.
4. **Absence de garde de test.** Aucun test n'attrapait cette classe de corruption
   (chaîne native écrasée par un token ASCII).

## Root causes

Find/replace global raté : un motif ciblant le mot « delays » (probablement une
opération de refactor sans rapport) a matché et remplacé des séquences de
caractères arméniens dans les deux fichiers. L'arménien, script non-latin peu
couvert par les tests, est passé inaperçu. Classe « donnée SSOT corrompue jamais
re-vérifiée », distincte des itérations 195-200 (réimplémentations divergentes)
mais dans la même veine SSOT.

## Business impact

**Tout utilisateur affichant l'arménien** (préférence de langue, badge de langue,
prompt « traduire en arménien ») voyait du charabia « Հdelays » / « Թdelays delays… ».
Défaut d'exactitude direct et embarrassant sur une langue produit officiellement
supportée (TTS MMS + STT Whisper actifs). Portée : web + iOS + Android + translator.

## Technical impact

- 2 chaînes restaurées dans le SSOT TS + 1 dans le miroir Python.
- +3 tests de garde d'intégrité (dont un scan générique « aucun champ ne contient
  le token `delays` ») empêchant la régression de cette classe pour **toutes** les
  langues, pas seulement l'arménien.
- `dist` régénéré (le mapper jest web lit `packages/shared/dist`).

## Risk assessment

**Très faible.** Correction de données pures (chaînes d'affichage) ; aucune API,
schéma, migration, clé i18n, ni logique. Le code arménien restauré est l'endonyme
standard `Հայերեն` ; le `translateText` suit le patron impératif des 60 autres
entrées (« Traduire ce message en X »). Aucun test n'attendait la valeur corrompue.

## Proposed improvements

Restaurer :
- `nativeName: 'Հdelays'` → `'Հայերեն'`
- `translateText: 'Թdelays delays …'` → `'Թարգմանել այս հաղորդագրությունը հայերեն'`
- miroir Python `"Հdelays"` → `"Հայերեն"`

Ajouter une garde d'intégrité vitest : aucun `nativeName`/`translateText` ne
contient le token `delays` ; chaque langue a un `nativeName` non vide ; assertion
spécifique sur l'endonyme + prompt arméniens.

## Expected benefits

- Nom natif et prompt de traduction arméniens corrects sur toutes les surfaces.
- Cohérence SSOT TS ↔ miroir Python restaurée.
- Régression de la classe « champ natif écrasé par token ASCII » verrouillée par test.

## Implementation complexity

**Triviale** — 2 fichiers de prod (SSOT TS + miroir Python), 1 fichier de test,
`dist` régénéré.

## Validation criteria

- `packages/shared` vitest : 59/59 verts (dont les 3 nouveaux gardes d'intégrité).
- `grep delays` sur `packages/shared/utils`, `packages/shared/dist`,
  `services/translator/src` = 0 occurrence.
- Aucun test Python n'attendait l'ancienne valeur (vérifié : 0 référence).

## Future improvements (backlog SSOT langues — mises en file)

1. **`apps/web/utils/language-utils.ts`** (2ᵉ copie flag/nom, sidebar active-users) :
   `en → 🇺🇸` contredit le SSOT 🇬🇧. **Bloqué** : couvre 25 langues absentes du SSOT
   (sk, sr, sl, et, lv, tl, ta, te, ml, kn, gu, pa, mr, ne, si, my, km, lo, ka, az,
   kk, ky, uz, tg, mn) — converger régresserait ces 25. Pré-requis : étendre
   `SUPPORTED_LANGUAGES` (+ miroir Python `language_capabilities.py`) ou acter hors
   périmètre. **Décision d'architecture requise.**
2. **`apps/web/hooks/v2/use-profile-v2.ts` + `apps/web/utils/audio-effects-config.ts`**
   — 2 copies inline supplémentaires de `LANGUAGE_NAMES`.
3. **« Time ago » restant** : `v2/CommentItem.tsx` (anglais codé en dur, non-i18n) —
   bloqué tant que la surface v2 n'a pas de wiring `t()`.
4. **`date-format.ts`** — ~15 copies `formatDate` ad-hoc.

(#2291 → v2/flags itération 199 ; #2293 → agent-dashboard `classifyRelativeTime`
itération 200 : déjà couverts, ne pas refaire.)
