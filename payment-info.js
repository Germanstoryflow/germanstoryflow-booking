// netlify/functions/payment-info.js
// Delivers bank details and PayPal link securely from environment variables

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      iban: process.env.BANK_IBAN || '',
      bankName: process.env.BANK_ACCOUNT_HOLDER || '',
      paypalMe: process.env.PAYPAL_ME || '',
    })
  };
};
