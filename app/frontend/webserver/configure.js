const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');
const config = require('config');
const { PubSub, cache, mongo } = require('../../helpers');

const { setHandlers } = require('./handlers');

const configureJWTToken = async () => {
  let jwtSecret = await cache.get('auth-jwt-secret');

  if (jwtSecret === null) {
    jwtSecret = uuidv4();
    await cache.set('auth-jwt-secret', jwtSecret);
  }

  return jwtSecret;
};

const configureWebServer = async (app, funcLogger, { loginLimiter }) => {
  const logger = funcLogger.child({ server: 'webserver' });

  // Firstly get(or set) JWT secret
  await configureJWTToken();

  // Handle POST requests to /webhook
  app.post('/webhook', async (req, res) => {
    const requestId = uuidv4();
    const requestLogger = logger.child({ route: '/webhook', requestId });

    requestLogger.info({ body: req.body }, 'Received POST /webhook');

    // Validate passphrase
    const incomingPassphrase = req.body.passphrase;
    const expectedPassphrase = config.get('tradingView.passphrase'); // Define this in your config

    if (incomingPassphrase !== expectedPassphrase) {
      requestLogger.warn('Invalid passphrase in webhook request');
      return res
        .status(403)
        .json({ success: false, message: 'Invalid passphrase' });
    }

    // Process the alert
    const alert = req.body;

    // Save alert to MongoDB
    await mongo.insertOne(requestLogger, 'tradingview-alerts', {
    ...alert,
      receivedAt: new Date()
    });

    // Cache the latest alert in Redis
    await cache.hset(
      'tradingview',
      'latest-alert',
      JSON.stringify(alert),
      3600 // Cache for 1 hour
    );

    // Publish an event to notify the frontend
    PubSub.publish('tradingview-alert', alert);

    // Send response back to TradingView
    res.status(200).json({ success: true, message: 'Alert received' });
  });

  const wss = new WebSocket.Server({ noServer: true });

  PubSub.subscribe('tradingview-alert', (message, data) => {
    logger.info({ data }, 'Publishing tradingview-alert to frontend');

    // Use data directly without fetching from cache
    const latestAlert = data;

    // Broadcast to all connected clients
    wss.clients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'tradingview-alert',
            data: latestAlert
          })
        );
      }
    });
  });

  await setHandlers(logger, app, { loginLimiter });
};

module.exports = { configureWebServer };
