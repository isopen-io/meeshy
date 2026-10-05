import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { loadGameCatalog } from '@/lib/i18n-game-catalog';
import { DEFAULT_INTERFACE_LANGUAGE } from '@/lib/inline-interface-language-bootstrap.js';

await loadInterfaceCatalog(DEFAULT_INTERFACE_LANGUAGE);

/* Le catalogue du jeu (`game.*`) : en production l'écran Progression le charge
   avec son chunk (`route-table.tsx`) ; hors routeur, le témoin rejoue ce
   contrat pour la même langue. */
await loadGameCatalog(DEFAULT_INTERFACE_LANGUAGE);
