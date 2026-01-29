// apps/web/components/common/message-composer/SendButton.tsx
'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAnimationConfig } from '@/hooks/composer/useAnimationConfig';
import styles from './SendButton.module.css';

interface SendButtonProps {
  onClick: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  className?: string;
  'aria-label'?: string;
}

export const SendButton: React.FC<SendButtonProps> = ({
  onClick,
  disabled = false,
  isLoading = false,
  className = '',
  'aria-label': ariaLabel = 'Send message',
}) => {
  const config = useAnimationConfig();

  const buttonVariants = {
    hidden: {
      scale: 0,
      rotate: config.enableRotation ? 15 : 0,
      opacity: 0,
    },
    visible: {
      scale: config.enableRotation ? [0, 1.15, 1] : [0, 1],
      rotate: config.enableRotation ? [15, -3, 0] : 0,
      opacity: 1,
      transition: {
        duration: config.duration,
        times: config.enableRotation ? [0, 0.6, 1] : [0, 1],
        ease: [0.34, 1.56, 0.64, 1],
      },
    },
    exit: {
      scale: 0,
      rotate: config.enableRotation ? -15 : 0,
      opacity: 0,
      transition: {
        duration: config.duration * 0.5,
      },
    },
    hover: !disabled && !isLoading ? {
      scale: 1.05,
      rotate: 0,
      transition: {
        duration: 0.2,
      },
    } : {},
    tap: !disabled && !isLoading ? {
      scale: 0.95,
      rotate: 0,
    } : {},
  };

  const handleClick = () => {
    if (!disabled && !isLoading) {
      onClick();
    }
  };

  return (
    <AnimatePresence mode="wait">
      <motion.button
        className={`${styles.sendButton} ${className}`}
        onClick={handleClick}
        disabled={disabled || isLoading}
        aria-label={ariaLabel}
        aria-busy={isLoading}
        variants={buttonVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        whileHover="hover"
        whileTap="tap"
      >
        {isLoading ? (
          <div className={styles.spinner} />
        ) : (
          <svg
            className={styles.icon}
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        )}
      </motion.button>
    </AnimatePresence>
  );
};
