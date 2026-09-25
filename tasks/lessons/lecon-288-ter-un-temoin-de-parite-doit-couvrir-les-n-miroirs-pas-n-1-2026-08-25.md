## Leçon 288 ter — un témoin de parité doit couvrir les N miroirs, pas N−1 (2026-08-25, itération 269)

La table de réduction de langue (`ISO_639_3_TO_1` + `LEGACY_ISO_639_1`) vit en
TROIS exemplaires, un par client : TS (SSOT), Swift (iOS/SDK), Kotlin (Android).
`language-normalize-swift-parity.test.ts` prouvait leur égalité — mais seulement
TS↔Swift. Kotlin n'avait JAMAIS reçu `LEGACY_ISO_639_1` (`iw→he`, `in→id`,
`ji→yi`), et rien ne pouvait rougir. Résultat : un utilisateur Android sur locale
hébraïque, dont `java.util.Locale.getLanguage()` émet `iw`, voyait son fil rester
dans la langue de l'expéditeur — la traduction `he` restant introuvable. La
plateforme même dont la JVM ÉMET les codes dépréciés était la seule à ne pas les
réduire.

> **Un témoin de parité qui couvre N−1 des N sites d'une règle dupliquée ne
> réduit pas le risque de dérive, il le DÉPLACE sur le site non couvert** — et
> l'y rend invisible, puisqu'on croit la règle gardée. La question à poser à tout
> test de parité n'est pas « prouve-t-il l'égalité ? » mais « énumère-t-il TOUS
> les exemplaires de la règle ? ». Le nom du fichier (`…-swift-parity`) le
> disait : il ne parlait que d'un des deux miroirs.

Corollaire de méthode : **le site non couvert se trouve en comptant les
implémentations, pas en lisant le test.** Le test paraissait complet (il
comparait deux tables réelles, avec contre-épreuve de taille) ; sa lacune n'était
visible qu'en recensant les clients — TS, iOS, Android — et en constatant que le
troisième n'apparaissait nulle part. Jumelle directe de la leçon 261 (« une
énumération de sites affirme aussi *ce sont les sites où la règle s'applique* —
presque jamais vérifié ») appliquée à une énumération de MIROIRS. Correctif :
renommer en `…-mirror-parity`, ajouter l'extraction Kotlin ; le témoin lit
désormais les trois tables et tombe au ROUGE dès qu'une entrée diverge sur l'un
quelconque des trois sites.
