import { MediaService } from '../../../services/MediaService';
import { planMediaUrlNormalization, STORAGE_KEY_SHAPE } from '../../../services/attachments/mediaUrlNormalization';

/**
 * LA DÉCISION DE NORMALISER UNE ADRESSE DE MÉDIA (#7022).
 *
 * `fileUrl` porte trois conventions en production, mesurées le 2026-09-18 sur
 * `meeshy-database` : 1600 adresses ABSOLUES sur 2912 références (55 %), 574
 * routes RELATIVES percent-encodées, et 738 clés NUES — la seule forme que
 * #4324 autorise à se persister (« ni hôte, ni préfixe d'API, ni version :
 * ce sont des décisions de déploiement, et une donnée qui les porte devient
 * fausse dès que l'une d'elles change »).
 *
 * LA DÉCISION EST PURE, et séparée du balayage qui l'applique : c'est elle
 * qu'on veut pouvoir interroger ligne à ligne sans base ni disque. La lecture
 * de la clé, elle, n'est pas réécrite ici — elle DÉLÈGUE à
 * `MediaService.relativePathFromUrl`, le site que la passerelle emploie déjà
 * pour retrouver les octets d'une adresse (`deleteMedia`, `duplicateMedia`).
 * Une seconde lecture divergerait de celle qui EFFACE les fichiers, et c'est
 * précisément la divergence qu'un script de migration ne peut pas se
 * permettre.
 *
 * FAIL-CLOSED — trois refus valent mieux qu'une réécriture optimiste. Une
 * ligne ne se réécrit QUE si sa clé a la forme d'une clé de stockage ET que
 * les octets sont là. Tout le reste est laissé INTACT et COMPTÉ : un script de
 * migration qui devine est un script qui perd des médias.
 */
describe('planMediaUrlNormalization — #7022', () => {
  const storageKeyOf = (value: string) => new MediaService('/app/uploads').relativePathFromUrl(value);
  const tousPrésents = () => true;
  const aucunPrésent = () => false;

  const plan = (value: string, hasBytes: (key: string) => boolean = tousPrésents) =>
    planMediaUrlNormalization({ value, storageKeyOf, hasBytes });

  describe('les trois formes réellement en base', () => {
    test("l'ADRESSE ABSOLUE (964 + 636 lignes) perd son hôte et sa route", () => {
      expect(
        plan('https://gate.meeshy.me/api/v1/attachments/file/2026/02/68f33afa8ae497b2054c84d7/community_upload_2e813ffd.jpg'),
      ).toEqual({
        kind: 'à-normaliser',
        key: '2026/02/68f33afa8ae497b2054c84d7/community_upload_2e813ffd.jpg',
      });
    });

    test('la ROUTE RELATIVE percent-encodée (539 + 35 lignes) est décodée en clé', () => {
      expect(plan('/api/attachments/file/2025%2F12%2F6908537c%2Fdossier_181fb11b.pdf')).toEqual({
        kind: 'à-normaliser',
        key: '2025/12/6908537c/dossier_181fb11b.pdf',
      });
    });

    test('la CLÉ NUE (738 lignes) est DÉJÀ la forme voulue — aucune écriture', () => {
      expect(plan('2026/09/68f33afa8ae497b2054c84d7/0_2e0b854d.jpeg')).toEqual({ kind: 'déjà-normalisée' });
    });
  });

  describe('IDEMPOTENCE — rejouer le script ne réécrit rien', () => {
    test("la clé rendue par un premier passage est « déjà-normalisée » au second", () => {
      const premier = plan('https://gate.meeshy.me/api/v1/attachments/file/2026%2F09%2F68f33afa%2Fphoto.png');
      expect(premier.kind).toBe('à-normaliser');
      if (premier.kind !== 'à-normaliser') throw new Error('inatteignable');
      expect(plan(premier.key)).toEqual({ kind: 'déjà-normalisée' });
    });
  });

  describe('LES TROIS REFUS — ce que le script laisse INTACT', () => {
    test("une adresse dont les OCTETS sont introuvables n'est jamais réécrite", () => {
      expect(plan('https://gate.meeshy.me/api/v1/attachments/file/2025/10/68c07400/Screenshot.png', aucunPrésent)).toEqual({
        kind: 'octets-absents',
        key: '2025/10/68c07400/Screenshot.png',
      });
    });

    test("ce qui n'a pas la forme d'une clé DATÉE est laissé — la piste TRADUITE vit hors de l'arborescence", () => {
      expect(plan('/api/v1/attachments/file/translated/voice_fr_42.mp3')).toEqual({
        kind: 'hors-arborescence',
        key: 'translated/voice_fr_42.mp3',
      });
    });

    test('le magasin STATIQUE garde son adresse — ses octets ne sont pas sur la passerelle (#4625)', () => {
      expect(plan('https://static.meeshy.me/u/i/2025/11/avatar_1763143871947_o0.jpg')).toEqual({ kind: 'forme-inconnue' });
    });

    test("un CDN tiers n'est pas une clé", () => {
      expect(plan('https://cdn.example.com/photo.png')).toEqual({ kind: 'forme-inconnue' });
    });

    test('une chaîne VIDE est laissée', () => {
      expect(plan('')).toEqual({ kind: 'forme-inconnue' });
    });
  });

  describe('la FORME de clé que le script accepte', () => {
    test("c'est l'arborescence datée que les DEUX producteurs écrivent — `YYYY/MM/<uid>/<nom>`", () => {
      expect(STORAGE_KEY_SHAPE.test('2026/09/68f33afa8ae497b2054c84d7/0_2e0b854d.jpeg')).toBe(true);
      expect(STORAGE_KEY_SHAPE.test('translated/voice.mp3')).toBe(false);
      expect(STORAGE_KEY_SHAPE.test('snapshots/abcd.jpg')).toBe(false);
      expect(STORAGE_KEY_SHAPE.test('avatars/u/photo.png')).toBe(false);
      // Le segment du PROPRIÉTAIRE n'est pas facultatif : les deux producteurs
      // écrivent `path.join(année, mois, userId, nom)`, et une clé à trois
      // segments ne vient d'aucun d'eux.
      expect(STORAGE_KEY_SHAPE.test('2026/09/photo.png')).toBe(false);
    });

    test("une clé qui REMONTE l'arborescence est refusée, même bien datée", () => {
      expect(plan('/api/v1/attachments/file/2026%2F09%2F..%2F..%2Fetc%2Fpasswd')).toEqual({ kind: 'forme-inconnue' });
    });
  });
});
