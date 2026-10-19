import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * **TOUT AVATAR MONTÉ DIT SA PRÉSENCE, OU DIT POURQUOI IL N'EN A PAS** (#10944,
 * directive porteur 2026-10-18 : la présence s'affiche PARTOUT où l'avatar
 * d'une personne s'affiche, et seulement si le lecteur a le droit de la voir).
 *
 * Une garde d'INVENTAIRE, motif `scripts/check-avatar-src.mjs` : elle vaut pour
 * la surface qui n'existe pas encore. Chaque `<Avatar` (et `<AuthorAvatar`, son
 * relais) reçoit une `presence` — celle que la passerelle a SERVIE : la charge
 * REST, ou la carte vivante (`presence-store.ts`) ; `PeerAvatar` la résout
 * par identifiant et n'a donc rien à déclarer. Sinon le fichier figure ci-dessous,
 * avec le compte exact et la RAISON : soi, un groupe ou une communauté, un
 * contexte sans point par décision, une charge sans clé de présence.
 *
 * Une exemption dont le site a disparu rougit aussi : un registre qui survit
 * aux surfaces qu'il décrit ment en silence.
 */

const SRC = dirname(fileURLToPath(import.meta.url));

type Exemption = { readonly fichier: string; readonly combien: number; readonly pourquoi: string };

const SOI = 'soi — sa propre présence ne se peint pas sur son propre visage';
const AVANT_SESSION = 'parcours sans session (connexion, inscription, invitation) — aucune présence n’est servie à un lecteur non authentifié';

const EXEMPTIONS: readonly Exemption[] = [
  { fichier: 'components/account-replacement-prompt.tsx', combien: 1, pourquoi: AVANT_SESSION },
  { fichier: 'components/email-taken-actions.tsx', combien: 1, pourquoi: AVANT_SESSION },
  { fichier: 'components/link-sign-in-confirmation.tsx', combien: 1, pourquoi: AVANT_SESSION },
  { fichier: 'components/signup-inviter-hero.tsx', combien: 1, pourquoi: AVANT_SESSION },
  { fichier: 'components/visitor-invitation.tsx', combien: 1, pourquoi: AVANT_SESSION },
  { fichier: 'routes/chat-join-parts.tsx', combien: 1, pourquoi: AVANT_SESSION },
  { fichier: 'components/device-account-list.tsx', combien: 1, pourquoi: SOI },
  { fichier: 'components/floating-menus.tsx', combien: 1, pourquoi: SOI },
  { fichier: 'components/story-rail-self-tile.tsx', combien: 1, pourquoi: SOI },
  { fichier: 'routes/onboarding-visuals.tsx', combien: 1, pourquoi: SOI },
  { fichier: 'routes/profile-sections.tsx', combien: 1, pourquoi: SOI },
  { fichier: 'routes/settings-sections.tsx', combien: 1, pourquoi: SOI },
  { fichier: 'components/conversation-settings-section.tsx', combien: 1, pourquoi: 'la photo de la CONVERSATION, qu’on modifie — pas une personne' },
  { fichier: 'routes/communities-parts.tsx', combien: 2, pourquoi: 'une communauté et ses conversations — pas des personnes' },
  { fichier: 'routes/share-link-form.tsx', combien: 2, pourquoi: 'les conversations à partager par lien — jamais un direct (`canCreateShareLink`)' },
  {
    fichier: 'routes/discover-parts.tsx',
    combien: 1,
    pourquoi: 'Découvrir ne peint aucun point, par décision (D-60, `decodePerson`) — `scripts/check-discover.mjs` en compte zéro dans tous les états',
  },
  {
    fichier: 'routes/onboarding-cards.tsx',
    combien: 1,
    pourquoi: 'des suggestions de personnes qu’on ne connaît pas encore : la présence n’est servie qu’aux amis acceptés, aucune ne peut l’être',
  },
  { fichier: 'routes/admin-conversations.tsx', combien: 1, pourquoi: 'la pile décorative (`aria-hidden`) de l’inventaire d’administration — la fiche porte la présence' },
  { fichier: 'routes/admin-member-images.tsx', combien: 1, pourquoi: 'la galerie de modération : l’objet est l’image, pas la personne' },
  {
    fichier: 'components/world-participant-card-sheet.tsx',
    combien: 1,
    pourquoi: 'worldParticipantCardSchema, liste blanche de la fiche de modération, ne porte ni présence ni identifiant de compte (#10102)',
  },
  {
    fichier: 'components/message-reactors.tsx',
    combien: 1,
    pourquoi: '`Reactor` (lib/api/reactors.ts) : la passerelle sert `participantId`, pas le compte — aucune clé de présence (ReactionService.users)',
  },
  {
    fichier: 'components/message-receipts-sheet.tsx',
    combien: 3,
    pourquoi: 'les accusés sont rangés par `participantId`, pas par compte — aucune clé de présence',
  },
  {
    fichier: 'routes/share-link-arrivals-parts.tsx',
    combien: 1,
    pourquoi: '`LinkArrival` ne porte aucun identifiant (lib/api/link-arrivals.ts)',
  },
  {
    fichier: 'routes/share-link-detail-parts.tsx',
    combien: 1,
    pourquoi: 'les arrivées d’un lien sont rangées par `participantId`, pas par compte — aucune clé de présence',
  },
];

/** Un composant qui RÉPAND ses props dans `Avatar` ne choisit rien : son hôte choisit. */
const RELAIS = [
  { fichier: 'components/author-avatar.tsx', balise: '<AuthorAvatar' },
  /* L'AVATAR QUI RÉSOUT SON CONTOUR (#10946) : son hôte dit la présence. */
  { fichier: 'components/peer-avatar.tsx', balise: '<RingedAvatar' },
] as const;
const BALISES = ['<Avatar', ...RELAIS.map((relais) => relais.balise)];

const fichiers = (): readonly string[] => {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const chemin = join(dir, entry);
      if (statSync(chemin).isDirectory()) walk(chemin);
      else if (entry.endsWith('.tsx') && !entry.includes('.test.')) found.push(chemin);
    }
  };
  walk(SRC);
  return found;
};

/** L'élément JSX de `<Avatar` à sa fermeture, compté en profondeur d'accolades. */
const elementAt = (source: string, start: number): string => {
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    const c = source[i];
    if (c === '{') depth += 1;
    else if (c === '}') depth -= 1;
    else if (c === '>' && depth === 0) return source.slice(start, i + 1);
  }
  return source.slice(start);
};

/** `presence` sous ses trois écritures : l'attribut, la clé d'un objet répandu, son raccourci. */
const PRESENCE_PROP = /(^|[\s{,])presence\s*(?:[=:]|[},])/;

/**
 * UN OBJET RÉPANDU QUI PORTE LA PRÉSENCE — `{...peerSignals}` (`lens-row.tsx`,
 * `thread-header.tsx`) : sa déclaration, jusqu'à l'instruction suivante, dit
 * `presence:`.
 */
const spreadCarriesPresence = (source: string, element: string): boolean =>
  [...element.matchAll(/\{\.\.\.([A-Za-z_$][\w$]*)\}/g)].some(([, name]) => {
    const declaration = new RegExp(`(?:const|let)\\s+${name}\\b[^=]*=`).exec(source);
    if (declaration === null) return false;
    const rest = source.slice(declaration.index + declaration[0].length);
    const end = rest.search(/\n\s*(?:const|let|return|if)\b/);
    return PRESENCE_PROP.test(end === -1 ? rest : rest.slice(0, end));
  });

function muettes(): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const chemin of fichiers()) {
    const source = readFileSync(chemin, 'utf8');
    const cle = relative(SRC, chemin);
    const relais = RELAIS.some((r) => r.fichier === cle);
    for (const balise of BALISES) {
      for (let i = source.indexOf(balise); i !== -1; i = source.indexOf(balise, i + 1)) {
        const apres = source[i + balise.length];
        if (apres !== undefined && /[A-Za-z0-9_]/.test(apres)) continue;
        const element = elementAt(source, i);
        if (PRESENCE_PROP.test(element) || spreadCarriesPresence(source, element)) continue;
        if (relais && /\{\.\.\.props\}/.test(element)) continue;
        counts.set(cle, (counts.get(cle) ?? 0) + 1);
      }
    }
  }
  return counts;
}

describe('garde de source — chaque avatar dit sa présence (#10944)', () => {
  const trouvees = muettes();

  test('le balayage voit les avatars du dépôt', () => {
    expect(fichiers().length).toBeGreaterThan(100);
    expect(trouvees.size).toBeGreaterThan(0);
  });

  test('aucun avatar sans présence hors du registre', () => {
    const inconnues = [...trouvees].filter(([fichier]) => !EXEMPTIONS.some((e) => e.fichier === fichier));
    expect(inconnues).toEqual([]);
  });

  test('chaque exemption compte exactement ses avatars, et aucune ne survit à son site', () => {
    const desaccords = EXEMPTIONS.filter((e) => trouvees.get(e.fichier) !== e.combien).map((e) => `${e.fichier} : registre ${e.combien}, trouvé ${trouvees.get(e.fichier) ?? 0}`);
    expect(desaccords).toEqual([]);
  });

  test('chaque exemption dit pourquoi', () => {
    expect(EXEMPTIONS.filter((e) => e.pourquoi.trim().length < 20).map((e) => e.fichier)).toEqual([]);
  });
});
