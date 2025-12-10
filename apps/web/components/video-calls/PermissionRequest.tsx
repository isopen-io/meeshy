/**
 * PERMISSION REQUEST COMPONENT
 * Guides users through granting camera/microphone permissions
 */

'use client';

import React, { useState } from 'react';
import { Camera, Mic, AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PermissionRequestProps {
  onPermissionsGranted: () => void;
  onCancel: () => void;
}

export function PermissionRequest({ onPermissionsGranted, onCancel }: PermissionRequestProps) {
  const [status, setStatus] = useState<'idle' | 'requesting' | 'granted' | 'denied'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const requestPermissions = async () => {
    setStatus('requesting');
    setErrorMessage('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      // Stop the stream immediately - we just needed to get permissions
      stream.getTracks().forEach(track => track.stop());

      setStatus('granted');
      setTimeout(() => {
        onPermissionsGranted();
      }, 500);
    } catch (error) {
      setStatus('denied');

      if (error instanceof DOMException) {
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          setErrorMessage('Camera and microphone access denied. Please check your browser settings and allow access.');
        } else if (error.name === 'NotFoundError') {
          setErrorMessage('No camera or microphone found. Please connect a device and try again.');
        } else if (error.name === 'NotReadableError') {
          setErrorMessage('Camera or microphone is already in use by another application.');
        } else {
          setErrorMessage('Unable to access camera and microphone. Please try again.');
        }
      } else {
        setErrorMessage('An unexpected error occurred. Please try again.');
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
            ? 'Permissions Granted'
            : status === 'denied'
            ? 'Permission Denied'
            : 'Camera & Microphone Access'}
        </h2>

        {/* Description */}
        <p className="text-gray-300 mb-6">
          {status === 'granted'
            ? 'You can now join the video call.'
            : status === 'denied'
            ? errorMessage
            : 'To join this video call, we need access to your camera and microphone.'}
        </p>

        {/* Buttons */}
        <div className="flex flex-col gap-3">
          {status === 'idle' && (
            <>
              <Button onClick={requestPermissions} size="lg" className="w-full">
                Grant Access
              </Button>
              <Button onClick={onCancel} variant="outline" size="lg" className="w-full">
                Cancel
              </Button>
            </>
          )}

          {status === 'requesting' && (
            <div className="py-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto"></div>
              <p className="text-gray-400 mt-3 text-sm">Please allow access in your browser...</p>
            </div>
          )}

          {status === 'denied' && (
            <>
              <Button onClick={requestPermissions} size="lg" className="w-full">
                Try Again
              </Button>
              <Button onClick={onCancel} variant="outline" size="lg" className="w-full">
                Cancel
              </Button>
            </>
          )}

          {status === 'granted' && (
            <div className="py-4">
              <p className="text-green-500 font-medium">Joining call...</p>
            </div>
          )}
        </div>

        {/* Browser Instructions */}
        {status === 'denied' && (
          <div className="mt-6 text-left text-sm text-gray-400 bg-gray-800 rounded p-4">
            <p className="font-semibold mb-2">How to enable permissions:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>
                <strong>Chrome:</strong> Click the camera icon in the address bar
              </li>
              <li>
                <strong>Firefox:</strong> Click the camera icon in the address bar
              </li>
              <li>
                <strong>Safari:</strong> Go to Safari Settings Privacy Camera/Microphone
              </li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
