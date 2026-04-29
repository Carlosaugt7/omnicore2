const axios = require('axios');

/**
 * Creates a pre-configured axios instance for the Evolution API.
 * @param {string} evolutionUrl - Base URL of the Evolution API
 * @param {string} evolutionApiKey - API key for authentication
 */
function createEvolutionClient(evolutionUrl, evolutionApiKey) {
  return axios.create({
    baseURL: evolutionUrl.replace(/\/$/, ''), // strip trailing slash
    headers: {
      apikey: evolutionApiKey,
      'Content-Type': 'application/json',
    },
    timeout: 15000,
  });
}

/**
 * Formats a phone number to the Evolution API standard (55XXXXXXXXXXX).
 * Handles Brazilian JID rules: DDDs > 28 do not include the leading 9 in the JID.
 * @param {string} phone
 * @returns {string}
 */
function formatPhone(phone) {
  let digits = phone.replace(/\D/g, '');
  
  // Add 55 if missing
  if (!digits.startsWith('55') && (digits.length === 10 || digits.length === 11)) {
    digits = `55${digits}`;
  }

  // Handle Brazilian numbers (start with 55 and have 12 or 13 digits)
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    const ddd = parseInt(digits.substring(2, 4));
    const number = digits.substring(4);

    // If it has 9 digits and the DDD is > 28, the leading 9 should be stripped for the JID
    if (number.length === 9 && ddd > 28) {
      return `55${ddd}${number.substring(1)}`;
    }
  }

  return digits;
}

/**
 * Extracts the base64 QR code from an Evolution API connect response.
 * @param {object} data - Response data from /instance/connect
 * @returns {string|null}
 */
function extractQrCode(data) {
  return (
    data?.qrcode?.base64 ||
    data?.base64 ||
    data?.qr?.base64 ||
    null
  );
}

module.exports = { createEvolutionClient, formatPhone, extractQrCode };
