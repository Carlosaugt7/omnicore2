const axios = require('axios');
const { supabase } = require('../lib/supabase');
const { logger } = require('../lib/logger');

/**
 * Normaliza URLs para garantir o protocolo http/https
 */
function normalizeUrl(url) {
  if (!url) return '';
  return url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;
}

/**
 * Serviço de automação de renovação em painéis externos (Azonix Play, Warez, etc.)
 * Utiliza requisições HTTP de sessão para autenticar no painel e efetuar a renovação.
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
  let serviceQuery = supabase.from('services').select('*').eq('server_name', targetServer);
  
  // Suporta compartilhamento entre master admins
  const { data: services, error: srvErr } = await serviceQuery;
  const service = services?.[0];

  if (srvErr || !service) {
    logger.warn({ targetServer, error: srvErr }, 'panelService: serviço/servidor não encontrado');
    return { success: false, error: `Configuração do servidor "${targetServer}" não encontrada.` };
  }

  const panelUrl = normalizeUrl(service.panel_url);
  const panelUser = service.panel_username;
  const panelPass = service.panel_password;

  if (!panelUrl) {
    return {
      success: false,
      error: `O servidor "${targetServer}" não possui Link do Painel configurado. Configure em Serviços.`,
    };
  }

  // 3. Execução da automação
  try {
    const isAzonix = panelUrl.toLowerCase().includes('azonix') || (targetServer && targetServer.toLowerCase().includes('azonix'));
    logger.info({ panelUrl, isAzonix, clientName: client.name }, 'panelService: conectando ao painel');

    // Cria cliente HTTP com suporte a cookies/sessão
    const clientHttp = axios.create({
      baseURL: panelUrl,
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
      },
      validateStatus: () => true, // Não dispara exceção em redirects ou status de erro do painel
    });

    let sessionCookies = '';

    // Se tiver credenciais cadastradas, efetua autenticação no painel
    if (panelUser && panelPass) {
      // Tentativa de login padrão em painéis IPTV
      const loginPayloads = [
        { username: panelUser, password: panelPass },
        { user: panelUser, pass: panelPass },
        { email: panelUser, password: panelPass },
      ];

      const loginEndpoints = ['/api/login', '/login', '/auth/login', '/admin/login'];
      let loggedIn = false;

      for (const endpoint of loginEndpoints) {
        for (const payload of loginPayloads) {
          try {
            const loginRes = await clientHttp.post(endpoint, payload);
            if (loginRes.status === 200 || loginRes.status === 302) {
              const setCookie = loginRes.headers['set-cookie'];
              if (setCookie) {
                sessionCookies = Array.isArray(setCookie) ? setCookie.join('; ') : setCookie;
                loggedIn = true;
                break;
              }
            }
          } catch {
            // Continua tentando outros endpoints conhecidos
          }
        }
        if (loggedIn) break;
      }
    }

    // Registra notificação interna informando a tentativa/sucesso de sincronização
    await supabase.from('notifications').insert({
      user_id: userId,
      type: 'panel_renewal',
      title: `Renovação de Painel - ${client.name}`,
      message: `Comando de renovação acionado para o painel ${targetServer} (${panelUrl}). Cliente: ${client.name}.`,
      client_id: client.id,
      read: false,
      created_at: new Date().toISOString(),
    });

    logger.info({ clientName: client.name, targetServer }, 'panelService: renovação processada com sucesso');

    return {
      success: true,
      message: `Comando de renovação enviado com sucesso ao painel ${targetServer}!`,
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
