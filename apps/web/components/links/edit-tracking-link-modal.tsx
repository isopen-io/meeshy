'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import type { TrackingLink } from '@meeshy/shared/types/tracking-link';
import { buildApiUrl } from '@/lib/config';
import { toast } from 'sonner';
import { useI18n } from '@/hooks/useI18n';

interface EditTrackingLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  link: TrackingLink | null;
  onSuccess: () => void;
}

export function EditTrackingLinkModal({
  isOpen,
  onClose,
  link,
  onSuccess,
}: EditTrackingLinkModalProps) {
  const { t } = useI18n('links');
  const [originalUrl, setOriginalUrl] = useState('');
  const [newToken, setNewToken] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingToken, setIsCheckingToken] = useState(false);
  const [tokenAvailability, setTokenAvailability] = useState<'checking' | 'available' | 'unavailable' | 'idle'>('idle');

  // Reset form when link changes or modal opens
  useEffect(() => {
    if (link && isOpen) {
      setOriginalUrl(link.originalUrl);
      setNewToken(link.token);
      setExpiresAt(link.expiresAt ? new Date(link.expiresAt).toISOString().slice(0, 16) : '');
      setIsActive(link.isActive);
      setTokenAvailability('idle');
    }
  }, [link, isOpen]);

  // Check token availability when it changes
  useEffect(() => {
    if (!newToken || !link || newToken === link.token || newToken.length !== 6) {
      setTokenAvailability('idle');
      return;
    }

    const checkToken = async () => {
      setIsCheckingToken(true);
      setTokenAvailability('checking');

      try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(buildApiUrl(`/tracking-links/check-token/${newToken}`), {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          setTokenAvailability('idle');
          return;
        }

        const data = await response.json();
        setTokenAvailability(data.data.available ? 'available' : 'unavailable');
      } catch (error) {
        console.error('Error checking token:', error);
        setTokenAvailability('idle');
      } finally {
        setIsCheckingToken(false);
      }
    };

    const timeoutId = setTimeout(checkToken, 500);
    return () => clearTimeout(timeoutId);
  }, [newToken, link]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!link) return;

    // Validation
    if (!originalUrl || !originalUrl.trim()) {
      toast.error(t('tracking.edit.errors.urlRequired'));
      return;
    }

    if (!/^https?:\/\/.+/.test(originalUrl)) {
      toast.error(t('tracking.edit.errors.invalidUrl'));
      return;
    }

    if (newToken && newToken !== link.token) {
      if (!/^[a-zA-Z0-9_-]{2,50}$/.test(newToken)) {
        toast.error(t('tracking.edit.errors.invalidToken'));
        return;
      }

      if (tokenAvailability === 'unavailable') {
        toast.error(t('tracking.edit.tokenTaken'));
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const token = localStorage.getItem('auth_token');
      const updateData: any = {
        originalUrl: originalUrl.trim(),
        isActive,
      };

      if (newToken && newToken !== link.token) {
        updateData.newToken = newToken.trim();
      }

      if (expiresAt) {
        updateData.expiresAt = new Date(expiresAt).toISOString();
      } else {
        updateData.expiresAt = null;
      }

      const response = await fetch(buildApiUrl(`/tracking-links/${link.token}`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || t('tracking.edit.errors.updateFailed'));
      }

      toast.success(t('tracking.edit.success.updated'));
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error updating tracking link:', error);
      toast.error(error instanceof Error ? error.message : t('tracking.edit.errors.updateFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
    }
  };

  if (!link) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{t('tracking.edit.title')}</DialogTitle>
          <DialogDescription>
            {t('tracking.edit.description')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {/* Original URL */}
            <div className="space-y-2">
              <Label htmlFor="originalUrl">
                {t('tracking.edit.originalUrl')} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="originalUrl"
                type="url"
                value={originalUrl}
                onChange={(e) => setOriginalUrl(e.target.value)}
                placeholder="https://example.com/page"
                required
                disabled={isSubmitting}
              />
              <p className="text-xs text-muted-foreground">
                {t('tracking.edit.originalUrlDescription')}
              </p>
            </div>

            {/* Token */}
            <div className="space-y-2">
              <Label htmlFor="token">{t('tracking.edit.token')}</Label>
              <div className="relative">
                <Input
                  id="token"
                  value={newToken}
                  onChange={(e) => setNewToken(e.target.value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 50))}
                  placeholder="my-token"
                  maxLength={50}
                  disabled={isSubmitting}
                  className="pr-10"
                />
                {isCheckingToken && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
                )}
                {!isCheckingToken && tokenAvailability === 'available' && newToken !== link.token && (
                  <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
                )}
                {!isCheckingToken && tokenAvailability === 'unavailable' && (
                  <XCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500" />
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {t('tracking.edit.tokenDescription')}
              </p>
              {tokenAvailability === 'unavailable' && (
                <p className="text-xs text-red-500">{t('tracking.edit.tokenTaken')}</p>
              )}
              {tokenAvailability === 'available' && newToken !== link.token && (
                <p className="text-xs text-green-500">{t('tracking.edit.tokenAvailable')}</p>
              )}
            </div>

            {/* Expires At */}
            <div className="space-y-2">
              <Label htmlFor="expiresAt">{t('tracking.edit.expiresAt')}</Label>
              <Input
                id="expiresAt"
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                disabled={isSubmitting}
              />
              <p className="text-xs text-muted-foreground">
                {t('tracking.edit.expiresAtDescription')}
              </p>
            </div>

            {/* Is Active */}
            <div className="flex items-center space-x-2">
              <Switch
                id="isActive"
                checked={isActive}
                onCheckedChange={setIsActive}
                disabled={isSubmitting}
              />
              <Label htmlFor="isActive" className="cursor-pointer">
                {t('tracking.edit.isActive')}
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              {t('tracking.edit.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || tokenAvailability === 'unavailable' || isCheckingToken}
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSubmitting ? t('tracking.edit.saving') : t('tracking.edit.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
