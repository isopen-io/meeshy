/**
 * LE BALAYAGE DE LA TRONCATURE DES APERÇUS (#8754).
 *
 * `String.prototype.slice` compte en unités UTF-16. Appliqué à un aperçu de
 * contenu utilisateur, il peut couper au milieu d'une paire de substitution et
 * livrer une demi-paire haute orpheline — rendue `�` dès le premier
 * aller-retour UTF-8, donc dès l'écriture en base ou la sérialisation de la
 * charge APNs. Sept expressions du gateway le faisaient ; elles passent
 * désormais par `sliceCodePoints` (`@meeshy/shared/utils/text-truncate`).
 *
 * CE QUE CE BALAYAGE GARDE, exactement : plus aucun `.slice(` ne s'applique
 * DIRECTEMENT à une expression de texte utilisateur — un identifiant terminant
 * par `content`, `subtitle`, `preview` ou `previewText`, éventuellement suivi
 * d'un `.trim()`. C'est une garde de FORME, sur le seul motif qui a produit le
 * défaut. Elle ne prétend pas prouver qu'aucune autre coupe du dépôt n'est
 * dangereuse.
 *
 * LIMITE ASSUMÉE : le balayage lit du TEXTE, pas un graphe de types. Une coupe
 * qui passe par une variable intermédiaire (`const t = post.content; t.slice(…)`)
 * lui échappe. C'est le prix d'un cliquet qui tourne en millisecondes ; c'est le
 * choix déjà fait par `absolute-media-url-sweep`. Le `MOTIF_INTERDIT` est
 * lui-même vérifié contre une fixture par son test, pour qu'un scanner qui
 * cesserait de reconnaître la forme qu'il interdit soit détecté plutôt que de
 * passer au vert en silence.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

/** La racine balayée : le code de production du gateway, tests exclus. */
export const RACINE = join(__dirname, '..', '..');

/** Les champs qui portent du texte écrit par un humain, et qu'on ne coupe donc pas à l'aveugle. */
export const CHAMPS_DE_TEXTE = ['content', 'subtitle', 'preview', 'previewText'] as const;

/**
 * `<…>content.slice(` · `<…>content?.slice(` · `<…>subtitle.trim().slice(`
 * Le nom doit TERMINER par l'un des champs (`postContent` compte, `contentType`
 * non) — d'où la limite de mot à gauche et la casse sur la dernière lettre.
 */
export const MOTIF_INTERDIT = new RegExp(
  String.raw`[A-Za-z0-9_$]*(?:` +
    CHAMPS_DE_TEXTE.map((c) => c.charAt(0).toUpperCase() + c.slice(1)).concat([...CHAMPS_DE_TEXTE]).join('|') +
    String.raw`)\s*(?:\?\.|\.)(?:trim\(\)\s*\.)?slice\s*\(`,
);

/**
 * LES NEUF PORTEURS — tous les fichiers de production qui coupent un aperçu.
 * La liste est venue du balayage, pas d'une lecture : l'issue #8754 en nommait
 * sept, tous dans les fichiers qu'une branche de juillet avait touchés. Le
 * balayage de l'arbre entier en a trouvé onze de plus. *Un grep ciblé n'est pas
 * un balayage.*
 */
export const PORTEURS = [
  'services/messaging/postReplySnapshot.ts',
  'services/messaging/MessageValidator.ts',
  'services/posts/postReplySnapshot.ts',
  'services/posts/postMentions.ts',
  'services/notifications/NotificationService.ts',
  'socketio/handlers/CommentReactionHandler.ts',
  'socketio/handlers/PostReactionHandler.ts',
  'routes/posts/comments.ts',
  'routes/posts/interactions.ts',
] as const;

export const IMPORT_ATTENDU = "from '@meeshy/shared/utils/text-truncate'";

function fichiersTypeScript(racine: string): string[] {
  const sortie: string[] = [];
  const descendre = (dossier: string): void => {
    for (const entree of readdirSync(dossier)) {
      if (entree === '__tests__' || entree === 'node_modules' || entree === 'dist') continue;
      const chemin = join(dossier, entree);
      if (statSync(chemin).isDirectory()) descendre(chemin);
      else if (entree.endsWith('.ts') && !entree.endsWith('.d.ts')) sortie.push(chemin);
    }
  };
  descendre(racine);
  return sortie;
}

export type Coupe = { readonly fichier: string; readonly ligne: number; readonly texte: string };

/** Les coupes interdites encore présentes. Vide = la règle tient. */
export function coupesInterdites(racine: string = RACINE): readonly Coupe[] {
  const trouvees: Coupe[] = [];
  for (const chemin of fichiersTypeScript(racine)) {
    const lignes = readFileSync(chemin, 'utf8').split('\n');
    lignes.forEach((texte, index) => {
      if (MOTIF_INTERDIT.test(texte)) {
        trouvees.push({ fichier: relative(racine, chemin), ligne: index + 1, texte: texte.trim() });
      }
    });
  }
  return trouvees;
}
