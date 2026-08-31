import { expect, type BrowserContext, type Page } from '@playwright/test';

import {
  CLE_DU_LIEN,
  NOM_DU_LIEN,
  passerelleDeBouchon,
  serveurDeLaV3,
  type MessageDeBouchon,
  type PasserelleDeBouchon,
  type ReglageDeBouchon,
  type ServeurV3,
} from './serveurs';

/**
 * LA CHAÎNE DE L'ÉCRAN `thread`, ET SES FIXTURES — extraites du spec qui les
 * portait.
 *
 * Ce n'est pas un rangement : le spec a franchi le budget de 800–1100 lignes du
 * `CLAUDE.md` racine en gagnant les cas que la revue a demandés, et la règle est
 * qu'on EXTRAIT avant d'ajouter. Le découpage se fait par RESPONSABILITÉ — ici
 * « de quoi une recette du fil a besoin pour exister » : une passerelle de
 * bouchon, un serveur `next start`, le parcours qui ouvre le fil, et les
 * personnages que la cible dessine.
 *
 * Les fixtures ne sont pas décoratives. Chacune existe pour rendre un défaut
 * VISIBLE : `TOLU` porte le fait d'être sans compte, `MARTA` une langue
 * d'origine différente de la langue servie, `BEAUCOUP` un fil assez long pour
 * qu'un pli existe. Sans elles, trois témoins de ce fichier seraient verts par
 * absence de sujet.
 */

export const CHEMIN_DU_FIL = `/chats/${CLE_DU_LIEN}`;

export const IBRAHIM: MessageDeBouchon = {
  id: 'm-1',
  senderId: 'participant-9',
  content: 'On se cale à 15 h pour la revue ?',
  originalLanguage: 'fr',
  createdAt: '2026-08-30T12:01:00.000Z',
  auteur: 'Ibrahim',
};

/**
 * L'auteur SANS COMPTE de la cible — celui que la planche marque d'un fantôme
 * et du mot « anonyme ». Il n'existait dans aucune fixture, si bien qu'aucun
 * témoin ne pouvait voir que l'écran ne rendait ni l'un ni l'autre.
 */
export const TOLU: MessageDeBouchon = {
  id: 'm-3',
  senderId: 'participant-7',
  content: 'Ça me va. J’apporte les chiffres de mars.',
  originalLanguage: 'fr',
  createdAt: '2026-08-30T12:03:00.000Z',
  auteur: 'Tolu',
  anonyme: true,
};

/**
 * LE MESSAGE QUI PROUVE OÙ LE PRISME DESCEND. Son original est espagnol, sa
 * traduction française : si l'espagnol apparaît dans le DOCUMENT, c'est que
 * l'original a traversé la frontière serveur→client pour rien.
 */
export const MARTA: MessageDeBouchon = {
  id: 'm-4',
  senderId: 'participant-8',
  content: 'Perfecto, lo reviso esta tarde.',
  originalLanguage: 'es',
  translations: [{ targetLanguage: 'fr', translatedContent: 'Parfait, je le relis cet après-midi.' }],
  createdAt: '2026-08-30T12:04:00.000Z',
  auteur: 'Marta Ruiz',
};

/**
 * ASSEZ DE BULLES POUR QU'UN PLI EXISTE.
 *
 * Toutes les fixtures de ce fichier tenaient dans le viewport (1 à 3 messages),
 * et `toContainText` ne dit RIEN de la visibilité : le fil pouvait s'ouvrir sur
 * le message le plus ancien, la bulle optimiste pouvait naître hors du pli, et
 * aucun témoin ne le voyait. Trente bulles suffisent à faire défiler la zone.
 */
export const BEAUCOUP: readonly MessageDeBouchon[] = Array.from({ length: 30 }, (_, rang) => ({
  id: `m-ancien-${rang}`,
  senderId: 'participant-9',
  content: `message ancien numéro ${rang}`,
  originalLanguage: 'fr',
  createdAt: new Date(Date.UTC(2026, 7, 30, 10, rang)).toISOString(),
  auteur: 'Ibrahim',
}));

export const DERNIER_ANCIEN = BEAUCOUP[BEAUCOUP.length - 1] as MessageDeBouchon;

/** Le message MANQUÉ du cas C — celui qui arrive pendant qu'on n'est pas là. */
export const MANQUE: MessageDeBouchon = {
  id: 'm-2',
  senderId: 'participant-9',
  content: 'Perfecto, lo reviso esta tarde.',
  originalLanguage: 'es',
  translations: [{ targetLanguage: 'fr', translatedContent: 'Parfait, je le relis cet après-midi.' }],
  createdAt: '2026-08-30T12:03:00.000Z',
  auteur: 'Marta Ruiz',
};

export type Chaine = {
  readonly passerelle: PasserelleDeBouchon;
  readonly serveur: ServeurV3;
  readonly ferme: () => Promise<void>;
};

export const monte = async (options?: ReglageDeBouchon): Promise<Chaine> => {
  const passerelle = await passerelleDeBouchon({ messages: [IBRAHIM], ...options });
  const serveur = await serveurDeLaV3(passerelle.base);

  return {
    passerelle,
    serveur,
    ferme: async () => {
      await serveur.ferme();
      await passerelle.ferme();
    },
  };
};

/**
 * LE PARCOURS COMPLET, parce que le fil n'est atteignable QUE par lui : entrer,
 * lire ce que la place ouvre, puis appuyer sur le CTA de la cible. Les trois
 * états vivent à la MÊME adresse (§ 6.3 B), et le marqueur d'entrée est un
 * cookie que seul le serveur écrit — un test qui le poserait à la main
 * prouverait qu'il sait écrire un cookie, pas que le geste marche.
 */
export const ouvreLeFil = async (page: Page, chaine: Chaine, pseudo = 'Tolu'): Promise<void> => {
  await page.goto(`${chaine.serveur.base}${CHEMIN_DU_FIL}`, { waitUntil: 'domcontentloaded' });
  await page.locator('#pseudo').fill(pseudo);
  await page.getByRole('button', { name: 'Rejoindre la conversation' }).click();
  await page.getByRole('button', { name: 'Entrer dans la conversation' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(NOM_DU_LIEN);
};

export const appels = (chaine: Chaine, fragment: string): number =>
  chaine.passerelle.journal.filter((appel) => appel.chemin.includes(fragment)).length;

export const envois = (chaine: Chaine): readonly string[] =>
  chaine.passerelle.journal
    .filter((appel) => appel.methode === 'POST' && appel.chemin.includes('/messages'))
    .map((appel) => String(JSON.parse(appel.corps).content));

export const jetonDuNavigateur = async (contexte: BrowserContext): Promise<string | undefined> =>
  (await contexte.cookies()).find((biscuit) => biscuit.name === `meeshy.guest.${CLE_DU_LIEN}`)?.value;
