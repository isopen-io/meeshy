import { REGION_DE_LA_BANNIERE } from '@/app/connecte/banniere-vue';
import { BANNIERE, DUREE_DE_LA_BANNIERE_MS } from '@/lib/contenu/banniere';
import { brancheLaBanniere, porteDeLaBanniere, type Minuterie } from '@/lib/realtime/banniere';

/**
 * LA BANNIÈRE EN APPLICATION, PEINTE (#4454) — la porte opposée à la RÉGION
 * QUE LE DOCUMENT SERT, jamais à un fragment fabriqué pour le témoin.
 *
 * C'est la seule façon de prouver ce qui compte ici : la porte cherche ses
 * trois nœuds par leurs classes, et un renommage dans la vue sans le
 * renommage correspondant dans le module produirait une bannière qui ne peint
 * RIEN, silencieusement. Un témoin qui poserait son propre `<output>` laisserait
 * passer exactement ce défaut.
 *
 * LE TEMPS EST COUSU, jamais attendu : `Minuterie` est injectée. Un témoin qui
 * dormirait sept secondes ferait payer sept secondes à chaque exécution de la
 * suite et ne prouverait rien de plus que l'appel qu'on inspecte.
 */

const region = (): HTMLElement => {
  document.body.innerHTML = REGION_DE_LA_BANNIERE;
  const trouvee = document.querySelector<HTMLElement>('.banniere');
  if (trouvee === null) throw new Error('le document ne sert plus de région .banniere');
  return trouvee;
};

type Armement = { readonly rappel: () => void; readonly ms: number };

const minuterieCousue = (): { minuterie: Minuterie; armements: Armement[]; desarmes: number[] } => {
  const armements: Armement[] = [];
  const desarmes: number[] = [];
  return {
    armements,
    desarmes,
    minuterie: {
      arme: (rappel, ms) => {
        armements.push({ rappel, ms });
        return armements.length;
      },
      desarme: (identifiant) => {
        desarmes.push(identifiant);
      },
    },
  };
};

const alice = { displayName: 'Alice Martin', username: 'alice' };

const messagePrive = {
  id: 'n1',
  type: 'new_message',
  title: 'Alice Martin',
  content: 'on se voit à 18h ?',
  actor: alice,
  context: { conversationType: 'direct', conversationTitle: 'Alice Martin' },
};

const dit = (noeud: HTMLElement, classe: string): string =>
  noeud.querySelector<HTMLElement>(`.${classe}`)?.textContent ?? '';

const masque = (noeud: HTMLElement, classe: string): boolean =>
  noeud.querySelector<HTMLElement>(`.${classe}`)?.hidden === true;

describe('la région servie', () => {
  it('est servie VIDE et MASQUÉE — une région annoncée n’annonce rien avant qu’il n’arrive quelque chose', () => {
    const noeud = region();

    expect(noeud.hidden).toBe(true);
    expect(dit(noeud, 'banniere-titre')).toBe('');
    expect(dit(noeud, 'banniere-corps')).toBe('');
  });

  /**
   * UNE RÉGION `aria-live` CRÉÉE APRÈS COUP N'EST ANNONCÉE PAR AUCUN LECTEUR
   * D'ÉCRAN : le navigateur ne surveille que celles qui existaient quand il a
   * construit l'arbre. C'est un fait de plateforme, et c'est pour cela que le
   * document la sert plutôt que le module ne la crée — ce témoin garde le
   * choix, pas le style.
   */
  it('est un <output>, donc une région de statut POLIE sans rôle écrit à la main', () => {
    const noeud = region();

    expect(noeud.tagName).toBe('OUTPUT');
    expect(noeud.getAttribute('role')).toBeNull();
    expect(noeud.getAttribute('aria-label')).toBe(BANNIERE.region);
  });

  it('porte une croix NOMMÉE — un rond sans nom accessible n’est pas un contrôle', () => {
    const fermer = region().querySelector<HTMLElement>('.banniere-fermer');

    expect(fermer?.getAttribute('aria-label')).toBe(BANNIERE.fermer);
    expect(fermer?.tagName).toBe('BUTTON');
  });
});

describe('ce que la porte peint', () => {
  it('montre le titre et le corps que la loi rend, et découvre la région', () => {
    const noeud = region();
    porteDeLaBanniere(noeud, minuterieCousue().minuterie).montre(messagePrive);

    expect(noeud.hidden).toBe(false);
    expect(dit(noeud, 'banniere-titre')).toBe('Alice Martin');
    expect(dit(noeud, 'banniere-corps')).toBe('on se voit à 18h ?');
    expect(masque(noeud, 'banniere-corps')).toBe(false);
  });

  it('masque le corps quand la loi n’en rend pas — une ligne vide n’est pas une ligne', () => {
    const noeud = region();
    porteDeLaBanniere(noeud, minuterieCousue().minuterie).montre({
      id: 'n2',
      type: 'friend_request',
      title: 'Alice Martin',
      subtitle: 'veut se connecter',
      content: 'Nouvelle demande de contact',
      actor: alice,
    });

    expect(dit(noeud, 'banniere-titre')).toBe('Alice Martin veut se connecter');
    expect(masque(noeud, 'banniere-corps')).toBe(true);
  });

  it('pose la pastille de réaction, et la retient quand la phrase porte déjà l’émoji', () => {
    const noeud = region();
    const porte = porteDeLaBanniere(noeud, minuterieCousue().minuterie);

    porte.montre({
      id: 'n3',
      type: 'story_reaction',
      title: 'Alice Martin',
      subtitle: 'a réagi à votre story',
      actor: alice,
      metadata: { reactionEmoji: '❤️' },
    });
    expect(dit(noeud, 'banniere-reaction')).toBe('❤️');
    expect(masque(noeud, 'banniere-reaction')).toBe(false);

    porte.montre({
      id: 'n4',
      type: 'story_reaction',
      title: 'Alice Martin',
      subtitle: 'a réagi 🔥 à votre story',
      actor: alice,
      metadata: { emoji: '🔥' },
    });
    expect(masque(noeud, 'banniere-reaction')).toBe(true);
  });

  /**
   * LE REFUS, ET C'EST LE TÉMOIN LE PLUS IMPORTANT DE CE FICHIER. Sans nom
   * servi ni phrase d'action, la liaison rend un titre VIDE plutôt qu'un
   * « Quelqu'un » fabriqué (`lib/notifications/banniere.ts`). La porte le lit
   * comme « ne peins rien » : un toast qui ne dit rien vaut moins que pas de
   * toast du tout, et il aurait en plus fait taire celui d'après en armant
   * une minuterie.
   */
  it('ne peint RIEN d’une charge sans nom ni phrase — et n’arme aucune minuterie', () => {
    const noeud = region();
    const { minuterie, armements } = minuterieCousue();

    porteDeLaBanniere(noeud, minuterie).montre({ id: 'n5', type: 42, actor: 'pas un objet' });

    expect(noeud.hidden).toBe(true);
    expect(dit(noeud, 'banniere-titre')).toBe('');
    expect(armements).toEqual([]);
  });

  it('ne peint rien, et ne rougit pas, sur une charge qui n’est pas un objet', () => {
    const noeud = region();
    const porte = porteDeLaBanniere(noeud, minuterieCousue().minuterie);

    for (const charge of [null, undefined, 'texte', 7, []]) {
      expect(() => porte.montre(charge)).not.toThrow();
    }
    expect(noeud.hidden).toBe(true);
  });

  it('ne rougit pas quand aucune région n’est servie — l’écran sans module n’en a pas', () => {
    expect(() => porteDeLaBanniere(null).montre(messagePrive)).not.toThrow();
  });
});

describe('le temps de la bannière', () => {
  it('arme la minuterie sur la durée décidée, et se retire quand elle sonne', () => {
    const noeud = region();
    const { minuterie, armements } = minuterieCousue();

    porteDeLaBanniere(noeud, minuterie).montre(messagePrive);
    expect(armements).toHaveLength(1);
    expect(armements[0]?.ms).toBe(DUREE_DE_LA_BANNIERE_MS);

    armements[0]?.rappel();
    expect(noeud.hidden).toBe(true);
    expect(dit(noeud, 'banniere-titre')).toBe('');
  });

  /**
   * DEUX NOTIFICATIONS EN SEPT SECONDES — le cas d'usage, pas le cas limite.
   * Sans le désarmement, la minuterie de la PREMIÈRE effacerait la seconde en
   * plein milieu de sa lecture.
   */
  it('désarme la minuterie précédente quand une seconde bannière arrive', () => {
    const noeud = region();
    const { minuterie, armements, desarmes } = minuterieCousue();
    const porte = porteDeLaBanniere(noeud, minuterie);

    porte.montre(messagePrive);
    porte.montre({ ...messagePrive, id: 'n6', content: 'ou 19h ?' });

    expect(armements).toHaveLength(2);
    expect(desarmes).toEqual([1]);
    expect(dit(noeud, 'banniere-corps')).toBe('ou 19h ?');
  });

  it('la croix retire la bannière ET désarme sa minuterie', () => {
    const noeud = region();
    const { minuterie, desarmes } = minuterieCousue();
    const socket = { on: (): void => undefined };

    brancheLaBanniere({ socket, region: noeud, minuterie }).montre(messagePrive);
    noeud.querySelector<HTMLElement>('.banniere-fermer')?.click();

    expect(noeud.hidden).toBe(true);
    expect(desarmes).toEqual([1]);
  });
});

describe('le branchement', () => {
  it('n’écoute QUE `notification:new` — un module de participation n’est pas un abonnement', () => {
    const ecoutes: string[] = [];
    brancheLaBanniere({
      socket: { on: (evenement) => ecoutes.push(evenement) },
      region: region(),
      minuterie: minuterieCousue().minuterie,
    });

    expect(ecoutes).toEqual(['notification:new']);
  });

  it('peint ce que le socket apporte, sans que rien d’autre ne soit appelé', () => {
    const noeud = region();
    const ecouteurs: ((charge: unknown) => void)[] = [];

    brancheLaBanniere({
      socket: {
        on: (_evenement, ecouteur) => {
          ecouteurs.push(ecouteur);
        },
      },
      region: noeud,
      minuterie: minuterieCousue().minuterie,
    });

    expect(ecouteurs).toHaveLength(1);
    ecouteurs[0]?.(messagePrive);
    expect(dit(noeud, 'banniere-titre')).toBe('Alice Martin');
  });
});
