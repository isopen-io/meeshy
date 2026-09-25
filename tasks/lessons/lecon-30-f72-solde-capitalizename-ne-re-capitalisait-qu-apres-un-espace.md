## Leçon 30 — F72 soldé : `capitalizeName` ne re-capitalisait qu'après un espace, mutilant Jean-Pierre/O'Brien à l'inscription (2026-07-05, itération 105)

**Contexte** : `services/gateway/src/utils/normalize.ts` normalise les champs d'inscription
(`normalizeUserData` → `AuthService.registerUser`). `capitalizeName` faisait `.split(' ')` — un seul
séparateur de segment. Or `AuthSchemas.register` autorise `[\p{L}\s'.-]` dans firstName/lastName : tout
nom composé à tiret ou apostrophe (omniprésent en clientèle francophone) passait la validation puis se
faisait forcer en minuscules après le séparateur : `'Jean-Pierre' → 'Jean-pierre'`, `"O'Brien" →
"O'brien"`. Preuve d'incohérence : sur un même enregistrement, `firstName` ressortait `'Jean-pierre'`
tandis que `displayName` (via `normalizeDisplayName`, qui ne touche pas la casse) restait
`'Jean-Pierre'`. Jumeau du même fichier : `normalizeDisplayName` promettait un rendu mono-ligne mais sa
classe `[\n\t]` **omettait `\r`**, laissant survivre le CR des fins de ligne Windows (`\r\n`) et Mac
historiques.

**Fix** : `capitalizeName` = `.trim().toLowerCase().replace(/(^|[\s'.-])(\p{L})/gu, (_, sep, l) => sep +
l.toUpperCase())` — capitalise la 1ʳᵉ lettre après début-de-chaîne OU tout séparateur de nom autorisé
(`[\s'.-]`, exactement le charset non-lettre de la validation), préserve les accents (`\p{L}`), les
multi-espaces et les préfixes numériques (`'3john'` inchangé). `normalizeDisplayName` = `replace(/[\r\n\t]/g,
'')`. Deux tests **codifiaient le défaut** (`'Jean-pierre'`, `'Test\rUser'`) alors que leurs intitulés
décrivaient le comportement correct — corrigés vers l'intention. Mock `normalize` d'`AuthService.test.ts`
réaligné sur l'impl réelle. RED→GREEN : `normalize.test.ts` 126/126 (+7 cas tiret/apostrophe/accent/`\r`
seul + 1 assertion d'intégration corrigée), `AuthService.test.ts` 115/115, `profile-extended.test.ts`
36/36.

**Règle réutilisable** : quand un helper de normalisation/formatage découpe sur UN séparateur (`split(' ')`,
`[\n\t]`, `lastIndexOf('.')`), vérifier l'**ensemble complet** des séparateurs que sa couche d'entrée
autorise réellement — ici le charset de la Zod schema qui garde l'endpoint. Le charset de validation EST
la source de vérité des séparateurs à traiter ; toute divergence entre « ce que la validation laisse
entrer » et « ce que le normalizer sait découper » est un bug latent (même classe que F65
`truncateFilename` sans point, F69 `sanitizeFileName`). Et un test dont l'intitulé décrit le
comportement correct mais dont l'assertion fige la sortie buggée est un signal fort de défaut, pas
d'intention.
