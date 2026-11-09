// Pricing logic for print orders

export const RATES = {
  BW_PER_PAGE: 10,
  COLOR_PER_PAGE: 15,
  COLOR_DISCOUNT_THRESHOLD: 5, // 5+ pages gets discount
  COLOR_DISCOUNTED_RATE: 10,   // discounted color rate
};

export const ID_CARD_RATE = 20; // fixed rate for ID card layout

/**
 * Calculate pricing based on print settings
 * @param {object} settings
 * @param {number} settings.totalPages - total pages to print
 * @param {number} settings.copies - number of copies
 * @param {string} settings.pageColor - 'bw' | 'color'
 * @param {string} settings.layoutMode - 'full_page' | 'id_card'
 * @returns {{ ratePerPage: number, totalPages: number, totalAmount: number }}
 */
export function calculatePrice({ totalPages, copies, pageColor, layoutMode }) {
  const pages = Math.max(1, totalPages || 1);
  const copyCount = Math.max(1, copies || 1);

  let ratePerPage;

  if (layoutMode === 'id_card') {
    ratePerPage = ID_CARD_RATE;
  } else if (pageColor === 'color') {
    const totalPrints = pages * copyCount;
    ratePerPage = totalPrints >= RATES.COLOR_DISCOUNT_THRESHOLD
      ? RATES.COLOR_DISCOUNTED_RATE
      : RATES.COLOR_PER_PAGE;
  } else {
    ratePerPage = RATES.BW_PER_PAGE;
  }

  const totalPagesToPrint = pages * copyCount;
  const totalAmount = totalPagesToPrint * ratePerPage;

  return { ratePerPage, totalPages: totalPagesToPrint, totalAmount };
}

/**
 * Format price in INR
 */
export function formatINR(amount) {
  return `₹${amount}`;
}
