# Iteration 123 — Analyse d'optimisation (2026-07-07)

## Protocole (démarrage)
`main` @ `b4b5a8a1`, working tree propre. Branche `claude/brave-archimedes-t4dp46` (re)créée depuis
`origin/main`. Numérotation : docs `main` jusqu'à **122** → ce cycle prend **123**.

PR ouvertes au démarrage (cibles retenues **strictement disjointes**) : #1600 (read-status),
#1599 (typing roster), #1598 (sanitize prototype-pollution — **couvre déjà** le backlog F87 d'iter 122),
#1597 (web calls overlay prop), #1596/#1588/#1585 (realtime notification:new), #1593 (translator
segmentation bullet class), #1592 (realtime dedup), #1590 (shared time-remaining), + bumps dependabot.

## Méthode
Revue adversariale en éventail (3 sous-agents parallèles) sur des zones **hors PR ouvertes** :
gateway non-realtime, translator (hors segmentation), web (Prisme/transforms). Chaque piste devait
être : petite, prouvable par un test unitaire ciblé (RED→GREEN), sans changement de signature publique,
et un vrai bug latent — pas une préférence de style. Les helpers purs `shared` (etag, bounded-cache,
circuitBreaker, pagination, relative-time, duration-format, call-summary, mention-parser,
language-normalize, presence-visibility, notification-strings…) ont été relus : déjà très mûrs
(122 itérations), aucun écart net trouvé. Trois défauts concrets ont été retenus et corrigés ce cycle.

---

## Cible A (impact majeur) — Le mapping NLLB du translator ne couvre que 8 des 40 langues déclarées

### Current state
`services/translator/src/services/translation_ml/translator_engine.py` (`TranslatorEngine.__init__`)
codait en dur un dictionnaire de **8** langues :
```python
self.lang_codes = {'fr':'fra_Latn','en':'eng_Latn','es':'spa_Latn','de':'deu_Latn',
                   'pt':'por_Latn','zh':'zho_Hans','ja':'jpn_Jpan','ar':'arb_Arab'}
```
Or ce dictionnaire est l'**unique** convertisseur ISO→NLLB utilisé aux deux call sites de traduction
(single L404-405, batch L497-498) via `self.lang_codes.get(code, 'eng_Latn'/'fra_Latn')`.
`TranslationMLService.lang_codes` (L152) n'est qu'un alias — les deux chemins temps-réel et batch en
dépendent.

### Problems / Root cause
Le service **annonce 40 langues** (`config/settings.py:114` `SUPPORTED_LANGUAGES`) et fournit déjà une
table canonique complète de 60+ entrées `LANGUAGE_MAPPINGS` (`settings.py:229`) plus un helper
`get_model_language_code()` conçu exactement pour cette conversion. `TranslatorEngine` ignorait cette
table. Les **31 autres langues supportées** (af, bg, bn, cs, da, el, fa, fi, he, hi, hr, hu, hy, id,
ig, it, ko, ln, lt, ms, nl, no, pl, ro, ru, sv, sw, th, tr, uk, ur, vi) tombaient sur le défaut `.get`.

### Business / Technical impact
Le défaut `.get(..., 'fra_Latn')` rend l'échec **silencieux et sémantiquement catastrophique** :
- `translate("Ciao", source='it', target='de')` → NLLB reçoit l'italien étiqueté **anglais** (source).
- `translate("Ciao", source='it', target='ru')` → cible `ru` absente ⇒ défaut `fra_Latn` : l'utilisateur
  demande du **russe** et reçoit du **français**, sans la moindre erreur.
`detect_language()` peut retourner n'importe quel code ISO (ru, ko, nl…), donc `source='auto'` produit
ces mismatches en routine. Surface : tout le pipeline de traduction texte + audio du translator.

### Risk assessment
Très faible. Les 8 codes déjà mappés ont des valeurs **identiques** dans `LANGUAGE_MAPPINGS` — le
changement est un **sur-ensemble strict** sans modification de valeur. Aucun test ne verrouille l'absence
des autres langues ni la taille exacte du dict.

### Proposed improvement (implémenté)
Pointer le moteur sur la source unique : `self.lang_codes = dict(LANGUAGE_MAPPINGS)`
(import `from config.settings import LANGUAGE_MAPPINGS`, cohérent avec les modules voisins qui font déjà
`from config.settings import get_settings`). Le moteur mappe désormais **63 langues**.

### Validation
- [x] `test_lang_codes_cover_every_supported_language` : chaque code de `SUPPORTED_LANGUAGES` mappe vers
      `LANGUAGE_MAPPINGS[code]` (RED avant : `missing NLLB mapping for 'af'`).
- [x] `test_lang_codes_map_representative_iso_codes_to_nllb` : it→ita_Latn, ru→rus_Cyrl, ko→kor_Hang,
      nl→nld_Latn (RED avant : `None`).
- [x] `test_lang_codes_complete` (existant, 8 codes) : toujours vert (sur-ensemble).
- [x] Baseline env : `65 failed, 16 passed` **inchangé** (65 échecs pré-existants = torch/transformers
      absents dans l'env de CI local) ; ma version ajoute **+2 tests passants**, **zéro** régression.
- [x] Smoke import : `TranslatorEngine(...)` charge 63 langues, 8 originaux intacts, sans import circulaire.

---

## Cible B (haute confiance) — `isUrlOnly` rate les schémas d'URL en majuscules (liens corrompus)

### Current state
`services/gateway/src/utils/url-content.ts` — `URL_TOKEN_REGEX = /https?:\/\/…/g` (pas de flag `i`).

### Problems / Root cause
Le schéma `https?` était comparé **sensible à la casse**. Les claviers mobiles capitalisent
automatiquement la 1ʳᵉ lettre d'un message : un lien collé nu arrive donc très souvent `Https://…`.
Sans flag `i`, le regex ne matche pas, `replace` laisse toute la chaîne, `isUrlOnly` renvoie `false`.

### Business / Technical impact
Les 3 call sites (`MessageTranslationService`, `PostTranslationService`) utilisent `isUrlOnly` pour
**sauter la traduction et préserver les liens verbatim**. Un `Https://…` était donc envoyé à NLLB, qui
corrompt le lien (domaines/segments traduits comme des mots) — précisément le bug que la fonction existe
pour prévenir. RFC 3986 §3.1 : le schéma est **insensible à la casse** ; `Https://`/`HTTPS://` DOIT être
traité comme une URL.

### Risk assessment
Très faible. La classe de caractères liste déjà `A-Za-z`, donc `i` n'affecte **que** le littéral de
schéma. Aucun test existant n'affirme qu'un schéma majuscule n'est pas une URL.

### Proposed improvement (implémenté)
Ajout du flag `i` : `/https?:\/\/[…]+/gi`.

### Validation
- [x] Nouveau cas `Https://…`, `HTTPS://…`, `HTTP://…` → `true` (RED prouvé : ancien regex `false`,
      nouveau `true`, via micro-bench node).
- [x] `url-content.test.ts` : **10/10** (mailto/ftp, CJK/Thai collés, comma-joined — tous inchangés).

---

## Cible C (haute confiance) — Le `senderName` du dernier message de groupe court-circuite le SSOT

### Current state
`apps/web/utils/v2/transform-conversation.ts:135` :
`senderName: isGroup ? (lastMessage.sender as any)?.displayName : undefined`

### Problems / Root cause
C'est la **même fonction** dont la résolution de nom des conversations directes a été migrée vers le SSOT
`getUserDisplayNameOrNull` (displayName > firstName+lastName > username) — cf. commentaire L109-113.
Le `senderName` du preview de dernier message en groupe est resté sur l'ancien chemin cassé : il lit
`sender.displayName` **seul**. Tout expéditeur avec `firstName`/`lastName` mais sans `displayName`
personnalisé (cas très courant) produit `senderName: undefined` → le nom disparaît du preview de la liste
de conversations — exactement la régression « nom cryptique/vide » que le refactor SSOT devait éliminer.

### Risk assessment
Très faible. `getUserDisplayNameOrNull` est déjà importé (L9). Comportement strictement amélioré : quand
`displayName` existe, résultat identique ; sinon repli vers nom complet puis username au lieu de rien.

### Proposed improvement (implémenté)
`senderName: isGroup ? (getUserDisplayNameOrNull(lastMessage.sender as any) ?? undefined) : undefined`

### Validation
- [x] 3 nouveaux `it` (displayName / firstName+lastName / username) — RED avant (`undefined`).
- [x] `transform-conversation.test.ts` : **8/8** (5 existants sur `item.name` inchangés).

---

## Leçons (à retenir)
- **Un défaut `.get(code, DEFAULT)` transforme une couverture partielle en corruption silencieuse.**
  Quand une table de mapping est la SSOT d'une conversion, un moteur ne doit jamais en réimplémenter un
  sous-ensemble codé en dur — il doit pointer sur la table (`dict(LANGUAGE_MAPPINGS)`).
- **Tout regex de schéma d'URL doit porter le flag `i`** (RFC 3986 §3.1) : les claviers mobiles
  capitalisent le 1ᵉʳ caractère, donc `Https://` est un cas de production courant, pas un cas limite.
- **Un refactor SSOT partiel laisse des chemins jumeaux sur l'ancienne logique.** Migrer `name` sans
  migrer `senderName` dans la même fonction recrée la régression que le refactor visait.

## Future improvements (backlog, non traité ce cycle)
- **F89 (MEDIUM, caveat de reachability)** : `apps/web/hooks/use-message-translations.ts:133-152` — le
  dedup de traductions par langue est **ordre-dépendant** : une traduction `basic` plus récente peut
  écraser une `premium` existante (la clause `currentTimestamp > existing.timestamp` prime sur la
  préférence premium). Fix proposé : classer par qualité de modèle (`premium>medium>basic`) **puis**
  récence. Reachability : ne mord que sur les messages REST portant à la fois une ligne `basic` et
  `premium` pour une même langue (le chemin Socket.IO dédoublonne déjà par `targetLanguage`).
- **F88 (MINOR, report d'iter 122)** : clamp défensif de `truncateFilename` pour `maxLength < 4`.
