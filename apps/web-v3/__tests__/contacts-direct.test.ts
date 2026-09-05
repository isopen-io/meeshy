import { axe } from 'jest-axe';

import { documentDesContacts, type EtatDesContacts } from '@/app/connecte/contacts-vue';

/**
 * LES FENTES DU DIRECT DE `/contacts` (issue #4921) — opposées au document que
 * le SERVEUR sert, jamais à un fragment fabriqué.
 *
 * Le module de participation (`lib/realtime/contacts.ts`) intercepte les deux
 * gestes d'une demande reçue et les rend OPTIMISTES : il remplit et révèle,
 * il ne fabrique rien. Chaque fente qu'il touche doit donc être SERVIE —
 * l'état « fait » d'une ligne, la voix de l'écran — et chaque ligne doit
 * porter l'identifiant que le geste envoie.
 */

const DEMANDE = (id: string, nom: string) => ({
  id,
  sens: 'recue' as const,
  personne: { id: `u-${id}`, pseudonyme: nom.toLowerCase(), nom, enLigne: false, vuA: null },
  creeeA: '2026-09-03T10:00:00.000Z',
});

const CONTACT = (nom: string) => ({
  id: `carnet-${nom.toLowerCase()}`,
  nom,
  personne: { id: `u-${nom.toLowerCase()}`, pseudonyme: nom.toLowerCase(), nom, enLigne: false, vuA: null },
  surMeeshy: true,
});

const TEMPS_REEL = { module: '/__v3/rt/contacts.abcd.js', passerelle: 'https://gate.meeshy.me' };

const ETAT = (attributs: Partial<EtatDesContacts> = {}): EtatDesContacts => ({
  demandesRecues: [DEMANDE('fr-1', 'Sara Kim')],
  demandesEnvoyees: [],
  contacts: [CONTACT('Marta')],
  maintenant: Date.parse('2026-09-03T12:00:00.000Z'),
  avis: null,
  tempsReel: TEMPS_REEL,
  ...attributs,
});

const peint = (etat: EtatDesContacts): void => {
  document.open();
  document.write(documentDesContacts(etat));
  document.close();
};

describe('le document des contacts porte ses fentes de direct', () => {
  it('nomme son module et sa passerelle — et s’en abstient quand le module n’est pas compilé', () => {
    peint(ETAT());
    const main = document.querySelector<HTMLElement>('main')!;
    expect(main.dataset.participation).toBe('contacts');
    expect(main.dataset.module).toBe(TEMPS_REEL.module);
    expect(main.dataset.passerelle).toBe(TEMPS_REEL.passerelle);

    peint(ETAT({ tempsReel: null }));
    expect(document.querySelector('main[data-participation]')).toBeNull();
  });

  it('chaque demande REÇUE porte son identifiant et une fente d’état SERVIE cachée', () => {
    peint(ETAT());
    const ligne = document.querySelector<HTMLElement>('li[data-sorte="recue"]')!;

    expect(ligne.dataset.demande).toBe('fr-1');
    const etat = ligne.querySelector<HTMLElement>('.etat-du-geste')!;
    expect(etat.hidden).toBe(true);
    expect(etat.textContent).toBe('');
    // Les deux gestes restent des formulaires — le chemin sans JavaScript.
    expect(ligne.querySelectorAll('form')).toHaveLength(2);
  });

  it('sert la voix de l’écran — une région créée après coup n’est annoncée par personne', () => {
    peint(ETAT());
    const journal = document.querySelector<HTMLElement>('#journal-des-gestes')!;

    expect(journal.getAttribute('role')).toBe('status');
    expect(journal.textContent).toBe('');
  });

  it('reste accessible, fentes comprises', async () => {
    peint(ETAT());
    const rapport = await axe(document.documentElement);
    const graves = rapport.violations
      .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
      .map((violation) => `${violation.id} — ${violation.help}`);
    expect(graves).toEqual([]);
  });
});
