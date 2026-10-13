import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadEmojiPickerCatalog } from '@/lib/i18n-emoji-picker-catalog';
import { loadGameCatalog } from '@/lib/i18n-game-catalog';
import { DEFAULT_INTERFACE_LANGUAGE } from '@/lib/inline-interface-language-bootstrap.js';

await loadInterfaceCatalog(DEFAULT_INTERFACE_LANGUAGE);

/* Le catalogue du jeu (`game.*`) : en production l'écran Progression le charge
   avec son chunk (`route-table.tsx`) ; hors routeur, le témoin rejoue ce
   contrat pour la même langue. */
await loadGameCatalog(DEFAULT_INTERFACE_LANGUAGE);

/* Le catalogue de la feuille d'emojis (`emojiPicker.*`, #10531) : en production
   il arrive avec la feuille (`prepareEmojiPickerSheet`) ;
   un témoin qui monte `ReactionSheet` ou `ComposerEmojiSheet` sans passer par
   leur import paresseux rejoue ce contrat. */
await loadEmojiPickerCatalog(DEFAULT_INTERFACE_LANGUAGE);
