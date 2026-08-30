/**
 * La fiche d'un visiteur sans compte.
 *
 * Il a rempli un formulaire pour entrer, et rien de ce qu'il y a écrit n'était
 * lisible ensuite : les autres membres ne voyaient qu'un pseudo. Un participant
 * sans fiche est un participant qu'on ne peut ni reconnaître, ni accueillir, ni
 * modérer — et sur le web, où presque tout le monde arrive par invitation,
 * c'est le cas le plus courant, pas le cas limite.
 *
 * La carte rend DEUX CERCLES que le gateway a déjà séparés :
 *   - l'identité, visible de tout membre ;
 *   - les coordonnées, servies `null` à un membre ordinaire et accompagnées de
 *     `hasEmail` / `hasBirthday`. La carte doit alors dire « fourni, non
 *     visible » plutôt que « rien » : la nuance est ce qui distingue un
 *     visiteur qui a tout rempli d'un visiteur qui n'a rien donné.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { ParticipantProfileCard } from '../ParticipantProfileCard';
import type { ParticipantProfile } from '@/hooks/queries/use-participant-profile';

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown> | string) =>
      typeof params === 'string' ? params : key,
  }),
}));

const profile = (overrides: Partial<ParticipantProfile> = {}): ParticipantProfile => ({
  participantId: 'p1',
  conversationId: 'c1',
  isAnonymous: true,
  userId: null,
  username: 'ano_bob_sm123',
  displayName: 'ano_bob_sm123',
  firstName: 'Bob',
  lastName: 'Smith',
  avatar: null,
  language: 'fr',
  country: 'FR',
  conversationRole: 'member',
  joinedAt: '2026-08-18T09:00:00Z',
  isOnline: true,
  lastActiveAt: '2026-08-18T10:00:00Z',
  shareLinkName: 'Invitation publique',
  hasEmail: true,
  hasBirthday: true,
  email: null,
  birthday: null,
  entryCapabilities: {
    canSendMessages: true,
    canSendFiles: false,
    canSendImages: true,
    canSendVideos: false,
    canSendAudios: false,
    canSendLocations: false,
    canSendLinks: false,
    canViewHistory: false,
  },
  entryLink: null,
  historyVisibleFrom: null,
  canGrantHistory: false,
  ...overrides,
});

describe('ParticipantProfileCard — identité', () => {
  it('rend le nom fourni à l’entrée', () => {
    render(<ParticipantProfileCard profile={profile()} />);

    expect(screen.getByTestId('participant-profile-name').textContent).toContain('Bob Smith');
  });

  it('rend le pseudo', () => {
    render(<ParticipantProfileCard profile={profile()} />);

    expect(screen.getByTestId('participant-profile-username').textContent).toContain('ano_bob_sm123');
  });

  it('marque d’un fantôme celui qui n’a pas de compte', () => {
    const { container } = render(<ParticipantProfileCard profile={profile()} />);

    expect(container.querySelector('[data-testid="ghost-icon"]')).not.toBeNull();
  });

  it('le dit aussi en toutes lettres', () => {
    render(<ParticipantProfileCard profile={profile()} />);

    expect(screen.getByTestId('participant-profile-no-account')).toBeTruthy();
  });

  it('CONTRE-ÉPREUVE — un inscrit n’a ni fantôme ni mention', () => {
    const { container } = render(
      <ParticipantProfileCard profile={profile({ isAnonymous: false, userId: 'u1', username: 'alice' })} />
    );

    expect(container.querySelector('[data-testid="ghost-icon"]')).toBeNull();
    expect(screen.queryByTestId('participant-profile-no-account')).toBeNull();
  });

  it('nomme le lien emprunté et date l’arrivée', () => {
    render(<ParticipantProfileCard profile={profile()} />);

    expect(screen.getByTestId('participant-profile-link').textContent).toContain('Invitation publique');
    expect(screen.getByTestId('participant-profile-joined')).toBeTruthy();
  });

  it('rend la langue déclarée — elle décide de ce que la personne lit', () => {
    render(<ParticipantProfileCard profile={profile()} />);

    expect(screen.getByTestId('participant-profile-language')).toBeTruthy();
  });
});

describe('ParticipantProfileCard — coordonnées', () => {
  it('affiche l’email quand le lecteur a le droit de le voir', () => {
    render(<ParticipantProfileCard profile={profile({ email: 'bob@example.com' })} />);

    expect(screen.getByTestId('participant-profile-email').textContent).toContain('bob@example.com');
  });

  it('dit « fourni, non visible » plutôt que rien à un membre ordinaire', () => {
    render(<ParticipantProfileCard profile={profile({ email: null, hasEmail: true })} />);

    const row = screen.getByTestId('participant-profile-email');
    expect(row.textContent).not.toContain('bob@example.com');
    expect(row.getAttribute('data-withheld')).toBe('true');
  });

  it('n’affiche AUCUNE ligne quand rien n’a été fourni — ne rien promettre', () => {
    render(<ParticipantProfileCard profile={profile({ email: null, hasEmail: false })} />);

    expect(screen.queryByTestId('participant-profile-email')).toBeNull();
  });

  it('applique la même règle à la date de naissance', () => {
    render(<ParticipantProfileCard profile={profile({ hasBirthday: false })} />);

    expect(screen.queryByTestId('participant-profile-birthday')).toBeNull();
  });
});

/**
 * Les CAPACITÉS expliquent un comportement visible de tous : un visiteur qui
 * n'envoie jamais de fichier n'est pas discret, il n'en a pas le droit. Cette
 * explication appartient donc à la salle, pas seulement à l'hôte.
 *
 * La carte n'énonce que ce qui est REFUSÉ. Lister les sept permissions, dont six
 * accordées, noierait l'unique information utile — et une fiche qui récite des
 * autorisations se lit comme un formulaire, pas comme une présentation.
 */
describe('ParticipantProfileCard — capacités', () => {
  it('nomme ce qui est refusé au visiteur', () => {
    render(<ParticipantProfileCard profile={profile()} />);

    expect(screen.getByTestId('participant-profile-denied-canSendFiles')).toBeTruthy();
  });

  it('n’énumère pas ce qui est accordé', () => {
    render(<ParticipantProfileCard profile={profile()} />);

    expect(screen.queryByTestId('participant-profile-denied-canSendMessages')).toBeNull();
    expect(screen.queryByTestId('participant-profile-denied-canSendImages')).toBeNull();
  });

  it('dit l’historique fermé', () => {
    render(<ParticipantProfileCard profile={profile()} />);

    expect(screen.getByTestId('participant-profile-denied-canViewHistory')).toBeTruthy();
  });

  it('affiche une mention d’absence de restriction quand tout est permis', () => {
    render(<ParticipantProfileCard profile={profile({
      entryCapabilities: {
        canSendMessages: true,
        canSendFiles: true,
        canSendImages: true,
        canSendVideos: true,
        canSendAudios: true,
        canSendLocations: true,
        canSendLinks: true,
        canViewHistory: true,
      },
    })} />);

    expect(screen.getByTestId('participant-profile-capabilities')).toBeTruthy();
    expect(screen.getByTestId('participant-profile-no-restriction')).toBeTruthy();
  });

  it('n’affiche aucune section pour un participant qui a un compte', () => {
    render(<ParticipantProfileCard profile={profile({ isAnonymous: false, entryCapabilities: null })} />);

    expect(screen.queryByTestId('participant-profile-capabilities')).toBeNull();
  });
});

/**
 * Les RÉGLAGES DU LIEN arrivent `null` hors du cercle des hôtes. La carte ne
 * doit alors rien laisser paraître — pas même une section vide, qui signalerait
 * l'existence de ce qu'elle cache.
 */
describe('ParticipantProfileCard — réglages du lien', () => {
  const entryLink = {
    name: 'Invitation publique',
    isActive: true,
    expiresAt: '2026-12-31T00:00:00Z',
    maxUses: 50,
    currentUses: 12,
    requireNickname: true,
    requireEmail: true,
    requireBirthday: false,
    allowedCountries: ['FR', 'BE'],
    allowedLanguages: ['fr'],
  };

  it('reste muette pour un membre ordinaire', () => {
    render(<ParticipantProfileCard profile={profile({ entryLink: null })} />);

    expect(screen.queryByTestId('participant-profile-entry-link')).toBeNull();
  });

  it('rend les quotas à un hôte', () => {
    render(<ParticipantProfileCard profile={profile({ entryLink })} />);

    expect(screen.getByTestId('participant-profile-entry-link').textContent).toContain('12');
    expect(screen.getByTestId('participant-profile-entry-link').textContent).toContain('50');
  });

  it('rend les pays admis à un hôte', () => {
    render(<ParticipantProfileCard profile={profile({ entryLink })} />);

    expect(screen.getByTestId('participant-profile-entry-link').textContent).toContain('FR');
  });

  it('signale un lien devenu inactif', () => {
    render(<ParticipantProfileCard profile={profile({ entryLink: { ...entryLink, isActive: false } })} />);

    expect(screen.getByTestId('participant-profile-entry-link-inactive')).toBeTruthy();
  });

  it('ne signale rien quand le lien est toujours actif', () => {
    render(<ParticipantProfileCard profile={profile({ entryLink })} />);

    expect(screen.queryByTestId('participant-profile-entry-link-inactive')).toBeNull();
  });
});

/**
 * L'ÉDITION — réservée aux hôtes, et la carte ne décide pas de ce droit.
 *
 * Elle rend des interrupteurs quand on lui passe de quoi écrire, du texte
 * sinon. L'arbitrage appartient au gateway (`entryLink` servi ou non) et au
 * conteneur qui branche le callback ; une carte qui déciderait elle-même
 * rejouerait côté client une règle d'autorisation.
 */
describe('ParticipantProfileCard — édition par l’hôte', () => {
  const entryLink = {
    name: 'Invitation publique',
    isActive: true,
    expiresAt: null,
    maxUses: null,
    currentUses: 3,
    requireNickname: true,
    requireEmail: false,
    requireBirthday: false,
    allowedCountries: [],
    allowedLanguages: [],
  };

  it('reste en lecture seule sans callback d’écriture', () => {
    render(<ParticipantProfileCard profile={profile({ entryLink })} />);

    expect(screen.queryByTestId('participant-profile-toggle-canSendFiles')).toBeNull();
  });

  it('rend un interrupteur par droit quand l’écriture est possible', () => {
    render(<ParticipantProfileCard profile={profile({ entryLink })} onToggleCapability={jest.fn()} />);

    expect(screen.getByTestId('participant-profile-toggle-canSendFiles')).toBeTruthy();
    expect(screen.getByTestId('participant-profile-toggle-canViewHistory')).toBeTruthy();
  });

  // En lecture, la carte n'énonce que les refus. En ÉDITION il faut les huit :
  // un hôte ne peut pas accorder un droit qu'on ne lui montre pas.
  it('montre AUSSI les droits accordés — on ne retire pas ce qui est caché', () => {
    render(<ParticipantProfileCard profile={profile({ entryLink })} onToggleCapability={jest.fn()} />);

    expect(screen.getByTestId('participant-profile-toggle-canSendMessages')).toBeTruthy();
  });

  it('remonte le droit et sa valeur CIBLE au basculement', () => {
    const onToggle = jest.fn();
    render(<ParticipantProfileCard profile={profile({ entryLink })} onToggleCapability={onToggle} />);

    fireEvent.click(screen.getByTestId('participant-profile-toggle-canSendFiles'));

    expect(onToggle).toHaveBeenCalledWith('canSendFiles', true);
  });

  it('remonte `false` pour un droit actuellement accordé', () => {
    const onToggle = jest.fn();
    render(<ParticipantProfileCard profile={profile({ entryLink })} onToggleCapability={onToggle} />);

    fireEvent.click(screen.getByTestId('participant-profile-toggle-canSendMessages'));

    expect(onToggle).toHaveBeenCalledWith('canSendMessages', false);
  });
});

/**
 * L'OCTROI D'HISTORIQUE PAR DATE — vaut pour TOUT participant, inscrit
 * compris, pas seulement les visiteurs sans compte : section séparée des
 * capacités ci-dessus, réservées aux anonymes.
 *
 * Même règle d'édition que les capacités : la carte ne décide jamais du
 * droit. Ici pourtant `entryLink` n'est PAS le bon signal (il n'existe que
 * pour un anonyme) — c'est la présence du callback `onSetHistoryGrant` qui
 * gouverne, le conteneur ne le branchant que si `profile.canGrantHistory`.
 */
describe('ParticipantProfileCard — octroi d’historique par date', () => {
  it('reste muette sans octroi ni droit d’édition — un membre ordinaire', () => {
    render(<ParticipantProfileCard profile={profile({ historyVisibleFrom: null })} />);

    expect(screen.queryByTestId('participant-profile-history-grant')).toBeNull();
  });

  it('affiche l’octroi en lecture seule à un hôte qui ne peut pas l’écrire', () => {
    render(
      <ParticipantProfileCard
        profile={profile({ historyVisibleFrom: '2026-01-15T00:00:00Z' })}
      />
    );

    expect(screen.getByTestId('participant-profile-history-grant-readonly')).toBeTruthy();
    expect(screen.queryByTestId('participant-profile-history-grant-input')).toBeNull();
  });

  /**
   * Le JOUR affiché est celui de l'octroi, pas celui du fuseau du lecteur.
   *
   * L'octroi est composé en minuit UTC du jour choisi, et le contrôle éditable
   * le réaffiche par `iso.slice(0, 10)` — donc en jour UTC. Un
   * `toLocaleDateString()` nu sur la ligne en LECTURE SEULE lisait le même
   * instant dans le fuseau du lecteur : à l'ouest de Greenwich il rendait la
   * VEILLE, et la même valeur s'affichait sous deux jours différents selon que
   * le lecteur peut l'écrire ou seulement la lire.
   *
   * L'instant est choisi À 23h30 UTC, et pas à minuit, pour que le témoin
   * PUISSE tomber : réassigner `process.env.TZ` ne prend pas (le worker jest a
   * déjà figé son fuseau), donc le seul levier est l'instant. À 23h30 UTC le
   * jour LOCAL est déjà le suivant pour tout fuseau à l'est de Greenwich —
   * celui de la machine de dev — et l'ancien rendu affichait « 16 ».
   * Un runner exactement en UTC ne peut pas l'exercer : c'est aussi le seul
   * fuseau où le défaut ne se produit pas.
   */
  it('affiche le JOUR de l’octroi, pas le jour du fuseau du lecteur', () => {
    render(
      <ParticipantProfileCard
        profile={profile({ historyVisibleFrom: '2026-01-15T23:30:00.000Z' })}
      />
    );

    const shown = screen.getByTestId('participant-profile-history-grant-readonly').textContent ?? '';
    expect(shown).toContain('15');
  });

  it('affiche un contrôle éditable quand l’écriture est possible', () => {
    render(
      <ParticipantProfileCard
        profile={profile({ historyVisibleFrom: null })}
        onSetHistoryGrant={jest.fn()}
      />
    );

    expect(screen.getByTestId('participant-profile-history-grant-input')).toBeTruthy();
  });

  it('pose l’octroi au choix d’une date', () => {
    const onSetHistoryGrant = jest.fn();
    render(
      <ParticipantProfileCard
        profile={profile({ historyVisibleFrom: null })}
        onSetHistoryGrant={onSetHistoryGrant}
      />
    );

    fireEvent.change(screen.getByTestId('participant-profile-history-grant-input'), {
      target: { value: '2026-01-15' },
    });

    expect(onSetHistoryGrant).toHaveBeenCalledWith('2026-01-15T00:00:00.000Z');
  });

  it('propose de retirer un octroi déjà posé', () => {
    const onSetHistoryGrant = jest.fn();
    render(
      <ParticipantProfileCard
        profile={profile({ historyVisibleFrom: '2026-01-15T00:00:00Z' })}
        onSetHistoryGrant={onSetHistoryGrant}
      />
    );

    fireEvent.click(screen.getByTestId('participant-profile-history-grant-clear'));

    expect(onSetHistoryGrant).toHaveBeenCalledWith(null);
  });

  it('ne propose pas de retirer quand rien n’est posé', () => {
    render(
      <ParticipantProfileCard
        profile={profile({ historyVisibleFrom: null })}
        onSetHistoryGrant={jest.fn()}
      />
    );

    expect(screen.queryByTestId('participant-profile-history-grant-clear')).toBeNull();
  });

  it('désactive le contrôle pendant l’écriture', () => {
    render(
      <ParticipantProfileCard
        profile={profile({ historyVisibleFrom: '2026-01-15T00:00:00Z' })}
        onSetHistoryGrant={jest.fn()}
        historyGrantPending
      />
    );

    expect(screen.getByTestId('participant-profile-history-grant-input')).toBeDisabled();
    expect(screen.getByTestId('participant-profile-history-grant-clear')).toBeDisabled();
  });

  it('affiche l’erreur après un échec d’écriture', () => {
    render(
      <ParticipantProfileCard
        profile={profile({ historyVisibleFrom: null })}
        onSetHistoryGrant={jest.fn()}
        historyGrantError="Échec de la mise à jour"
      />
    );

    expect(screen.getByTestId('participant-profile-history-grant-error').textContent).toContain(
      'Échec de la mise à jour'
    );
  });
});

/**
 * #4393 — ce que le contrôle de date dit à qui ne voit pas l'écran.
 *
 * Un `data-testid` est un identifiant de TEST : il ne nomme personne. Un
 * `<span>` voisin n'est pas un `<label for>`. Et une erreur seulement DESSINÉE
 * n'apprend rien à qui ne regarde pas la zone où elle apparaît.
 */
describe('ParticipantProfileCard — l’octroi d’historique s’utilise sans voir', () => {
  const hote = () =>
    render(
      <ParticipantProfileCard
        profile={profile({ historyVisibleFrom: '2026-01-15T00:00:00Z' })}
        onSetHistoryGrant={jest.fn()}
      />
    );

  it('donne un NOM accessible au champ de date, pas seulement un identifiant de test', () => {
    hote();

    const champ = screen.getByTestId('participant-profile-history-grant-input');
    expect(champ.getAttribute('aria-label')).toBe('Voit l’historique depuis');
    // Et il se trouve PAR ce nom, ce qu'un lecteur d'écran fait aussi.
    expect(screen.getByLabelText('Voit l’historique depuis')).toBe(champ);
  });

  it('annonce l’échec de l’écriture au lieu de seulement le dessiner', () => {
    render(
      <ParticipantProfileCard
        profile={profile({ historyVisibleFrom: '2026-01-15T00:00:00Z' })}
        onSetHistoryGrant={jest.fn()}
        historyGrantError="Échec de l’octroi"
      />
    );

    const erreur = screen.getByTestId('participant-profile-history-grant-error');
    expect(erreur.getAttribute('role')).toBe('alert');
    expect(screen.getByRole('alert').textContent).toBe('Échec de l’octroi');
  });

  it('offre au retrait une cible de 44 px, pas les 14 px de son icône', () => {
    hote();

    const retrait = screen.getByTestId('participant-profile-history-grant-clear');
    // `h-11 w-11` = 44 px dans l'échelle Tailwind du projet.
    expect(retrait.className).toContain('h-11');
    expect(retrait.className).toContain('w-11');
  });

  it('nomme le retrait, dont l’icône est décorative', () => {
    hote();

    const retrait = screen.getByTestId('participant-profile-history-grant-clear');
    expect(retrait.getAttribute('aria-label')).toBe('Retirer');
    expect(retrait.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});
