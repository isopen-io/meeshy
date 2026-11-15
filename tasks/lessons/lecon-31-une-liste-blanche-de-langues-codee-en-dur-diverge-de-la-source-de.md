## Leçon 31 — Une liste blanche de langues codée en dur diverge de la source de vérité des bundles (2026-07-05, itération 108)

`detectBestInterfaceLanguage` (`apps/web/utils/language-detection.ts`) sélectionnait la langue de l'UI
au montage via une liste blanche codée en dur `['en', 'fr', 'pt']`. L'espagnol y manquait alors que
`locales/es/` est un bundle complet et que `es` est une entrée first-class de `INTERFACE_LANGUAGES`
(`types/frontend.ts`), placée AVANT `fr`/`pt` qui, elles, étaient auto-détectées. Résultat : tout
navigateur hispanophone recevait une UI anglaise — violation du Prisme Linguistique sur la surface
chrome, exactement le genre de friction que le produit promet d'éliminer. La fonction jumelle
`getUserPreferredLanguage` (même fichier, langue de contenu) gérait `es` correctement via
`isSupportedLanguage` : divergence entre deux détecteurs du même module.

**Fix** : `['en', 'es', 'fr', 'pt']` = exactement les 4 langues avec bundle complet ; `de`/`it` restent
exclues (sans bundle, repli `en` intentionnel documenté). RED→GREEN : 3 tests (`['es-ES','en-US'] → 'es'`,
`['es-419'] → 'es'`, garde-fou `['it-IT','de-DE'] → 'en'`). `language-detection.test.ts` 35/35,
`use-language.test.tsx` (callers) 24/24.

**Règle réutilisable** : quand une capacité produit (langue, thème, feature-flag) a une **source de
vérité déclarative** (ici `INTERFACE_LANGUAGES` + présence du dossier `locales/<code>`), toute liste
blanche codée en dur qui la re-liste ailleurs est un point de dérive garanti. Auditer systématiquement
que chaque valeur « expédiée » (bundle présent, entrée dans le sélecteur) apparaît dans TOUS les chemins
qui la filtrent — et distinguer l'omission-défaut (valeur expédiée mais absente : `es`) de
l'omission-intentionnelle (valeur non expédiée, repli documenté : `de`/`it`). Un test garde-fou sur le
cas intentionnel empêche un futur « fix » de casser l'exclusion voulue.
