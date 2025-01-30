const SmeeClient = require('smee-client');
const config = require('config');
const { slack, cache } = require('../../helpers');

// Generate random 16 character string with only letters and numbers
const generateChannelId = () => {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 16; i += 1) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const connect = async smeeLogger => {
  if (config.get('smeeTunnel.enabled') !== true) {
    smeeLogger.info('Smee tunnel is disabled');
    await cache.hdel('trailing-trade-common', 'smee-tunnel-url');
    await cache.hdel('trailing-trade-common', 'smee-tunnel-webhook-url');
    return false;
  }

  smeeLogger.info('Attempt connecting smee tunnel');

  // Check if we have an existing tunnel URL
  const existingSmeeUrl = await cache.hget(
    'trailing-trade-common',
    'smee-tunnel-url'
  );

  // Use existing URL or generate new one
  const smeeUrl = existingSmeeUrl || `https://smee.io/${generateChannelId()}`;

  // Generate smee channel URL with predefined route
  const defaultChannel = config.get('smeeTunnel.subdomain');
  const cachedWebhookURL = `https://smee.io/${defaultChannel}`;

  // Configure target URL
  const targetUrl = `http://localhost:${config.get('frontend.port')}/webhook`;

  const smee = new SmeeClient({
    source: smeeUrl,
    target: targetUrl,
    logger: smeeLogger
  });

  const events = smee.start();

  slack.sendMessage(
    `*Smee Tunnel URL:* ${smeeUrl}\n*Webhook URL:* ${smeeUrl}`,
    { symbol: 'global' }
  );

  smeeLogger.info({ url: smeeUrl }, 'Connected smee tunnel');

  await cache.hset('trailing-trade-common', 'smee-tunnel-url', smeeUrl);
  await cache.hset(
    'trailing-trade-common',
    'smee-tunnel-webhook-url',
    cachedWebhookURL
  );

  return events;
};

/**
 * Configure the local tunnel
 *
 * @param {*} serverLogger
 * @returns
 */
const configureSmeeTunnel = async serverLogger => {
  const logger = serverLogger.child({ server: 'smee-tunnel' });

  return connect(logger);
};

module.exports = { configureSmeeTunnel };
