/**
 * #7022 — L'ADRESSE PUBLIQUE D'UN MÉDIA, COMPOSÉE PAR LE SERVEUR.
 *
 * La normalisation retire l'hôte de la DONNÉE ; il faut donc que la passerelle
 * le repose pour le seul lecteur qui n'a pas de base — l'extension de
 * notification iOS. Ces témoins portent sur la RÈGLE, jamais sur un appelant :
 * ce qui se compose, et surtout ce qui ne se compose PAS.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';

import { publicMediaUrl } from '../../../services/attachments/publicMediaUrl';

const BASE = 'https://gate.staging.meeshy.me';

describe('publicMediaUrl — la clé identifie le fichier, le serveur compose l’adresse', () => {
  it('une CLÉ DE STOCKAGE reçoit la route de flux versionnée, encodée une fois', () => {
    expect(publicMediaUrl('2026/09/507f1f77bcf86cd799439041/photo.jpg', BASE)).toBe(
      `${BASE}/api/v1/attachments/file/2026%2F09%2F507f1f77bcf86cd799439041%2Fphoto.jpg`,
    );
  });

  it('elle vise la base CONFIGURÉE — jamais l’hôte de production', () => {
    expect(publicMediaUrl('2026/09/u/photo.jpg', 'http://localhost:3000')).toBe(
      'http://localhost:3000/api/v1/attachments/file/2026%2F09%2Fu%2Fphoto.jpg',
    );
  });

  /**
   * FAIL-CLOSED PAR LA FORME — les trois familles qu'une réécriture PERDRAIT.
   * Un CDN tiers et le magasin statique ne vivent pas sur la passerelle ; une
   * piste traduite vit hors de l'arborescence datée et se sert par son chemin.
   * Se tromper d'adresse perd le fichier ; le laisser tel quel ne fait que
   * reconduire ce qui marchait.
   */
  it.each([
    ['https://cdn.example/photo.jpg'],
    ['https://static.meeshy.me/u/i/2025/11/a.jpg'],
    ['http://localhost:9000/bucket/a.jpg'],
  ])('une adresse déjà absolue traverse INCHANGÉE — %s', (valeur) => {
    expect(publicMediaUrl(valeur, BASE)).toBe(valeur);
  });

  it('un chemin en barre initiale est simplement posé derrière la base', () => {
    expect(publicMediaUrl('/api/v1/attachments/file/translated/att_fr.mp3', BASE)).toBe(
      `${BASE}/api/v1/attachments/file/translated/att_fr.mp3`,
    );
  });

  it.each([['translated/att_fr.mp3'], ['avatars/user/abc.jpg'], ['uploads/photo.png']])(
    'une clé HORS arborescence datée garde le comportement antérieur — %s',
    (valeur) => {
      expect(publicMediaUrl(valeur, BASE)).toBe(`${BASE}/${valeur}`);
    },
  );

  it('une chaîne VIDE reste vide — elle ne désigne rien, et le fil la lit comme « pas de média »', () => {
    expect(publicMediaUrl('', BASE)).toBe('');
  });

  it('une base à barre finale ne double pas la barre', () => {
    expect(publicMediaUrl('2026/09/u/p.jpg', 'https://gate.meeshy.me/')).toBe(
      'https://gate.meeshy.me/api/v1/attachments/file/2026%2F09%2Fu%2Fp.jpg',
    );
  });
});
