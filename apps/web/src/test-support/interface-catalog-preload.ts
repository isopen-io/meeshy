import { loadAccountRecoveryCatalog } from '@/lib/i18n-account-recovery-catalog';
import { loadRevokeSessionsCatalog } from '@/lib/i18n-revoke-sessions-catalog';
import { loadSignInLinkCatalog } from '@/lib/i18n-sign-in-link-catalog';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadEmojiPickerCatalog } from '@/lib/i18n-emoji-picker-catalog';
import { loadGameCatalog } from '@/lib/i18n-game-catalog';
import { loadRowMenuCatalog } from '@/lib/i18n-row-menu-catalog';
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

/* Le catalogue du menu d'une ligne et des puces de la liste (`rowMenu.*`,
   `listFilter.*`, #10593) : en production il arrive avec l'écran de la liste
   (`route-table.tsx`) ; un témoin qui monte `LensRow` ou `RowActions` hors
   routeur rejoue ce contrat. */
await loadRowMenuCatalog(DEFAULT_INTERFACE_LANGUAGE);

/* LE MOT DE PASSE OUBLIÉ (`recovery.*`, #10823) : en production il arrive avec
   `/forgot-password` et `/reset-password` (`route-table.tsx`) ; un témoin qui
   monte l'un de ces écrans hors routeur rejoue ce contrat. */
await loadAccountRecoveryCatalog(DEFAULT_INTERFACE_LANGUAGE);

/* LA CONFIRMATION D'UN LIEN DE CONNEXION (`signInLink.confirm.*`) : en production elle arrive avec le lien magique
   et la vérification d'adresse (`route-table.tsx`) ; un témoin qui monte ces écrans hors routeur rejoue ce contrat. */
await loadSignInLinkCatalog(DEFAULT_INTERFACE_LANGUAGE);

/* LE LIEN « CE N'ÉTAIT PAS MOI » (`revokeSessions.*`) : il arrive avec `/auth/revoke-sessions` (`route-table.tsx`). */
await loadRevokeSessionsCatalog(DEFAULT_INTERFACE_LANGUAGE);
