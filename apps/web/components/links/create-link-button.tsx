'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Link2 } from 'lucide-react';
import { CreateLinkModalV2 as CreateLinkModal } from '@/components/conversations/create-link-modal';
import { toast } from 'sonner';

interface CreateLinkButtonProps {
  onLinkCreated?: () => void;
  variant?: 'default' | 'outline' | 'ghost' | 'secondary' | 'destructive';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
  children?: React.ReactNode;
}

export function CreateLinkButton({
  onLinkCreated,
  variant = 'default',
  size = 'default',
  className,
  children
}: CreateLinkButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleLinkCreated = () => {
    setIsModalOpen(false);
    onLinkCreated?.();
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={() => setIsModalOpen(true)}
        className={className}
      >
        {children || (
          <>
            <Link2 className="h-4 w-4 mr-2" />
            Créer un lien
          </>
        )}
      </Button>

      <CreateLinkModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onLinkCreated={handleLinkCreated}
      />
    </>
  );
}
