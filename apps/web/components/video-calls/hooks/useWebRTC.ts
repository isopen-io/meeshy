/**
 * USE WEBRTC HOOK
 * Enhanced WebRTC logic with mobile optimizations
 */

'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import { WebRTCService } from '@/services/webrtc-service';
import { logger } from '@/utils/logger';
import { toast } from 'sonner';

export interface UseWebRTCOptions {
  onError?: (error: Error) => void;
}

export function useWebRTC(options: UseWebRTCOptions = {}) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const webrtcServiceRef = useRef<WebRTCService | null>(null);

  /**
   * Check browser compatibility
   */
  const checkBrowserSupport = useCallback((): boolean => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const err = new Error('Your browser does not support video calls. Please use a modern browser like Chrome, Firefox, or Safari.');
      setError(err);
      options.onError?.(err);
      return false;
    }

    if (!window.RTCPeerConnection) {
      const err = new Error('WebRTC is not supported in your browser.');
      setError(err);
      options.onError?.(err);
      return false;
    }

    // Check for HTTPS (required for getUserMedia)
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
      const err = new Error('Video calls require a secure connection (HTTPS).');
      setError(err);
      options.onError?.(err);
      return false;
    }

    return true;
  }, [options]);

  /**
   * Get local media stream
   */
  const getLocalStream = useCallback(async (constraints?: MediaStreamConstraints) => {
    if (!checkBrowserSupport()) {
      throw new Error('Browser not supported');
    }

    setIsInitializing(true);
    setError(null);

    try {
      const service = new WebRTCService();
      webrtcServiceRef.current = service;

      const stream = await service.getLocalStream(constraints);
      setLocalStream(stream);

      logger.info('[useWebRTC]', 'Local stream obtained successfully');
      return stream;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to get media stream');
      setError(error);
      options.onError?.(error);
      throw error;
    } finally {
      setIsInitializing(false);
    }
  }, [checkBrowserSupport, options]);

  /**
   * Switch camera (mobile)
   */
  const switchCamera = useCallback(async () => {
    if (!localStream) {
      throw new Error('No local stream available');
    }

    try {
      const videoTrack = localStream.getVideoTracks()[0];
      if (!videoTrack) {
        throw new Error('No video track found');
      }

      const constraints = videoTrack.getConstraints();
      const currentFacingMode = (constraints as any).facingMode || 'user';
      const newFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';

      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: newFacingMode },
        audio: false,
      });

      const newVideoTrack = newStream.getVideoTracks()[0];

      // Stop old track
      videoTrack.stop();
      localStream.removeTrack(videoTrack);
      localStream.addTrack(newVideoTrack);

      logger.info('[useWebRTC]', 'Camera switched successfully', { facingMode: newFacingMode });
      return newVideoTrack;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to switch camera');
      logger.error('[useWebRTC]', 'Camera switch failed', { error });
      options.onError?.(error);
      throw error;
    }
  }, [localStream, options]);

  /**
   * Toggle audio track
   */
  const toggleAudio = useCallback((enabled: boolean) => {
    if (!localStream) return;

    localStream.getAudioTracks().forEach(track => {
      track.enabled = enabled;
    });

    logger.debug('[useWebRTC]', 'Audio toggled', { enabled });
  }, [localStream]);

  /**
   * Toggle video track
   */
  const toggleVideo = useCallback((enabled: boolean) => {
    if (!localStream) return;

    localStream.getVideoTracks().forEach(track => {
      track.enabled = enabled;
    });

    logger.debug('[useWebRTC]', 'Video toggled', { enabled });
  }, [localStream]);

  /**
   * Stop local stream
   */
  const stopLocalStream = useCallback(() => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
      logger.info('[useWebRTC]', 'Local stream stopped');
    }
  }, [localStream]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      stopLocalStream();
      webrtcServiceRef.current?.close();
    };
  }, [stopLocalStream]);

  return {
    localStream,
    isInitializing,
    error,
    checkBrowserSupport,
    getLocalStream,
    switchCamera,
    toggleAudio,
    toggleVideo,
    stopLocalStream,
  };
}
