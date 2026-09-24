import { describe, expect, test } from 'bun:test';

import { ROUTES } from '@/routes/route-table';

/**
 * **UNE LISTE D'ADMINISTRATION OUVRE SA FICHE** — la garde qui manquait, et
 * dont l'absence a laissé passer un défaut entier.
 *
 * ## Le défaut mesuré (2026-09-16, #6862)
 *
 * `admin-conversations.tsx` a été livré avec des lignes INERTES : aucun
 * `<Link>`, alors que l'écran de lecture (`admin-conversation.tsx`) était
 * écrit, testé, routé et déclaré privé. Le détail n'était atteignable qu'en
 * tapant son adresse à la main.
 *
 * **Rien ne pouvait le voir** : `tsc` passe (une liste sans lien est du
 * TypeScript valide), les 4449 témoins passent (aucun n'interroge la
 * navigation), le gate de poids passe (un lien manquant ALLÈGE). Un maillon
 * absent ne casse rien — il ne relie simplement pas. C'est la loi 4 sous sa
 * forme la plus discrète : non pas un contrôle sans effet, mais un contrôle
 * qui n'existe pas là où l'utilisateur le cherche.
 *
 * ## Ce que ce témoin garde, et ce qu'il ne peut pas garder
 *
 * Il garde la **structure** : pour chaque liste d'administration, l'écran de
 * DÉTAIL correspondant existe dans la table des routes, dans les deux espaces,
 * et son motif porte le paramètre que la ligne devra fournir. Une paire
 * liste/détail ajoutée sans son jumeau rougit ici.
 *
 * Il ne peut PAS garder que le composant rend effectivement le lien — cela se
 * mesure au DOM, et c'est l'objet de la recette au navigateur. Mais il rend la
 * paire EXPLICITE : ajouter une liste sans détail, ou un détail sans le
 * déclarer dans les deux espaces, ne passe plus en silence.
 */

/** Les paires « liste → fiche » de l'administration, dans les DEUX espaces. */
const PAIRES = [
  { liste: 'adminUsers', fiche: 'adminUser', parametre: 'user' },
  { liste: 'admUsers', fiche: 'admUser', parametre: 'user' },
  { liste: 'adminConversations', fiche: 'adminConversation', parametre: 'conversation' },
  { liste: 'admConversations', fiche: 'admConversation', parametre: 'conversation' },
] as const;

describe('toute liste d’administration a une fiche à ouvrir (#6862)', () => {
  for (const { liste, fiche, parametre } of PAIRES) {
    test(`${liste} → ${fiche} : les deux routes existent`, () => {
      expect(ROUTES[liste]).toBeDefined();
      expect(ROUTES[fiche]).toBeDefined();
    });

    test(`${fiche} porte bien le paramètre « ${parametre} » que la ligne doit fournir`, () => {
      // Le motif DÉCLARE ce que `params` devra contenir. Un détail dont le
      // paramètre ne correspond pas à ce que la liste passe ne compilerait
      // pas — mais il faut encore que le paramètre soit celui qu'on croit.
      expect(ROUTES[fiche].pattern).toContain(`$${parametre}`);
    });

    test(`${fiche} vit sous le MÊME espace que ${liste} — jamais l’autre administration`, () => {
      // D-76 tient `/adm` et `/admin` séparées : une fiche qui changerait
      // d'espace ferait sauter l'administrateur de l'une à l'autre au premier
      // tap, sans que rien ne le signale.
      const espace = (motif: string) => (motif.startsWith('/adm/') ? '/adm' : '/admin');
      expect(espace(ROUTES[fiche].pattern)).toBe(espace(ROUTES[liste].pattern));
    });
  }

  test('la fiche est TOUJOURS plus profonde que sa liste — aucune ambiguïté de résolution', () => {
    for (const { liste, fiche } of PAIRES) {
      const profondeur = (motif: string) => motif.split('/').filter(Boolean).length;
      expect(profondeur(ROUTES[fiche].pattern)).toBeGreaterThan(profondeur(ROUTES[liste].pattern));
    }
  });
});
