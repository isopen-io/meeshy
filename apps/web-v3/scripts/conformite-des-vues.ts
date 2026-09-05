/**
 * LA CONFORMITÉ D'UN ÉCRAN, JOUÉE SUR LA CHAÎNE.
 *
 *   bun run apps/web-v3/scripts/conformite-des-vues.ts rich thread
 *
 * `compare-rendu.js` navigue vers un `--base`. Tant que ce `--base` était un
 * `next start` NU — sans passerelle derrière —, aucune vue du MEMBRE n'était
 * mesurable : `/chats/:cle` et `/chats/:id` redirigent un visiteur sans créance
 * vers `/login`, et `rapport-conformite.json` ne contenait que `vitrine`. Le
 * critère de fin de `thread`, `join`, `rights` et `rich` nommait donc une
 * mesure que le dépôt ne savait pas produire.
 *
 * Ce script monte la MÊME chaîne que les specs de chaîne (`e2e/visual/lib/
 * serveurs.ts` : la passerelle de bouchon, puis l'artefact de `next build`) et
 * appelle `compare-rendu.js` dessus. Il ne réécrit NI la passerelle, NI les
 * seuils, NI la sélection : il ne fait que TENIR les deux bouts, ce qui est
 * exactement ce qui manquait.
 *
 * Il est en TypeScript et se lance sous `bun` parce que la passerelle de
 * bouchon l'est : la recopier en `.mjs` en ferait une jumelle, et un bouchon qui
 * ne ressemble pas au serveur ne prouve rien (§ 9.4).
 *
 * L'ÉTAT DE SESSION est déclaré par vue dans `jetons-de-vues.json`
 * (`"@session": "membre"`) et traduit en cookies par `compare-rendu.js` — les
 * mêmes que ceux que cette passerelle reconnaît, ce que
 * `__tests__/conformite-des-vues.test.ts` oppose aux constantes du dépôt.
 *
 * SEULE ENRICHISSEMENT ACCORDÉ : LA GALERIE DE `media`.
 *
 * `lib/api/medias.ts` le dit dans son propre en-tête : la galerie est une
 * PROJECTION PURE du fil, jamais une seconde lecture. Le fil de
 * `CONVERSATION_DU_LECTEUR` (`equipe-lagos`) que sert `passerelleDeBouchon()`
 * par défaut ne porte que quatre messages texte (`messagesInitiaux`) — la
 * grille qu'ils projettent est donc VIDE, quand `cible/media.png` en dessine
 * une pleine. `v3-medias.spec.ts` fait déjà tenir ce fil par des pièces
 * jointes réelles, dans SA PROPRE passerelle, avec les mêmes fabriques que
 * ci-dessous (`messagesRiches`, `messageDeFichier`, `messageProtege`,
 * toutes exportées par `bouchon-monde.ts` pour ne jamais être recopiées).
 * `doitEnrichirLaGalerie` rejoue exactement ce geste ici, à une condition près :
 * jamais quand `thread` ou `profilMembre` sont demandées dans la MÊME
 * exécution — ces deux vues visent la MÊME conversation
 * (`jetons-de-vues.json` → `thread.cle` = `profilMembre.cle` = `equipe-lagos`)
 * et leur cible ne dessine PAS cette galerie : un enrichissement inconditionnel
 * leur ferait comparer un fil à quatre messages contre un fil qui en porte
 * huit de plus. Ceci n'est ni la passerelle, ni un seuil, ni la sélection —
 * seulement la DONNÉE que la passerelle sert déjà par son API publique
 * (`ajouteUnMessage`), comme le fait tout spec qui a besoin d'un fil garni.
 */

import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  CONVERSATION_DU_LECTEUR,
  messageDeFichier,
  messageProtege,
  messagesRiches,
  passerelleDeBouchon,
  RACINE_V3,
  serveurDeLaV3,
  type PasserelleDeBouchon,
} from '../e2e/visual/lib/serveurs';

const DESIGN = join(RACINE_V3, '..', '..', 'docs', 'product', 'MeeshyWebV3Design');

const vues = process.argv.slice(2).filter((argument) => !argument.startsWith('--'));

/** Les vues dont le critère de fin exige une grille GARNIE. */
const VISENT_LA_GALERIE = new Set(['media']);
/** Les vues qui partagent la MÊME conversation, mais pas cette exigence. */
const PARTAGENT_LE_FIL_SANS_LA_GALERIE = new Set(['thread', 'profilMembre']);

export const doitEnrichirLaGalerie = (demandees: readonly string[]): boolean =>
  demandees.some((vue) => VISENT_LA_GALERIE.has(vue)) &&
  !demandees.some((vue) => PARTAGENT_LE_FIL_SANS_LA_GALERIE.has(vue));

const enrichitLaGalerie = (passerelle: PasserelleDeBouchon): void => {
  messagesRiches(CONVERSATION_DU_LECTEUR.id).forEach((message) => passerelle.ajouteUnMessage(message));
  passerelle.ajouteUnMessage(messageDeFichier(CONVERSATION_DU_LECTEUR.id));
  passerelle.ajouteUnMessage(messageProtege(CONVERSATION_DU_LECTEUR.id));
};

const principal = async (): Promise<number> => {
  const passerelle = await passerelleDeBouchon();
  if (doitEnrichirLaGalerie(vues)) enrichitLaGalerie(passerelle);
  const v3 = await serveurDeLaV3(passerelle.base);
  try {
    // `spawnSync` BLOQUERAIT la boucle d'événements de ce processus — celui-là
    // même qui HÉBERGE la passerelle de bouchon : le navigateur recevrait « le
    // service ne répond pas » et l'outil mesurerait l'écran de panne contre la
    // cible d'un fil. Mesuré : `structure=0.54` sur un code conforme.
    return await new Promise<number>((resoud) => {
      const enfant = spawn(
        'node',
        [join(DESIGN, 'compare-rendu.js'), '--base', v3.base, ...(vues.length > 0 ? ['--vues', vues.join(',')] : [])],
        { stdio: 'inherit', cwd: RACINE_V3 },
      );
      enfant.on('exit', (code) => resoud(code ?? 2));
      enfant.on('error', () => resoud(2));
    });
  } finally {
    await v3.ferme();
    await passerelle.ferme();
  }
};

/**
 * NE LANCE LA CHAÎNE QUE SUR UNE EXÉCUTION DIRECTE.
 *
 * `__tests__/conformite-des-vues-galerie.test.ts` importe `doitEnrichirLaGalerie`
 * ci-dessus SANS vouloir monter passerelle, build et navigateur — le même
 * besoin que `mesure-reseau.mjs` a déjà résolu (`playwright.config.ts`,
 * commentaire « pages/chaînes ») avec la même garde `import.meta`.
 */
const executeDirectement = (): boolean => {
  const argument = process.argv[1];
  if (argument === undefined) return false;
  try {
    return import.meta.url === pathToFileURL(argument).href;
  } catch {
    return false;
  }
};

if (executeDirectement()) {
  principal().then(
    (code) => process.exit(code),
    (erreur: unknown) => {
      process.stderr.write(`[conformité] ÉCHEC : ${String(erreur)}\n`);
      process.exit(2);
    },
  );
}
