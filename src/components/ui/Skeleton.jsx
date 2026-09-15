import React from 'react';

/**
 * Basic Skeleton Shimmer Box
 */
export const Skeleton = ({
  width = '100%',
  height = 20,
  borderRadius = 10,
  className = '',
  style = {}
}) => (
  <div
    className={`skeleton-shimmer ${className}`}
    style={{
      width,
      height,
      borderRadius,
      ...style
    }}
  />
);

/**
 * Skeleton Table Loader with customizable rows and columns
 */
export const SkeletonTable = ({ rows = 5, cols = 4, className = '' }) => (
  <div className={`flex flex-col gap-3 w-full ${className}`} style={{ padding: '8px 0' }}>
    {/* Table Header Simulation */}
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 14, padding: '10px 14px' }}>
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton key={`h-${i}`} height={16} width={i === 0 ? '60%' : '80%'} borderRadius={6} />
      ))}
    </div>

    {/* Table Rows Simulation */}
    {Array.from({ length: rows }).map((_, r) => (
      <div
        key={`row-${r}`}
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: 14,
          padding: '14px 14px',
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          borderRadius: 14
        }}
      >
        {Array.from({ length: cols }).map((_, c) => (
          <Skeleton
            key={`cell-${r}-${c}`}
            height={18}
            width={c === 0 ? '75%' : (c === cols - 1 ? '45%' : '90%')}
            borderRadius={8}
          />
        ))}
      </div>
    ))}
  </div>
);

/**
 * Skeleton Stats Grid Loader (for top KPI cards)
 */
export const SkeletonStats = ({ count = 4 }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, width: '100%' }}>
    {Array.from({ length: count }).map((_, i) => (
      <div
        key={`stat-sk-${i}`}
        className="dark-card"
        style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Skeleton width="50%" height={16} borderRadius={6} />
          <Skeleton width={32} height={32} borderRadius={10} />
        </div>
        <Skeleton width="70%" height={32} borderRadius={8} />
        <Skeleton width="40%" height={14} borderRadius={4} />
      </div>
    ))}
  </div>
);

/**
 * Skeleton Card Loader
 */
export const SkeletonCard = ({ height = 180, className = '' }) => (
  <div
    className={`dark-card ${className}`}
    style={{ height, display: 'flex', flexDirection: 'column', gap: 14, padding: 22 }}
  >
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <Skeleton width="40%" height={22} borderRadius={8} />
      <Skeleton width="20%" height={18} borderRadius={6} />
    </div>
    <Skeleton width="90%" height={16} borderRadius={6} />
    <Skeleton width="65%" height={16} borderRadius={6} />
    <div style={{ marginTop: 'auto', display: 'flex', gap: 10 }}>
      <Skeleton width="30%" height={32} borderRadius={10} />
      <Skeleton width="30%" height={32} borderRadius={10} />
    </div>
  </div>
);
