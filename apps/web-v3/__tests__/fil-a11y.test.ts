import { axe } from 'jest-axe';

import { documentDuChoix } from '@/app/(public)/chat/[lien]/choix-vue';
import { documentDuFil, type EtatDuFil } from '@/app/connecte/fil-vue';
import { message } from '@/lib/api/fil';
import type { CleDeLien } from '@/lib/api/guest-session';

/**
 * Gate B (§ 9.5) sur LE FIL, à ses deux portes, et sur l'état CHOIX : « 0
 * violation `axe` `serious`/`critical` ». Le harnais est celui de la vitrine :
 * le document COMPLET, tel que le gestionnaire le sert — `html-has-lang`,
 * `landmark-one-main`, `page-has-heading-one`, les `lang` des textes traduits.
 */

const graves = async (): Promise<readonly string[]> => {
  const rapport = await axe(document.documentElement);
  return rapport.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => `${violation.id} — ${violation.help}`);
};

const ecris = (html: string): void => {
  document.open();
  document.write(html);
  document.close();
};

const messages = [
  message({ id: 'm1', content: 'Shall we meet?', originalLanguage: 'en', createdAt: '2026-09-01T12:00:00.000Z', senderId: 'u2', sender: { id: 'p2', displayName: 'Ibrahim' }, translations: [{ language: 'fr', content: 'On se voit ?' }] }, 'u1', ['fr'], 'https://gate.test'),
  message({ id: 'm2', content: 'Oui', originalLanguage: 'fr', createdAt: '2026-09-01T12:01:00.000Z', senderId: 'u1', sender: { id: 'p1', displayName: 'Amina' }, readCount: 1 }, 'u1', ['fr'], 'https://gate.test'),
  message({ id: 'm3', content: 'Ça me va', originalLanguage: 'fr', createdAt: '2026-09-01T12:02:00.000Z', senderId: 'p9', sender: { id: 'p9', displayName: 'Tolu', type: 'anonymous' } }, 'u1', ['fr'], 'https://gate.test'),
].filter((m): m is NonNullable<typeof m> => m !== null);

const TEMPS_REEL = {
  passerelle: 'https://gate.test',
  actifs: {
    participate: { nom: 'participate.a.js', url: '/__v3/rt/participate.a.js', corps: '' },
    socket: { nom: 'socket.io.b.js', url: '/__v3/rt/socket.io.b.js', corps: '' },
  },
};

const etat = (attributs: Partial<EtatDuFil> = {}): EtatDuFil => ({
  porte: { genre: 'membre', cle: 'c1' },
  fil: { id: 'c1', titre: 'Équipe Lagos', membres: 4, presence: { participants: ['u2'], presents: ['u2'] }, messages, plusAncien: 'm0' },
  lecteur: { id: 'u1', nom: 'Amina', langues: ['fr'] },
  erreur: null,
  brouillon: '',
  maintenant: Date.parse('2026-09-01T12:30:00.000Z'),
  composeur: { genre: 'ouvert' },
  tempsReel: TEMPS_REEL,
  ...attributs,
});

describe('le fil face à axe', () => {
  it('ne porte aucune violation grave — porte du membre, temps réel greffé', async () => {
    ecris(documentDuFil(etat()));
    expect(await graves()).toEqual([]);
  });

  it('ne porte aucune violation grave — porte de l’invité, bandeau des droits ouvert', async () => {
    ecris(
      documentDuFil(
        etat({
          porte: {
            genre: 'invite',
            lien: 'mshy_lagos' as CleDeLien,
            segment: 'lagos-q1',
            pseudo: 'Tolu',
            droits: { canSendMessages: true, canSendFiles: false, canSendImages: false, canViewHistory: true },
            jonctionFraiche: true,
          },
          lecteur: { id: 'p9', nom: 'Tolu', langues: ['fr'] },
        }),
      ),
    );
    expect(await graves()).toEqual([]);
  });

  it('ne porte aucune violation grave — composeur fermé, fil vide', async () => {
    ecris(etatFerme());
    expect(await graves()).toEqual([]);
  });

  it('ne porte aucune violation grave — état CHOIX, modale ouverte sur le cadre inerte', async () => {
    ecris(
      documentDuChoix({
        segment: 'lagos-q1',
        apercu: { lien: 'mshy_lagos' as CleDeLien, nom: 'Équipe Lagos', description: 'Le canal.', conversationId: 'c1', requireNickname: true, requireAccount: false, requireEmail: false, requireBirthday: false, languesAutorisees: [], participants: 12 },
        langueProposee: 'fr',
        saisie: { pseudo: '', courriel: '', naissance: '' },
        refus: null,
        clos: null,
        maintenant: 0,
      }),
    );
    expect(await graves()).toEqual([]);
  });

  it('rougit sur un document dont la structure est fautive', async () => {
    ecris('<html><body><div tabindex="0"><img src="x"></div></body></html>');
    expect(await graves()).not.toEqual([]);
  });
});

const etatFerme = (): string =>
  documentDuFil(etat({ fil: { id: 'c1', titre: 'T', membres: 1, presence: { participants: [], presents: [] }, messages: [], plusAncien: null }, composeur: { genre: 'ferme', raison: 'Ce lien a expiré.', cause: 'lien' } }));
