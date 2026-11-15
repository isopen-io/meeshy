## Leçon 629 — pour savoir QUELLE vue est à l'écran, sonder par la POSITION, jamais par un `defaultValue`

**Le fait (2026-09-18, #7037).** Pour prouver que la croix rendue venait bien de `ConversationMediaGalleryView`, j'ai changé son libellé en « Fermer-SONDE7037 » et recompilé. L'arbre d'accessibilité affichait toujours « Fermer ». **J'en ai conclu, à tort, que ce n'était pas cette vue** — et j'ai perdu un cycle à chercher ailleurs.

**Pourquoi la sonde était inopérante.** `String(localized: "common.close", defaultValue: "Fermer-SONDE7037", bundle: .main)` : le `defaultValue` n'est servi **que si la clé est absente du catalogue**. `common.close` y est. La sonde ne pouvait rien changer, quelle que soit la vue rendue. C'est le même mécanisme que [[reference_a_defaultvalue_hides_a_missing_catalog_key_in_six_languages]], vu depuis l'autre bout : là il MASQUE une clé absente, ici il rend une sonde MUETTE.

**La sonde qui tranche** : un `.offset(x: 700)` temporaire. Mesure : x passé de −326,3 à **373,7 = −326,3 + 700**. L'identité de la vue est prouvée par l'arithmétique, et aucun catalogue ne s'interpose.

**Règle.** Pour identifier une vue rendue, sonder une propriété que **le code seul** décide — position, taille, opacité — jamais une chaîne qui traverse une table de localisation.
