/* eslint-disable global-require */
describe('tradingview-webhook.js', () => {
  let mockConfig;
  let mockMongo;
  let mockCache;
  let mockPubSub;
  let mockApp;
  let mockLogger;

  beforeEach(() => {
    jest.clearAllMocks().resetModules();

    // Mock config
    mockConfig = {
      get: jest.fn(key => {
        if (key === 'tradingView.passphrase') {
          return 'valid-passphrase';
        }
        return null;
      })
    };

    // Mock mongo
    mockMongo = {
      insertOne: jest.fn().mockResolvedValue(true)
    };

    // Mock cache
    mockCache = {
      hset: jest.fn().mockResolvedValue(true)
    };

    // Mock PubSub
    mockPubSub = {
      publish: jest.fn().mockReturnValue(true)
    };

    // Mock Express app
    mockApp = {
      post: jest.fn().mockImplementation((path, handler) => {
        this.handler = handler;
        return mockApp;
      })
    };

    // Mock logger
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      child: jest.fn().mockReturnValue({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      })
    };

    // Mock modules
    jest.mock('config', () => mockConfig);
    jest.mock('../../../helpers', () => ({
      mongo: mockMongo,
      cache: mockCache,
      PubSub: mockPubSub
    }));
  });

  describe('handleTradingViewWebhook', () => {
    let handleTradingViewWebhook;

    beforeEach(async () => {
      const { handleTradingViewWebhook: handle } = require('../tradingview-webhook');
      handleTradingViewWebhook = handle;

      await handleTradingViewWebhook(mockLogger, mockApp);
    });

    it('initializes router with expected endpoint', () => {
      expect(mockApp.post).toHaveBeenCalledWith(
        '/webhook',
        expect.any(Function)
      );
    });

    describe('POST /webhook', () => {
      let mockReq;
      let mockRes;

      beforeEach(() => {
        mockReq = {
          body: {
            passphrase: 'valid-passphrase',
            someData: 'test-data'
          }
        };

        mockRes = {
          status: jest.fn().mockReturnThis(),
          json: jest.fn().mockReturnThis()
        };
      });

      it('handles valid webhook request', async () => {
        await mockApp.handler(mockReq, mockRes);

        expect(mockLogger.child).toHaveBeenCalledWith({
          method: 'POST',
          endpoint: '/webhook'
        });

        expect(mockMongo.insertOne).toHaveBeenCalledWith(
          expect.any(Object),
          'tradingview-alerts',
          expect.objectContaining({
            passphrase: 'valid-passphrase',
            someData: 'test-data',
            receivedAt: expect.any(Date)
          })
        );

        expect(mockCache.hset).toHaveBeenCalledWith(
          'tradingview',
          'latest-alert',
          JSON.stringify(mockReq.body),
          3600
        );

        expect(mockPubSub.publish).toHaveBeenCalledWith(
          'tradingview-alert',
          JSON.stringify(mockReq.body)
        );

        expect(mockRes.status).toHaveBeenCalledWith(200);
        expect(mockRes.json).toHaveBeenCalledWith({
          success: true,
          message: 'Alert received'
        });
      });

      it('rejects request with invalid passphrase', async () => {
        mockReq.body.passphrase = 'invalid-passphrase';

        await mockApp.handler(mockReq, mockRes);

        expect(mockLogger.child).toHaveBeenCalledWith({
          method: 'POST',
          endpoint: '/webhook'
        });

        expect(mockRes.status).toHaveBeenCalledWith(403);
        expect(mockRes.json).toHaveBeenCalledWith({
          success: false,
          message: 'Invalid passphrase'
        });

        expect(mockMongo.insertOne).not.toHaveBeenCalled();
        expect(mockCache.hset).not.toHaveBeenCalled();
        expect(mockPubSub.publish).not.toHaveBeenCalled();
      });

      it('handles internal server error', async () => {
        mockMongo.insertOne.mockRejectedValueOnce(new Error('DB Error'));

        await mockApp.handler(mockReq, mockRes);

        expect(mockLogger.child).toHaveBeenCalledWith({
          method: 'POST',
          endpoint: '/webhook'
        });

        expect(mockRes.status).toHaveBeenCalledWith(500);
        expect(mockRes.json).toHaveBeenCalledWith({
          success: false,
          message: 'Internal server error'
        });
      });
    });
  });
});
