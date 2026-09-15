// Security utilities shared across service modules.
// Currently provides a simple role‑based guard.

/**
 * Ensures that the supplied `actorRole` is `admin`.
 * Throws an error otherwise.
 */
export const assertAdmin = (actorRole) => {
  if (actorRole !== 'admin') {
    throw new Error('صلاحية غير كافية: يتطلب الإجراء دور المسؤول (admin)');
  }
};
