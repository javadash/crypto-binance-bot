const _ = require('lodash');
const instance = require('../tradingview-payload-build');
const { cache, mongo } = require('../../../../helpers');
const common = require('../../../../cronjob/trailingTradeHelper/common');

jest.mock('../../../../helpers/mongo', () => ({
  aggregate: jest.fn()
}));

jest.mock('../../../../cronjob/trailingTradeHelper/common', () => ({
  getSymbolInfo: jest.fn(),
  cacheExchangeSymbols: jest.fn(),
  getAccountInfo: jest.fn(),
  getAPILimit: jest.fn()
}));

const mockSymbolInfo = {
  symbol: 'BTCUSDT',
  status: 'TRADING',
  baseAsset: 'BTC',
  baseAssetPrecision: 8,
  quoteAsset: 'USDT',
  quotePrecision: 8,
  filterLotSize: {
    minQty: '0.00000100',
    stepSize: '0.00000100',
    maxQty: '1000.00000000'
  },
  filterPrice: {
    tickSize: '0.01000000',
    minPrice: '0.01000000',
    maxPrice: '1000000.00000000'
  },
  filterMinNotional: {
    minNotional: '10.00000000'
  }
};

const mockBalance = {
  quoteAssetBalance: { free: '1000000.00', locked: '0.00' },
  baseAssetBalance: { free: '10000000', locked: '0.00' }
};

const mockLogger = {
  child: jest.fn().mockReturnValue({
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn()
  }),
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn()
};

describe('tradingview-payload-build.js', () => {
  let result;

  beforeEach(() => {
    jest.clearAllMocks().resetModules();

    // Setup default cache mock
    cache.hget = jest.fn().mockImplementation((key, field) => {
      if (field.includes('latest-candle')) {
        return Promise.resolve(JSON.stringify({ close: '50000.00' }));
      }
      return Promise.resolve(null);
    });

    common.getSymbolInfo.mockResolvedValue(mockSymbolInfo);
  });

  describe('buildAutomaticTradePayload', () => {
    describe('when called with buy alert', () => {
      beforeEach(async () => {
        // Mock cache.hget to return a valid candle
        cache.hget = jest.fn().mockImplementation((key, field) => {
          if (
            key === 'trailing-trade-symbols' &&
            field === 'BTCUSDT-latest-candle'
          ) {
            return Promise.resolve(JSON.stringify({ close: '50000.00' }));
          }
          return Promise.resolve(null);
        });

        const alert = {
          side: 'buy',
          ticker: 'BTCUSDT',
          bar: {
            time: '2023-01-01T00:00:00.000Z',
            close: '50000.00'
          }
        };
        common.getSymbolInfo.mockResolvedValue(mockSymbolInfo);

        result = await instance.buildAutomaticTradePayload(mockLogger, alert);
      });

      it('returns expected result structure', () => {
        expect(result).toHaveProperty('command', 'automatic-trade');
        expect(result).toHaveProperty('authToken', ' ');
        expect(result.data).toHaveProperty('symbol', 'BTCUSDT');
        expect(result.data.order).toHaveProperty('side', 'buy');
        expect(result.data.order).toMatchObject({
          side: 'buy',
          buy: {
            type: 'limit',
            price: 0,
            quantity: 0,
            total: 0,
            marketType: 'total',
            marketQuantity: 0,
            quoteOrderQty: 0,
            isValid: false
          },
          sell: {
            type: 'limit',
            price: 0,
            quantity: 0,
            total: 0,
            marketType: 'total',
            marketQuantity: 0,
            quoteOrderQty: 0,
            isValid: false
          }
        });
      });
    });

    describe('when called with sell alert', () => {
      beforeEach(async () => {
        cache.hget = jest.fn().mockResolvedValue(
          JSON.stringify({
            close: '50000.00'
          })
        );

        const alert = {
          side: 'sell',
          ticker: 'BTCUSDT',
          bar: {
            time: '2023-01-01T00:00:00.000Z',
            close: '50000.00'
          }
        };

        result = await instance.buildAutomaticTradePayload(mockLogger, alert);
      });

      it('returns expected result structure', () => {
        expect(result).toHaveProperty('command', 'automatic-trade');
        expect(result).toHaveProperty('authToken', ' ');
        expect(result.data).toHaveProperty('symbol', 'BTCUSDT');
        expect(result.data.order).toHaveProperty('side', 'sell');
        expect(result.data.order).toMatchObject({
          side: 'sell',
          buy: {
            type: 'limit',
            price: 0,
            quantity: 0,
            total: 0,
            marketType: 'total',
            marketQuantity: 0,
            quoteOrderQty: 0,
            isValid: false
          },
          sell: {
            type: 'limit',
            price: 0,
            quantity: 0,
            total: 0,
            marketType: 'total',
            marketQuantity: 0,
            quoteOrderQty: 0,
            isValid: false
          }
        });
      });
    });

    describe('when cache.hget throws an error', () => {
      beforeEach(async () => {
        cache.hget = jest.fn().mockRejectedValue(new Error('Cache error'));

        const alert = {
          side: 'buy',
          ticker: 'BTCUSDT',
          bar: {
            time: '2023-01-01T00:00:00.000Z',
            close: '50000.00'
          }
        };

        result = await instance.buildAutomaticTradePayload(mockLogger, alert);
      });

      it('returns expected result with default values', () => {
        expect(result).toMatchObject({
          command: 'automatic-trade',
          authToken: ' ',
          data: {
            symbol: 'BTCUSDT',
            order: {
              side: 'buy',
              buy: {
                type: 'limit',
                price: 0,
                quantity: 0,
                total: 0,
                marketType: 'total',
                marketQuantity: 0,
                quoteOrderQty: 0,
                isValid: false
              },
              sell: {
                type: 'limit',
                price: 0,
                quantity: 0,
                total: 0,
                marketType: 'total',
                marketQuantity: 0,
                quoteOrderQty: 0,
                isValid: false
              }
            }
          }
        });
      });
    });
  });
});

describe('calculatePercentage', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockLogger.child.mockReturnValue({
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn()
    });

    /// Setup default cache mock
    cache.hget = jest.fn().mockImplementation((key, field) => {
      if (field.includes('latest-candle')) {
        return Promise.resolve(JSON.stringify({ close: '50000.00' }));
      }
      return Promise.resolve(null);
    });

    common.getSymbolInfo.mockResolvedValue(mockSymbolInfo);

    // Mock mongo.aggregate to return symbol data
    mongo.aggregate = jest.fn().mockResolvedValue([
      {
        symbol: 'BTCUSDT',
        baseAssetBalance: mockBalance.baseAssetBalance,
        quoteAssetBalance: mockBalance.quoteAssetBalance,
        lastCandle: { close: '50000.00' },
        symbolInfo: mockSymbolInfo,
        symbolConfiguration: {
          buy: { triggerPercentage: 1.05 },
          sell: { triggerPercentage: 0.98 }
        },
        tradingView: {
          recommendation: 'STRONG_BUY'
        },
        overrideData: {}
      }
    ]);
  });

  describe('when called with buy side', () => {
    it('should properly mock getSymbolInfo with all required fields', async () => {
      const result = await common.getSymbolInfo(mockLogger, 'BTCUSDT');

      expect(result).toMatchObject({
        symbol: 'BTCUSDT',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        filterLotSize: {
          stepSize: expect.any(String),
          minQty: expect.any(String),
          maxQty: expect.any(String)
        },
        filterPrice: {
          tickSize: expect.any(String),
          minPrice: expect.any(String),
          maxPrice: expect.any(String)
        }
      });
    });

    it('should calculate limit buy percentage correctly', async () => {
      const payload = {
        command: 'automatic-trade',
        authToken: ' ',
        data: {
          symbol: 'BTCUSDT',
          order: {
            side: 'buy',
            buy: {
              type: 'limit',
              price: 0,
              quantity: 2,
              total: 0,
              marketType: 'total',
              marketQuantity: 0,
              quoteOrderQty: 0,
              isValid: false
            },
            sell: {
              type: 'limit',
              price: 0,
              quantity: 0,
              total: 0,
              marketType: 'total',
              marketQuantity: 0,
              quoteOrderQty: 0,
              isValid: false
            }
          }
        }
      };

      const result = await instance.calculatePercentage(
        mockLogger,
        'buy',
        100,
        payload
      );

      expect(common.getSymbolInfo).toHaveBeenCalledWith(mockLogger, 'BTCUSDT');

      expect(result).toBeDefined();
      expect(result.buy.type).toBe('limit');
      expect(result.buy.quantity).toBeGreaterThan(0);
      expect(result.buy.isValid).toBe(true);
    });

    it('should calculate market buy percentage correctly', async () => {
      const payload = {
        command: 'automatic-trade',
        authToken: ' ',
        data: {
          symbol: 'BTCUSDT',
          order: {
            side: 'buy',
            buy: {
              type: 'market',
              price: 0,
              quantity: 10000,
              total: 0,
              marketType: 'total',
              marketQuantity: 0,
              quoteOrderQty: 0,
              isValid: false
            },
            sell: {
              type: 'market',
              price: 0,
              quantity: 0,
              total: 0,
              marketType: 'total',
              marketQuantity: 0,
              quoteOrderQty: 0,
              isValid: false
            }
          }
        }
      };

      const result = await instance.calculatePercentage(
        mockLogger,
        'buy',
        100,
        payload
      );

      expect(result).toBeDefined();
      expect(result.buy.type).toBe('market');
      expect(result.buy.quoteOrderQty).toBeGreaterThan(0);
      expect(result.buy.isValid).toBe(true);
    });
  });

  describe('when called with sell side', () => {
    it('should calculate limit sell percentage correctly', async () => {
      const payload = {
        command: 'automatic-trade',
        authToken: ' ',
        data: {
          symbol: 'BTCUSDT',
          order: {
            side: 'sell',
            buy: {
              type: 'limit',
              price: 0,
              quantity: 0,
              total: 0,
              marketType: 'total',
              marketQuantity: 0,
              quoteOrderQty: 0,
              isValid: false
            },
            sell: {
              type: 'limit',
              price: 2,
              quantity: 50,
              total: 0,
              marketType: 'total',
              marketQuantity: 0,
              quoteOrderQty: 0,
              isValid: false
            }
          }
        }
      };

      const result = await instance.calculatePercentage(
        mockLogger,
        'sell',
        100,
        payload
      );

      expect(result).toBeDefined();
      expect(result.sell.type).toBe('limit');
      expect(result.sell.quantity).toBeGreaterThan(0);
      expect(result.sell.isValid).toBe(true);
    });

    it('should calculate market sell percentage correctly', async () => {
      const payload = {
        command: 'automatic-trade',
        authToken: ' ',
        data: {
          symbol: 'BTCUSDT',
          order: {
            side: 'sell',
            buy: {
              type: 'market',
              price: 0,
              quantity: 0,
              total: 0,
              marketType: 'total',
              marketQuantity: 0,
              quoteOrderQty: 0,
              isValid: false
            },
            sell: {
              type: 'market',
              price: 2,
              quantity: 50000,
              total: 0,
              marketType: 'amount',
              marketQuantity: 0,
              quoteOrderQty: 0,
              isValid: false
            }
          }
        }
      };

      const result = await instance.calculatePercentage(
        mockLogger,
        'sell',
        100,
        payload
      );

      expect(result).toBeDefined();
      expect(result.sell.type).toBe('market');
      expect(result.sell.quantity).toBeGreaterThan(0);
      expect(result.sell.isValid).toBe(true);
    });

    it('should handle errors gracefully', async () => {
      cache.hget.mockResolvedValue(JSON.stringify({ close: '50000.00' }));
      common.getSymbolInfo.mockRejectedValue(new Error('Test error'));

      const payload = {
        command: 'automatic-trade',
        authToken: ' ',
        data: {
          symbol: 'BTCUSDT',
          order: {
            side: 'sell',
            buy: {
              type: 'market',
              price: 0,
              quantity: 0,
              total: 0,
              marketType: 'total',
              marketQuantity: 0,
              quoteOrderQty: 0,
              isValid: false
            },
            sell: {
              type: 'market',
              price: 2,
              quantity: 50000,
              total: 0,
              marketType: 'total',
              marketQuantity: 0,
              quoteOrderQty: 0,
              isValid: false
            }
          }
        }
      };

      const result = await instance.calculatePercentage(
        mockLogger,
        'buy',
        100,
        payload
      );

      expect(mockLogger.error).toHaveBeenCalled();
      expect(result).toEqual(payload.data.order);
      expect(result.buy.isValid).toBe(false);
      expect(result.sell.isValid).toBe(false);
    });
  });
});
