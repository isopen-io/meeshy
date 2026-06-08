/**
 * PERMISSION REQUEST COMPONENT
 * Guides users through granting camera/microphone permissions
 */

'use client';

import React, { useState } from 'react';
import { Camera, Mic, AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useI18n } from '@/hooks/useI18n';

interface PermissionRequestProps {
  onPermissionsGranted: () => void;
  onCancel: () => void;
}

export function PermissionRequest({ onPermissionsGranted, onCancel }: PermissionRequestProps) {
  const [status, setStatus] = useState<'idle' | 'requesting' | 'granted' | 'denied'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const { t } = useI18n('calls');

  const requestPermissions = async () => {
    setStatus('requesting');
    setErrorMessage('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      stream.getTracks().forEach(track => track.stop());

      setStatus('granted');
      setTimeout(() => {
        onPermissionsGranted();
      }, 500);
    } catch (error) {
      setStatus('denied');

      if (error instanceof DOMException) {
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          setErrorMessage(t('calls.permissions.errorDenied'));
        } else if (error.name === 'NotFoundError') {
          setErrorMessage(t('calls.permissions.errorNotFound'));
        } else if (error.name === 'NotReadableError') {
          setErrorMessage(t('calls.permissions.errorInUse'));
        } else {
          setErrorMessage(t('calls.permissions.errorUnavailable'));
        }
      } else {
        setErrorMessage(t('calls.permissions.errorUnexpected'));
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-gray-900 rounded-lg p-6 text-center">
        {/* Icon */}
        <div
          className={cn(
            'w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6',
            status === 'granted' ? 'bg-green-600' : status === 'denied' ? 'bg-red-600' : 'bg-blue-600'
          )}
        >
          {status === 'granted' ? (
            <CheckCircle className="w-10 h-10 text-white" />
          ) : status === 'denied' ? (
            <AlertCircle className="w-10 h-10 text-white" />
          ) : (
            <div className="flex gap-2">
              <Camera className="w-8 h-8 text-white" />
              <Mic className="w-8 h-8 text-white" />
            </div>
          )}
        </div>

        {/* Title */}
        <h2 className="text-white text-2xl font-bold mb-2">
          {status === 'granted'
            ? t('calls.permissions.titleGranted')
            : status === 'denied'
            ? t('calls.permissions.titleDenied')
            : t('calls.permissions.title')}
        </h2>

        {/* Description */}
        <p className="text-gray-300 mb-6">
          {status === 'granted'
            ? t('calls.permissions.descriptionGranted')
            : status === 'denied'
            ? errorMessage
            : t('calls.permissions.description')}
        </p>

        {/* Buttons */}
        <div className="flex flex-col gap-3">
          {status === 'idle' && (
            <>
              <Button onClick={requestPermissions} size="lg" className="w-full">
                {t('calls.permissions.grantAccess')}
              </Button>
              <Button onClick={onCancel} variant="outline" size="lg" className="w-full">
                {t('calls.permissions.cancel')}
              </Button>
            </>
          )}

          {status === 'requesting' && (
            <div className="py-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto"></div>
              <p className="text-gray-400 mt-3 text-sm">{t('calls.permissions.requesting')}</p>
            </div>
          )}

          {status === 'denied' && (
            <>
              <Button onClick={requestPermissions} size="lg" className="w-full">
                {t('calls.permissions.tryAgain')}
              </Button>
              <Button onClick={onCancel} variant="outline" size="lg" className="w-full">
                {t('calls.permissions.cancel')}
              </Button>
            </>
          )}

          {status === 'granted' && (
            <div className="py-4">
              <p className="text-green-500 font-medium">{t('calls.permissions.joining')}</p>
            </div>
          )}
        </div>

        {/* Browser Instructions */}
        {status === 'denied' && (
          <div className="mt-6 text-left text-sm text-gray-400 bg-gray-800 rounded p-4">
            <p className="font-semibold mb-2">{t('calls.permissions.howToEnable')}</p>
            <ul className="list-disc list-inside space-y-1">
              <li>
                <strong>Chrome:</strong> {t('calls.permissions.instructionChrome')}
              </li>
              <li>
                <strong>Firefox:</strong> {t('calls.permissions.instructionFirefox')}
              </li>
              <li>
                <strong>Safari:</strong> {t('calls.permissions.instructionSafari')}
              </li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
