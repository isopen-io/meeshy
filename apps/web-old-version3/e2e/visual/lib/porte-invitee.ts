import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

import { cleDeLien, nomDuCookie } from '../../../lib/api/guest-session';
import { chargeDeMessage } from './bouchon-socket';
import {
  CONVERSATION_DU_LECTEUR,
  IDENTIFIANT_DU_LIEN_PARTAGE,
  INVITE,
  LIEN_DU_FIL,
  PAIR_ANGLOPHONE,
  type MessageServi,
  type PasserelleDeBouchon,
  type ServeurV3,
} from './serveurs';

/**
 * LA PORTE DE L'INVITÉ, VUE DU HARNAIS — ce qu'un spec fait pour ouvrir
 * `/chat/:lien` en état INVITÉ sur la chaîne réelle, et pour lire ce qui en
 * part. Partagé par la machine à trois états (`v3-fil-invite.spec.ts`) et par
 * les six cas C→H de la recette (`v3-lifecycle.spec.ts`) : deux specs qui
 * recopieraient le cookie, l'adresse ou le prédicat « aucune jonction »
 * divergeraient au premier nom de cookie déplacé.
 */

const CLE = cleDeLien({ linkId: LIEN_DU_FIL });
if (CLE === null) throw new Error(`${LIEN_DU_FIL} n'est pas une clé de lien`);

/** Le nom que `lib/api/guest-session.ts` seul compose — lu ici, jamais réécrit. */
export const NOM_DU_COOKIE = nomDuCookie(CLE);

export type PorteInvitee = {
  readonly adresse: string;
  readonly contexteDeLInvite: (navigateur: Browser, options?: Parameters<Browser['newContext']>[0]) => Promise<BrowserContext>;
  readonly cookieDeLaPlace: (contexte: BrowserContext) => Promise<{ readonly value: string; readonly path: string } | undefined>;
  /** L'état INVITÉ ouvert, le module de participation greffé et dans la room. */
  readonly ouvre: (contexte: BrowserContext, adresse?: string) => Promise<Page>;
  readonly ecrit: (page: Page, texte: string) => Promise<void>;
  /** Un message d'un PAIR, tel que la liste et `/sync` le servent — jamais poussé par le socket. */
  readonly messageDIbrahim: (id: string, content: string, createdAt?: string) => MessageServi;
  readonly cheminsRecus: () => readonly string[];
  /** Aucune porte de jonction n'a été poussée — ni la canonique, ni les deux historiques. */
  readonly aucuneJonction: () => boolean;
};

export const porteInvitee = ({ passerelle, v3 }: { readonly passerelle: () => PasserelleDeBouchon; readonly v3: () => ServeurV3 }): PorteInvitee => {
  const adresse = (): string => `${v3().base}/chat/${IDENTIFIANT_DU_LIEN_PARTAGE}`;
  const cheminsRecus = (): readonly string[] => passerelle().journal.map((a) => `${a.methode} ${a.chemin.split('?')[0]}`);

  return {
    get adresse() {
      return adresse();
    },
    contexteDeLInvite: async (navigateur, options = {}) => {
      const contexte = await navigateur.newContext(options);
      // Le cookie que la route pose à la jonction : nommé par le lien, porté à la porte de l'invité.
      await contexte.addCookies([{ name: NOM_DU_COOKIE, value: INVITE.session, domain: '127.0.0.1', path: '/chat' }]);
      return contexte;
    },
    cookieDeLaPlace: async (contexte) => (await contexte.cookies()).find((cookie) => cookie.name === NOM_DU_COOKIE),
    ouvre: async (contexte, ou = adresse()) => {
      const page = await contexte.newPage();
      await page.goto(ou, { waitUntil: 'load' });
      await expect(page.locator('.etat')).toHaveAttribute('data-etat', 'connecte', { timeout: 15_000 });
      return page;
    },
    ecrit: async (page, texte) => {
      await page.locator('#champ-texte').click();
      await page.keyboard.type(texte);
      await page.keyboard.press('Enter');
    },
    messageDIbrahim: (id, content, createdAt = new Date().toISOString()): MessageServi => ({
      ...chargeDeMessage({
        id,
        conversationId: CONVERSATION_DU_LECTEUR.id,
        senderId: PAIR_ANGLOPHONE.id,
        content,
        originalLanguage: 'fr',
        sender: { id: 'p-ibrahim', displayName: PAIR_ANGLOPHONE.nom, userId: PAIR_ANGLOPHONE.id },
        createdAt,
      }),
      senderParticipantId: 'p-ibrahim',
    }),
    cheminsRecus,
    aucuneJonction: () =>
      !cheminsRecus().some((c) => c.includes('/members') || c.includes('/anonymous/join') || c.includes('/conversations/join')),
  };
};
