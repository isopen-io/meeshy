## Un témoin de source s'ancre sur des FRAGMENTS du code, pas sur le nom du symbole : avant de retirer un bloc, chercher chaque ligne distinctive dans les tests (2026-09-25, #7945)

Le lot 3 du nettoyage iOS a retiré `originalLanguageFlag`, une sous-vue de
`FocalRow` que rien ne montait. La preuve de mort était faite dans les règles :
`grep -rnw originalLanguageFlag` ne rendait que la déclaration et son unique
lecteur, lui-même mort, et aucun test ne nommait le symbole. Le run complet
(12 197 tests) a pourtant rougi sur un cas, `F06`. Ce test ne connaissait pas
`originalLanguageFlag` : il lisait `FocalRow.swift` et cherchait
`LanguageData.info(for: translation.originalLangCode`, une ligne du CORPS de la
vue retirée, la seule où cette chaîne vivait. Le lot 6 a rejoué la même famille
deux fois : un compte de `requestDeleteMessage(` et un `location: pendingPlace`.

> **Un témoin de source (`contains`, `range(of:)`, `body(of:)`, compte
> `components(separatedBy:)`) éprouve des FRAGMENTS, pas des symboles.** Le
> grep qui prouve qu'un symbole est mort ne dit rien des tests qui ancrent son
> corps. Avant de retirer ou de réécrire un bloc, chercher dans
> `apps/ios/MeeshyTests` et `packages/MeeshySDK/Tests` : le nom du symbole, le
> nom du fichier, et **chaque fragment distinctif du bloc** (appel qualifié,
> étiquette d'argument, littéral, expression). Un témoin qui matche se met à
> jour dans le même geste, ou le constat s'écarte.

La vérification se mécanise. Pour chaque test qui lit des sources `.swift`,
prendre les littéraux passés à une recherche, puis comparer leur nombre
d'occurrences, avant et après le diff, dans les seuls fichiers que ce test
nomme. Une baisse signale un témoin candidat à la rupture. Rejoué sur le jalon
du lot 6, ce relevé désigne les deux gardes que le porteur a dû corriger. Il
rend aussi quelques faux positifs (mots courants, gardes d'absence), qui se
trient en lisant l'assertion.

Et quand le témoin rougit sur un code mort qu'il nourrissait, la bonne
correction est de le RÉ-ANCRER sur le signal vivant : `F06` éprouve désormais
`plainLanguageFlags(translation)`, bâtie depuis `originalLangCode`. Restaurer
le code mort pour nourrir le témoin serait l'inverse.
