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
 * Removes non-digits, adds country code 55 if missing.
 * @param {string} phone
 * @returns {string}
 */
function formatPhone(phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  return `55${digits}`;
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
