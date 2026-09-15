import React from 'react';
import classNames from 'classnames';

/**
 * Simple Card component that applies glass-card styling.
 * Children are rendered inside the card container.
 */
export const Card = ({ className = '', children, ...rest }) => {
  const classes = classNames('glass-card', className);
  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
};

export default Card;
