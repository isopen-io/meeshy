import { describe, it, expect } from '@jest/globals';
import { TUS_COLLECTION_METHODS, TUS_UPLOAD_METHODS } from '../tus-methods';

/**
 * **`GET` n'est jamais exposé sur une route servie par `@tus/server`** (#7132).
 *
 * La porte tus décide SEULE de ses en-têtes CORS — `tusServer.handle` écrit sur
 * la réponse brute, donc ceux de `@fastify/cors` ne l'atteignent jamais (#5298).
 * Et `@tus/server` 2.4.5 a une exception qu'il écrit lui-même dans son code
 * (`dist/server.js`) :
 *
 * > `// CORS must be set before the 412 and validation 400 returns below.`
 * > `// GET still dispatches earlier and stays CORS-less.`
 *
 * Un `GET` servi par tus repart donc **sans** `Access-Control-Allow-Origin`, et
 * un navigateur d'une autre origine ne peut pas le lire : c'est mot pour mot le
 * message rapporté sur staging le 2026-09-19 (#7132).
 *
 * Ce fichier ne monte AUCUN mock : il lit les deux listes telles que le module
 * les déclare. Le fichier voisin (`tus-handler-cors.test.ts`) charge le module
 * APRÈS avoir posé les siens, et un import statique y casserait cette
 * mécanique — d'où deux fichiers plutôt qu'un.
 */
describe('registerTusRoutes — les méthodes exposées', () => {
  it("n'expose JAMAIS GET : une réponse tus à un GET n'a pas d'en-tête CORS", () => {
    expect(TUS_COLLECTION_METHODS).not.toContain('GET');
    expect(TUS_UPLOAD_METHODS).not.toContain('GET');
  });

  it('porte les méthodes du protocole, et elles seules (#4190)', () => {
    // La collection CRÉE une session et se décrit ; une session existante se
    // sonde (reprise), se poursuit, se termine et se décrit.
    expect([...TUS_COLLECTION_METHODS].sort()).toEqual(['HEAD', 'OPTIONS', 'POST']);
    expect([...TUS_UPLOAD_METHODS].sort()).toEqual(['DELETE', 'HEAD', 'OPTIONS', 'PATCH', 'POST']);
  });

  it("CONTRE-ÉPREUVE — la garde reconnaît une liste qui exposerait GET", () => {
    // Sans elle, les deux témoins ci-dessus passeraient aussi si `toContain`
    // ne discriminait rien. La forme FAUTIVE est reconnue, la nôtre non.
    const fautive: readonly string[] = ['HEAD', 'GET', 'PATCH', 'OPTIONS'];
    expect(fautive).toContain('GET');
    expect([...TUS_UPLOAD_METHODS] as readonly string[]).not.toContain('GET');
    expect([...TUS_COLLECTION_METHODS] as readonly string[]).not.toContain('GET');
  });
});
