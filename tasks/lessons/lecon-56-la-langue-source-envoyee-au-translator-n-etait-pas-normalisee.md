## Leçon 56 — la langue SOURCE envoyée au translator n'était PAS normalisée, contrairement aux cibles (2026-08-04, routine messaging)

Audit ciblé du cœur temps-réel TS (env Linux, pas de Xcode). `MessageTranslationService`
canonicalisait chaque langue CIBLE via le SSOT `normalizeLanguageCode`
(`_resolveTargetLanguages`) mais envoyait la SOURCE verbatim :
`sourceLanguage: message.originalLanguage` (sites 540/656/3052). Or les clients
transmettent `originalLanguage` = `Locale.current` (`'pt-BR'`, `'FR'`, `'de-DE'`) et
le champ est persisté sans normalisation. Côté translator, la source passe par
`LANGUAGE_MAPPINGS.get(src, 'eng_Latn')` : un code région-taggé absent de la table
retombe **silencieusement sur `'eng_Latn'`** → NLLB traduit un texte portugais comme
s'il était anglais. Traductions dégradées/fausses pour tous les lecteurs cross-langue,
invisible pour l'expéditeur (le skip d'auto-traduction, lui, compare des formes
normalisées, donc il fonctionnait).

**Fix** : helper `_normalizeSourceLanguage` (miroir de la logique source déjà présente
dans `_resolveTargetLanguages`), appliqué aux 3 sites qui construisent une
`TranslationRequest` ZMQ. `'auto'` (détection) et valeurs vides préservés.

**Leçons :**
1. **Une asymétrie de normalisation entre deux champs d'un même payload est un bug
   silencieux.** La cible était corrigée, la source oubliée — le même `normalizeLanguageCode`
   existait à 3 lignes de distance. Quand un helper canonicalise un champ d'une requête,
   vérifier que TOUS les champs de langue de cette requête passent par lui.
2. **Le repli d'un `.get(key, DEFAULT)` côté consommateur masque le bug côté producteur.**
   `LANGUAGE_MAPPINGS.get('pt-BR', 'eng_Latn')` ne lève jamais — il retourne l'anglais.
   Un défaut « raisonnable » (anglais) transforme une clé invalide en résultat plausible
   mais faux. Chercher les `.get(x, default)` sur la frontière quand on trace une donnée
   mal formée : ils avalent l'erreur au lieu de la signaler.
3. **Un test de régression doit rester VERT sur les cas déjà corrects.** Les cas `'auto'`
   et `'fr'` passaient avant ET après le fix — ils prouvent l'absence de régression sur
   les entrées déjà canoniques, pendant que `'pt-BR'`/`'de-DE'` prouvaient le bug (rouge
   avant, vert après). Toujours mêler cas-qui-changent et cas-qui-ne-changent-pas.
