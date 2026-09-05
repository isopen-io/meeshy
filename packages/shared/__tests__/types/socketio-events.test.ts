import { describe, it, expect } from 'vitest';
import { CLIENT_EVENTS, SERVER_EVENTS } from '../../types/socketio-events';

describe('SERVER_EVENTS', () => {
  it('declares MESSAGE_ATTACHMENT_UPDATED for async attachment enrichments', () => {
    expect(SERVER_EVENTS.MESSAGE_ATTACHMENT_UPDATED).toBe('message:attachment-updated');
  });

  it('uses entity:action-word convention (colons + hyphens, never underscores)', () => {
    const eventName = SERVER_EVENTS.MESSAGE_ATTACHMENT_UPDATED;
    expect(eventName).toMatch(/^[a-z]+:[a-z-]+$/);
    expect(eventName).not.toContain('_');
  });

  it('declares typed FRIEND_REQUEST_NEW/ACCEPTED/REJECTED events using the naming convention', () => {
    expect(SERVER_EVENTS.FRIEND_REQUEST_NEW).toBe('friend-request:new');
    expect(SERVER_EVENTS.FRIEND_REQUEST_ACCEPTED).toBe('friend-request:accepted');
    expect(SERVER_EVENTS.FRIEND_REQUEST_REJECTED).toBe('friend-request:rejected');
    for (const eventName of [
      SERVER_EVENTS.FRIEND_REQUEST_NEW,
      SERVER_EVENTS.FRIEND_REQUEST_ACCEPTED,
      SERVER_EVENTS.FRIEND_REQUEST_REJECTED,
    ]) {
      expect(eventName).toMatch(/^[a-z-]+:[a-z-]+$/);
      expect(eventName).not.toContain('_');
    }
  });

  it('declares USER_UPDATED for realtime profile propagation to conversation partners', () => {
    expect(SERVER_EVENTS.USER_UPDATED).toBe('user:updated');
    expect(SERVER_EVENTS.USER_UPDATED).toMatch(/^[a-z]+:[a-z-]+$/);
    expect(SERVER_EVENTS.USER_UPDATED).not.toContain('_');
  });

  it('ne déclare QU’UN nom d’accusé de lecture — la dérogation de nommage est assumée, pas doublée', () => {
    // Le nom hyphène l'ENTITÉ (`read-status`) et déroge donc à
    // `entity:action-word`. Un alias conforme (`message:read-status-updated`) a
    // été dual-émis du 2026-07-05 au cycle 64 pour permettre la migration des
    // clients ; aucun client ne l'a jamais écouté, et le dual-émission doublait
    // le fan-out le plus fréquent de la messagerie. La dérogation coûte moins
    // que sa correction — voir tasks/socketio-events-cleanup.md § 3.
    expect(SERVER_EVENTS.READ_STATUS_UPDATED).toBe('read-status:updated');

    // La garde porte sur le NOMBRE : un second nom d'accusé de lecture ne peut
    // pas rentrer dans le contrat sans faire rougir ce témoin, quel que soit le
    // namespace qu'il choisit.
    const readStatusNames = Object.values(SERVER_EVENTS).filter((name) =>
      String(name).includes('read-status'),
    );
    expect(readStatusNames).toEqual(['read-status:updated']);
  });
});

/**
 * La convention `entity:action-word` sur L'ENSEMBLE du contrat, pas sur sept
 * noms choisis.
 *
 * Les témoins ci-dessus sont des sondes PONCTUELLES : chacune atteste la forme
 * d'un nom qu'un lot précis a ajouté. Aucune ne tombe si le nom SUIVANT porte
 * un underscore — et le contrat vit désormais dans vingt-deux modules
 * (`types/socketio-events/`, #4645), donc « le fichier documente la
 * convention » ne suffit plus à la garder : **un balayage qui cherche dans UN
 * fichier mesure ce fichier**.
 *
 * Ces témoins-ci lisent les cartes à l'EXÉCUTION, à travers la façade. Ils sont
 * donc aveugles au nombre de fichiers qui les composent, et ne peuvent pas
 * rétrécir quand la découpe s'affine.
 */
describe('la convention de nommage, sur TOUT le contrat', () => {
  const DECLARED: ReadonlyArray<string> = [
    ...Object.values(SERVER_EVENTS),
    ...Object.values(CLIENT_EVENTS),
  ];

  /**
   * Les quatre noms de POIGNÉE DE MAIN, sans namespace. Ils appartiennent au
   * transport et non au produit — c'est la seule raison qui exempte un nom du
   * `entity:` obligatoire, et elle est ÉNUMÉRÉE ici plutôt que devinée par une
   * expression régulière permissive : un nom produit qui perdrait son namespace
   * doit faire rougir ce fichier, pas s'y glisser.
   */
  const HANDSHAKE_NAMES: ReadonlySet<string> = new Set([
    'authenticate',
    'authenticated',
    'error',
    'heartbeat',
  ]);

  /** `entity:action-word` — minuscules et tirets, un ou plusieurs segments. */
  const PRODUCT_EVENT_SHAPE = /^[a-z][a-z0-9-]*(:[a-z0-9-]+)+$/;

  // Sans ce témoin, une façade qui cesserait de ré-exporter l'une des deux
  // cartes rendrait les suivants VIDES — donc verts sur rien. Le seuil est très
  // en dessous du compte réel (122 + 58 au 2026-09-01) : il atteste que les deux
  // cartes arrivent, il ne fige pas un inventaire.
  it('voit les DEUX cartes du contrat — un balayage vide passerait tout au vert', () => {
    expect(Object.values(SERVER_EVENTS).length).toBeGreaterThanOrEqual(100);
    expect(Object.values(CLIENT_EVENTS).length).toBeGreaterThanOrEqual(40);
  });

  it('ne déclare AUCUN nom portant un underscore', () => {
    expect(DECLARED.filter((name) => name.includes('_')).sort()).toEqual([]);
  });

  it('donne à chaque nom la forme entity:action-word, hors poignée de main', () => {
    const malformed = DECLARED.filter(
      (name) => !HANDSHAKE_NAMES.has(name) && !PRODUCT_EVENT_SHAPE.test(name),
    );

    expect(malformed.sort()).toEqual([]);
  });

  // Le témoin NÉGATIF, sans lequel les deux précédents ne prouvent rien : une
  // expression régulière devenue permissive (ou une exemption élargie) les
  // laisserait verts sur n'importe quoi.
  it('refuserait un nom fautif — la forme n’accepte ni underscore ni majuscule', () => {
    for (const wrong of ['message_new', 'Message:New', 'message:New', 'message', ':new']) {
      expect(HANDSHAKE_NAMES.has(wrong) || PRODUCT_EVENT_SHAPE.test(wrong)).toBe(false);
    }
  });
});
