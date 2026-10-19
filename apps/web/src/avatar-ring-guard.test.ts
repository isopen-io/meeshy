import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * **TOUT AVATAR D'UNE PERSONNE PORTE SON CONTOUR SERVI, OU DIT POURQUOI**
 * (#10946, directive porteur 2026-10-18 : le contour équipé s'affiche PARTOUT
 * où l'avatar d'une personne s'affiche).
 *
 * Garde d'INVENTAIRE, jumelle de `avatar-presence-guard.test.ts` : chaque
 * `<Avatar`, `<PeerAvatar` et `<RingedAvatar` reçoit le contour — `ringRef` (la
 * référence SERVIE, que `PeerAvatar` résout par le catalogue) ou `ring` (le
 * dessin déjà résolu). `AuthorAvatar` et `MemberAvatar` le résolvent
 * eux-mêmes et n'ont rien à déclarer. Sinon le fichier figure ci-dessous, avec
 * le compte exact et la RAISON. Une exemption dont le site a disparu rougit.
 */

const SRC = dirname(fileURLToPath(import.meta.url));

type Exemption = { readonly fichier: string; readonly combien: number; readonly pourquoi: string };

const AVANT_SESSION = 'parcours sans session (connexion, inscription, invitation) — la charge ne porte que nom et photo, aucun décor';
const ENTITE = 'une conversation, une communauté, un lien — pas une personne : aucun contour d’avatar ne s’y pose';
const ANNEAU_HOTE = 'le contour est posé AUTOUR par l’hôte (`<AvatarRing ring={…}>`, l’en-tête du profil / de l’humeur)';
const NON_SERVI = 'la passerelle ne sert pas encore `profileDecor` sur cette charge — suivi #10957';
const ADMIN = 'administration et modération : l’objet est la fiche, la charge d’administration ne porte aucun décor';

const EXEMPTIONS: readonly Exemption[] = [
  { fichier: 'components/account-replacement-prompt.tsx', combien: 1, pourquoi: AVANT_SESSION },
  { fichier: 'components/email-taken-actions.tsx', combien: 1, pourquoi: AVANT_SESSION },
  { fichier: 'components/link-sign-in-confirmation.tsx', combien: 1, pourquoi: AVANT_SESSION },
  { fichier: 'components/signup-inviter-hero.tsx', combien: 1, pourquoi: AVANT_SESSION },
  { fichier: 'components/visitor-invitation.tsx', combien: 1, pourquoi: AVANT_SESSION },
  { fichier: 'routes/chat-join-parts.tsx', combien: 1, pourquoi: AVANT_SESSION },
  { fichier: 'components/conversation-settings-section.tsx', combien: 1, pourquoi: ENTITE },
  { fichier: 'routes/communities-parts.tsx', combien: 2, pourquoi: ENTITE },
  { fichier: 'routes/share-link-form.tsx', combien: 2, pourquoi: ENTITE },
  { fichier: 'routes/user-profile-conversations.tsx', combien: 1, pourquoi: ENTITE },
  { fichier: 'routes/profile-sections.tsx', combien: 1, pourquoi: ANNEAU_HOTE },
  { fichier: 'routes/user-profile-header.tsx', combien: 1, pourquoi: ANNEAU_HOTE },
  { fichier: 'components/mood-page.tsx', combien: 1, pourquoi: ANNEAU_HOTE },
  { fichier: 'components/device-account-list.tsx', combien: 1, pourquoi: 'les comptes mémorisés sur l’appareil : la carte locale ne garde que nom et photo, et le compte actif a déjà son disque' },
  { fichier: 'routes/onboarding-visuals.tsx', combien: 1, pourquoi: 'illustration décorative de l’arrivée (`aria-hidden`) — le visage du nouveau compte, sans décor équipé à ce stade' },
  { fichier: 'components/call-bubble.tsx', combien: 1, pourquoi: `appels — ${NON_SERVI}` },
  { fichier: 'components/call-grid.tsx', combien: 2, pourquoi: `appels — ${NON_SERVI}` },
  { fichier: 'components/call-overlay.tsx', combien: 1, pourquoi: `appels — ${NON_SERVI}` },
  { fichier: 'components/call-pip-window.tsx', combien: 1, pourquoi: `appels — ${NON_SERVI}` },
  { fichier: 'routes/call-detail-parts.tsx', combien: 1, pourquoi: `appels — ${NON_SERVI}` },
  { fichier: 'routes/calls-parts.tsx', combien: 1, pourquoi: `appels — ${NON_SERVI}` },
  { fichier: 'components/notification-row.tsx', combien: 1, pourquoi: `l’acteur d’une notification — ${NON_SERVI}` },
  { fichier: 'components/notification-toast.tsx', combien: 1, pourquoi: `l’acteur d’une notification — ${NON_SERVI}` },
  { fichier: 'components/publication-viewers-sheet.tsx', combien: 1, pourquoi: `la liste des vues d’une publication — ${NON_SERVI}` },
  { fichier: 'components/message-reactors.tsx', combien: 1, pourquoi: `les réacteurs d’un message (\`Reactor\`) — ${NON_SERVI}` },
  { fichier: 'components/message-receipts-sheet.tsx', combien: 3, pourquoi: `les accusés d’un message, rangés par participant — ${NON_SERVI}` },
  { fichier: 'components/contact-card-account.tsx', combien: 1, pourquoi: `le compte d’une fiche contact (\`POST /contacts/resolve\`) — ${NON_SERVI}` },
  { fichier: 'routes/onboarding-cards.tsx', combien: 1, pourquoi: `les suggestions de l’arrivée — ${NON_SERVI}` },
  { fichier: 'routes/share-link-arrivals-parts.tsx', combien: 1, pourquoi: `les arrivées d’un lien (\`LinkArrival\`) — ${NON_SERVI}` },
  { fichier: 'routes/share-link-detail-parts.tsx', combien: 1, pourquoi: `les arrivées d’un lien (\`LinkArrival\`) — ${NON_SERVI}` },
  { fichier: 'components/admin/entity-chip.tsx', combien: 1, pourquoi: ADMIN },
  { fichier: 'components/admin/fiche.tsx', combien: 1, pourquoi: ADMIN },
  { fichier: 'components/world-participant-card-sheet.tsx', combien: 1, pourquoi: ADMIN },
  { fichier: 'routes/admin-conversations.tsx', combien: 1, pourquoi: ADMIN },
  { fichier: 'routes/admin-member-images.tsx', combien: 1, pourquoi: ADMIN },
];

const BALISES = ['<Avatar', '<PeerAvatar', '<RingedAvatar'];
/** Les relais qui RÉPANDENT `{...props}` dans `Avatar` : leur hôte choisit. */
const RELAIS = ['components/author-avatar.tsx', 'components/peer-avatar.tsx'];

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

/** `ring` / `ringRef` sous leurs trois écritures : l'attribut, la clé d'un objet répandu, son raccourci. */
const RING_PROP = /(^|[\s{,])(?:ring|ringRef)\s*(?:[=:]|[},])/;

const spreadCarriesRing = (source: string, element: string): boolean =>
  [...element.matchAll(/\{\.\.\.([A-Za-z_$][\w$]*)\}/g)].some(([, name]) => {
    const declaration = new RegExp(`(?:const|let)\\s+${name}\\b[^=]*=`).exec(source);
    if (declaration === null) return false;
    const rest = source.slice(declaration.index + declaration[0].length);
    const end = rest.search(/\n\s*(?:const|let|return|if)\b/);
    return RING_PROP.test(end === -1 ? rest : rest.slice(0, end));
  });

function sansContour(): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const chemin of fichiers()) {
    const source = readFileSync(chemin, 'utf8');
    const cle = relative(SRC, chemin);
    const relais = RELAIS.includes(cle);
    for (const balise of BALISES) {
      for (let i = source.indexOf(balise); i !== -1; i = source.indexOf(balise, i + 1)) {
        const apres = source[i + balise.length];
        if (apres !== undefined && /[A-Za-z0-9_]/.test(apres)) continue;
        const element = elementAt(source, i);
        if (RING_PROP.test(element) || spreadCarriesRing(source, element)) continue;
        if (relais && /\{\.\.\.props\}/.test(element)) continue;
        counts.set(cle, (counts.get(cle) ?? 0) + 1);
      }
    }
  }
  return counts;
}

describe('garde de source — chaque avatar de personne porte son contour servi (#10946)', () => {
  const trouvees = sansContour();

  test('le balayage voit les avatars du dépôt', () => {
    expect(fichiers().length).toBeGreaterThan(100);
    expect(trouvees.size).toBeGreaterThan(0);
  });

  test('aucun avatar sans contour hors du registre', () => {
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
