import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { axe } from 'jest-axe';
import { renderToStaticMarkup } from 'react-dom/server';

import { DOCUMENT_LANGUAGE } from '@/app/document-language';
import { languesProposees } from '@/app/(public)/chats/[lien]/langues';
import {
  PLACE_FERMEE,
  avisDuLienMort,
  droitsDeLaPlace,
  pointsDuLien,
  type PointDuLien,
} from '@/app/(public)/chats/[lien]/etats';
import { VueDeJonction, VueDesDroits, type EcranDesDroits } from '@/app/(public)/chats/[lien]/vue';
import { THEME_PAR_DEFAUT } from '@/app/theme-script';
import type { LienDadhesion } from '@/lib/api/adhesion';
import type { CleDeLien, DroitsDeLaPlace } from '@/lib/api/guest-session';

/**
 * L'ÉCRAN `rights` — « après avoir rejoint, on voit exactement ce qu'on a le
 * droit de faire dans la conversation » (matrice `rights`, issue #4523).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * CE QUE CE TÉMOIN PROUVE, ET POURQUOI C'EST CELA QU'IL FAUT PROUVER
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Le critère de fin ne demande pas « l'écran rend quatre lignes » — il demande
 * que ces quatre lignes viennent de la MÊME source que l'accordéon de `join`,
 * « un seul module, importé deux fois, aucune liste dupliquée ». Une liste
 * recopiée passerait n'importe quel témoin de contenu : les deux exemplaires
 * seraient justes le jour où on les écrit. Ce qu'il faut donc garder est la
 * DÉRIVE, et elle se garde de deux façons complémentaires :
 *
 *   • en COMPORTEMENT — ce que l'écran rend est, ligne pour ligne, ce que le
 *     module RETOURNE : un littéral recopié dans la vue cesse de suivre le
 *     module à la première correction de copie, et le témoin tombe ;
 *   • en SOURCE — aucun fichier de vue ne contient un titre de droit. C'est la
 *     seule moitié qui attrape la duplication le jour où elle est écrite,
 *     c'est-à-dire avant qu'elle ait eu le temps de diverger.
 *
 * Le rendu passe par `renderToStaticMarkup` puis par un `document.write` pour
 * la même raison que `join-vue.test.tsx` : c'est le HTML qu'un visiteur SANS
 * JavaScript reçoit, et c'est la population du rôle premier.
 */

const REPERTOIRE = join(__dirname, '..', 'app', '(public)', 'chats', '[lien]');

const LIEN: LienDadhesion = {
  cle: 'mshy_lagos' as CleDeLien,
  nom: 'Équipe Lagos',
  invitation: null,
  exigePseudo: true,
  exigeEmail: false,
  exigeNaissance: false,
  exigeCompte: false,
  echeance: Date.parse('2026-08-12T00:00:00.000Z'),
  placesRestantes: 14,
  languesDuLien: [],
  languesParlees: ['en', 'fr', 'yo'],
};

const TOUT_ACCORDE: DroitsDeLaPlace = {
  ecrire: true,
  fichiers: true,
  images: true,
  historique: true,
};

const ecrit = (markup: string): void => {
  document.open();
  document.write(
    `<!doctype html><html lang="${DOCUMENT_LANGUAGE}" class="${THEME_PAR_DEFAUT}"><body>${markup}</body></html>`,
  );
  document.close();
};

/**
 * L'écran reçoit ce que `page.tsx` a DÉJÀ arbitré (les lignes, l'avis, le
 * bouton) : le témoin compose donc la même chose que la page, et pas un objet de
 * passerelle. `droits === null` y rend ce que le LIEN déclare, exactement comme
 * la page le fait quand ni le cookie ni le refresh n'ont dit les quatre.
 */
const SORTIE_NOMINALE = {
  libelle: 'Quitter cette place',
  primaire: false,
  action: '/chats/mshy_lagos',
} as const;

const peint = (
  droits: DroitsDeLaPlace | null = TOUT_ACCORDE,
  pseudo = 'Tolu',
  lien: LienDadhesion | null = LIEN,
  extra: Partial<EcranDesDroits> = {},
): void =>
  ecrit(
    renderToStaticMarkup(
      <VueDesDroits
        ecran={{
          pseudo,
          nom: lien?.nom ?? null,
          points:
            droits === null ? (lien === null ? null : pointsDuLien(lien)) : droitsDeLaPlace(droits),
          avis: null,
          entree: null,
          sortie: SORTIE_NOMINALE,
          ...extra,
        }}
      />,
    ),
  );

const peintLaJonction = (): void => {
  const proposition = languesProposees({ lien: LIEN, acceptLanguage: 'fr' });
  ecrit(
    renderToStaticMarkup(
      <VueDeJonction
        ecran={{
          lien: LIEN,
          proposition,
          prerempli: { pseudo: '', langue: proposition.choisie },
          refus: null,
          action: '/chats/mshy_lagos',
          retour: '/chats/mshy_lagos',
        }}
      />,
    ),
  );
};

/** Ce que les lignes DISENT, lu sur le DOM — jamais sur les classes, absentes en jsdom. */
const lignesRendues = (): readonly { readonly titre: string; readonly detail: string }[] =>
  [...document.querySelectorAll('li')].map((ligne) => {
    const textes = [...ligne.querySelectorAll('p')].map((p) => p.textContent ?? '');
    return { titre: textes[0] ?? '', detail: textes[1] ?? '' };
  });

const glyphesRendus = (): readonly string[] =>
  [...document.querySelectorAll('li use')].map((use) => use.getAttribute('href') ?? '');

const dit = (points: readonly PointDuLien[]) =>
  points.map((point) => ({ titre: point.titre, detail: point.detail }));

describe('les quatre droits viennent du MÊME module que l’accordéon de join', () => {
  it('rend, ligne pour ligne, ce que le module de copie retourne', () => {
    peint();

    expect(lignesRendues()).toEqual(dit(droitsDeLaPlace(TOUT_ACCORDE)));
  });

  it('rend l’accordéon de join, ligne pour ligne, depuis ce MÊME module', () => {
    peintLaJonction();

    expect(lignesRendues()).toEqual(dit(pointsDuLien(LIEN)));
  });

  /**
   * Les deux écrans passent par le MÊME rendu de ligne : un glyphe d'état, un
   * titre, un détail. Un second rendu écrit à côté aurait sa propre anatomie —
   * et c'est cette anatomie-là qu'on compare, les classes des modules CSS
   * n'existant pas sous `jsdom`.
   */
  it('rend les deux listes avec la MÊME anatomie de ligne', () => {
    peintLaJonction();
    const deLaJonction = [...document.querySelectorAll('li')].map((li) => li.innerHTML.replace(/>[^<]*</g, '><'));

    peint();
    const desDroits = [...document.querySelectorAll('li')].map((li) => li.innerHTML.replace(/>[^<]*</g, '><'));

    expect(desDroits[0]).toBe(deLaJonction[0]);
  });

  /**
   * LA moitié qui attrape une liste DUPLIQUÉE le jour où elle est écrite.
   *
   * Le témoin de comportement ci-dessus ne tombe qu'une fois les deux
   * exemplaires DIVERGENTS ; celui-ci refuse le second exemplaire tout de
   * suite. Il balaie le répertoire de l'écran entier, parce qu'une copie n'a
   * aucune raison d'atterrir dans `vue.tsx` plutôt qu'ailleurs.
   */
  it('n’écrit aucun titre de droit ailleurs que dans le module de copie', () => {
    const titres = [
      ...droitsDeLaPlace(TOUT_ACCORDE),
      ...droitsDeLaPlace({ ecrire: false, fichiers: false, images: false, historique: false }),
    ].map((point) => point.titre);

    const porteurs = readdirSync(REPERTOIRE)
      .filter((nom) => nom.endsWith('.ts') || nom.endsWith('.tsx'))
      .filter((nom) => {
        const source = readFileSync(join(REPERTOIRE, nom), 'utf8');
        return titres.some((titre) => source.includes(titre));
      });

    expect(porteurs).toEqual(['etats.ts']);
  });
});

describe('ce que les quatre droits DISENT, relu de la réponse de jonction', () => {
  const COMBINAISONS: readonly DroitsDeLaPlace[] = [
    TOUT_ACCORDE,
    { ecrire: false, fichiers: false, images: false, historique: false },
    { ecrire: true, fichiers: false, images: true, historique: false },
    { ecrire: true, fichiers: true, images: false, historique: true },
  ];

  it.each(COMBINAISONS)('rend QUATRE lignes quel que soit l’état des droits (%o)', (droits) => {
    peint(droits);

    expect(lignesRendues()).toHaveLength(4);
  });

  it('marque chaque ligne par son état — accordée ou refusée, jamais muette', () => {
    peint({ ecrire: true, fichiers: false, images: false, historique: false });

    expect(glyphesRendus()).toEqual([
      '#ph-x-circle',
      '#ph-check-circle',
      '#ph-x-circle',
      '#ph-x-circle',
    ]);
  });

  it('ne promet pas un historique que le lien masque', () => {
    peint({ ...TOUT_ACCORDE, historique: false });

    expect(document.body.textContent).toContain('L’historique reste masqué');
    expect(document.body.textContent).not.toContain('Lire tout l’historique');
  });

  /**
   * `canSendFiles` et `canSendImages` sont DEUX booléens sur UNE ligne : la
   * planche n'en dessine qu'une. Écrire « Envoyer photos et fichiers » quand
   * l'un des deux est fermé serait la promesse que l'écran suivant dément —
   * exactement ce que l'accordéon de `join` refuse déjà de faire.
   */
  it.each([
    [{ images: true, fichiers: true }, 'Envoyer photos et fichiers'],
    [{ images: true, fichiers: false }, 'Envoyer des photos'],
    [{ images: false, fichiers: true }, 'Envoyer des fichiers'],
    [{ images: false, fichiers: false }, 'Ni photo ni fichier'],
  ])('dit ce qui est vrai des DEUX booléens d’envoi (%o)', (envois, attendu) => {
    peint({ ...TOUT_ACCORDE, ...envois });

    expect(lignesRendues()[2]?.titre).toBe(attendu);
  });

  /**
   * Appels et invitations ne dépendent d'aucun droit servi : ils sont fermés
   * par l'IDENTITÉ, et c'est mesuré — `/calls/*` est monté
   * `allowAnonymous: false` (`services/gateway/src/routes/calls.ts`) et
   * `POST /conversations/:id/invite` exige `authContext.registeredUser`
   * (`routes/conversations/sharing.ts`).
   */
  it('ferme appels et invitations quels que soient les droits du lien', () => {
    peint(TOUT_ACCORDE);

    expect(lignesRendues()[3]).toEqual({
      titre: 'Pas d’appel, pas d’invitation',
      detail: 'Réservé aux membres qui ont un compte.',
    });
    expect(glyphesRendus()[3]).toBe('#ph-x-circle');
  });

  /**
   * DROITS INCONNUS — une place ouverte par une version qui ne les rangeait pas
   * encore, ou un 201 qui ne les a pas dits. On n'invente RIEN : l'écran retombe
   * sur ce que le lien DÉCLARE, la seule chose qu'il sache. Servir quatre `false`
   * refuserait des droits que le visiteur a ; servir quatre `true` promettrait
   * ce qu'aucune porte n'a accordé.
   */
  it('ne fabrique aucun droit quand la réponse n’en a dit aucun', () => {
    peint(null);

    expect(lignesRendues()).toEqual(dit(pointsDuLien(LIEN)));
  });
});

describe('l’écran d’accueil d’une place ouverte', () => {
  it('accueille le visiteur par le pseudo qu’il a saisi', () => {
    peint(TOUT_ACCORDE, 'Tolu');

    expect(document.querySelector('h1')?.textContent).toContain('Tolu');
  });

  it('nomme la conversation dans laquelle ce lien vient d’ouvrir une place', () => {
    peint();

    expect(document.querySelector('h1 + p')?.textContent).toBe(
      'Voilà ce que ce lien vous ouvre dans Équipe Lagos.',
    );
  });

  /**
   * Le badge fantôme n'est pas une décoration : il DIT au lecteur ce qu'il est
   * — un invité sans compte (`packages/icons/critique.json`, `ph-ghost`). Un
   * glyphe muet à cette place laisserait l'information au seul dessin.
   */
  it('dit au visiteur qu’il est entré SANS COMPTE, autrement que par un dessin', () => {
    peint();

    const badge = document.querySelector('main svg[role="img"]');
    expect(badge?.getAttribute('aria-label')).toBe('Invité, sans compte');
    expect(badge?.querySelector('use')?.getAttribute('href')).toBe('#ph-ghost');
  });

  /**
   * La place est PRISE : rien ne repropose d'entrer. Le `<form>` de la sortie
   * n'est pas le formulaire d'entrée — il n'a aucun champ, et c'est ce que le
   * témoin mesure ; compter les `<form>` confondrait les deux.
   */
  it('ne repropose ni champ d’entrée ni script — la place est prise', () => {
    peint();

    expect(document.querySelectorAll('input, select, textarea')).toHaveLength(0);
    expect(document.querySelectorAll('script')).toHaveLength(0);
    expect(document.querySelectorAll('[onclick]')).toHaveLength(0);
  });

  it('range tout son contenu dans un repère de page', () => {
    peint();

    expect(document.querySelector('main#main-content')).not.toBeNull();
  });
});

/**
 * LE RANG 1 DU PRISME, SUR LE SEUL ÉCRAN QUI L'AIT SOUS LA MAIN.
 *
 * L'écran qui CONFIRME l'entrée est aussi celui qui parle de traduction. Il tient
 * la réponse d'admission, donc `participant.language` — la langue que le visiteur
 * vient de déclarer, seule langue configurée d'un lecteur anonyme. Le taire
 * laissait le visiteur entrer sans savoir dans quelle langue il allait lire.
 */
describe('la langue servie, nommée là où elle se mérite', () => {
  it('nomme la langue du lecteur dans le droit d’écriture', () => {
    ecrit(
      renderToStaticMarkup(
        <VueDesDroits
          ecran={{
            pseudo: 'Tolu',
            nom: 'Équipe Lagos',
            points: droitsDeLaPlace(TOUT_ACCORDE, 'yo'),
            avis: null,
            entree: null,
            sortie: SORTIE_NOMINALE,
          }}
        />,
      ),
    );

    expect(lignesRendues()[1]?.detail).toContain('yoruba');
  });

  /**
   * Aucune langue n'est FABRIQUÉE : une place qui ne porte pas la sienne rend la
   * phrase générique, qui reste vraie. Inventer un rang 1 serait pire que se
   * taire — l'écran affirmerait une langue de lecture que rien ne sert.
   */
  it('ne nomme aucune langue quand la place n’en porte pas', () => {
    peint();

    expect(lignesRendues()[1]?.detail).toBe(
      'Vos messages sont traduits vers les langues des participants.',
    );
  });
});

/**
 * CE QUI EST ARRIVÉ À LA PLACE DEPUIS SON OUVERTURE — états F et G (§ 6.3).
 *
 * L'écran dont le rôle est de dire ce qu'on a le droit de faire doit savoir dire
 * qu'on ne l'a plus. Les deux états sont DISTINCTS, et se peignent
 * différemment : F retire les lignes (elles viennent de devenir fausses) et
 * porte le bouton de reprise que le § 6.3 F exige ; G les garde (la place tient,
 * c'est le lien qui est mort) et NOMME la raison.
 */
describe('la place n’est plus ce qu’elle était', () => {
  it('état F — dit que la place est fermée, et ne peint plus aucun droit', () => {
    peint(TOUT_ACCORDE, 'Tolu', LIEN, {
      points: null,
      avis: PLACE_FERMEE,
      sortie: { libelle: 'Reprendre ma place', primaire: true, action: '/chats/mshy_lagos' },
    });

    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      'Votre place a été fermée',
    );
    expect(document.querySelectorAll('main li')).toHaveLength(0);
    expect(document.querySelector('button')?.textContent).toBe('Reprendre ma place');
  });

  it('état G — nomme la raison du lien mort SANS effacer ce qui est lu', () => {
    peint(TOUT_ACCORDE, 'Tolu', LIEN, { avis: avisDuLienMort('lien-expire') });

    expect(document.querySelector('[role="alert"]')?.textContent).toContain('Ce lien a expiré');
    expect(lignesRendues()).toHaveLength(4);
  });

  /**
   * § 7 — « erreur réseau ≠ 401 ». Une passerelle muette ne peint AUCUNE
   * alerte : le visiteur n'a rien à faire de cette information, et une bannière
   * d'incident au-dessus d'un écran lisible est exactement le spinner que le
   * § 6.3 B interdit sur un cache non vide.
   */
  it('ne peint aucune alerte quand rien n’est arrivé à la place', () => {
    peint();

    expect(document.querySelector('[role="alert"]')).toBeNull();
  });
});

/**
 * LE BLOC DE CONTRÔLE — deux gestes, désormais, et chacun a un effet.
 *
 * Le CTA « Entrer dans la conversation » que la cible dessine était ÉCARTÉ tant
 * que personne ne servait `thread` : il aurait été inerte (loi 4). L'écran
 * `thread` existe (matrice ordre 5), et le bouton est donc servi — en tête du
 * bloc, comme la cible le pose — au-dessus de la sortie, qui reste le geste par
 * lequel une place se ferme.
 *
 * Les deux témoins ci-dessous mesurent le bloc SANS le CTA (`entree: null`),
 * c'est-à-dire l'état où la place ne peut ouvrir aucun fil : c'est le cas où le
 * bouton unique doit rester atteignable et postable sans JavaScript. Le CTA a
 * son propre témoin, juste après.
 */
describe('le bloc de contrôle, à la place que la cible lui donne', () => {
  it('porte un bouton atteignable au clavier, sous les quatre lignes', () => {
    peint();

    const bouton = document.querySelector('main button');
    expect(bouton?.textContent).toBe('Quitter cette place');
    expect(bouton?.getAttribute('type')).toBe('submit');
    const blocs = [...document.querySelectorAll('main > *')].map((noeud) => noeud.tagName);
    expect(blocs.indexOf('FORM')).toBeGreaterThan(blocs.indexOf('UL'));
  });

  /**
   * Le geste passe par un `<form method="post">` : sans JavaScript, le navigateur
   * le poste seul. Un `<div onClick>` ou un `<button>` sans formulaire n'aurait
   * aucun effet sur la population du rôle premier.
   */
  it('agit sans JavaScript — un formulaire posté, pas un gestionnaire', () => {
    peint();

    const formulaire = document.querySelector('main form');
    expect(formulaire?.getAttribute('method')).toBe('post');
    expect(document.querySelectorAll('[onclick]')).toHaveLength(0);
  });

  /**
   * Le CTA de la cible, quand il OUVRE quelque chose : il passe DEVANT la
   * sortie, qui redevient secondaire. L'ordre n'est pas décoratif — c'est le
   * geste nominal de l'écran, et le mettre second ferait de « quitter » le
   * geste par défaut d'un visiteur qui vient d'entrer.
   */
  it('sert le CTA d’entrée EN TÊTE du bloc quand un fil est joignable', () => {
    peint(TOUT_ACCORDE, 'Tolu', LIEN, {
      entree: { libelle: 'Entrer dans la conversation', action: '/chats/mshy_lagos' },
    });

    const libelles = [...document.querySelectorAll('main button')].map(
      (bouton) => bouton.textContent,
    );
    expect(libelles).toEqual(['Entrer dans la conversation', 'Quitter cette place']);
  });
});

/**
 * LE RENDU DÉGRADÉ — la place s'affiche quand la passerelle ne répond pas.
 *
 * C'est ce que le titre rangé avec le jeton achète : sans lui, l'écran dépendrait
 * de l'aperçu du LIEN pour nommer la conversation, donc du réseau, sur le chemin
 * même où le réseau manque.
 */
describe('quand la passerelle ne dit rien', () => {
  it('se peint sans nommer la conversation plutôt que de disparaître', () => {
    peint(TOUT_ACCORDE, 'Tolu', null, { points: droitsDeLaPlace(TOUT_ACCORDE) });

    expect(document.querySelector('h1')?.textContent).toContain('Tolu');
    expect(document.querySelector('h1 + p')?.textContent).toBe('Voilà ce que ce lien vous ouvre.');
    expect(lignesRendues()).toHaveLength(4);
  });
});

describe('l’écran des droits face à axe', () => {
  const graves = async (): Promise<readonly string[]> => {
    const rapport = await axe(document.documentElement);
    return rapport.violations
      .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
      .map((violation) => `${violation.id} — ${violation.help}`);
  };

  it.each<readonly [string, DroitsDeLaPlace | null]>([
    ['tout accordé', TOUT_ACCORDE],
    ['tout refusé', { ecrire: false, fichiers: false, images: false, historique: false }],
    ['droits inconnus', null],
  ])('ne porte aucune violation grave — %s', async (_nom, droits) => {
    peint(droits);

    expect(await graves()).toEqual([]);
  });
});
