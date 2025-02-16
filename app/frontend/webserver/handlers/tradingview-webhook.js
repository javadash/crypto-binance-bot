const config = require('config');
const { mongo, cache, PubSub } = require('../../../helpers');
const { buildAutomaticTradePayload } = require('./tradingview-payload-build');

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

    //TODO
    const expectedPassphrase = 'LlbqS6wEVlCOza8Z47UKRz83ZaGiiQD9';

    if (incomingPassphrase !== expectedPassphrase) {
      logger.warn('Invalid passphrase in webhook request');
      res.status(403).json({ success: false, message: 'Invalid passphrase' });
      return;
    }

    const {
      exchange = null,
      ticker = null,
      bar = null,
      strategy = null,
      side = null
    } = req.body;

    const alert = { exchange, ticker, bar, strategy, side };

    const tradePayload = await buildAutomaticTradePayload(logger, alert);
    console.log(tradePayload);

    try {
      // Save alert to MongoDB
      await mongo.insertOne(logger, 'tradingview-alerts', {
        ...alert,
        receivedAt: new Date()
      });

      // Cache the latest alert
      await cache.hset('tradingview', 'latest-alert', JSON.stringify(alert));

      const notification = {
        type: alert.side.toLowerCase(),
        title: `${alert.side} signal for ${alert.ticker} at ${alert.bar.close}`
      };

      logger.info(
        { notification: JSON.stringify(notification) },
        'Publishing notification'
      );

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
