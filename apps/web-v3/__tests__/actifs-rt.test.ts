/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { GET } from '@/app/rt/[nom]/route';
import { PREFIXE_RT, actifParNom, actifsTempsReel } from '@/lib/actifs-rt';

/**
 * LES ACTIFS DU TEMPS RÉEL (conception § 12.4) : TROIS fichiers, servis dans la
 * ZONE sous un nom qui porte le hash de leur contenu, par le MÊME module qui
 * écrit leur adresse dans le document. Ce que ces témoins gardent : l'adresse
 * et le nom viennent d'une seule lecture ; un nom inconnu — ou un hash
 * périmé — rend 404 ; ce qui est servi est immuable.
 *
 * DEUX MODULES, PAS UN. Le fil (`participate`) et la liste (`liste`) sont
 * compilés séparément parce qu'un écran ne doit télécharger que ce qu'il
 * exécute : `participate.js` pèse 26 Ko gzip (composeur, réserve, plein écran,
 * peinture de bulles), dont `/chats` n'exécute pas une ligne. Le socle qu'ils
 * PARTAGENT — socket.io-client — reste UN actif, à UNE adresse, donc mis en
 * cache une seule fois pour les deux écrans.
 */

const RACINE = join(__dirname, '..');

describe('les trois actifs', () => {
  const actifs = actifsTempsReel();

  it('composent leur adresse sous /__v3/rt/, avec le hash dans le NOM', () => {
    expect(actifs.participate.url).toBe(`${PREFIXE_RT}/${actifs.participate.nom}`);
    expect(actifs.liste.url).toBe(`${PREFIXE_RT}/${actifs.liste.nom}`);
    expect(actifs.socket.url).toBe(`${PREFIXE_RT}/${actifs.socket.nom}`);
    expect(actifs.participate.nom).toMatch(/^participate\.[0-9a-f]{16}\.js$/);
    expect(actifs.liste.nom).toMatch(/^liste\.[0-9a-f]{16}\.js$/);
    expect(actifs.socket.nom).toMatch(/^socket\.io\.[0-9a-f]{16}\.js$/);
  });

  /**
   * Les deux modules ne partagent PAS une adresse : servir la liste au fil (ou
   * l'inverse) ferait exécuter un module qui ne trouve pas sa surface et
   * n'échouerait nulle part — un temps réel silencieusement mort.
   */
  it('donnent deux adresses DISTINCTES aux deux modules', () => {
    expect(actifs.liste.url).not.toBe(actifs.participate.url);
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
