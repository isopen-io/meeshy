/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { documentDuFil, type EtatDuFil } from '@/app/connecte/fil-vue';
import { AUCUNE_PRESENCE, LONGUEUR_MAX_DU_MESSAGE } from '@/lib/api/fil';

/**
 * LE PLAFOND D'UN MESSAGE EST CELUI DE LA PASSERELLE, ET IL EST ANNONCÉ.
 *
 * `MessageValidator.ts:89` et `messages-send.ts:45` refusent au-delà de
 * `MESSAGE_LIMITS.MAX_MESSAGE_LENGTH` ; le composeur n'annonçait rien, et un
 * envoi de 4 001 caractères PARTAIT — pour revenir en refus, le champ déjà vidé,
 * « Réessayer » rejouant le même refus. La directive dit « compteur si une
 * limite existe » : elle existe, elle a une valeur, et cette valeur vit dans un
 * fichier que la v3 ne peut pas importer (frontière de paquet). Ce témoin le
 * RELIT : si la passerelle change sa loi, la v3 rougit ici, pas chez le lecteur.
 */

const FICHIER_DE_LA_PASSERELLE = join(__dirname, '..', '..', '..', 'services', 'gateway', 'src', 'config', 'message-limits.ts');

const plafondDeLaPasserelle = (): number => {
  const source = readFileSync(FICHIER_DE_LA_PASSERELLE, 'utf8');
  const lu = /MAX_MESSAGE_LENGTH:\s*parseInt\(process\.env\.MAX_MESSAGE_LENGTH\s*\|\|\s*'(\d+)'/.exec(source);
  if (lu === null) throw new Error(`MESSAGE_LIMITS.MAX_MESSAGE_LENGTH introuvable dans ${FICHIER_DE_LA_PASSERELLE}`);
  return Number(lu[1]);
};

const etat = (): EtatDuFil => ({
  porte: { genre: 'membre', cle: 'lagos' },
  fil: { id: 'c1', titre: 'Équipe Lagos', membres: 3, presence: AUCUNE_PRESENCE, messages: [], plusAncien: null },
  lecteur: { id: 'u1', nom: 'Amina', langues: ['fr'] },
  erreur: null,
  brouillon: '',
  maintenant: 0,
  composeur: { genre: 'ouvert' },
  tempsReel: null,
  plein: null,
  profil: null,
});

describe('le plafond du message', () => {
  it('est celui que la passerelle sert par défaut — relu dans son fichier, jamais recopié à l’aveugle', () => {
    expect(LONGUEUR_MAX_DU_MESSAGE).toBe(plafondDeLaPasserelle());
  });

  it('est annoncé sans JavaScript : maxlength sur le champ, et les deux sorties que le module révèle', () => {
    const html = documentDuFil(etat());
    expect(html).toContain(`maxlength="${LONGUEUR_MAX_DU_MESSAGE}"`);
    expect(html).toContain('<output class="compteur" id="compteur" for="champ-texte" aria-live="polite" hidden></output>');
    expect(html).toContain('<output class="refus" id="refus-du-composeur" for="champ-texte" role="alert" hidden></output>');
  });
});
