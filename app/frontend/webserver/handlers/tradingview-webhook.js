const config = require('config');
const { mongo, cache, PubSub } = require('../../../helpers');

const handleTradingViewWebhook = async (funcLogger, app) => {
  const logger = funcLogger.child({
    method: 'POST',
    endpoint: '/webhook'
  });

  app.post('/webhook', async (req, res) => {
    logger.info({ body: req.body }, 'Received POST /webhook');

    // Validate passphrase
    const incomingPassphrase = req.body.passphrase;
    const expectedPassphrase = config.get('tradingView.passphrase');

    if (incomingPassphrase !== expectedPassphrase) {
      logger.warn('Invalid passphrase in webhook request');
      res.status(403).json({ success: false, message: 'Invalid passphrase' });
      return;
    }

    const alert = req.body;

    try {
      // Save alert to MongoDB
      await mongo.insertOne(logger, 'tradingview-alerts', {
        ...alert,
        receivedAt: new Date()
      });

      // Cache the latest alert
      await cache.hset(
        'tradingview',
        'latest-alert',
        JSON.stringify(alert),
        3600 // Cache for 1 hour
      );

      // Publish event for WebSocket notifications
      PubSub.publish('tradingview-alert', JSON.stringify(alert));

      res.status(200).json({ success: true, message: 'Alert received' });
    } catch (err) {
      logger.error({ err }, 'Failed to process webhook');
      res
        .status(500)
        .json({ success: false, message: 'Internal server error' });
    }
  });
};

module.exports = { handleTradingViewWebhook };
