// Razorpay Checkout helper
// Uses Razorpay's Standard Checkout (client-side order creation for demo).
// For production, move order creation to a Firebase Cloud Function.

const RAZORPAY_KEY_ID = import.meta.env.VITE_RAZORPAY_KEY_ID || 'rzp_test_1DP5mmOlF5G5ag';

/**
 * Load Razorpay Checkout script dynamically
 * @returns {Promise<boolean>}
 */
export function loadRazorpayScript() {
  if (window.Razorpay) return Promise.resolve(true);

  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

/**
 * Create a Razorpay order via client-side API call
 * NOTE: In production, this should be done server-side (Cloud Function)
 * to protect the Key Secret.
 */
async function createOrder(amount, currency = 'INR', receipt = '') {
  const keySecret = import.meta.env.VITE_RAZORPAY_KEY_SECRET || '';

  // If no secret configured, use a demo order approach
  if (!keySecret) {
    return { id: `order_demo_${Date.now()}`, amount, currency };
  }

  const response = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${btoa(`${RAZORPAY_KEY_ID}:${keySecret}`)}`,
    },
    body: JSON.stringify({
      amount: amount * 100, // Razorpay expects paise
      currency,
      receipt: receipt || `rcpt_${Date.now()}`,
      payment_capture: 1,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.description || 'Failed to create order');
  }

  return response.json();
}

/**
 * Open Razorpay Checkout modal
 * @param {object} options
 * @param {number} options.amount - amount in INR
 * @param {string} options.orderId - Razorpay order ID
 * @param {string} options.name - customer name
 * @param {string} options.description - payment description
 * @param {function} options.onSuccess - called with payment details
 * @param {function} options.onFailure - called with error
 * @returns {Promise<void>}
 */
export async function openRazorpayCheckout({ amount, orderId, name = '', description = 'Print Payment', onSuccess, onFailure }) {
  const loaded = await loadRazorpayScript();
  if (!loaded) {
    onFailure?.({ error: 'Failed to load Razorpay. Check your connection.' });
    return;
  }

  const options = {
    key: RAZORPAY_KEY_ID,
    amount: amount * 100,
    currency: 'INR',
    name: 'QR Print System',
    description,
  };

  // Only pass a real order id. In test mode (no key secret configured)
  // we use a demo order id which Razorpay rejects - so omit it.
  if (orderId && !orderId.startsWith('order_demo_')) {
    options.order_id = orderId;
  }

  Object.assign(options, {
    handler: function (response) {
      onSuccess?.({
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_order_id: response.razorpay_order_id,
        razorpay_signature: response.razorpay_signature,
      });
    },
    prefill: {
      name: name || '',
    },
    theme: {
      color: '#2563eb',
    },
    modal: {
      ondismiss: function () {
        onFailure?.({ error: 'Payment cancelled by user.' });
      },
    },
  });

  const rzp = new window.Razorpay(options);
  rzp.open();
}

/**
 * Process a print payment through Razorpay
 * @param {object} params
 * @param {number} params.amount
 * @param {string} params.customerName
 * @param {string} params.orderId
 */
export async function processPayment({ amount, customerName = '', orderId = '' }) {
  let rzOrder = null;
  try {
    rzOrder = await createOrder(amount, 'INR', orderId);
  } catch (err) {
    throw new Error(err?.message || 'Could not create payment order.');
  }

  return new Promise((resolve, reject) => {
    openRazorpayCheckout({
      amount,
      orderId: rzOrder.id,
      name: customerName,
      onSuccess: (payment) => resolve({ order: rzOrder, payment }),
      onFailure: (err) => reject(new Error(err?.error || 'Payment failed.')),
    });
  });
}
