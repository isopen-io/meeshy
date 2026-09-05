import { axe } from 'jest-axe';

import { documentDesNotifs } from '@/app/connecte/notifs-vue';
import type { Notification } from '@/lib/api/notifications';
import { NOTIFS } from '@/lib/contenu/notifs';
import { arrive, compte, ligneDeNotification, lit, litEnMasse } from '@/lib/realtime/notifs-etat';
import { etatDuDocument, peins, peintre } from '@/lib/realtime/notifs-peinture';

/**
 * `/notifications` VIVANTE (issue #4898) — la peinture opposée au document que
 * le SERVEUR sert, jamais à un fragment fabriqué pour le témoin.
 *
 * Même loi que `liste-vivante.test.ts` : une fente que la vue cesserait de
 * servir ferait tomber la peinture ICI, pas seulement au navigateur où elle
 * échouerait en silence.
 */

const NOTIF = (attributs: Partial<Notification> = {}): Notification => ({
  id: 'n1',
  genre: 'message',
  titre: 'Alice vous a répondu',
  sousTitre: null,
  corps: 'On se voit demain ?',
  nomDeLActeur: 'Alice',
  lue: false,
  creeeA: '2026-09-02T20:00:00.000Z',
  contexte: { conversationId: 'c1' },
  ...attributs,
});

const MAINTENANT = Date.parse('2026-09-02T20:30:00.000Z');

const TEMPS_REEL = {
  module: '/__v3/rt/notifs.abcd.js',
  socket: '/__v3/rt/socket.io.abcd.js',
  passerelle: 'https://gate.meeshy.me',
};

const peint = (notifications: readonly Notification[], nonLues = notifications.filter((n) => !n.lue).length): void => {
  document.open();
  document.write(
    documentDesNotifs({
      notifications,
      nonLues,
      maintenant: MAINTENANT,
      toutLu: false,
      tempsReel: TEMPS_REEL,
      curseurSuivant: null,
    }),
  );
  document.close();
};

const main = (): HTMLElement => document.querySelector<HTMLElement>('main[data-participation="notifs"]')!;

const p = () => peintre(main())!;

const ids = (): readonly string[] =>
  [...document.querySelectorAll<HTMLElement>('ul.notifs > li')].map((li) => li.dataset.id ?? '');

const sous = (): HTMLElement => document.querySelector<HTMLElement>('.fil-tete .sous')!;

const formulaire = (): HTMLFormElement => document.querySelector<HTMLFormElement>('form.tout-lire')!;

describe('le document servi porte ses fentes', () => {
  it('nomme son module, son socket et sa passerelle — le chargeur ne connaît aucune adresse', () => {
    peint([NOTIF()]);

    expect(main().dataset.module).toBe(TEMPS_REEL.module);
    expect(main().dataset.socket).toBe(TEMPS_REEL.socket);
    expect(main().dataset.passerelle).toBe(TEMPS_REEL.passerelle);
  });

  it('relit l’état dans les `data-` et la classe, jamais dans le texte affiché', () => {
    peint([NOTIF(), NOTIF({ id: 'n2', lue: true, contexte: {} })]);

    const etat = etatDuDocument(p());
    expect(etat.nonLues).toBe(1);
    expect(etat.lignes[0]).toMatchObject({ id: 'n1', genre: 'message', lue: false, contexte: { conversationId: 'c1' } });
    expect(etat.lignes[1]).toMatchObject({ id: 'n2', lue: true });
  });

  it('sert le gabarit d’une ligne SANS qu’il compte comme une ligne', () => {
    peint([NOTIF()]);

    expect(document.querySelector('template#gabarit-notif')).not.toBeNull();
    expect(ids()).toEqual(['n1']);
  });

  it('la première repeinture ne défait rien de ce que le serveur a peint', () => {
    peint([NOTIF(), NOTIF({ id: 'n2', lue: true })]);
    const avant = main().innerHTML;

    const pe = p();
    peins(pe, etatDuDocument(pe), MAINTENANT);

    expect(main().innerHTML).toBe(avant);
  });
});

describe('une notification qui arrive se peint sans rechargement', () => {
  it('naît EN TÊTE, avec le texte servi, sa pastille et son glyphe de genre', () => {
    peint([NOTIF()]);
    const pe = p();

    peins(pe, arrive(etatDuDocument(pe), ligneDeNotification(NOTIF({ id: 'n2', genre: 'friend_request', titre: 'Marta veut vous ajouter', corps: null }))), MAINTENANT);

    expect(ids()).toEqual(['n2', 'n1']);
    const neuve = document.querySelector<HTMLElement>('li[data-id="n2"]')!;
    expect(neuve.querySelector('.primaire')?.textContent).toBe('Marta veut vous ajouter');
    expect(neuve.classList.contains('non-lue')).toBe(true);
    // Le glyphe est INLINÉ par le serveur (`svgDuSprite`) : un module de
    // navigateur n'a pas les tracés. La ligne neuve porte celui du gabarit —
    // la cloche, « une notification » — ou celui, RÉUTILISÉ, d'une ligne
    // existante du même genre ; jamais une vignette vide.
    expect(neuve.querySelector('.vignette svg')).not.toBeNull();
  });

  it('monte le compteur de l’en-tête et le révèle', () => {
    peint([NOTIF({ lue: true })], 0);
    const pe = p();
    expect(sous().hidden).toBe(true);

    peins(pe, arrive(etatDuDocument(pe), ligneDeNotification(NOTIF({ id: 'n2' }))), MAINTENANT);

    expect(sous().hidden).toBe(false);
    expect(sous().textContent).toBe(NOTIFS.nonLues(1));
    expect(formulaire().hidden).toBe(false);
  });

  it('remplace la carte vide par la liste quand la première ligne arrive', () => {
    peint([]);
    const pe = p();
    expect(document.querySelector<HTMLElement>('.vide-des-notifs')!.hidden).toBe(false);

    peins(pe, arrive(etatDuDocument(pe), ligneDeNotification(NOTIF())), MAINTENANT);

    expect(document.querySelector<HTMLElement>('.vide-des-notifs')!.hidden).toBe(true);
    expect(document.querySelector<HTMLElement>('ul.notifs')!.hidden).toBe(false);
    expect(ids()).toEqual(['n1']);
  });
});

describe('une lecture se peint sans rechargement', () => {
  it('éteint la pastille et le mot « Non lue » d’une ligne lue par un autre appareil', () => {
    peint([NOTIF()]);
    const pe = p();

    peins(pe, lit(etatDuDocument(pe), 'n1'), MAINTENANT);

    const ligne = document.querySelector<HTMLElement>('li[data-id="n1"]')!;
    expect(ligne.classList.contains('non-lue')).toBe(false);
    expect(ligne.querySelector<HTMLElement>('.pastille')!.hidden).toBe(true);
    expect(sous().hidden).toBe(true);
  });

  it('un `read-bulk` de contexte n’éteint que les lignes du contexte', () => {
    peint([NOTIF(), NOTIF({ id: 'n2', contexte: { postId: 'p1' } })]);
    const pe = p();

    peins(pe, litEnMasse(etatDuDocument(pe), { kind: 'context', contextKey: 'conversationId', contextValue: 'c1' }), MAINTENANT);

    expect(document.querySelector('li[data-id="n1"]')!.classList.contains('non-lue')).toBe(false);
    expect(document.querySelector('li[data-id="n2"]')!.classList.contains('non-lue')).toBe(true);
  });

  it('`notification:counts` recale l’en-tête et cache « Tout lire » à zéro', () => {
    peint([NOTIF()]);
    const pe = p();

    peins(pe, compte(litEnMasse(etatDuDocument(pe), { kind: 'all' }), 0), MAINTENANT);

    expect(sous().hidden).toBe(true);
    expect(formulaire().hidden).toBe(true);
  });
});

describe('le document peint reste accessible', () => {
  it('0 violation grave après l’arrivée d’une ligne peinte', async () => {
    peint([NOTIF()]);
    const pe = p();
    peins(pe, arrive(etatDuDocument(pe), ligneDeNotification(NOTIF({ id: 'n2', genre: 'mention' }))), MAINTENANT);

    const rapport = await axe(document.documentElement);
    const graves = rapport.violations
      .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
      .map((violation) => `${violation.id} — ${violation.help}`);
    expect(graves).toEqual([]);
  });
});
