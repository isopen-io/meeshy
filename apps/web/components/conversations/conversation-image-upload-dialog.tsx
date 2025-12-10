'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import Cropper from 'react-easy-crop';
import { Area, Point } from 'react-easy-crop';
import { getCroppedImg, cleanupObjectUrl } from '@/utils/image-crop';
import { RotateCw, ZoomIn, Loader2, Upload, Camera } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import { validateAvatarFile } from '@/utils/avatar-upload';
import { toast } from 'sonner';

interface ConversationImageUploadDialogProps {
  open: boolean;
  onClose: () => void;
  onImageUploaded: (file: File) => void;
  isUploading?: boolean;
  conversationTitle?: string;
}

/**
 * Composant de dialogue pour uploader et recadrer une image de conversation
 */
export function ConversationImageUploadDialog({
  open,
  onClose,
  onImageUploaded,
  isUploading = false,
  conversationTitle = 'conversation',
}: ConversationImageUploadDialogProps) {
  const { t } = useI18n('conversations');

  // État du recadrage
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Réinitialiser l'état quand le dialogue s'ouvre
  useEffect(() => {
    if (open) {
      setImageSrc(null);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setRotation(0);
      setCroppedAreaPixels(null);
    }
  }, [open]);

  // Nettoyer l'URL de l'image lors de la fermeture
  useEffect(() => {
    return () => {
      if (imageSrc) {
        cleanupObjectUrl(imageSrc);
      }
    };
  }, [imageSrc]);

  /**
   * Gestion de la sélection de fichier
   */
  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Valider le fichier
    const validation = validateAvatarFile(file);
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }

    // Créer une URL de prévisualisation
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result) {
        setImageSrc(reader.result as string);
      }
    };
    reader.readAsDataURL(file);
  }, []);

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
    if (!croppedAreaPixels || !imageSrc) return;

    setIsProcessing(true);
    try {
      const { file, url } = await getCroppedImg(
        imageSrc,
        croppedAreaPixels,
        rotation,
        `conversation-${conversationTitle}-${Date.now()}.jpg`
      );

      // Nettoyer l'URL de prévisualisation temporaire
      cleanupObjectUrl(url);

      // Appeler le callback avec le fichier recadré
      onImageUploaded(file);
    } catch (error) {
      console.error('Erreur lors du recadrage:', error);
      toast.error('Erreur lors du traitement de l\'image');
    } finally {
      setIsProcessing(false);
    }
  }, [croppedAreaPixels, imageSrc, rotation, onImageUploaded, conversationTitle]);

  /**
   * Réinitialise tous les paramètres
   */
  const handleReset = useCallback(() => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
  }, []);

  /**
   * Ouvre le sélecteur de fichier
   */
  const handleSelectFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {t('conversationImage.title') || 'Changer l\'image de la conversation'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {!imageSrc ? (
            /* Zone de sélection de fichier */
            <div className="flex flex-col items-center justify-center space-y-4 py-12">
              <div className="p-6 bg-primary/10 rounded-full">
                <Camera className="h-12 w-12 text-primary" />
              </div>
              <div className="text-center space-y-2">
                <h3 className="font-semibold text-lg">
                  {t('conversationImage.selectImage') || 'Sélectionner une image'}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t('conversationImage.selectImageDescription') ||
                    'Choisissez une image pour représenter cette conversation'}
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                onChange={handleFileSelect}
                className="hidden"
              />
              <Button
                onClick={handleSelectFile}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
              >
                <Upload className="mr-2 h-4 w-4" />
                {t('conversationImage.chooseFile') || 'Choisir un fichier'}
              </Button>
              <p className="text-xs text-muted-foreground">
                {t('conversationImage.fileRequirements') ||
                  'JPEG, PNG ou WebP - Max 5MB'}
              </p>
            </div>
          ) : (
            <>
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
                  cropShape="round" // Forme circulaire
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
                    {t('conversationImage.zoom') || 'Zoom'}
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
                    {t('conversationImage.rotation') || 'Rotation'}
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
                  {t('conversationImage.instructions') ||
                    'Utilisez la souris pour déplacer l\'image, les curseurs pour zoomer et tourner.'}
                </p>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          {imageSrc && (
            <>
              <Button
                variant="outline"
                onClick={handleReset}
                disabled={isProcessing || isUploading}
              >
                {t('conversationImage.reset') || 'Réinitialiser'}
              </Button>
              <Button
                variant="outline"
                onClick={handleSelectFile}
                disabled={isProcessing || isUploading}
              >
                {t('conversationImage.changeImage') || 'Changer l\'image'}
              </Button>
            </>
          )}
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isProcessing || isUploading}
          >
            {t('conversationImage.cancel') || 'Annuler'}
          </Button>
          {imageSrc && (
            <Button
              onClick={handleCropImage}
              disabled={isProcessing || isUploading || !croppedAreaPixels}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
            >
              {(isProcessing || isUploading) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {isUploading
                ? (t('conversationImage.uploading') || 'Téléchargement...')
                : isProcessing
                  ? (t('conversationImage.processing') || 'Traitement...')
                  : (t('conversationImage.save') || 'Enregistrer')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
