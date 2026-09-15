import React from 'react';
import classNames from 'classnames';

/**
 * Reusable Button component that maps variants and sizes to CSS classes defined in index.css.
 *
 * Props:
 * - variant: 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'ghost' | 'outline'
 * - size: 'sm' | 'md' | 'lg'
 * - onClick: function handler
 * - disabled: boolean
 * - className: additional class names
 * - children: button label/content
 */
export const Button = ({
  variant = 'primary',
  size = 'md',
  onClick,
  disabled = false,
  className = '',
  children,
  ...rest
}) => {
  const btnClass = classNames(
    'btn',
    `btn-${variant}`,
    `btn-${size}`,
    className
  );
  return (
    <button className={btnClass} onClick={onClick} disabled={disabled} {...rest}>
      {children}
    </button>
  );
};

export default Button;
