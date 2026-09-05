import { documentDuFil, type EtatDuFil } from '@/app/connecte/fil-vue';
import { message, type Message } from '@/lib/api/fil';
import type { Contexte } from '@/lib/realtime/fil-contexte';
import { bulleServie } from '@/lib/realtime/fil-etat';
import { prendsLesGestes } from '@/lib/realtime/fil-gestes';

/**
 * LE MENU D'UNE LIGNE — fermeture, repli et destruction (§ 12.10.1, revue de
 * l'issue #5163) :
 *
 *   §2 — `prendsLesGestes` rend une poignée de destruction qui retire les
 *        TROIS familles d'écouteurs (réagir, menu, fermeture des menus) —
 *        dimension 3, § 12.11 étage 3 (« aucune fuite de listener ni de
 *        socket ») ;
 *   §3 — un `submit` SANS `SubmitEvent.submitter` (un moteur qui ne le sert
 *        pas) se replie sur `document.activeElement` plutôt que de sortir en
 *        silence ;
 *   §5 — ouvrir un second menu referme le premier, un clic hors de tout menu
 *        les referme tous, Échap fait de même.
 *
 * Le document est SERVI (`documentDuFil`), jamais fabriqué à la main — le
 * même patron que `fil-composeur-arme.test.ts` et `fil-peinture.test.ts`.
 */

const LANGUES = ['fr'];
const ORIGINE = 'https://gate.test';

const mienMessage = (id: string, contenu: string): Message =>
  message(
    { id, content: contenu, originalLanguage: 'fr', createdAt: '2026-09-01T12:00:00.000Z', senderId: 'u1', sender: { id: 'p1', displayName: 'Amina' } },
    'u1',
    LANGUES,
    ORIGINE,
  )!;

const M1 = mienMessage('m1', 'Un premier message');
const M2 = mienMessage('m2', 'Un second message');

const etat = (): EtatDuFil => ({
  porte: { genre: 'membre', cle: 'c1' },
  fil: { id: 'c1', titre: 'T', membres: 2, presence: { participants: ['u2'], presents: [] }, messages: [M2, M1], plusAncien: null },
  lecteur: { id: 'u1', nom: 'Amina', langues: LANGUES },
  erreur: null,
  brouillon: '',
  maintenant: Date.parse('2026-09-01T12:30:00.000Z'),
  composeur: { genre: 'ouvert' },
  contexte: null,
  tempsReel: null,
  plein: null,
  profil: null,
});

const menus = (liste: Element): readonly HTMLDetailsElement[] => [...liste.querySelectorAll<HTMLDetailsElement>('details.actions')];

/** Ouvrir un `<details>` comme le ferait un clic — `open` posé, puis l'événement `toggle` que le navigateur émet. */
const ouvre = (details: HTMLDetailsElement): void => {
  details.open = true;
  details.dispatchEvent(new Event('toggle'));
};

const monte = () => {
  document.open();
  document.write(documentDuFil(etat()));
  document.close();
  const main = document.querySelector<HTMLElement>('main')!;
  const liste = main.querySelector<HTMLOListElement>('ol.lignes')!;
  const armements: { readonly genre: string }[] = [];
  const ctx = {
    p: { liste },
    etat: { bulles: [M1, M2].map(bulleServie), frappeurs: [], presents: [] },
    composeur: {
      armeLaReponse: () => armements.push({ genre: 'reponse' }),
      armeLaModification: () => armements.push({ genre: 'modification' }),
    },
    ferme: false,
    socket: null,
    pret: false,
    creance: { genre: 'membre', jeton: 'j' },
    config: { passerelle: ORIGINE },
  } as unknown as Contexte;
  const applique = jest.fn();
  const envoieLaBulle = jest.fn(async () => undefined);
  const gestes = prendsLesGestes({ ctx, applique, envoieLaBulle });
  return { liste, ctx, armements, gestes, applique };
};

describe('les menus SE REFERMENT (défaut #5163 §5)', () => {
  it('ouvrir un second menu referme le premier', () => {
    const { liste } = monte();
    const [d1, d2] = menus(liste) as readonly [HTMLDetailsElement, HTMLDetailsElement];
    ouvre(d1);
    expect(d1.open).toBe(true);
    ouvre(d2);
    expect(d1.open).toBe(false);
    expect(d2.open).toBe(true);
  });

  it('un clic hors de tout menu les referme tous', () => {
    const { liste } = monte();
    const [d1] = menus(liste) as readonly [HTMLDetailsElement];
    ouvre(d1);
    expect(d1.open).toBe(true);
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(d1.open).toBe(false);
  });

  it('un clic DANS le menu ouvert ne le referme pas', () => {
    const { liste } = monte();
    const [d1] = menus(liste) as readonly [HTMLDetailsElement];
    ouvre(d1);
    const bouton = d1.querySelector('button')!;
    bouton.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(d1.open).toBe(true);
  });

  it('Échap referme le menu ouvert', () => {
    const { liste } = monte();
    const [d1] = menus(liste) as readonly [HTMLDetailsElement];
    ouvre(d1);
    liste.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(d1.open).toBe(false);
  });
});

describe('LE REPLI SANS `SubmitEvent.submitter` (défaut #5163 §3)', () => {
  it('un moteur qui ne sert pas `submitter` se replie sur `document.activeElement`', () => {
    const { liste, armements } = monte();
    const [d1] = menus(liste) as readonly [HTMLDetailsElement];
    const bouton = d1.querySelector<HTMLButtonElement>('button[name="repondre"]')!;
    bouton.focus();
    expect(document.activeElement).toBe(bouton);
    // Un `Event` NU — pas `SubmitEvent` — n'a PAS de propriété `submitter` : le
    // moteur ne la sert pas, exactement le cas que le défaut #3 nomme.
    const soumission = new Event('submit', { bubbles: true, cancelable: true });
    bouton.closest('form')!.dispatchEvent(soumission);
    expect(soumission.defaultPrevented).toBe(true);
    expect(armements).toEqual([{ genre: 'reponse' }]);
  });

  it('sans `submitter` NI bouton focalisé dans le formulaire, le geste NAVIGUE — décision écrite, pas un accident', () => {
    const { liste, armements } = monte();
    const [d1] = menus(liste) as readonly [HTMLDetailsElement];
    const formulaire = d1.querySelector('form')!;
    document.body.focus();
    expect(formulaire.contains(document.activeElement)).toBe(false);
    const soumission = new Event('submit', { bubbles: true, cancelable: true });
    formulaire.dispatchEvent(soumission);
    expect(soumission.defaultPrevented).toBe(false);
    expect(armements).toEqual([]);
  });
});

describe('LA POIGNÉE DE DESTRUCTION (défaut #5163 §2, dimension 3)', () => {
  it('detruit() retire les trois familles d’écouteurs — plus aucun geste n’agit ensuite', () => {
    const { liste, armements, gestes } = monte();
    const [d1] = menus(liste) as readonly [HTMLDetailsElement];

    gestes.detruit();

    // Le MENU ne réagit plus.
    const bouton = d1.querySelector<HTMLButtonElement>('button[name="repondre"]')!;
    bouton.focus();
    const soumission = new Event('submit', { bubbles: true, cancelable: true });
    d1.querySelector('form')!.dispatchEvent(soumission);
    expect(soumission.defaultPrevented).toBe(false);
    expect(armements).toEqual([]);

    // La FERMETURE des menus ne réagit plus — ouvrir un menu n'en referme plus un autre.
    d1.open = true;
    d1.dispatchEvent(new Event('toggle'));
    const [, d2] = menus(liste) as readonly [HTMLDetailsElement, HTMLDetailsElement];
    d2.open = true;
    d2.dispatchEvent(new Event('toggle'));
    expect(d1.open).toBe(true);

    // La RÉACTION ne réagit plus.
    const reagir = liste.querySelector<HTMLButtonElement>('button.reagir');
    if (reagir !== null) {
      reagir.dispatchEvent(new Event('click', { bubbles: true }));
    }
  });
});
