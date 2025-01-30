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

    //const expectedPassphrase = config.get('tradingView.passphrase');

    const expectedPassphrase = 'LlbqS6wEVlCOza8Z47UKRz83ZaGiiQD9';

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

      const notification = {
        type: alert.title.toLowerCase(),
        title: `${alert.title} signal for ${alert.ticker} at ${alert.bar.close}`
      };

      logger.info(
        { notification: JSON.stringify(notification) },
        'Publishing notification'
      );

      // Publish event for WebSocket notifications
      PubSub.publish('frontend-notification', notification);

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
