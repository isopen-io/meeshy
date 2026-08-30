# Itération 285 — suppression du hook web `useMessageTranslations` : une jumelle divergente du Prisme, morte en production

Suite directe des cycles 283/284 (le CORPS et le `replyTo` du message web
descendent enfin le Prisme ordonné via `resolvePrismTranslation` /
`resolveLastMessagePreview`). En balayant les résolveurs de contenu web restants,
un hook porte encore une résolution linguistique **RANG 1 SEUL** — exactement le
défaut que les cycles 283/284 viennent de corriger — mais **mort en production** :
`apps/web/hooks/use-message-translations.ts`.

## État actuel (avant ce lot)

`useMessageTranslations` exposait six méthodes. DEUX seulement sont vivantes,
consommées par `components/common/bubble-stream-page.tsx` :

- `getUserLanguagePreferences()` — délégateur pur vers
  `getUserLanguagePreferences(user)` de `@/utils/user-language-preferences`.
- `resolveUserPreferredLanguage()` — délégateur pur vers
  `resolveUserPreferredLanguage(user)` de la même SSOT.

Les QUATRE autres — `processMessageWithTranslations`, `getPreferredLanguageContent`,
`shouldRequestTranslation`, `getRequiredTranslations` — n'ont **aucun consommateur
de production** (mesuré : `grep` sur les quatre noms ne rend que le fichier de test
du hook lui-même). Elles réimplémentent, à la main, une résolution de contenu :

```ts
// Si le message n'est pas dans la langue préférée de l'utilisateur
if (!sameLanguage(originalLanguage, preferredLanguage)) {
  const preferredTranslation = translations.find(t =>
    sameLanguage(t.language, preferredLanguage) && t.status === 'completed'
  );
  if (preferredTranslation) { displayContent = preferredTranslation.content; … }
  else { isTranslated = false; … }          // repli : l'ORIGINAL
}
```

`preferredLanguage` est la langue de RANG 1 seule (sortie de
`resolveUserPreferredLanguage`). La boucle cherche cette unique langue ; à défaut,
elle retombe sur l'ORIGINAL — **sans jamais essayer les rangs 2/3/4 du lecteur**
(langue régionale, destination personnalisée, locale appareil). Elle porte en plus
sa propre déduplication `normalizeLanguageForDedup` + arbitrage `translationModel`,
un second jeu de règles parallèle à celui du chemin de rendu VIVANT
(`use-message-display.ts` + `resolvePrismTranslation`, corrigé aux cycles 283/284).

## Problèmes identifiés

1. **Jumelle divergente du Prisme, interdite par le `CLAUDE.md`** (« aucune jumelle
   divergente », « UNE source de vérité »). Deux résolveurs de contenu message
   coexistaient sur le web : le VIVANT (SSOT, rangs 1→4) et ce MORT (rang 1 seul,
   repli original). Une table recopiée « se lit comme une source de vérité et dérive
   du vrai contrat en silence » (§ Testing, apps/web/CLAUDE.md).

2. **Piège latent de correctness.** Le chemin de rendu du fil streaming
   (`bubble-stream-page` → `ConversationMessages` → `MessagesDisplay` →
   `use-message-display`) est déjà correct. Mais tout futur mainteneur qui câblerait
   `processMessageWithTranslations` (son nom l'y invite) réintroduirait **exactement**
   le bug des cycles 283/284 : un lecteur multilingue — ou francophone sur navigateur
   anglais (locale appareil rang 4 ≠ langue applicative) — verrait l'original étranger
   alors qu'une traduction d'un de ses rangs existe.

3. **Indirection redondante pour les deux méthodes vivantes.** Elles ne font que
   déléguer à `@/utils/user-language-preferences` (SSOT testée par
   `__tests__/utils/user-language-preferences.test.ts`) ; le hook n'ajoutait aucune
   valeur au-dessus de l'appel direct des utils.

4. **Inventaire de test dupliquant la SSOT.** Le fichier de test du hook (1149 lignes)
   re-testait le comportement des deux délégateurs — déjà couvert par le test de la
   SSOT — et testait les quatre méthodes mortes (donc du code mort).

## Causes racines

Le hook a été écrit AVANT l'extraction de `resolvePrismTranslation` et de la SSOT
`user-language-preferences`. Quand le chemin de rendu vivant a adopté la SSOT
(`use-message-display`, cycle 283), personne n'a retiré ce résolveur parallèle : il
« marchait » pour le cas fréquent et, surtout, n'était plus appelé — donc invisible.
L'énumération « les cinq familles web » comptait les résolveurs VIVANTS ; un
résolveur MORT échappe à ce recensement par construction.

## Impact métier / technique

Nul aujourd'hui (code mort). Le risque est prospectif : un résolveur mort mais bien
nommé est une invitation à réintroduire un bug de Prisme corrigé trois fois
(120-123, 283, 284). Le retirer supprime la trappe et une couche d'indirection.

## Évaluation du risque

Faible. Le chemin de rendu VIVANT est intouché (`bubble-stream-page` continue de
passer `messages` bruts à `ConversationMessages`). Les deux méthodes vivantes sont
remplacées par un appel direct à la SSOT que la barrique `@/lib/bubble-stream-modules`
ré-exporte déjà. Zéro consommateur des quatre méthodes mortes. Le cliquet de dette de
types reste à 1184 (delta nul, mesuré). 120 suites de hooks vertes (2396 tests).

## Améliorations proposées (implémentées)

- Suppression de `apps/web/hooks/use-message-translations.ts` (résolveur mort +
  divergent) et de son export dans `hooks/index.ts`.
- Rewiring de `bubble-stream-page.tsx` vers la SSOT `@/lib/bubble-stream-modules`
  (`resolveUserPreferredLanguage(user)`, `getUserLanguagePreferences(user)`) — trois
  sites d'appel, mécaniques.
- Suppression de `__tests__/hooks/use-message-translations.test.tsx` (teste un hook
  supprimé ; le comportement des utils reste couvert par
  `__tests__/utils/user-language-preferences.test.ts`).
- Nettoyage des entrées mortes dans `scripts/analyze-unused-hooks.ts` /
  `analyze-hooks-detailed.ts` et d'un commentaire pendant dans
  `conversation-item/__tests__/message-formatting.test.tsx`.

## Bénéfices attendus

Une seule loi de résolution de contenu message côté web (la SSOT vivante). La trappe
« rang 1 seul + repli original » disparaît du dépôt ; une couche d'indirection en
moins ; ~250 lignes de source + ~1150 lignes de test mort retirées.

## Complexité

Faible : une suppression de hook, trois sites d'appel rewirés vers la SSOT existante,
deux scripts et un commentaire nettoyés.

## Critères de validation (atteints)

- `grep useMessageTranslations|use-message-translations` : aucune référence vivante.
- `npx jest __tests__/hooks` : 120 suites / 2396 tests verts.
- `__tests__/utils/user-language-preferences.test.ts`, `StreamSidebar`,
  `bubble-stream-page.realtime-cache-gap`, `message-formatting`, `FocalQuotedReply`
  verts.
- `scripts/check-type-debt.sh --self-test && scripts/check-type-debt.sh` : self-test
  OK ; dette inchangée à 1184 (delta nul).

## Dimensions (roadmap treize dimensions)

**11 · Maintenabilité** (mûre : une jumelle divergente retirée, une SSOT unique de
résolution message web, indirection en moins) — **1 · Sécurité/justesse** (mûre : la
trappe de régression Prisme rang-1 est supprimée du dépôt) — **13 · Complétude**
(mûre : le recensement des résolveurs web ne laisse plus de résolveur mort porteur
d'une loi divergente).

## Suivi (hors périmètre)

- Toujours aucun cliquet ne garde « toute surface web de contenu descend le prisme
  ordonné » (suivi de méthode inchangé depuis le cycle 283). Un tel garde
  attraperait un résolveur mort ré-câblé — mais pas un résolveur mort jamais
  appelé ; seule la revue de recensement le fait.
- `use-stream-translation.ts` construit `userLanguages` sans la locale appareil
  (rang 4) pour un INCRÉMENT DE STATISTIQUES uniquement (pas d'affichage) — à trancher
  au prochain passage : aligner sur la SSOT ou documenter l'écart comme volontaire.
