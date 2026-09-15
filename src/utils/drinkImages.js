/**
 * Helper utility to resolve drink product badges and images.
 * Maps both explicit item.imageUrl and smart keyword matching.
 */
export const getDrinkImage = (item) => {
  if (item?.imageUrl) return item.imageUrl;
  const name = String(item?.name || '').trim().toLowerCase();

  if (name.includes('بيبسي') || name.includes('pepsi')) return '/drinks/pepsi.png';
  if (name.includes('سفن') || name.includes('7up') || name.includes('seven')) return '/drinks/sevenup.png';
  if (name.includes('ميرندا') || name.includes('mirinda')) return '/drinks/mirinda.png';
  if (name.includes('مياه') || name.includes('ماء') || name.includes('water') || name.includes('معدنية')) return '/drinks/water.png';
  if (name.includes('ستينج') || name.includes('sting')) return '/drinks/sting.png';
  if (name.includes('ريدبول') || name.includes('ريد بول') || name.includes('red bull') || name.includes('redbull')) return '/drinks/redbull.png';
  if (name.includes('تويست') || name.includes('twist')) return '/drinks/twist.png';

  return null;
};

export const getDrinkFallbackEmoji = (item) => {
  const name = String(item?.name || '').trim().toLowerCase();
  const cat = String(item?.category || '').trim().toLowerCase();

  if (name.includes('شاي') || cat.includes('شاي')) return '🍵';
  if (name.includes('عصير') || cat.includes('عصير')) return '🧃';
  if (name.includes('سناك') || name.includes('شيبس') || name.includes('بسكويت') || cat.includes('سناكس')) return '🍪';
  return '☕';
};
