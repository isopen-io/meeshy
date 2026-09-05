/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { GET } from '@/app/rt/[nom]/route';
import { PREFIXE_RT, actifParNom, actifsTempsReel } from '@/lib/actifs-rt';

/**
 * LES ACTIFS DU TEMPS RÉEL (conception § 12.4) : QUATRE fichiers, servis dans
 * la ZONE sous un nom qui porte le hash de leur contenu, par le MÊME module
 * qui écrit leur adresse dans le document. Ce que ces témoins gardent :
 * l'adresse et le nom viennent d'une seule lecture ; un nom inconnu — ou un
 * hash périmé — rend 404 ; ce qui est servi est immuable.
 *
 * NEUF MODULES, PAS UN. Le fil (`participate`), la liste (`liste`), le fil
 * social (`feed`, #5031), la boîte (`notifs`, #4898), le carnet (`contacts`,
 * #4921), la recherche (`recherche`, #4897), les liens (`liens`, #5090), les
 * commentaires (`commentaires`, #5091) et la galerie (`plein`,
 * `/chats/:cle/medias`, #4525) sont compilés séparément parce qu'un écran ne doit
 * télécharger que ce qu'il exécute : `participate.js` pèse 26 Ko gzip
 * (composeur, réserve, plein écran, peinture de bulles), dont ni `/chats` ni
 * `/feed` n'exécutent une ligne ; `plein.js` ne pèse que 241 o gzip — UN seul
 * appel à `prendsLePleinEcran()`, tout ce que la galerie doit au clavier. Le
 * socle que `participate` et `liste` PARTAGENT — socket.io-client — reste UN
 * actif, à UNE adresse ; `feed` et `plein` ne le référencent pas du tout
 * (aimer et reposter sont des allers simples, aucun socket ; la galerie n'a
 * pas de temps réel non plus).
 */

const RACINE = join(__dirname, '..');

describe('les quatre actifs', () => {
  const actifs = actifsTempsReel();

  it('composent leur adresse sous /__v3/rt/, avec le hash dans le NOM', () => {
    expect(actifs.participate.url).toBe(`${PREFIXE_RT}/${actifs.participate.nom}`);
    expect(actifs.liste.url).toBe(`${PREFIXE_RT}/${actifs.liste.nom}`);
    expect(actifs.feed.url).toBe(`${PREFIXE_RT}/${actifs.feed.nom}`);
    expect(actifs.notifs.url).toBe(`${PREFIXE_RT}/${actifs.notifs.nom}`);
    expect(actifs.contacts.url).toBe(`${PREFIXE_RT}/${actifs.contacts.nom}`);
    expect(actifs.recherche.url).toBe(`${PREFIXE_RT}/${actifs.recherche.nom}`);
    expect(actifs.liens.url).toBe(`${PREFIXE_RT}/${actifs.liens.nom}`);
    expect(actifs.commentaires.url).toBe(`${PREFIXE_RT}/${actifs.commentaires.nom}`);
    expect(actifs.plein.url).toBe(`${PREFIXE_RT}/${actifs.plein.nom}`);
    expect(actifs.socket.url).toBe(`${PREFIXE_RT}/${actifs.socket.nom}`);
    expect(actifs.participate.nom).toMatch(/^participate\.[0-9a-f]{16}\.js$/);
    expect(actifs.liste.nom).toMatch(/^liste\.[0-9a-f]{16}\.js$/);
    expect(actifs.feed.nom).toMatch(/^feed\.[0-9a-f]{16}\.js$/);
    expect(actifs.notifs.nom).toMatch(/^notifs\.[0-9a-f]{16}\.js$/);
    expect(actifs.contacts.nom).toMatch(/^contacts\.[0-9a-f]{16}\.js$/);
    expect(actifs.recherche.nom).toMatch(/^recherche\.[0-9a-f]{16}\.js$/);
    expect(actifs.liens.nom).toMatch(/^liens\.[0-9a-f]{16}\.js$/);
    expect(actifs.commentaires.nom).toMatch(/^commentaires\.[0-9a-f]{16}\.js$/);
    expect(actifs.plein.nom).toMatch(/^plein\.[0-9a-f]{16}\.js$/);
    expect(actifs.socket.nom).toMatch(/^socket\.io\.[0-9a-f]{16}\.js$/);
  });

  /**
   * Les neuf modules ne partagent AUCUNE adresse : servir la liste au fil (ou
   * l'inverse) ferait exécuter un module qui ne trouve pas sa surface et
   * n'échouerait nulle part — un temps réel silencieusement mort.
   */
  it('donnent trois adresses DISTINCTES aux trois modules', () => {
    expect(actifs.liste.url).not.toBe(actifs.participate.url);
    expect(actifs.feed.url).not.toBe(actifs.participate.url);
    expect(actifs.feed.url).not.toBe(actifs.liste.url);
    expect(actifs.notifs.url).not.toBe(actifs.participate.url);
    expect(actifs.notifs.url).not.toBe(actifs.liste.url);
    expect(actifs.notifs.url).not.toBe(actifs.feed.url);
    expect(actifs.contacts.url).not.toBe(actifs.participate.url);
    expect(actifs.contacts.url).not.toBe(actifs.liste.url);
    expect(actifs.contacts.url).not.toBe(actifs.feed.url);
    expect(actifs.contacts.url).not.toBe(actifs.notifs.url);
    expect(actifs.recherche.url).not.toBe(actifs.participate.url);
    expect(actifs.recherche.url).not.toBe(actifs.liste.url);
    expect(actifs.recherche.url).not.toBe(actifs.feed.url);
    expect(actifs.recherche.url).not.toBe(actifs.notifs.url);
    expect(actifs.recherche.url).not.toBe(actifs.contacts.url);
    expect(actifs.liens.url).not.toBe(actifs.participate.url);
    expect(actifs.liens.url).not.toBe(actifs.liste.url);
    expect(actifs.liens.url).not.toBe(actifs.feed.url);
    expect(actifs.liens.url).not.toBe(actifs.notifs.url);
    expect(actifs.liens.url).not.toBe(actifs.contacts.url);
    expect(actifs.liens.url).not.toBe(actifs.recherche.url);
    expect(actifs.commentaires.url).not.toBe(actifs.participate.url);
    expect(actifs.commentaires.url).not.toBe(actifs.liste.url);
    expect(actifs.commentaires.url).not.toBe(actifs.feed.url);
    expect(actifs.commentaires.url).not.toBe(actifs.notifs.url);
    expect(actifs.commentaires.url).not.toBe(actifs.contacts.url);
    expect(actifs.commentaires.url).not.toBe(actifs.recherche.url);
    expect(actifs.commentaires.url).not.toBe(actifs.liens.url);
    expect(actifs.plein.url).not.toBe(actifs.participate.url);
    expect(actifs.plein.url).not.toBe(actifs.liste.url);
    expect(actifs.plein.url).not.toBe(actifs.feed.url);
    expect(actifs.plein.url).not.toBe(actifs.notifs.url);
    expect(actifs.plein.url).not.toBe(actifs.contacts.url);
    expect(actifs.plein.url).not.toBe(actifs.recherche.url);
    expect(actifs.plein.url).not.toBe(actifs.liens.url);
    expect(actifs.plein.url).not.toBe(actifs.commentaires.url);
  });

  /**
   * CHAQUE MODULE QUE LES ACTIFS SERVENT EST TRACÉ (`next.config.ts`,
   * `/rt/[nom]`). `standalone` ne copie que ce qu'une entrée désigne : un
   * module non tracé rend un corps vide en production, la porte sert
   * `tempsReel: null`, et l'écran perd son direct EN SILENCE — c'est arrivé à
   * `/feed`, jamais tracé entre #5031 et #4898. La liste attendue est DÉRIVÉE
   * des actifs (jamais énumérée ici) : un cinquième module l'étendra tout seul.
   */
  it('trace chaque module de participation dans next.config — un module non tracé meurt en silence', async () => {
    const { default: nextConfig } = await import('../next.config');
    const traces = (nextConfig.outputFileTracingIncludes ?? {})['/rt/[nom]'] ?? [];
    const modules = Object.keys(actifsTempsReel()).filter((base) => base !== 'socket');

    modules.forEach((base) => {
      expect(traces).toContain(`./.rt/${base}.js`);
    });
    expect(traces).toContain('./node_modules/socket.io-client/dist/socket.io.esm.min.js');
  });

  it('servent socket.io-client tel quel, depuis son paquet — jamais recopié', () => {
    const attendu = readFileSync(join(RACINE, 'node_modules', 'socket.io-client', 'dist', 'socket.io.esm.min.js'), 'utf8');
    expect(actifs.socket.corps).toBe(attendu);
    expect(actifParNom(actifs.socket.nom)?.corps).toBe(attendu);
  });

  it('refuse un nom inconnu', () => {
    expect(actifParNom('socket.io.0000000000000000.js')).toBeNull();
    expect(actifParNom('../../etc/passwd')).toBeNull();
  });
});

describe('la route qui les sert', () => {
  const contexte = (nom: string) => ({ params: Promise.resolve({ nom }) });

  it('sert un module ES, immuable, sous son type', async () => {
    const reponse = await GET(new Request('https://meeshy.me/x'), contexte(actifsTempsReel().socket.nom));
    expect(reponse.status).toBe(200);
    expect(reponse.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    expect(reponse.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect((await reponse.text()).length).toBeGreaterThan(1000);
  });

  it('rend 404, sans cache, sur un nom qui n’est pas le sien', async () => {
    const reponse = await GET(new Request('https://meeshy.me/x'), contexte('participate.deadbeefdeadbeef.js'));
    expect(reponse.status).toBe(404);
    expect(reponse.headers.get('cache-control')).toBe('no-store');
  });
});

describe("chaque actif du memo est SERVABLE — l'énumération manuscrite ne peut plus retenir un module", () => {
  it('actifParNom retrouve chaque actif que actifsTempsReel compose (corps non vide)', () => {
    for (const [cle, actif] of Object.entries(actifsTempsReel())) {
      if (actif.corps === '') continue;
      expect({ cle, servi: actifParNom(actif.nom) !== null }).toEqual({ cle, servi: true });
    }
  });
});
