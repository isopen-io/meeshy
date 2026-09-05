import { axe } from 'jest-axe';

import { documentDesChats } from '@/app/connecte/liste-vue';
import type { Conversation } from '@/lib/api/compte';
import { CHATS } from '@/lib/contenu/liste';
import { gesteDuSens, prendsLeBalayage } from '@/lib/realtime/balayage';
import { bouge, compte, frappe, metEnSourdine, miseAJourDe, retire, remets } from '@/lib/realtime/liste-etat';
import { etatDuDocument, montreLeTrou, peins, peintre } from '@/lib/realtime/liste-peinture';

/**
 * `/chats` VIVANTE — la peinture, le balayage et le verdict d'axe, opposés au
 * document que le SERVEUR sert (jamais à un fragment fabriqué pour le témoin).
 *
 * C'est ce qui rend ces témoins opposables : ils partent de `documentDesChats`,
 * si bien qu'une fente que la vue cesserait de servir ferait tomber la peinture
 * ici — pas seulement au navigateur, où elle échouerait en silence.
 */

const CONVERSATION = (attributs: Partial<Conversation> = {}): Conversation => ({
  id: 'c1',
  identifiant: 'lagos',
  titre: 'Équipe Lagos',
  genre: 'group',
  membres: 4,
  nonLus: 0,
  dernierMessageA: '2026-09-01T12:00:00.000Z',
  apercu: 'On se cale à 15 h ?',
  apercuTraductions: null,
  apercuLangueOriginale: 'fr',
  sourdine: false,
  archivee: false,
  participantsInscrits: [],
  ...attributs,
});

const MAINTENANT = Date.parse('2026-09-01T12:30:00.000Z');

const TEMPS_REEL = {
  passerelle: 'https://gate.meeshy.me',
  actifs: {
    participate: { nom: 'p.js', url: '/__v3/rt/p.js', corps: '' },
    liste: { nom: 'l.js', url: '/__v3/rt/l.js', corps: '' },
    feed: { nom: 'feed.l.js', url: '/__v3/rt/feed.l.js', corps: '' },
    notifs: { nom: 'notifs.f.js', url: '/__v3/rt/notifs.f.js', corps: '' },
    contacts: { nom: 'contacts.f.js', url: '/__v3/rt/contacts.f.js', corps: '' },
    recherche: { nom: 'recherche.f.js', url: '/__v3/rt/recherche.f.js', corps: '' },
    liens: { nom: 'liens.f.js', url: '/__v3/rt/liens.f.js', corps: '' },
    commentaires: { nom: 'commentaires.f.js', url: '/__v3/rt/commentaires.f.js', corps: '' },
    plein: { nom: 'plein.f.js', url: '/__v3/rt/plein.f.js', corps: '' },
    navigateur: { nom: 'n.js', url: '/__v3/rt/n.js', corps: '' },
    composer: { nom: 'composer.f.js', url: '/__v3/rt/composer.f.js', corps: '' },
    prefs: { nom: 'prefs.f.js', url: '/__v3/rt/prefs.f.js', corps: '' },
    socket: { nom: 's.js', url: '/__v3/rt/s.js', corps: '' },
  },
};

const peint = (conversations: readonly Conversation[], langues: readonly string[] = ['fr']): void => {
  document.open();
  document.write(
    documentDesChats({ conversations, maintenant: MAINTENANT, langues, moi: 'u1', tempsReel: TEMPS_REEL }),
  );
  document.close();
};

const main = (): HTMLElement => document.querySelector<HTMLElement>('main[data-participation="liste"]')!;

const p = () => peintre(main(), document.documentElement.lang)!;

const ids = (): readonly string[] =>
  [...document.querySelectorAll<HTMLElement>('.liste ul > li')].map((li) => li.dataset.conversation ?? '');

describe('la peinture reprend le document servi', () => {
  it('relit l’état dans les `data-`, jamais dans le texte affiché', () => {
    peint([CONVERSATION({ nonLus: 3, sourdine: true })]);

    expect(etatDuDocument(p()).lignes[0]).toMatchObject({
      id: 'c1',
      titre: 'Équipe Lagos',
      quand: '2026-09-01T12:00:00.000Z',
      nonLus: 3,
      sourdine: true,
      // L'aperçu est repris DÉJÀ RÉSOLU : c'est ce qui empêche la première
      // repeinture d'effacer la pastille que le serveur vient de peindre.
      apercu: { texte: 'On se cale à 15 h ?', langue: null, traduitDe: null },
    });
  });

  /**
   * LA PREMIÈRE REPEINTURE NE DÉFAIT RIEN DE CE QUE LE SERVEUR A PEINT.
   *
   * Le module repeint dès son démarrage (les heures relatives ont vieilli dans
   * le cache du navigateur). Tant qu'il gardait la charge BRUTE et redescendait
   * le Prisme à chaque peinture, cette première passe rendait « aucune
   * traduction » — l'état relu dans le DOM n'ayant aucune carte — et EFFAÇAIT
   * la pastille `es` de la ligne servie. Mesuré au navigateur : la pastille
   * mesurait 51,8 × 26 px au premier pixel et 0 × 0 une seconde plus tard.
   */
  it('ne défait pas la pastille servie au premier repeint', () => {
    peint([CONVERSATION({ apercu: 'Gracias', apercuLangueOriginale: 'es', apercuTraductions: { fr: 'Merci' } })]);
    const pe = p();
    const pastille = document.querySelector<HTMLElement>('li[data-conversation="c1"] .langue')!;

    expect(pastille.hidden).toBe(false);
    peins(pe, etatDuDocument(pe), MAINTENANT);

    expect(pastille.hidden).toBe(false);
    expect(pastille.querySelector('.code')?.textContent).toBe('es');
    expect(document.querySelector('li[data-conversation="c1"] .apercu .texte')?.textContent).toBe('Merci');
  });

  it('remonte une conversation en tête sur `conversation:updated`', () => {
    peint(
      [
        CONVERSATION({ id: 'a', dernierMessageA: '2026-09-01T12:00:00.000Z' }),
        CONVERSATION({ id: 'b', dernierMessageA: '2026-09-01T10:00:00.000Z' }),
      ],
      ['es', 'fr'],
    );
    const pe = p();
    const maj = miseAJourDe({
      conversationId: 'b',
      lastMessageAt: '2026-09-01T13:00:00.000Z',
      lastMessagePreview: 'Hello everyone',
      lastMessageOriginalLanguage: 'en',
      lastMessageTranslations: { es: 'Hola a todos' },
    })!;

    expect(ids()).toEqual(['a', 'b']);
    peins(pe, bouge(etatDuDocument(pe), maj, pe.langues), MAINTENANT);

    expect(ids()).toEqual(['b', 'a']);
    const ligne = document.querySelector<HTMLElement>('li[data-conversation="b"]')!;
    expect(ligne.querySelector('.apercu .texte')?.textContent).toBe('Hola a todos');
    // `lang` est posé parce que la langue SERVIE diffère de celle du document
    // (§ 5.4). Sur un texte servi en `fr` — la langue du document — il ne l'est
    // pas : un `lang` redondant est du bruit pour le lecteur d'écran.
    expect(ligne.querySelector('.apercu .texte')?.getAttribute('lang')).toBe('es');
    expect(ligne.querySelector('.langue .code')?.textContent).toBe('en');
  });

  /**
   * Le re-tri DÉPLACE les nœuds servis, il ne les reconstruit pas : un menu
   * ouvert et le focus du clavier survivent au message qui arrive.
   */
  it('ne referme pas un menu ouvert quand la liste se réordonne', () => {
    peint([
      CONVERSATION({ id: 'a', dernierMessageA: '2026-09-01T12:00:00.000Z' }),
      CONVERSATION({ id: 'b', dernierMessageA: '2026-09-01T10:00:00.000Z' }),
    ]);
    const pe = p();
    const menu = document.querySelector<HTMLDetailsElement>('li[data-conversation="a"] details.actions')!;
    menu.open = true;

    peins(pe, bouge(etatDuDocument(pe), miseAJourDe({ conversationId: 'b', lastMessageAt: '2026-09-01T13:00:00.000Z' })!, pe.langues), MAINTENANT);

    expect(ids()).toEqual(['b', 'a']);
    expect(document.querySelector<HTMLDetailsElement>('li[data-conversation="a"] details.actions')?.open).toBe(true);
  });

  it('bouge la pastille de non-lus, et la fait disparaître à zéro', () => {
    peint([CONVERSATION({ nonLus: 0 })]);
    const pe = p();
    const ligne = document.querySelector<HTMLElement>('li[data-conversation="c1"]')!;

    peins(pe, compte(etatDuDocument(pe), { id: 'c1', nonLus: 5 }), MAINTENANT);
    expect(ligne.dataset.nonlus).toBe('5');
    expect(ligne.querySelector('.compte .valeur')?.textContent).toBe('5');
    // LE MOT SURVIT AU NOMBRE. Écrire le compte dans la pastille elle-même
    // effaçait le libellé hors écran : « 3 » cessait de se dire « 3 non lus »
    // dès la première mise à jour, sans que rien ne change à l'œil.
    expect(ligne.querySelector('.compte .hors-ecran')?.textContent).toBe(` ${CHATS.nonLus}`);

    peins(pe, compte(etatDuDocument(pe), { id: 'c1', nonLus: 0 }), MAINTENANT);
    expect(ligne.dataset.nonlus).toBe('0');
  });

  /**
   * La frappe REMPLACE l'aperçu (charte règle 27) : les deux occupent la même
   * place, jamais deux. Une ligne qui grandirait ferait sauter tout ce qui la
   * suit, à chaque touche frappée par quelqu'un d'autre.
   */
  it('montre la frappe à la place de l’aperçu, puis la rend', () => {
    peint([CONVERSATION()]);
    const pe = p();
    const ligne = document.querySelector<HTMLElement>('li[data-conversation="c1"]')!;
    const frappeur = { conversation: 'c1', nom: 'Marta Ruiz' };

    peins(pe, frappe(etatDuDocument(pe), frappeur, true), MAINTENANT);
    expect(ligne.querySelector<HTMLElement>('.frappe')?.hidden).toBe(false);
    expect(ligne.querySelector('.frappe')?.textContent).toBe(`Marta Ruiz ${CHATS.frappe}`);
    expect(ligne.querySelector<HTMLElement>('.apercu')?.hidden).toBe(true);

    peins(pe, etatDuDocument(pe), MAINTENANT);
    expect(ligne.querySelector<HTMLElement>('.frappe')?.hidden).toBe(true);
    expect(ligne.querySelector<HTMLElement>('.apercu')?.hidden).toBe(false);
  });

  it('dit la sourdine dans la méta, sans toucher au compte de participants', () => {
    peint([CONVERSATION({ membres: 4 })]);
    const pe = p();
    const meta = document.querySelector<HTMLElement>('li[data-conversation="c1"] .meta')!;

    peins(pe, metEnSourdine(etatDuDocument(pe), 'c1', true), MAINTENANT);

    expect(meta.textContent).toBe(`4 ${CHATS.participants} · ${CHATS.sourdine}`);
  });

  /** § 12.10.2 tenu par la PEINTURE aussi : une conversation à deux ne se met pas à parler en direct. */
  it('se tait à deux, même quand la sourdine bascule', () => {
    peint([CONVERSATION({ membres: 2 })]);
    const pe = p();
    const meta = document.querySelector<HTMLElement>('li[data-conversation="c1"] .meta')!;

    peins(pe, metEnSourdine(etatDuDocument(pe), 'c1', true), MAINTENANT);

    expect(meta.textContent).toBe(CHATS.sourdine);
    expect(meta.textContent).not.toContain(CHATS.participants);
  });

  it('retire une ligne de la vue, et la remet exactement d’où elle vient', () => {
    peint([
      CONVERSATION({ id: 'a', dernierMessageA: '2026-09-01T12:00:00.000Z' }),
      CONVERSATION({ id: 'b', dernierMessageA: '2026-09-01T11:00:00.000Z' }),
      CONVERSATION({ id: 'c', dernierMessageA: '2026-09-01T10:00:00.000Z' }),
    ]);
    const pe = p();
    const etat = etatDuDocument(pe);

    peins(pe, retire(etat, 'b'), MAINTENANT);
    expect(document.querySelector<HTMLElement>('li[data-conversation="b"]')?.hidden).toBe(true);

    peins(pe, remets(retire(etat, 'b'), 'b'), MAINTENANT);
    expect(document.querySelector<HTMLElement>('li[data-conversation="b"]')?.hidden).toBe(false);
    expect(ids()).toEqual(['a', 'b', 'c']);
  });

  /** `hasGap` (§ 7) : ce que la passerelle ne sait pas rejouer se DIT, avec son geste. */
  it('pose UN séparateur de trou, avec son rechargement', () => {
    peint([CONVERSATION()]);
    const pe = p();

    montreLeTrou(pe);
    montreLeTrou(pe);

    expect(document.querySelectorAll('.manque').length).toBe(1);
    expect(document.querySelector('.manque a')?.textContent).toContain(CHATS.trouAction);
  });
});

describe('le balayage', () => {
  /** Vers la DROITE on RANGE (archiver), vers la GAUCHE on RETIRE (supprimer). */
  it('lie chaque sens à son geste', () => {
    expect(gesteDuSens(120)).toBe('archiver');
    expect(gesteDuSens(-120)).toBe('supprimer');
  });

  const pointeur = (type: string, x: number, y: number, cible: Element): void => {
    const evenement = new Event(type, { bubbles: true, cancelable: true }) as Event & {
      pointerId: number;
      isPrimary: boolean;
      clientX: number;
      clientY: number;
    };
    Object.assign(evenement, { pointerId: 1, isPrimary: true, clientX: x, clientY: y });
    cible.dispatchEvent(evenement);
  };

  const balaye = ({ de, vers, hauteur = 0 }: { de: number; vers: number; hauteur?: number }): readonly string[] => {
    peint([CONVERSATION()]);
    const pe = p();
    const recus: string[] = [];
    prendsLeBalayage({ liste: pe.liste, sur: ({ geste, ligne }) => recus.push(`${geste}:${ligne.dataset.conversation}`) });
    const nom = document.querySelector('li[data-conversation="c1"] .nom')!;
    pointeur('pointerdown', de, 0, nom);
    pointeur('pointermove', vers, hauteur, nom);
    pointeur('pointerup', vers, hauteur, nom);
    return recus;
  };

  it('déclenche le geste quand le geste est FRANC', () => {
    expect(balaye({ de: 200, vers: 100 })).toEqual(['supprimer:c1']);
    expect(balaye({ de: 100, vers: 200 })).toEqual(['archiver:c1']);
  });

  it('ne déclenche rien sur un frôlement', () => {
    expect(balaye({ de: 200, vers: 170 })).toEqual([]);
  });

  /**
   * LE VERROU DE DIRECTION : tant que le vertical domine, le geste est
   * abandonné. Un balayage mal assuré ne doit pas voler le défilement de la
   * page — c'est le défaut qui rend une liste tactile inutilisable.
   */
  it('rend un geste vertical au défilement de la page', () => {
    expect(balaye({ de: 200, vers: 100, hauteur: 200 })).toEqual([]);
  });

  it('laisse le menu tranquille : un geste né sur un contrôle appartient au contrôle', () => {
    peint([CONVERSATION()]);
    const pe = p();
    const recus: string[] = [];
    prendsLeBalayage({ liste: pe.liste, sur: ({ geste }) => recus.push(geste) });
    const resume = document.querySelector('li[data-conversation="c1"] summary')!;
    pointeur('pointerdown', 200, 0, resume);
    pointeur('pointermove', 100, 0, resume);
    pointeur('pointerup', 100, 0, resume);

    expect(recus).toEqual([]);
  });
});

describe('la liste face à axe', () => {
  const graves = async (): Promise<readonly string[]> => {
    const rapport = await axe(document.documentElement);
    return rapport.violations
      .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
      .map((violation) => `${violation.id} — ${violation.help}`);
  };

  it('ne porte aucune violation grave, garnie', async () => {
    peint([CONVERSATION({ nonLus: 3 }), CONVERSATION({ id: 'c2', titre: 'Marta Ruiz', membres: 2, sourdine: true })]);

    expect(await graves()).toEqual([]);
  });

  /** L'état VIDE est un écran à part entière — celui d'un compte neuf. */
  it('ne porte aucune violation grave, vide', async () => {
    peint([]);

    expect(await graves()).toEqual([]);
  });

  /**
   * Le chemin CLAVIER du § 12.10.4 : chaque ligne porte un contrôle nommé qui
   * ouvre ses trois gestes, et ces gestes sont des `<button>` — pas des `div`
   * cliquables (charte règle 5).
   */
  it('offre les trois gestes au clavier, sur des contrôles nommés', () => {
    peint([CONVERSATION()]);
    const ligne = document.querySelector<HTMLElement>('li[data-conversation="c1"]')!;

    expect(ligne.querySelector('summary')?.textContent).toContain('Actions pour Équipe Lagos');
    expect(ligne.querySelectorAll('form button[type="submit"]').length).toBe(3);
    expect(ligne.querySelectorAll('div[onclick],div[role=button]').length).toBe(0);
  });
});
