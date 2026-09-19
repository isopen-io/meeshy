/**
 * **TOUT APPELANT DE `serializeAttachmentForSocket` SÉLECTIONNE LA FORME DU
 * CANAL SOCKET** (#7014).
 *
 * ## Le défaut que ce témoin ferme, et pourquoi il a survécu au lot #7014
 *
 * Le lot #7014 a rendu `serializeAttachmentForSocket` **fail-closed** : une
 * ligne sans drapeau de protection ressort estampillée PROTÉGÉE, ce qui est le
 * bon sens de panne pour une garde de confidentialité. Il a créé pour cela
 * `attachmentSocketSelect` — `attachmentMediaSelect` **plus** la protection.
 *
 * Mais il a migré quatre appelants sur cinq. `routes/sync/messages.ts`
 * chargeait encore `attachmentMediaSelect` nu — délibérément SANS drapeau,
 * son propre doc-comment le dit — et passait le résultat au sérialiseur.
 * Conséquence mesurée sur la branche : **toute pièce jointe servie par le
 * delta-sync sortait masquée**, pour tout le monde, alors qu'aucune n'est
 * protégée. Un fail-closed protège des fuites ; il ne protège de rien contre
 * l'oubli d'alimenter la garde, et transforme alors l'oubli en panne totale.
 *
 * ## Pourquoi une garde d'INVENTAIRE, et pas un témoin de plus
 *
 * Un témoin par appelant aurait laissé passer le sixième. La question à garder
 * n'est pas « ce site-ci est-il correct ? » mais **« existe-t-il un site qui ne
 * l'est pas ? »** — la seule forme qui survit à l'ajout d'un appelant que
 * personne n'a pensé à tester. C'est la leçon que ce dépôt a déjà payée sur
 * les relais qui RECOPIENT champ par champ.
 *
 * @jest-environment node
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, it, expect } from '@jest/globals';

const RACINE = join(__dirname, '..', '..');
const APPELANT = 'serializeAttachmentForSocket';
const FORME_DU_CANAL = 'attachmentSocketSelect';
const FORME_SANS_PROTECTION = 'attachmentMediaSelect';

/** Le sérialiseur lui-même et ses témoins : ils DÉFINISSENT la règle, ils ne la consomment pas. */
const HORS_SUJET = (chemin: string): boolean =>
  chemin.includes('__tests__') || chemin.endsWith(`${APPELANT}.ts`);

function fichiersTypeScript(dossier: string): readonly string[] {
  return readdirSync(dossier).flatMap((entree) => {
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) return fichiersTypeScript(chemin);
    return chemin.endsWith('.ts') && !chemin.endsWith('.d.ts') ? [chemin] : [];
  });
}

/**
 * Un fichier qui NOMME le sérialiseur dans un doc-comment ne l'appelle pas.
 * Six fichiers du gateway le citent pour expliquer une règle voisine ; les
 * retenir ferait rougir ce témoin sur des commentaires — le piège du
 * détecteur par SOUS-CHAÎNE, que ce dépôt a déjà payé. Seul un IMPORT
 * atteste d'un appel.
 */
const IMPORTE_LE_SERIALISEUR = new RegExp(`import\\s*\\{[^}]*\\b${APPELANT}\\b[^}]*\\}`, 's');

/**
 * Le CODE seul, commentaires retirés. Les deux formes sont abondamment citées
 * dans les doc-comments du gateway — précisément pour expliquer laquelle
 * employer — et un détecteur qui les lit rougit sur des sites CORRECTS
 * (`MessageHandler.ts` en cite trois fois la forme interdite pour dire qu'il
 * ne l'emploie pas). Un témoin qui rougit sur un commentaire finit désactivé.
 */
const codeSeul = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const appelants = fichiersTypeScript(RACINE)
  .filter((chemin) => !HORS_SUJET(chemin))
  .map((chemin) => ({ chemin, source: codeSeul(readFileSync(chemin, 'utf8')) }))
  .filter(({ source }) => IMPORTE_LE_SERIALISEUR.test(source));

describe(`les appelants de ${APPELANT}`, () => {
  it("il en existe — sans quoi ce témoin verdirait sur un inventaire VIDE", () => {
    expect(appelants.length).toBeGreaterThan(0);
  });

  it.each(appelants.map(({ chemin }) => [chemin.slice(RACINE.length + 1)]))(
    '%s sélectionne la forme du canal socket, jamais la forme sans protection',
    (relatif) => {
      const { source } = appelants.find(({ chemin }) => chemin.endsWith(relatif))!;
      const selectionne = (nom: string): boolean => new RegExp(`\\b${nom}\\b`).test(source);

      // Le message porte le NOM du site fautif, pas la source entière : un
      // témoin d'inventaire qui déverse 40 Ko de fichier est illisible au
      // moment précis où on en a besoin.
      // La règle est NÉGATIVE, et c'est voulu : « ne charge pas la forme sans
      // protection ». Exiger l'inverse — « charge la forme du canal » — ferait
      // rougir les RELAIS, qui reçoivent leur ligne en paramètre et ne
      // chargent rien (`emitAttachmentUpdated.ts` en est un : c'est
      // `MeeshySocketIOManager` qui charge pour lui). La responsabilité d'un
      // relais est chez son appelant, lequel est dans ce même inventaire.
      // Le diagnostic voyage dans la VALEUR comparée, jamais en second
      // argument d'`expect` : cette forme-là est une API de `bun:test` et de
      // Vitest, que le gateway — qui tourne sous JEST — refuse au typage
      // (`TS2554: Expected 1 arguments, but got 2`). Le témoin passait en local
      // sous `bun test` et faisait échouer la suite ENTIÈRE en CI.
      const diagnostic = selectionne(FORME_SANS_PROTECTION)
        ? `${relatif} charge ${FORME_SANS_PROTECTION} (sans drapeau de protection) et passe la ligne ` +
          `au sérialiseur socket, qui est FAIL-CLOSED : toute pièce servie par ce site ressort ` +
          `MASQUÉE. Charger ${FORME_DU_CANAL}.`
        : 'conforme';

      expect(diagnostic).toBe('conforme');
    },
  );
});
