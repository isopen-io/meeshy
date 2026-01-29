import React from 'react';
import { motion } from 'framer-motion';
import { useAnimationConfig } from '@/hooks/composer/useAnimationConfig';
import styles from './ToolbarButtons.module.css';

interface ToolbarButtonsProps {
  onMicClick: () => void;
  onAttachmentClick: () => void;
  disabled?: boolean;
  className?: string;
}

export const ToolbarButtons: React.FC<ToolbarButtonsProps> = ({
  onMicClick,
  onAttachmentClick,
  disabled = false,
  className = '',
}) => {
  const config = useAnimationConfig();

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: config.staggerDelay,
        delayChildren: 0,
      },
    },
  };

  const buttonVariants = {
    hidden: {
      scale: 0,
      y: 10,
      opacity: 0,
    },
    visible: {
      scale: 1,
      y: 0,
      opacity: 1,
      transition: config.spring,
    },
    hover: !disabled
      ? {
          scale: 1.2,
          transition: {
            duration: 0.2,
          },
        }
      : {},
    tap: !disabled
      ? {
          scale: 0.85,
        }
      : {},
  };

  return (
    <motion.div
      className={`${styles.toolbarContainer} ${className}`}
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Mic Button */}
      <motion.button
        className={styles.toolbarButton}
        onClick={onMicClick}
        disabled={disabled}
        aria-label="Record voice message"
        variants={buttonVariants}
        whileHover="hover"
        whileTap="tap"
      >
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
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
      </motion.button>

      {/* Attachment Button */}
      <motion.button
        className={styles.toolbarButton}
        onClick={onAttachmentClick}
        disabled={disabled}
        aria-label="Attach file"
        variants={buttonVariants}
        whileHover="hover"
        whileTap="tap"
      >
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
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
        </svg>
      </motion.button>
    </motion.div>
  );
};
