/**
 * @jest-environment jsdom
 *
 * L'écran des préférences de notification tient son PROPRE état local — il ne
 * passe pas par `user-preferences-store`, donc le correctif de verbe du cycle
 * 136 ne l'a jamais atteint.
 *
 * Son amorce porte 15 des 33 champs du schéma partagé, et son chargement absorbe
 * l'échec en silence : hors ligne ou sur un 5xx, l'écran rend ses DÉFAUTS comme
 * s'ils étaient les réglages de l'utilisateur, bouton d'enregistrement actif. En
 * `PUT`, le geste suivant estampait sur le serveur les dix-huit champs que
 * l'écran ne rend pas — `callsEnabled` (les appels entrants, rallumés),
 * `dndUtcOffsetMinutes` (la fenêtre « ne pas déranger » repassée en UTC : neuf
 * heures de décalage pour Tokyo), `showPreview` (le contenu des messages de
 * retour sur l'écran verrouillé).
 *
 * Ce que ces témoins gardent : seul ce que l'utilisateur a TOUCHÉ voyage.
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key, locale: 'fr' }),
}));

jest.mock('@/components/auth/AuthGuard', () => ({
  AuthGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

jest.mock('@/lib/config', () => ({
  API_CONFIG: { getApiUrl: () => 'http://localhost:3000/api/v1' },
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

import NotificationPreferencesPage from '@/app/notifications/preferences/page';

/** Le document complet tel que la passerelle le sert (33 champs + métadonnées). */
const storedDocument = {
  id: 'pref-1',
  userId: 'user-1',
  pushEnabled: true,
  emailEnabled: true,
  soundEnabled: true,
  vibrationEnabled: true,
  newMessageEnabled: true,
  missedCallEnabled: true,
  callsEnabled: false,
  voicemailEnabled: true,
  systemEnabled: true,
  conversationEnabled: true,
  replyEnabled: true,
  mentionEnabled: true,
  reactionEnabled: true,
  contactRequestEnabled: true,
  groupInviteEnabled: true,
  memberJoinedEnabled: true,
  memberLeftEnabled: true,
  postLikeEnabled: true,
  postCommentEnabled: true,
  postRepostEnabled: true,
  storyReactionEnabled: true,
  commentReplyEnabled: true,
  commentLikeEnabled: true,
  friendContentEnabled: true,
  dndEnabled: false,
  dndStartTime: '22:00',
  dndEndTime: '08:00',
  dndDays: ['sat', 'sun'],
  dndUtcOffsetMinutes: 540,
  showPreview: false,
  showSenderName: true,
  groupNotifications: true,
  notificationBadgeEnabled: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const toggle = (id: string) => {
  const control = document.getElementById(id);
  if (!control) throw new Error(`interrupteur introuvable : ${id}`);
  fireEvent.click(control);
};

const save = () => fireEvent.click(screen.getByText('notifPrefs.saveButton'));

const renderLoaded = async () => {
  render(<NotificationPreferencesPage />);
  await waitFor(() => {
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
};

const writeCall = () => {
  const calls = (global.fetch as jest.Mock).mock.calls;
  const write = calls.find(([, init]) => init?.method && init.method !== 'GET');
  if (!write) throw new Error("aucune écriture n'a été émise");
  return { init: write[1], body: JSON.parse(write[1].body as string) };
};

describe('écran des préférences de notification — ce qui part au serveur', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.setItem('authToken', 'mock-token');
    global.fetch = jest.fn();
  });

  describe('quand le chargement a échoué (hors ligne, 5xx)', () => {
    beforeEach(async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ success: false }),
      });
      await renderLoaded();
    });

    it('écrit en PATCH — le verbe qui FUSIONNE, jamais celui qui remplace', () => {
      toggle('sound');
      save();

      expect(writeCall().init.method).toBe('PATCH');
    });

    it('ne nomme que la clé basculée', () => {
      toggle('sound');
      save();

      expect(writeCall().body).toEqual({ soundEnabled: false });
    });

    it('ne nomme aucun des champs que l’écran ne rend pas', () => {
      toggle('dnd');
      save();

      const { body } = writeCall();
      expect(body).not.toHaveProperty('callsEnabled');
      expect(body).not.toHaveProperty('dndUtcOffsetMinutes');
      expect(body).not.toHaveProperty('dndDays');
      expect(body).not.toHaveProperty('showPreview');
      expect(body).not.toHaveProperty('showSenderName');
      expect(body).not.toHaveProperty('vibrationEnabled');
    });
  });

  describe('quand le chargement a abouti', () => {
    beforeEach(async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: storedDocument }),
      });
      await renderLoaded();
    });

    it('ne renvoie pas les métadonnées de la ligne lue', () => {
      toggle('push');
      save();

      const { body } = writeCall();
      expect(body).not.toHaveProperty('id');
      expect(body).not.toHaveProperty('userId');
      expect(body).not.toHaveProperty('createdAt');
      expect(body).not.toHaveProperty('updatedAt');
    });

    it('n’émet AUCUNE écriture quand rien n’a été touché', () => {
      save();

      expect(
        (global.fetch as jest.Mock).mock.calls.filter(
          ([, init]) => init?.method && init.method !== 'GET',
        ),
      ).toHaveLength(0);
    });

    it('ne réaffirme pas un réglage déjà enregistré au geste suivant', async () => {
      toggle('sound');
      save();
      await waitFor(() => expect(writeCall().body).toEqual({ soundEnabled: false }));

      (global.fetch as jest.Mock).mockClear();
      toggle('email');
      save();

      await waitFor(() =>
        expect(writeCall().body).toEqual({ emailEnabled: false }),
      );
    });

    it('n’oublie pas une bascule faite PENDANT que l’enregistrement vole', async () => {
      let releaseWrite: (value: unknown) => void = () => undefined;
      (global.fetch as jest.Mock).mockImplementationOnce(
        () =>
          new Promise(resolve => {
            releaseWrite = resolve;
          }),
      );

      toggle('sound');
      save();
      toggle('email');

      releaseWrite({ ok: true, json: async () => ({ success: true }) });
      await waitFor(() =>
        expect(screen.getByText('notifPrefs.saveButton')).toBeEnabled(),
      );

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });
      (global.fetch as jest.Mock).mockClear();
      save();

      await waitFor(() =>
        expect(writeCall().body).toEqual({ emailEnabled: false }),
      );
    });

    it('porte l’heure de début quand la fenêtre « ne pas déranger » est réglée', () => {
      toggle('dnd');
      fireEvent.change(document.getElementById('dndStart')!, {
        target: { value: '23:30' },
      });
      save();

      expect(writeCall().body).toEqual({
        dndEnabled: true,
        dndStartTime: '23:30',
      });
    });
  });
});
