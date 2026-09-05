# Itération 288 — `normalizeGroupLanguage` était une jumelle divergente de la SSOT de dedup

Suite de la campagne « une source de vérité par règle de langue » (cycles 118→287,
Prisme + `recipient-language.ts` + `normalizeLanguageForDedup`). En balayant le
gateway pour la forme `normalizeLanguageCode(x) ?? <repli>` — le contrat EXACT de
la SSOT `normalizeLanguageForDedup` — un site la RÉIMPLÉMENTAIT localement, avec
le repli d'AVANT la correction du cycle 237e : `normalizeGroupLanguage`
(`src/socketio/utils/message-payload-filter.ts`).

## État actuel (avant ce lot)

```ts
function normalizeGroupLanguage(code: string): string {
  return normalizeLanguageCode(code) ?? code.trim().toLowerCase();
}
```

Cette fonction canonicalise chaque code de langue d'un DESTINATAIRE avant de
constituer la CLÉ DE GROUPE de `groupSocketsByLanguage` — l'optimisation de bande
passante « une émission de `message:new` par jeu de langues distinct » plutôt
qu'un paquet N-langues par socket. Elle sert aussi les `languages` passées à
`filterMessagePayloadForLanguages` (le filtre de traductions par destinataire).

## Problème identifié

`normalizeGroupLanguage` reproduit la forme `normalizeLanguageCode(x) ?? repli`
de `normalizeLanguageForDedup`, mais avec le repli HISTORIQUE (chaîne entière
lowercased) que le cycle 237e a explicitement remplacé, dans la SSOT, par le
SOUS-TAG PRIMAIRE lowercased. La divergence ne se voit que sur un code
IRRÉDUCTIBLE (que `normalizeLanguageCode` rend `undefined`) ET tagué
région/script — le cas hors catalogue :

| entrée | `normalizeGroupLanguage` (avant) | `normalizeLanguageForDedup` (SSOT) |
|---|---|---|
| `'en-US'`, `'pt-BR'`, `'zh-Hant-HK'` (catalogue) | `'en'`, `'pt'`, `'zh'` | identique (via `normalizeLanguageCode`) |
| `'yue-HK'` (Cantonais, hors catalogue) | `'yue-hk'` | `'yue'` |

Conséquence, mesurée par témoin RED : un destinataire anonyme portant `'yue-HK'`
et un autre portant `'yue'` formaient DEUX groupes de langue distincts —
`['yue-hk','fr']` et `['yue','fr']` — donc DEUX émissions de la charge
`message:new` là où une seule suffit. La clé de groupe n'était pas région-aveugle
pour les codes hors catalogue, exactement la fuite que le cas `'en'`/`'en-US'`
interdit (doc-comment de `normalizeLanguageForDedup`).

## Cause racine

Le site n'appelait pas la SSOT partagée mais en recopiait le squelette. Une copie
partielle ne reçoit pas les corrections de son original : le cycle 237e a rendu
la SSOT région-aveugle pour TOUT code, la copie est restée à la forme d'avant.
C'est la « jumelle divergente » que le `CLAUDE.md` proscrit (dimension 11,
maintenabilité — « aucune jumelle divergente ») et que la campagne SSOT hunt.

## Impact métier

Faible mais réel : sur une conversation comptant des destinataires portant des
variantes régionales d'une MÊME langue hors catalogue, le gateway émettait la
charge `message:new` (traductions comprises) plus de fois que nécessaire —
gaspillage de bande passante serveur et de fan-out Socket.IO (dimension 2,
Performance). Aucun impact de CORRECTION du Prisme : la carte de traductions
étant à clés catalogue, le matching des langues RÉELLES est inchangé (une langue
hors catalogue n'a de toute façon pas de traduction stockée).

## Impact technique

Surface minimale : le corps d'une fonction pure privée délégué à la SSOT, un
`import` échangé (`normalizeLanguageCode` → `normalizeLanguageForDedup`, l'ancien
n'ayant plus d'autre usage dans le fichier). Aucun schéma, aucune requête, aucune
frontière réseau. Les deux consommateurs (`MessageHandler`,
`MeeshySocketIOManager`) reçoivent des `group.languages` déjà canonicalisées —
inchangé.

## Évaluation du risque

Très faible. Pour tout code CATALOGUÉ (le cas nominal, y compris région-tagué),
`normalizeGroupLanguage` et `normalizeLanguageForDedup` rendent le MÊME code —
les deux passent par `normalizeLanguageCode`. La SSOT ne rend jamais `undefined`
(elle replie toujours), donc aucun code plausible n'est droppé. La seule
différence observable est la convergence de variantes régionales HORS catalogue
en une seule clé — jamais l'apparition d'une langue que l'ancien code n'aurait
pas produite.

## Améliorations proposées (implémentées)

- `normalizeGroupLanguage` délègue désormais à `normalizeLanguageForDedup` ;
  doc-comment mis à jour (raison de la région-cécité, référence SSOT).
- Deux témoins ajoutés (`message-payload-filter.test.ts`) : strip de la région
  d'un code hors catalogue (`yue-HK` → `yue`) et collapse de deux variantes
  régionales hors catalogue en UN seul groupe.

## Critères de validation

- RED prouvé : les 2 nouveaux témoins échouent contre l'implémentation verbatim
  (`yue-hk` reçu au lieu de `yue` ; 2 groupes au lieu de 1) — mesuré par
  `git stash` de la production.
- GREEN : 22/22 témoins de `message-payload-filter.test.ts`, 40/40 avec
  `message-new-producer-parity`.
- `tsc --noEmit` du gateway : EXIT=0.
