/* eslint-disable global-require */

describe('smee-tunnel/configure', () => {
  let config;
  let smeeTunnel;
  let mockLogger;
  let mockSlack;
  let mockCache;

  let mockSmeeTunnelOn;

  beforeEach(() => {
    jest.clearAllMocks().resetModules();

    jest.useFakeTimers();
    jest.mock('config');
    jest.mock('smee-client');
    jest.mock('../../../helpers');

    config = require('config');

    const { cache, slack } = require('../../../helpers');

    // Add mock implementation for logger
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      child: jest.fn().mockImplementation(() => ({
        info: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
      }))
    };

    mockCache = cache;
    mockSlack = slack;

    config = require('config');
    jest.mock('config');

    config.get = jest.fn(key => {
      switch (key) {
        case 'mode':
          return 'test';
        case 'smeeTunnel.enabled':
          return true;
        case 'smeeTunnel.subdomain':
          return 'my-domain';
        case 'featureToggle.notifyDebug':
          return false;
        default:
          return `value-${key}`;
      }
    });

    mockSlack.sendMessage = jest.fn();

    mockCache.hset = jest.fn().mockResolvedValue(true);
    mockCache.hdel = jest.fn().mockResolvedValue(true);

    mockSmeeTunnelOn = jest.fn().mockImplementation((_event, _cb) => {});
  });

  describe('when smee tunnel is disabled', () => {
    beforeEach(async () => {
      config.get = jest.fn(key => {
        switch (key) {
          case 'mode':
            return 'test';
          case 'smeeTunnel.enabled':
            return false;
          case 'smeeTunnel.subdomain':
            return 'my-domain';
          default:
            return `value-${key}`;
        }
      });
      mockCache.hget = jest.fn().mockImplementation((key, field) => {
        if (key === 'trailing-trade-common' && field === 'smee-tunnel-url') {
          return undefined;
        }

        return '';
      });

      jest.mock('smee-client', () =>
        jest.fn().mockImplementation(() => ({
          url: 'https://smee.io/foo',
          target: 'my-domain.loca.lt',
          logger: mockLogger,
          on: mockSmeeTunnelOn
        }))
      );

      smeeTunnel = require('smee-client');

      const { configureSmeeTunnel } = require('../configure');

      await configureSmeeTunnel(mockLogger);
    });

    it('does not initialise', () => {
      expect(smeeTunnel).not.toHaveBeenCalled();
    });
  });

  describe('when local tunnel url is not cached and returned configured domain', () => {
    beforeEach(async () => {
      mockCache.hget = jest.fn().mockImplementation((key, field) => {
        if (key === 'trailing-trade-common' && field === 'smee-tunnel-url') {
          return undefined;
        }

        return '';
      });

      jest.mock('smee-client', () =>
        jest.fn().mockImplementation(() => ({
          source: 'https://smee.io/randomchannelid',
          target: 'http://localhost:value-frontend.port/webhook',
          logger: mockLogger,
          start: jest.fn().mockReturnValue({
            url: 'https://smee.io/randomchannelid'
          })
        }))
      );

      smeeTunnel = require('smee-client');

      const { configureSmeeTunnel } = require('../configure');

      await configureSmeeTunnel(mockLogger);
      jest.advanceTimersByTime(300 * 1000);
    });

    it('initialise with expected', () => {
      expect(smeeTunnel).toHaveBeenCalledWith({
        source: expect.stringMatching(/^https:\/\/smee\.io\/.{16}$/),
        target: 'http://localhost:value-frontend.port/webhook',
        logger: expect.any(Object)
      });
    });

    it('triggers cache.hget', () => {
      expect(mockCache.hget).toHaveBeenCalledWith(
        'trailing-trade-common',
        'smee-tunnel-url'
      );
    });

    it('triggers cache.hset for tunnel url', () => {
      expect(mockCache.hset).toHaveBeenCalledWith(
        'trailing-trade-common',
        'smee-tunnel-url',
        expect.stringMatching(/^https:\/\/smee\.io\/.{16}$/)
      );
    });

    it('triggers cache.hset for webhook url', () => {
      expect(mockCache.hset).toHaveBeenCalledWith(
        'trailing-trade-common',
        'smee-tunnel-webhook-url',
        expect.stringMatching(/^https:\/\/smee\.io\/value-frontend\.port$/)
      );
    });

    it('calls smeeTunnel only once', () => {
      expect(smeeTunnel).toHaveBeenCalledTimes(1);
    });
  });
});
