const https = require('https');

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
const BASE_URL = 'api.paystack.co';

// Generic Paystack HTTPS request
const paystackRequest = (method, path, body = null) => {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: BASE_URL,
      port: 443,
      path,
      method,
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error('Failed to parse Paystack response'));
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
};

/**
 * Initialize a Paystack transaction
 * @returns { authorization_url, access_code, reference }
 */
exports.initializePayment = async ({ email, amount, reference, metadata = {}, callbackUrl }) => {
  const body = {
    email,
    amount: Math.round(amount * 100), // Paystack uses kobo (smallest unit)
    reference,
    metadata,
    callback_url: callbackUrl || `${process.env.CLIENT_URL}/payment/verify`,
    channels: ['card', 'bank', 'ussd', 'bank_transfer'],
  };

  const response = await paystackRequest('POST', '/transaction/initialize', body);

  if (!response.status) {
    throw new Error(response.message || 'Paystack initialization failed');
  }

  return response.data; // { authorization_url, access_code, reference }
};

/**
 * Verify a Paystack transaction by reference
 * @returns transaction data
 */
exports.verifyPayment = async (reference) => {
  const response = await paystackRequest('GET', `/transaction/verify/${reference}`);

  if (!response.status) {
    throw new Error(response.message || 'Payment verification failed');
  }

  return response.data;
};

/**
 * Generate a unique Paystack reference
 */
exports.generateReference = (prefix = 'FSP') => {
  const timestamp = Date.now().toString();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
};
