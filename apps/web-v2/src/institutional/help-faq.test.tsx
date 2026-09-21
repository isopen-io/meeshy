/** @jsxImportSource preact */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { render } from 'preact-render-to-string';

import {
  INSTITUTIONAL_PATTERN,
  INSTITUTIONAL_ROUTES,
} from '../../scripts/lib/institutional-routes.mjs';
import { ROUTES } from '../routes/route-table';
import { resolveRouteAccess } from '../lib/session-guard';
import { PAGE_FAQ } from './faq';
import { PAGE_HELP } from './help';
import { InstitutionalPage } from './page';

/**
 * « CENTRE D'AIDE » ET « FAQ » — LES DEUX ADRESSES DU BINAIRE DÉJÀ DISTRIBUÉ
 * (#7287).
 *
 * `SupportView.swift:64-65` ouvre `https://meeshy.me/help` et
 * `https://meeshy.me/faq`. Ce ne sont pas des maquettes : elles sont DANS
 * l'application publiée sur l'App Store, et on ne peut pas les y corriger sans
 * une nouvelle revue. Depuis la bascule de meeshy.me sur la v2, les deux
 * rendaient « adresse inconnue » — sur le chemin qu'emprunte précisément un
 * utilisateur qui a DÉJÀ un problème.
 *
 * Ce témoin garde les quatre propriétés dont dépend « la page s'ouvre » :
 * déclarée à la SOURCE UNIQUE, non masquée par la coquille, énumérée par les
 * DEUX miroirs qui ne peuvent pas importer cette source (`nginx.conf` et
 * `sw-institutional.js`), lisible SANS COMPTE. Chacune se casse en silence —
 * une page écrite sur le disque que personne ne sert rend un 200 qui a l'air
 * vivant, et un miroir oublié la fait repartir sur le réseau à chaque visite
 * sans rien casser de visible (c'est ce que le second miroir a coûté, #7287).
 */

const NGINX = readFileSync(new URL('../../nginx.conf', import.meta.url), 'utf8');
const SW = readFileSync(new URL('../../public/sw-institutional.js', import.meta.url), 'utf8');

describe('les deux adresses que l’app publiée ouvre sont servies', () => {
  test('« help » et « faq » sont déclarées à la SOURCE UNIQUE des adresses institutionnelles', () => {
    // La source unique alimente le préchauffage, le refus de repli du service
    // worker, l'inventaire de parité et la vérification des coques. Les y
    // déclarer, c'est les servir partout à la fois ; les oublier ici, c'est
    // écrire deux documents que personne ne route.
    expect(INSTITUTIONAL_ROUTES).toContain('help');
    expect(INSTITUTIONAL_ROUTES).toContain('faq');
  });

  test('le service worker ne sert PAS la coquille de l’application sur ces adresses', () => {
    // Sans ce refus, un visiteur qui REVIENT reçoit `index.html` : le document
    // est bien sur le disque, et il voit quand même une page blanche. C'est le
    // défaut que #5554 a payé sur les cinq premières pages.
    for (const path of ['/help', '/help/', '/faq', '/faq/']) {
      expect(INSTITUTIONAL_PATTERN.test(path)).toBe(true);
    }
    // ... et le motif reste ancré : une adresse de l'application qui COMMENCE
    // par le même mot n'est pas exclue par erreur.
    expect(INSTITUTIONAL_PATTERN.test('/help-me')).toBe(false);
  });

  /* LES DEUX MIROIRS QUI NE PEUVENT PAS IMPORTER LA SOURCE UNIQUE.
     `institutional-routes.mjs` énumère ses TROIS consommateurs — tous des
     modules, tous à jour par construction. Ces deux-ci ne sont pas des
     modules : `nginx.conf` est de la CONFIGURATION, `sw-institutional.js` est
     servi tel quel depuis `public/` et chargé par `importScripts`. Ni l'un ni
     l'autre ne peut importer quoi que ce soit, donc les deux recopient la
     liste — et aucun des deux n'avait de témoin.

     Ce dépôt a DÉJÀ payé une divergence de cette liste (`institutional-routes
     .mjs` § « Les trois listes ont divergé une fois »), et #7287 en a payé une
     seconde sur le second miroir : `/help/` et `/faq/` repartaient chercher
     leur document SUR LE RÉSEAU à chaque visite, pendant que les cinq autres
     coûtaient zéro requête. La page s'affichait, avec le bon titre — seul
     `check-institutional.mjs`, qui compte les requêtes sur un navigateur réel,
     l'a vu. Les deux cas de table ci-dessous ferment la porte AVANT ce gate. */
  const miroirs: readonly { readonly nom: string; readonly source: string; readonly motif: RegExp }[] = [
    { nom: 'nginx.conf', source: NGINX, motif: /location ~ \^\/\(([a-z|]+)\)\(\\\.html\|\/\)\?\$/ },
    { nom: 'sw-institutional.js', source: SW, motif: /const INSTITUTIONAL_ROUTES = \[([^\]]+)\]/ },
  ];

  for (const { nom, source, motif } of miroirs) {
    test(`${nom} énumère CHAQUE adresse de la source unique — le miroir ne diverge pas`, () => {
      const declaration = motif.exec(source);
      // La déclaration ABSENTE est un échec NOMMÉ, jamais une liste vide
      // comparée à une liste vide : c'est la forme de témoin qui verdit sur le
      // fichier disparu ou renommé.
      expect(declaration).not.toBeNull();
      const listed = (declaration?.[1] ?? '')
        .split(/[|,]/)
        .map((r) => r.trim().replace(/^'|'$/g, ''))
        .filter((r) => r !== '');
      expect(listed.sort()).toEqual([...INSTITUTIONAL_ROUTES].sort());
    });
  }

  test('elles sont lisibles SANS COMPTE — aucune n’est une route de l’application', () => {
    // Un document pré-rendu ne traverse pas la garde de session : il est servi
    // par nginx AVANT le repli de l'application. Le vérifier explicitement
    // ferme la porte à l'inverse — quelqu'un qui en ferait demain une route
    // applicative les ferait entrer sous la garde, et `/settings` y est PRIVÉE.
    const patterns = Object.values(ROUTES).map((r) => r.pattern);
    expect(patterns).not.toContain('/help');
    expect(patterns).not.toContain('/faq');

    // Et si elles y entraient un jour, la garde les laisserait passer : une
    // clé qu'elle ne connaît pas est publique et neutre.
    for (const routeKey of ['help', 'faq']) {
      expect(
        resolveRouteAccess({ sessionStatus: 'anonymous', source: 'gateway', routeKey }),
      ).toBe('allow');
    }
  });
});

describe('le contenu des deux pages est RÉEL', () => {
  test('la FAQ répond aux questions qu’un utilisateur de Meeshy se pose', () => {
    /* Le critère de fin de #7287 dit « avec du contenu » — pas « avec une
       page ». Ce témoin nomme les cinq sujets que l'issue énumère : une FAQ
       qui perdrait l'un d'eux en refonte rougirait ici plutôt qu'en production,
       chez quelqu'un qui cherchait justement cette réponse. */
    const texte = JSON.stringify(PAGE_FAQ).toLowerCase();
    for (const sujet of ['traduction', 'langue', 'vocal', 'confidentialité', 'compte']) {
      expect(texte).toContain(sujet);
    }
  });

  test('aucune des deux pages n’est une coquille — ni gabarit vide, ni « à venir »', () => {
    for (const page of [PAGE_HELP, PAGE_FAQ]) {
      expect(page.sections.length).toBeGreaterThanOrEqual(4);
      for (const section of page.sections) {
        expect(section.blocks.length).toBeGreaterThan(0);
      }
      // Une page d'aide qui annonce son propre retard est pire qu'une page
      // absente : elle fait perdre le geste à quelqu'un qui cherchait de l'aide.
      expect(JSON.stringify(page).toLowerCase()).not.toContain('à venir');
      expect(JSON.stringify(page).toLowerCase()).not.toContain('bientôt disponible');
    }
  });

  test('les deux traversent le rendu partagé et en ressortent avec leur contenu', () => {
    for (const page of [PAGE_HELP, PAGE_FAQ]) {
      const html = render(<InstitutionalPage page={page} version="2.0.10" />);
      expect(html).toContain(page.title);
      for (const section of page.sections) {
        // `preact-render-to-string` échappe les entités comme le préchauffage :
        // on cherche donc le titre tel qu'il SORT, pas tel qu'il est écrit.
        expect(html).toContain(section.title.replace(/&/g, '&amp;').replace(/'/g, '&#39;'));
      }
    }
  });

  test('chaque page renvoie vers l’autre — on arrive sur l’une en cherchant l’autre', () => {
    // La rangée de suite est le SEUL chemin entre les deux pour un lecteur
    // arrivé depuis l'app : elles n'ont pas de menu.
    expect(PAGE_HELP.run.links.map((l) => l.href)).toContain('/faq');
    expect(PAGE_FAQ.run.links.map((l) => l.href)).toContain('/help');
  });
});
