'use client';

import { useState, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import Cropper from 'react-easy-crop';
import { Area, Point } from 'react-easy-crop';
import { getCroppedImg, cleanupObjectUrl } from '@/utils/image-crop';
import { RotateCw, ZoomIn, Loader2 } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import { useReducedMotion, SoundFeedback } from '@/hooks/use-accessibility';

interface AvatarCropDialogProps {
  open: boolean;
  onClose: () => void;
  imageSrc: string;
  onCropComplete: (file: File) => void;
  isUploading?: boolean;
}

/**
 * Composant de dialogue pour recadrer, zoomer et tourner une image d'avatar
 */
export function AvatarCropDialog({
  open,
  onClose,
  imageSrc,
  onCropComplete,
  isUploading = false,
}: AvatarCropDialogProps) {
  const { t } = useI18n('settings');
  const reducedMotion = useReducedMotion();

  // État du recadrage
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Réinitialiser l'état quand le dialogue s'ouvre
  useEffect(() => {
    if (open) {
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setRotation(0);
      setCroppedAreaPixels(null);
    }
  }, [open]);

  /**
   * Callback appelé à chaque changement de zone de recadrage
   */
  const onCropChange = useCallback((location: Point) => {
    setCrop(location);
  }, []);

  /**
   * Callback appelé à chaque changement de zoom
   */
  const onZoomChange = useCallback((zoom: number) => {
    setZoom(zoom);
  }, []);

  /**
   * Callback appelé quand le recadrage est terminé
   */
  const onCropCompleteCallback = useCallback(
    (croppedArea: Area, croppedAreaPixels: Area) => {
      setCroppedAreaPixels(croppedAreaPixels);
    },
    []
  );

  /**
   * Traite l'image recadrée et appelle le callback parent
   */
  const handleCropImage = useCallback(async () => {
    if (!croppedAreaPixels) return;

    setIsProcessing(true);
    try {
      const { file, url } = await getCroppedImg(
        imageSrc,
        croppedAreaPixels,
        rotation,
        `avatar-${Date.now()}.jpg`
      );

      // Nettoyer l'URL de prévisualisation temporaire
      cleanupObjectUrl(url);

      // Appeler le callback avec le fichier recadré
      onCropComplete(file);
    } catch (error) {
      console.error('Erreur lors du recadrage:', error);
    } finally {
      setIsProcessing(false);
    }
  }, [croppedAreaPixels, imageSrc, rotation, onCropComplete]);

  /**
   * Réinitialise tous les paramètres
   */
  const handleReset = useCallback(() => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
  }, []);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {t('profile.cropAvatar.cropAvatarTitle') || 'Recadrer votre photo de profil'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Zone de recadrage */}
          <div className="relative w-full h-[400px] bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden">
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={1} // Carré 1:1
              onCropChange={onCropChange}
              onZoomChange={onZoomChange}
              onCropComplete={onCropCompleteCallback}
              cropShape="round" // Forme circulaire pour l'avatar
              showGrid={false}
              style={{
                containerStyle: {
                  width: '100%',
                  height: '100%',
                  backgroundColor: '#f3f4f6',
                },
              }}
            />
          </div>

          {/* Contrôles de zoom */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2 text-sm font-medium">
                <ZoomIn className="h-4 w-4" />
                {t('profile.cropAvatar.zoom') || 'Zoom'}
              </Label>
              <span className="text-sm text-gray-500">{Math.round(zoom * 100)}%</span>
            </div>
            <Slider
              value={[zoom]}
              onValueChange={([value]) => setZoom(value)}
              min={1}
              max={3}
              step={0.1}
              className="w-full"
            />
          </div>

          {/* Contrôles de rotation */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2 text-sm font-medium">
                <RotateCw className="h-4 w-4" />
                {t('profile.cropAvatar.rotation') || 'Rotation'}
              </Label>
              <span className="text-sm text-gray-500">{rotation}°</span>
            </div>
            <Slider
              value={[rotation]}
              onValueChange={([value]) => setRotation(value)}
              min={0}
              max={360}
              step={1}
              className="w-full"
            />
          </div>

          {/* Instructions */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              {t('profile.cropAvatar.cropInstructions') || 
                'Utilisez la souris pour déplacer l\'image, les curseurs pour zoomer et tourner. L\'image sera recadrée en carré.'}
            </p>
          </div>
        </div>

        <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={isProcessing || isUploading}
          >
            {t('profile.cropAvatar.reset') || 'Réinitialiser'}
          </Button>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isProcessing || isUploading}
          >
            {t('profile.cropAvatar.cancel') || 'Annuler'}
          </Button>
          <Button
            onClick={() => {
              SoundFeedback.playClick();
              handleCropImage();
            }}
            disabled={isProcessing || isUploading || !croppedAreaPixels}
            className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            {(isProcessing || isUploading) && (
              <Loader2 className={`mr-2 h-4 w-4 ${reducedMotion ? '' : 'animate-spin'}`} />
            )}
            {isUploading
              ? (t('profile.cropAvatar.uploading') || 'Téléchargement...')
              : isProcessing
                ? (t('profile.cropAvatar.processing') || 'Traitement...')
                : (t('profile.cropAvatar.saveAvatar') || 'Enregistrer')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

