/**
 * ============================================
 *  SHOP BRANDING - YAHAN APNI DETAILS BHARO
 * ============================================
 * 1. Shop ka naam badlo
 * 2. Logo badalne ke liye: apni logo file ko
 *    `public/logo.png` naam se replace karo
 *    (ya public/logo.svg)
 */

export const BRAND = {
  shopName: 'Smart Print Center',        // <-- APNI SHOP KA NAAM
  tagline: 'Scan • Upload • Print',      // <-- chhoti line
  logo: '/logo.svg',                     // <-- logo file (public folder mein)
  upiNumber: '',                         // <-- future: UPI/phone (optional)
};

/** Page title bhi brand se set hota hai */
export function applyBrandTitle(page = '') {
  document.title = page ? `${page} | ${BRAND.shopName}` : BRAND.shopName;
}
