const axios = require('axios');
const { supabase } = require('../lib/supabase');
const { logger } = require('../lib/logger');
const { decryptSecret } = require('../lib/crypto');

/**
 * Normaliza URLs para garantir o protocolo http/https
 */
function normalizeUrl(url) {
  if (!url) return '';
  const trimmed = url.trim();
  return trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`;
}

/**
 * Detecta se a resposta HTML/headers indica proteção Cloudflare ou CAPTCHA.
 */
function hasAntiBotChallenge(res) {
  const headers = res?.headers || {};
  if (headers['cf-mitigated']) return true;
  const body = typeof res?.data === 'string' ? res.data.toLowerCase() : '';
  return (
    body.includes('just a moment') ||
    body.includes('cf-turnstile') ||
    body.includes('g-recaptcha') ||
    body.includes('hcaptcha') ||
    body.includes('verify you are human')
  );
}

/**
 * Registro de drivers específicos para painéis já mapeados.
 * Cada driver recebe { clientHttp, sessionCookies, authToken, panelUser, panelPass, clientTarget, client, service }
 * e retorna { renewed: boolean, message?: string, error?: string }.
 */
const PANEL_DRIVERS = {};

function resolveDriverKey(panelUrl, serverName) {
  const haystack = `${panelUrl} ${serverName || ''}`.toLowerCase();
  for (const key of Object.keys(PANEL_DRIVERS)) {
    if (haystack.includes(key)) return key;
  }
  return null;
}

/**
 * Serviço de automação de renovação em painéis externos (Azonix Play, Warez, etc.).
 * Valida credenciais, checa proteção anti-bot/CAPTCHA e executa apenas se o driver
 * do painel estiver mapeado — nunca retorna falso positivo.
 */
async function renewClientInPanel({ userId, clientId, serverName }) {
  logger.info({ userId, clientId, serverName }, 'panelService: iniciando renovação no painel');

  // 1. Busca dados do cliente
  const { data: client, error: clientErr } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .single();

  if (clientErr || !client) {
    logger.warn({ clientId, error: clientErr }, 'panelService: cliente não encontrado');
    return { success: false, error: 'Cliente não encontrado no sistema.' };
  }

  // 2. Busca configuração do serviço/servidor
  const targetServer = serverName || client.server;
  const { data: services, error: srvErr } = await supabase
    .from('services')
    .select('*')
    .eq('server_name', targetServer);

  const service = services?.[0];

  if (srvErr || !service) {
    logger.warn({ targetServer, error: srvErr }, 'panelService: serviço/servidor não encontrado');
    return { success: false, error: `Configuração do servidor "${targetServer}" não encontrada.` };
  }

  const panelUrl = normalizeUrl(service.panel_url);
  const panelUser = (service.panel_username || '').trim();
  const panelPass = decryptSecret(service.panel_password);
  const clientPanelLogin = (client.panel_username || '').trim() || client.name;

  if (!panelUrl) {
    return {
      success: false,
      error: `O servidor "${targetServer}" não possui Link do Painel configurado. Configure em Serviços.`,
    };
  }

  if (!panelUser || !panelPass) {
    return {
      success: false,
      error: `Login e senha do painel "${targetServer}" não configurados. Preencha em Serviços.`,
    };
  }

  // 3. Conexão e verificação real no painel
  try {
    const clientHttp = axios.create({
      baseURL: panelUrl,
      timeout: 15000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/json, text/plain, */*',
      },
      validateStatus: () => true,
    });

    // Checa página inicial para detectar Cloudflare/CAPTCHA ou indisponibilidade
    const homeRes = await clientHttp.get('/');
    if (hasAntiBotChallenge(homeRes)) {
      return {
        success: false,
        error: `O painel "${targetServer}" possui proteção anti-bot/CAPTCHA (Cloudflare/reCAPTCHA). A renovação precisa ser feita manualmente acessando o painel.`,
      };
    }

    // Tenta autenticação
    const loginPayloads = [
      { username: panelUser, password: panelPass },
      { user: panelUser, pass: panelPass },
      { email: panelUser, password: panelPass },
    ];
    const loginEndpoints = ['/api/login', '/login', '/auth/login', '/admin/login'];

    let sessionCookies = '';
    let authToken = '';
    let loggedIn = false;

    for (const endpoint of loginEndpoints) {
      for (const payload of loginPayloads) {
        try {
          const loginRes = await clientHttp.post(endpoint, payload);
          if (hasAntiBotChallenge(loginRes)) {
            return {
              success: false,
              error: `O login do painel "${targetServer}" está protegido por CAPTCHA/Cloudflare.`,
            };
          }
          const setCookie = loginRes.headers['set-cookie'];
          const token = loginRes.data?.token || loginRes.data?.access_token || loginRes.data?.jwt;

          if ((loginRes.status === 200 || loginRes.status === 302) && (setCookie || token)) {
            sessionCookies = Array.isArray(setCookie) ? setCookie.join('; ') : setCookie || '';
            authToken = token || '';
            loggedIn = true;
            break;
          }
        } catch {
          // Tenta próximo endpoint
        }
      }
      if (loggedIn) break;
    }

    // Verifica se existe driver mapeado para este painel
    const driverKey = resolveDriverKey(panelUrl, targetServer);
    if (!driverKey) {
      const reason = loggedIn
        ? `Autenticação no painel "${targetServer}" validada, mas as rotas internas de busca e renovação deste painel ainda não estão mapeadas para o usuário "${clientPanelLogin}".`
        : `Não foi possível autenticar ou mapear automaticamente as rotas do painel "${targetServer}". Acesse o painel manualmente pelo botão "Acessar Painel" ou envie os cURLs (Login, Busca e Renovar) do F12 para integrarmos este servidor.`;

      logger.warn({ targetServer, loggedIn, clientPanelLogin }, 'panelService: painel sem driver mapeado');
      return { success: false, error: reason };
    }

    if (!loggedIn) {
      return {
        success: false,
        error: `Falha ao autenticar no painel "${targetServer}". Verifique o login e a senha cadastrados em Serviços.`,
      };
    }

    // Executa driver específico do painel
    const driverResult = await PANEL_DRIVERS[driverKey]({
      clientHttp,
      sessionCookies,
      authToken,
      panelUser,
      panelPass,
      clientTarget: clientPanelLogin,
      client,
      service,
    });

    if (!driverResult?.renewed) {
      return {
        success: false,
        error: driverResult?.error || `O painel "${targetServer}" não confirmou a renovação de "${clientPanelLogin}".`,
      };
    }

    await supabase.from('notifications').insert({
      user_id: userId,
      type: 'panel_renewal',
      title: `Renovação de Painel - ${client.name}`,
      message: `Cliente "${clientPanelLogin}" renovado no painel ${targetServer} (${panelUrl}).`,
      client_id: client.id,
      read: false,
      created_at: new Date().toISOString(),
    });

    return {
      success: true,
      message: driverResult.message || `Cliente "${clientPanelLogin}" renovado com sucesso no painel ${targetServer}!`,
      panelUrl,
      clientName: client.name,
    };
  } catch (err) {
    logger.error({ err: err.message, targetServer }, 'panelService: falha ao comunicar com painel');
    return {
      success: false,
      error: `Erro ao conectar com painel (${targetServer}): ${err.message}`,
    };
  }
}

module.exports = {
  renewClientInPanel,
};
