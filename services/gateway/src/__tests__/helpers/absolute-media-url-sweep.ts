/**
 * LE BALAYAGE DES COMPOSEURS D'ADRESSE ABSOLUE DE MÉDIA (#7022).
 *
 * #4324 a tranché que ce qui se persiste est la CLÉ DE STOCKAGE. La base porte
 * pourtant 2784 adresses absolues (1600 `fileUrl` + 1184 `thumbnailUrl`,
 * mesurées le 2026-09-18 sur `meeshy-database`), toutes en
 * `https://gate.meeshy.me/…`. Elles ont cessé d'entrer le 2026-09-08 — non par
 * une garde, mais parce que le dernier appelant a disparu. **Rien n'empêche le
 * prochain.**
 *
 * CE QUE CE BALAYAGE GARDE, exactement : les deux fonctions qui PRÉFIXENT
 * `publicUrl` — le seul endroit du gateway où un hôte de déploiement entre dans
 * une chaîne destinée à une colonne de média — n'ont AUCUN appelant de
 * production. C'est une garde d'INVENTAIRE, pas de valeur : elle ne lit pas ce
 * qui est écrit en base, elle constate que le seul moyen de composer la forme
 * interdite n'est branché nulle part. Une garde de valeur serait plus forte ;
 * elle demanderait un point de passage unique à l'écriture, que les deux
 * producteurs (`tus-handler`, `UploadProcessor`) ne partagent pas aujourd'hui —
 * c'est nommé comme dette dans l'issue, pas soldé ici en silence.
 *
 * LIMITE ASSUMÉE : le balayage lit du TEXTE, pas un graphe d'appel. Un appel
 * atteint par réflexion (`svc['getAttachmentUrl']()`) lui échappe. C'est le prix
 * d'un cliquet qui tourne en millisecondes sur tout le dépôt ; la forme
 * habituelle du dépôt (`recipient-language-projection-sweep`) fait le même
 * choix.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * LES DEUX COMPOSEURS D'ABSOLU. `getAttachmentUrl` pose `publicUrl` devant la
 * route de flux ; `buildFullUrl` pose `publicUrl` devant n'importe quel chemin
 * relatif. Ce sont les deux seules portes par lesquelles un hôte peut entrer
 * dans une adresse de média côté gateway.
 */
export const COMPOSEURS_D_ABSOLU = ['getAttachmentUrl', 'buildFullUrl'] as const;

/**
 * OÙ ILS SONT DÉFINIS — un fichier ne s'accuse pas de se déclarer lui-même.
 * `AttachmentService` n'est pas une définition mais une DÉLÉGATION morte : elle
 * expose les deux noms sans que personne ne les appelle. La laisser est un
 * choix de portée (ce lot ne touche pas `AttachmentService.ts`, où six autres
 * lots travaillent) ; la RETIRER serait mieux, et c'est une suite nommée dans
 * l'issue. L'exemption dit donc ce qu'elle couvre, pour qu'on la retrouve.
 */
export const EXEMPTIONS: readonly { readonly fichier: string; readonly raison: string }[] = [
  {
    fichier: 'services/attachments/UploadProcessor.ts',
    raison: 'définit les deux composeurs',
  },
  {
    fichier: 'services/attachments/AttachmentService.ts',
    raison:
      "délégation MORTE — expose les deux noms, aucun appelant de production (mesuré #7022). Son retrait est une suite ; ce lot ne touche pas ce fichier.",
  },
];

export type AppelDAbsolu = {
  readonly fichier: string;
  readonly ligne: number;
  readonly composeur: string;
  readonly texte: string;
};

function fichiersTs(racine: string): readonly string[] {
  const trouvés: string[] = [];
  const descendre = (dossier: string): void => {
    for (const entrée of readdirSync(dossier)) {
      const chemin = join(dossier, entrée);
      if (statSync(chemin).isDirectory()) {
        if (entrée === '__tests__' || entrée === 'node_modules' || entrée === 'generated') continue;
        descendre(chemin);
        continue;
      }
      if (entrée.endsWith('.ts') && !entrée.endsWith('.d.ts')) trouvés.push(chemin);
    }
  };
  descendre(racine);
  return trouvés;
}

/**
 * Rend les appels de production aux composeurs d'absolu. Un commentaire n'est
 * pas un appel : seule une occurrence SUIVIE d'une parenthèse compte, ce qui
 * laisse passer les mentions en prose (« `getAttachmentUrl` pose l'hôte… ») et
 * attrape les appels, y compris `this.x.getAttachmentUrl(…)`.
 */
export function balayerAppelsDAbsolu(racineSrc: string): readonly AppelDAbsolu[] {
  const exemptés = new Set(EXEMPTIONS.map((e) => e.fichier));
  const appels: AppelDAbsolu[] = [];

  for (const chemin of fichiersTs(racineSrc)) {
    const fichier = relative(racineSrc, chemin).split('\\').join('/');
    if (exemptés.has(fichier)) continue;

    const lignes = readFileSync(chemin, 'utf8').split('\n');
    lignes.forEach((texte, index) => {
      const nu = texte.trim();
      if (nu.startsWith('*') || nu.startsWith('//')) return;
      for (const composeur of COMPOSEURS_D_ABSOLU) {
        if (new RegExp(`\\b${composeur}\\s*\\(`).test(texte)) {
          appels.push({ fichier, ligne: index + 1, composeur, texte: nu });
        }
      }
    });
  }

  return appels;
}
