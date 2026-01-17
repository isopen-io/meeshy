/**
 * Types partagés pour le système de carousel d'attachments
 */

export interface AttachmentCarouselProps {
  files: File[];
  onRemove: (index: number) => void;
  uploadProgress?: { [key: number]: number };
  disabled?: boolean;
  audioRecorderSlot?: React.ReactNode;
}

export interface FilePreviewProps {
  file: File;
  index: number;
  uploadProgress?: number;
  disabled?: boolean;
  onRemove: (index: number) => void;
  onOpenLightbox: (file: File, type: 'image' | 'video' | 'pdf' | 'text' | 'pptx' | 'markdown') => void;
  thumbnailUrl?: string;
  fileUrl?: string;
  isGeneratingThumbnail: boolean;
}

export interface AudioFilePreviewProps {
  file: File;
  extension: string;
  isUploading: boolean;
  isUploaded: boolean;
  progress: number | undefined;
}

export interface LightboxState {
  imageLightboxIndex: number;
  videoLightboxIndex: number;
  pdfLightboxFile: File | null;
  textLightboxFile: File | null;
  pptxLightboxFile: File | null;
  markdownLightboxFile: File | null;
}
