/**
 * @jest-environment node
 */

/**
 * L'ESPACE MEMBRE OUVRE-T-IL SUR QUELQUE CHOSE ? (#5093)
 *
 * LE DÉFAUT QUE CE FICHIER GARDE est celui qui a rendu le lot nécessaire, pris
 * par l'autre bout. Mesuré sur `dev` (`fd772e3a26`) : `/contacts`, `/search`,
 * `/notifications` et `/settings` étaient servis par la v3 et n'avaient AUCUN
 * lien entrant — quatre écrans livrés, testés, budgétés, injoignables autrement
 * qu'en tapant leur adresse. La charte règle 7 dit « un contrôle existe s'il a
 * un effet » ; la réciproque est vraie et n'était gardée nulle part : un écran
 * que rien n'ouvre.
 *
 * IL OPPOSE DEUX SOURCES QUI NE SE PARLENT PAS. D'un côté les destinations que
 * l'espace membre RENDRA (`lib/contenu/espace.ts`, plus les deux ronds) ; de
 * l'autre les `app/**\/route.ts` réellement présents sur le disque. Un témoin
 * qui comparerait la liste des rangées à une seconde liste écrite à la main
 * serait une jumelle : elle passerait le jour où la route disparaît.
 *
 * ET IL GARDE LES DEUX SENS. Qu'une destination soit servie (sinon le rond
 * quitte la zone v3 en silence, et le lecteur atterrit sur le legacy sans que
 * rien ne le dise) ET qu'aucune des quatre routes ci-dessus ne retombe à zéro
 * lien entrant — c'est la seconde moitié qui ne peut pas se déduire de la
 * première.
 */

import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { ESPACE, RANGEES_DE_L_ESPACE } from '@/lib/contenu/espace';
import { feuilleDeLEspace, raccourcisEntete, versLEspace } from '@/app/connecte/espace-vue';
import { FEUILLE_DE_L_ESPACE } from '@/app/connecte/espace-feuille';

const RACINE = join(__dirname, '..', 'app');

const fichiersDeRoute = (dossier: string): readonly string[] =>
  readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
    const chemin = join(dossier, entree.name);
    if (entree.isDirectory()) return fichiersDeRoute(chemin);
    return entree.name === 'route.ts' ? [chemin] : [];
  });

/**
 * L'ADRESSE QU'UN `route.ts` SERT — les segments de GROUPE retirés (`(public)`
 * n'apparaît dans aucune URL), la racine rendue `/`.
 */
const adresseServie = (fichier: string): string => {
  const segments = relative(RACINE, fichier)
    .split(sep)
    .slice(0, -1)
    .filter((segment) => !segment.startsWith('('));
  return segments.length === 0 ? '/' : `/${segments.join('/')}`;
};

const ROUTES_SERVIES: readonly string[] = fichiersDeRoute(RACINE).map(adresseServie);

/** Les destinations que le lot promet — les deux raccourcis, les rangées, le champ du tableau. */
const DESTINATIONS: readonly string[] = [
  '/feed',
  ...RANGEES_DE_L_ESPACE.map((rangee) => rangee.href),
];

describe('l’espace membre n’ouvre que sur des routes que la v3 SERT', () => {
  it('trouve les routes du disque — sinon le témoin est vide', () => {
    expect(ROUTES_SERVIES).toContain('/');
    expect(ROUTES_SERVIES.length).toBeGreaterThan(20);
  });

  it.each(DESTINATIONS)('sert %s', (destination) => {
    expect(ROUTES_SERVIES).toContain(destination);
  });

  /**
   * Les quatre écrans qui n'avaient AUCUN lien entrant. Les nommer ici plutôt
   * que de se fier au compte des rangées est ce qui fait tomber le témoin le
   * jour où l'un d'eux sort de la feuille : une liste qui rétrécit ne se
   * remarque pas, un nom qui manque, si.
   */
  it.each(['/contacts', '/search', '/notifications', '/settings'])(
    'ouvre %s, qui n’avait aucune porte',
    (orphelin) => {
      expect(DESTINATIONS).toContain(orphelin);
    },
  );

  it('rougirait sur une destination hors zone', () => {
    expect(ROUTES_SERVIES).not.toContain('/communities');
    expect(ROUTES_SERVIES).not.toContain('/calls');
    expect(DESTINATIONS).not.toContain('/communities');
    expect(DESTINATIONS).not.toContain('/calls');
  });
});

/**
 * LES TROIS CHEMINS DE FERMETURE, et le quatrième qui vient du navigateur.
 *
 * Sans JavaScript, une feuille se ferme par des LIENS — la croix, le voile, la
 * poignée — et par le bouton « précédent », que l'état d'adresse rend gratuit.
 * `data-retour` est la prise d'Échap : `lib/realtime/plein-ecran.ts` élève tout
 * `dialog[open][data-retour]` en modale, et les deux écrans qui servent cette
 * feuille servent déjà leur module.
 */
describe('la feuille se ferme sans un octet de JavaScript', () => {
  const feuille = feuilleDeLEspace({ lecteur: null, hote: '/chats' });

  it('rend le voile, la poignée et la croix, tous vers l’hôte', () => {
    expect(feuille).toContain('<a class="voile" href="/chats"');
    expect(feuille).toContain('<a class="poignee" href="/chats"');
    expect(feuille).toContain('<a class="fermer" href="/chats"');
  });

  it('porte la prise d’Échap', () => {
    expect(feuille).toContain('data-retour="/chats"');
    expect(feuille).toContain('<dialog class="espace" open aria-modal="true"');
  });

  it('ouvre depuis l’hôte, et y revient', () => {
    expect(versLEspace('/')).toBe('/?espace');
    expect(versLEspace('/chats')).toBe('/chats?espace');
    expect(raccourcisEntete('/chats')).toContain('href="/chats?espace"');
  });
});

/**
 * LE CONTRÔLE DE SORTIE (#5095) — un `<form method=post>` RÉEL, atteignable
 * au clavier PAR CONSTRUCTION (un `<button>` natif, jamais un `<a>` ni un
 * `div`), sur une cible de la charte, dans les deux thèmes.
 */
describe('la feuille sert le formulaire de sortie', () => {
  const feuille = feuilleDeLEspace({ lecteur: null, hote: '/chats' });

  it('un <form> POST vers /deconnexion, un <button> natif, un champ session vide', () => {
    expect(feuille).toContain('<form class="sortie" method="post" action="/deconnexion">');
    expect(feuille).toContain('<input type="hidden" name="session" value="" />');
    expect(feuille).toContain(`<button type="submit">${ESPACE.deconnecter}</button>`);
  });

  it('le formulaire vient APRÈS les rangées, DANS le dialogue', () => {
    const finDesRangees = feuille.indexOf('</ul>');
    const debutDuFormulaire = feuille.indexOf('<form class="sortie"');
    const finDuDialogue = feuille.indexOf('</dialog>');
    expect(finDesRangees).toBeGreaterThan(-1);
    expect(debutDuFormulaire).toBeGreaterThan(finDesRangees);
    expect(debutDuFormulaire).toBeLessThan(finDuDialogue);
  });

  it('le bouton est une cible de la charte, sans couleur en dur', () => {
    expect(FEUILLE_DE_L_ESPACE).toContain('.sortie button{');
    expect(FEUILLE_DE_L_ESPACE).toContain('min-height:var(--action-height-secondary)');
    expect(FEUILLE_DE_L_ESPACE).toContain('width:100%');
    expect(FEUILLE_DE_L_ESPACE).not.toMatch(/\.sortie[^}]*#[0-9a-fA-F]{3,8}/);
    expect(FEUILLE_DE_L_ESPACE).toContain('var(--color-danger)');
  });
});
