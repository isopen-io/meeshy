## Leçon 282 — une SSOT de descente n'a de valeur que si on GREPPE ses réécritures ; `.toLowerCase()` n'est pas `normalizeLanguageForDedup` (2026-08-24, itération 262)

Le cycle 118→124 a construit `resolvePrismTranslation()` comme SSOT de la descente du
Prisme, et `CLAUDE.md` a inscrit la règle : « tout consommateur TS qui doit DIRE dans
quelle langue il sert l'appelle plutôt que de réécrire la boucle ». La règle était
écrite ; deux résolveurs de `apps/web` la violaient encore — `findTranslation`
(posts/commentaires) et `focalServedLanguage` (libellé de langue du fil Focal), tous
deux en `.trim().toLowerCase()`.

Deux enseignements :

1. **Une règle « appelez la SSOT » ne s'applique pas toute seule — elle se GREPPE.** Le
   témoin qui attrape une réécriture n'est pas « la SSOT existe-t-elle ? » mais
   « quelqu'un compare-t-il encore des codes de langue à la main ? » (`grep -rn
   "toLowerCase" apps/web/hooks apps/web/components | grep -i lang`). L'énumération des
   sites conformes ne prouve pas l'absence de sites non conformes.

2. **`.toLowerCase()` et `normalizeLanguageForDedup` se ressemblent et divergent sur la
   région.** Le premier replie la casse ; le second replie la casse ET strippe la région
   (`'en-US'` → `'en'`). Sur des codes déjà canoniques ils rendent le même verdict — donc
   un témoin écrit sur `'en'`/`'fr'` ne peut pas les distinguer. Le témoin qui sépare les
   deux s'écrit sur un code **région-tagué** (`'en-US'` en langue d'origine, `'pt-BR'` en
   clé de carte), exactement là où le pipeline de traduction et les messages hérités
   produisent leurs codes. C'est la forme « un témoin de rang s'écrit sur un rang autre
   que le premier » (leçon 261), transposée à la NORMALISATION : un témoin de région
   s'écrit sur un code tagué région.

**Corollaire de scope.** La même boucle vivait dans `use-audio-translation.ts`, laissée
HORS périmètre : y strripper la région **change une sémantique** (une préférence `fr-CA`
matcherait une piste vocale `fr-FR`), pas seulement un cas d'échec. Router une descente
de TEXTE vers la SSOT est un refactor ; router une sélection de PISTE l'est moins — la
région y porte une information (la voix). Distinguer « même défaut de forme » de « même
décision produit » avant de généraliser un correctif.

---
