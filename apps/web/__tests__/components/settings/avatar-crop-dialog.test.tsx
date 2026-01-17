/**
 * Tests pour le composant AvatarCropDialog
 * Gere le recadrage, zoom et rotation d'une image d'avatar
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AvatarCropDialog } from '@/components/settings/avatar-crop-dialog';

// Mock des hooks
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, fallback?: string) => fallback || key,
  }),
}));

jest.mock('@/hooks/use-accessibility', () => ({
  useReducedMotion: () => false,
  SoundFeedback: {
    playClick: jest.fn(),
    playSuccess: jest.fn(),
    playError: jest.fn(),
  },
}));

// Mock de react-easy-crop
const mockOnCropComplete = jest.fn();
jest.mock('react-easy-crop', () => {
  const MockCropper = ({ onCropComplete, onCropChange, onZoomChange }: any) => {
    // Simuler un appel de onCropComplete apres le rendu
    React.useEffect(() => {
      if (onCropComplete) {
        onCropComplete(
          { x: 0, y: 0, width: 100, height: 100 },
          { x: 0, y: 0, width: 200, height: 200 }
        );
      }
    }, [onCropComplete]);

    return (
      <div data-testid="cropper-mock">
        <button
          data-testid="trigger-crop-change"
          onClick={() => onCropChange?.({ x: 10, y: 10 })}
        >
          Change Crop
        </button>
        <button
          data-testid="trigger-zoom-change"
          onClick={() => onZoomChange?.(2)}
        >
          Change Zoom
        </button>
      </div>
    );
  };
  return MockCropper;
});

// Mock des utilitaires d'image
jest.mock('@/utils/image-crop', () => ({
  getCroppedImg: jest.fn().mockResolvedValue({
    file: new File(['test'], 'avatar.jpg', { type: 'image/jpeg' }),
    url: 'blob:test-url',
  }),
  cleanupObjectUrl: jest.fn(),
}));

describe('AvatarCropDialog', () => {
  const defaultProps = {
    open: true,
    onClose: jest.fn(),
    imageSrc: 'data:image/jpeg;base64,test',
    onCropComplete: jest.fn(),
    isUploading: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendu initial', () => {
    it('affiche le dialogue quand open est true', () => {
      render(<AvatarCropDialog {...defaultProps} />);

      expect(screen.getByText('Recadrer votre photo de profil')).toBeInTheDocument();
    });

    it('affiche les controles de zoom', () => {
      render(<AvatarCropDialog {...defaultProps} />);

      expect(screen.getByText('Zoom')).toBeInTheDocument();
      expect(screen.getByText('100%')).toBeInTheDocument();
    });

    it('affiche les controles de rotation', () => {
      render(<AvatarCropDialog {...defaultProps} />);

      expect(screen.getByText('Rotation')).toBeInTheDocument();
      expect(screen.getByText('0°')).toBeInTheDocument();
    });

    it('affiche les boutons d\'action', () => {
      render(<AvatarCropDialog {...defaultProps} />);

      expect(screen.getByText('Reinitialiser')).toBeInTheDocument();
      expect(screen.getByText('Annuler')).toBeInTheDocument();
      expect(screen.getByText('Enregistrer')).toBeInTheDocument();
    });

    it('affiche les instructions d\'utilisation', () => {
      render(<AvatarCropDialog {...defaultProps} />);

      expect(
        screen.getByText(/Utilisez la souris pour deplacer l'image/)
      ).toBeInTheDocument();
    });
  });

  describe('Interactions utilisateur', () => {
    it('appelle onClose quand on clique sur Annuler', () => {
      const onClose = jest.fn();
      render(<AvatarCropDialog {...defaultProps} onClose={onClose} />);

      fireEvent.click(screen.getByText('Annuler'));

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('reinitialise les valeurs quand on clique sur Reinitialiser', async () => {
      render(<AvatarCropDialog {...defaultProps} />);

      // D'abord modifier le zoom via le mock
      fireEvent.click(screen.getByTestId('trigger-zoom-change'));

      // Puis reinitialiser
      fireEvent.click(screen.getByText('Reinitialiser'));

      // Le zoom devrait revenir a 100%
      expect(screen.getByText('100%')).toBeInTheDocument();
      expect(screen.getByText('0°')).toBeInTheDocument();
    });

    it('traite l\'image et appelle onCropComplete quand on clique sur Enregistrer', async () => {
      const onCropComplete = jest.fn();
      const { getCroppedImg } = require('@/utils/image-crop');

      render(<AvatarCropDialog {...defaultProps} onCropComplete={onCropComplete} />);

      // Attendre que le cropper soit pret (via useEffect)
      await waitFor(() => {
        expect(screen.getByText('Enregistrer')).not.toBeDisabled();
      });

      fireEvent.click(screen.getByText('Enregistrer'));

      await waitFor(() => {
        expect(getCroppedImg).toHaveBeenCalled();
        expect(onCropComplete).toHaveBeenCalled();
      });
    });
  });

  describe('Etats de chargement', () => {
    it('desactive les boutons pendant le traitement', async () => {
      const { getCroppedImg } = require('@/utils/image-crop');
      // Retarder la resolution pour simuler le traitement
      getCroppedImg.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  file: new File(['test'], 'avatar.jpg'),
                  url: 'blob:test',
                }),
              100
            )
          )
      );

      render(<AvatarCropDialog {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Enregistrer')).not.toBeDisabled();
      });

      fireEvent.click(screen.getByText('Enregistrer'));

      // Pendant le traitement
      await waitFor(() => {
        expect(screen.getByText('Traitement...')).toBeInTheDocument();
      });
    });

    it('affiche "Telechargement..." quand isUploading est true', () => {
      render(<AvatarCropDialog {...defaultProps} isUploading={true} />);

      expect(screen.getByText('Telechargement...')).toBeInTheDocument();
    });

    it('desactive tous les boutons quand isUploading est true', () => {
      render(<AvatarCropDialog {...defaultProps} isUploading={true} />);

      expect(screen.getByText('Reinitialiser')).toBeDisabled();
      expect(screen.getByText('Annuler')).toBeDisabled();
      expect(screen.getByText('Telechargement...')).toBeDisabled();
    });
  });

  describe('Gestion des erreurs', () => {
    it('gere les erreurs de recadrage sans crash', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation();
      const { getCroppedImg } = require('@/utils/image-crop');
      getCroppedImg.mockRejectedValue(new Error('Erreur de recadrage'));

      render(<AvatarCropDialog {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Enregistrer')).not.toBeDisabled();
      });

      fireEvent.click(screen.getByText('Enregistrer'));

      await waitFor(() => {
        expect(consoleError).toHaveBeenCalledWith(
          'Erreur lors du recadrage:',
          expect.any(Error)
        );
      });

      consoleError.mockRestore();
    });
  });

  describe('Reinitialisation a l\'ouverture', () => {
    it('reinitialise les valeurs quand le dialogue s\'ouvre', () => {
      const { rerender } = render(<AvatarCropDialog {...defaultProps} open={false} />);

      // Ouvrir le dialogue
      rerender(<AvatarCropDialog {...defaultProps} open={true} />);

      // Les valeurs devraient etre a leur etat initial
      expect(screen.getByText('100%')).toBeInTheDocument();
      expect(screen.getByText('0°')).toBeInTheDocument();
    });
  });

  describe('Accessibilite', () => {
    it('a un titre de dialogue accessible', () => {
      render(<AvatarCropDialog {...defaultProps} />);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
    });

    it('les sliders sont utilisables au clavier', () => {
      render(<AvatarCropDialog {...defaultProps} />);

      // Les sliders Radix UI sont accessibles
      const sliders = screen.getAllByRole('slider');
      expect(sliders.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Nettoyage des ressources', () => {
    it('nettoie l\'URL d\'objet apres le recadrage', async () => {
      const { cleanupObjectUrl, getCroppedImg } = require('@/utils/image-crop');
      getCroppedImg.mockResolvedValue({
        file: new File(['test'], 'avatar.jpg'),
        url: 'blob:test-url-to-cleanup',
      });

      render(<AvatarCropDialog {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Enregistrer')).not.toBeDisabled();
      });

      fireEvent.click(screen.getByText('Enregistrer'));

      await waitFor(() => {
        expect(cleanupObjectUrl).toHaveBeenCalledWith('blob:test-url-to-cleanup');
      });
    });
  });
});
