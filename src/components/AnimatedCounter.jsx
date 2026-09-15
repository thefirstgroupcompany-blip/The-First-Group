import React, { useState, useEffect, useRef } from 'react';

/**
 * AnimatedCounter - Ultra-smooth rolling number ticker
 * Uses requestAnimationFrame with cubic-out easing for Swiss-bank grade smoothness.
 */
export default function AnimatedCounter({
  value = 0,
  duration = 650,
  formatter = null,
  prefix = '',
  suffix = '',
  className = '',
  style = {}
}) {
  const numValue = Number(value) || 0;
  const [displayValue, setDisplayValue] = useState(numValue);
  const prevValueRef = useRef(numValue);
  const animRef = useRef(null);

  useEffect(() => {
    const startVal = prevValueRef.current;
    const endVal = numValue;
    prevValueRef.current = endVal;

    if (startVal === endVal) {
      setDisplayValue(endVal);
      return;
    }

    const startTime = performance.now();

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(1, elapsed / duration);
      // Cubic-out easing: fast start, soft deceleration
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(startVal + (endVal - startVal) * ease);

      setDisplayValue(current);

      if (progress < 1) {
        animRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayValue(endVal);
      }
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [numValue, duration]);

  const formatted = formatter ? formatter(displayValue) : displayValue.toLocaleString('ar-EG-u-nu-latn');

  return (
    <span
      className={`tabular-nums ${className}`}
      style={{
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: '-0.02em',
        display: 'inline-block',
        ...style
      }}
    >
      {prefix}{formatted}{suffix}
    </span>
  );
}
