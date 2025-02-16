/* eslint-disable no-const-assign */
/* eslint-disable no-param-reassign */
/**
 * @module tradingview-payload-build
 * @description Module for building trading payloads based on TradingView alerts and Binance trading rules
 */
const _ = require('lodash');
const {
  getSymbolInfo
} = require('../../../cronjob/trailingTradeHelper/common');
const { cache, mongo } = require('../../../helpers');
const { handleError } = require('../../../error-handler');

/**
 * @constant {number} initialAmount
 * @description Initial amount used for calculations (100,000)
 */
const initialAmount = 100000;
/**
 * @constant {Object} initialOrder
 * @description Default order structure for both buy and sell orders
 */
const initialOrder = {
  side: null,
  buy: {
    type: 'limit', // limit or market
    price: 0, // limit price
    quantity: 0, // limit quantity
    total: 0, // limit total
    marketType: 'total', // total or amount  - total for limit  - amount for market
    marketQuantity: 0, // market quantity
    quoteOrderQty: 0, // market total
    isValid: false
  },
  sell: {
    type: 'limit', // limit or market
    price: 0, // limit price
    quantity: 0, // limit quantity
    total: 0, // limit total
    marketType: 'total', // total or amount - total for limit  - amount for market
    marketQuantity: 0, // market quantity
    quoteOrderQty: 0, // market total
    isValid: false
  }
};

let currentPrice = 0;
let symbolInfo = {};

/**
 * Get cached trading data for a specific symbol
 *
 * @param {*} logger Logger instance for tracking operations
 * @param {string} symbol The symbol to retrieve (e.g. 'BTCUSDT')
 * @returns {Promise<Object|null>} Symbol trading data in format:
 * {
 *   symbol: string,
 *   lastCandle: {
 *     openTime: string,
 *     open: string,
 *     high: string,
 *     low: string,
 *     close: string,
 *     volume: string
 *   },
 *   symbolInfo: {
 *     baseAsset: string,
 *     quoteAsset: string,
 *     filterLotSize: object,
 *     filterPrice: object
 *   },
 *   symbolConfiguration: object,
 *   baseAssetBalance: {
 *     free: string,
 *     locked: string
 *   },
 *   quoteAssetBalance: {
 *     free: string,
 *     locked: string
 *   },
 *   tradingView: {
 *     recommendation: string
 *   },
 *   overrideData: object|null
 * }
 */
const getCacheTrailingTradeSymbolData = async (logger, symbol) => {
  const functionLogger = logger.child({
    function: 'getCacheTrailingTradeSymbolData',
    symbol
  });

  functionLogger.info({ symbol }, 'Getting cached symbol data');

  try {
    const result = await mongo.aggregate(
      functionLogger,
      'trailing-trade-cache',
      [
        {
          $match: {
            symbol
          }
        },
        {
          $project: {
            _id: 0,
            symbol: 1,
            lastCandle: {
              openTime: '$lastCandle.openTime',
              open: '$lastCandle.open',
              high: '$lastCandle.high',
              low: '$lastCandle.low',
              close: '$lastCandle.close',
              volume: '$lastCandle.volume'
            },
            symbolInfo: {
              baseAsset: '$symbolInfo.baseAsset',
              quoteAsset: '$symbolInfo.quoteAsset',
              filterLotSize: '$symbolInfo.filterLotSize',
              filterPrice: '$symbolInfo.filterPrice'
            },
            symbolConfiguration: 1,
            baseAssetBalance: {
              free: '$baseAssetBalance.free',
              locked: '$baseAssetBalance.locked'
            },
            quoteAssetBalance: {
              free: '$quoteAssetBalance.free',
              locked: '$quoteAssetBalance.locked'
            },
            tradingView: {
              recommendation: '$tradingView.recommendation'
            },
            overrideData: 1
          }
        }
      ]
    );

    functionLogger.info(
      { symbol, data: { found: !_.isEmpty(result) } },
      'Retrieved cached symbol data'
    );

    if (_.isEmpty(result)) {
      const errorMessage = `Could not find cached data for symbol ${symbol}`;
      functionLogger.error({ symbol }, errorMessage);
      throw new Error(errorMessage);
    }

    // Return first (and should be only) result
    return result[0];
  } catch (err) {
    functionLogger.error(
      { err, symbol },
      'Error retrieving cached symbol data'
    );
    handleError(
      logger,
      `Fatal error retrieving cached symbol data - ${symbol}`,
      err
    );
    return {};
  }
};

/**
 * Calculate the percentage-based quantity for a limit buy order
 * @function calculatePercentageLimitBuy
 * @param {Object} params - Calculation parameters
 * @param {Object} params.quoteAssetBalance - Quote asset balance information
 * @param {number} params.percentage - Percentage of balance to use
 * @param {Object} params.filterLotSize - LOT_SIZE filter from Binance
 * @param {number} params.baseAssetStepSize - Step size for base asset quantity
 * @returns {number} Calculated quantity for limit buy order
 */
const calculatePercentageLimitBuy = ({
  quoteAssetBalance,
  percentage,
  filterLotSize,
  baseAssetStepSize
}) => {
  const quoteAssetBalanceFree = parseFloat(quoteAssetBalance.free);

  let newAmount = _.floor(
    (quoteAssetBalanceFree / currentPrice) * (percentage / 100),
    baseAssetStepSize
  );

  if (parseFloat(newAmount) > parseFloat(filterLotSize.maxQty)) {
    newAmount = parseFloat(filterLotSize.maxQty).toFixed(baseAssetStepSize);
  }

  return parseFloat(newAmount);
};
/**
 * Calculate the percentage-based quantity for a limit sell order
 * @function calculatePercentageLimitSell
 * @param {Object} params - Calculation parameters
 * @param {Object} params.baseAssetBalance - Base asset balance information
 * @param {number} params.percentage - Percentage of balance to use
 * @param {number} params.baseAssetStepSize - Step size for base asset quantity
 * @param {Object} params.filterLotSize - LOT_SIZE filter from Binance
 * @returns {number} Calculated quantity for limit sell order
 */
const calculatePercentageLimitSell = ({
  baseAssetBalance,
  percentage,
  baseAssetStepSize,
  filterLotSize
}) => {
  const baseAssetBalanceFree = parseFloat(baseAssetBalance.free);

  let newAmount = _.floor(
    (baseAssetBalanceFree / 100) * percentage,
    baseAssetStepSize
  );

  if (parseFloat(newAmount) > parseFloat(filterLotSize.maxQty)) {
    newAmount = parseFloat(filterLotSize.maxQty).toFixed(baseAssetStepSize);
  }

  return parseFloat(newAmount);
};
/**
 * Validate an order against account balances and trading rules
 * @function validateOrder
 * @param {Object} logger - Logger instance
 * @param {Object} order - Order to validate
 * @param {Object} baseAssetBalance - Base asset balance information
 * @param {Object} quoteAssetBalance - Quote asset balance information
 * @returns {Object} Validated order with updated isValid flags
 */
const validateOrder = (logger, order, baseAssetBalance, quoteAssetBalance) => {
  if (!currentPrice || currentPrice <= 0) {
    logger.error(
      { currentPrice },
      'Validation error: Error getting current price'
    );
    return order;
  }
  const baseAssetBalanceFree = parseFloat(baseAssetBalance.free);
  const quoteAssetBalanceFree = parseFloat(quoteAssetBalance.free);

  const validOrder = _.cloneDeep(order);

  validOrder.buy.isValid = false;
  validOrder.sell.isValid = false;

  if (validOrder.buy.type === 'limit') {
    // Total must be more than 0 and total must be less than the quote asset balance.
    if (
      validOrder.buy.total > 0 &&
      validOrder.buy.total <= quoteAssetBalanceFree
    ) {
      validOrder.buy.isValid = true;
    }
  }

  if (validOrder.sell.type === 'limit') {
    // Total must be more than 0 and quantity must be less than the base asset balance.
    if (
      validOrder.sell.total > 0 &&
      validOrder.sell.quantity <= baseAssetBalanceFree
    ) {
      validOrder.sell.isValid = true;
    }
  }

  if (validOrder.buy.type === 'market') {
    // Quote amount must be more than 0 and must be less than the quote asset balance.
    if (
      validOrder.buy.marketType === 'total' &&
      validOrder.buy.quoteOrderQty > 0 &&
      validOrder.buy.quoteOrderQty <= quoteAssetBalanceFree
    ) {
      validOrder.buy.isValid = true;
    }

    // Quantity must be more than 0 and total amount must be less than the quote asset balance.
    if (
      validOrder.buy.marketType === 'amount' &&
      validOrder.buy.marketQuantity > 0 &&
      validOrder.buy.marketQuantity * currentPrice <= quoteAssetBalanceFree
    ) {
      validOrder.buy.isValid = true;
    }
  }

  if (validOrder.sell.type === 'market') {
    // Quote amount must be more than 0 and quantity must be less than the base asset balance.
    if (
      validOrder.sell.marketType === 'total' &&
      validOrder.sell.quoteOrderQty > 0 &&
      validOrder.sell.quoteOrderQty / currentPrice <= baseAssetBalanceFree
    ) {
      validOrder.sell.isValid = true;
    }

    // Quantity must be more than 0 and must be less than the base asset balance.
    if (
      validOrder.sell.marketType === 'amount' &&
      validOrder.sell.marketQuantity > 0 &&
      validOrder.sell.marketQuantity <= baseAssetBalanceFree
    ) {
      validOrder.sell.isValid = true;
    }
  }
  return validOrder;
};

/**
 * Calculate total values for buy and sell orders based on price and quantity
 * @function calculateTotal
 * @param {Object} logger - Logger instance
 * @param {Object} order - Order to calculate totals for
 * @param {Object} baseAssetBalance - Base asset balance information
 * @param {Object} quoteAssetBalance - Quote asset balance information
 * @returns {Object} Order with calculated totals and validation
 */
const calculateTotal = (logger, order, baseAssetBalance, quoteAssetBalance) => {
  const { quotePrecision } = symbolInfo;

  order.buy.total = parseFloat(
    (parseFloat(order.buy.price) * parseFloat(order.buy.quantity)).toFixed(
      quotePrecision
    )
  );

  order.sell.total = parseFloat(
    (parseFloat(order.sell.price) * parseFloat(order.sell.quantity)).toFixed(
      quotePrecision
    )
  );
  return validateOrder(logger, order, baseAssetBalance, quoteAssetBalance);
};

// Calculate the total amount for a market buy order based on the percentage
// of the total quote asset balance
/**
 * Calculate the percentage-based total for a market buy order
 * @function calculatePercentageMarketBuyTotal
 * @param {Object} params - Calculation parameters
 * @param {Object} params.quoteAssetBalance - Quote asset balance information
 * @param {number} params.quoteAssetTickSize - Tick size for quote asset
 * @param {number} params.percentage - Percentage of balance to use
 * @param {Object} params.filterPrice - PRICE_FILTER from Binance
 * @returns {number} Calculated total for market buy order
 */
const calculatePercentageMarketBuyTotal = ({
  quoteAssetBalance,
  quoteAssetTickSize,
  percentage,
  filterPrice
}) => {
  const quoteAssetBalanceFree = parseFloat(quoteAssetBalance.free); // Total quote asset balance

  // TODO: Calculate the new amount based on the percentage
  let newAmount = _.floor(
    parseFloat(initialAmount) * (percentage / 100),
    quoteAssetTickSize
  );

  if (parseFloat(newAmount) > parseFloat(filterPrice.maxPrice)) {
    newAmount = parseFloat(filterPrice.maxPrice).toFixed(quoteAssetTickSize);
  }

  return parseFloat(newAmount);
};

// Calculate the amount for a market sell order based on the percentage
// of the total base asset balance
/**
 * Calculate the percentage-based amount for a market buy order
 * @function calculatePercentageMarketBuyAmount
 * @param {Object} params - Calculation parameters
 * @param {Object} params.quoteAssetBalance - Quote asset balance information
 * @param {number} params.baseAssetStepSize - Step size for base asset quantity
 * @param {number} params.percentage - Percentage of balance to use
 * @param {Object} params.filterLotSize - LOT_SIZE filter from Binance
 * @returns {number} Calculated amount for market buy order
 */
const calculatePercentageMarketBuyAmount = ({
  quoteAssetBalance,
  baseAssetStepSize,
  percentage,
  filterLotSize
}) => {
  const quoteAssetBalanceFree = parseFloat(quoteAssetBalance.free);

  let newAmount = _.floor(
    (quoteAssetBalanceFree / this.currentPrice) * (percentage / 100),
    baseAssetStepSize
  );

  if (parseFloat(newAmount) > parseFloat(filterLotSize.maxQty)) {
    newAmount = parseFloat(filterLotSize.maxQty).toFixed(baseAssetStepSize);
  }

  return parseFloat(newAmount);
};
/**
 * Calculate the percentage-based total for a market sell order
 * @function calculatePercentageMarketSellTotal
 * @param {Object} params - Calculation parameters
 * @param {Object} params.baseAssetBalance - Base asset balance information
 * @param {number} params.quoteAssetTickSize - Tick size for quote asset
 * @param {number} params.percentage - Percentage of balance to use
 * @param {Object} params.filterPrice - PRICE_FILTER from Binance
 * @returns {number} Calculated total for market sell order
 */
const calculatePercentageMarketSellTotal = ({
  baseAssetBalance,
  quoteAssetTickSize,
  percentage,
  filterPrice
}) => {
  const baseAssetBalanceFree = parseFloat(baseAssetBalance.free);

  let newAmount = _.floor(
    baseAssetBalanceFree * this.currentPrice * (percentage / 100),
    quoteAssetTickSize
  );

  if (parseFloat(newAmount) > parseFloat(filterPrice.maxPrice)) {
    newAmount = parseFloat(filterPrice.maxPrice).toFixed(quoteAssetTickSize);
  }

  return parseFloat(newAmount);
};
/**
 * Calculate the percentage-based amount for a market sell order
 * @function calculatePercentageMarketSellAmount
 * @param {Object} params - Calculation parameters
 * @param {Object} params.baseAssetBalance - Base asset balance information
 * @param {number} params.baseAssetStepSize - Step size for base asset quantity
 * @param {number} params.percentage - Percentage of balance to use
 * @param {Object} params.filterLotSize - LOT_SIZE filter from Binance
 * @returns {number} Calculated amount for market sell order
 */
const calculatePercentageMarketSellAmount = ({
  baseAssetBalance,
  baseAssetStepSize,
  percentage,
  filterLotSize
}) => {
  const baseAssetBalanceFree = parseFloat(baseAssetBalance.free);

  let newAmount = _.floor(
    baseAssetBalanceFree * (percentage / 100),
    baseAssetStepSize
  );

  if (parseFloat(newAmount) > parseFloat(filterLotSize.maxQty)) {
    newAmount = parseFloat(filterLotSize.maxQty).toFixed(baseAssetStepSize);
  }

  return parseFloat(newAmount);
};

/**
 * Calculate the percentage-based quantity for an order
 * @async
 * @function calculatePercentage
 * @param {Object} logger - Logger instance
 * @param {string} side - Order side ('buy' or 'sell')
 * @param {number} percentage - Percentage of balance to use
 * @param {Object} payload - Order payload
 * @returns {Promise<Object>} Order with calculated values and validation
 */
const calculatePercentage = async (logger, side, percentage, payload) => {
  const cachedLatestCandle =
    JSON.parse(
      await cache.hget(
        'trailing-trade-symbols',
        `${payload.data.symbol}-latest-candle`
      )
    ) || {};

  currentPrice = parseFloat(cachedLatestCandle?.close);

  try {
    symbolInfo = await getSymbolInfo(logger, payload.data.symbol);
  } catch (err) {
    logger.error({ err }, 'Error getting symbol info');
    return payload.data.order;
  }

  const { symbol, filterLotSize, filterPrice } = symbolInfo;

  const baseAssetStepSize =
    parseFloat(filterLotSize.stepSize) === 1
      ? 0
      : filterLotSize.stepSize.indexOf(1) - 1;

  const quoteAssetTickSize =
    parseFloat(filterPrice.tickSize) === 1
      ? 0
      : filterPrice.tickSize.indexOf(1) - 1;

  const symbolData = await getCacheTrailingTradeSymbolData(
    logger,
    payload.data.symbol
  );

  if (_.isEmpty(symbolData)) {
    logger.error({ symbol }, 'Could not retrieve symbol data');
    return payload.data.order;
  }

  const { baseAssetBalance, quoteAssetBalance } = symbolData;

  const orderParams = payload.data.order[side];

  if (orderParams.type === 'limit' && side === 'buy') {
    orderParams.quantity = calculatePercentageLimitBuy({
      quoteAssetBalance,
      currentPrice: this.currentPrice,
      percentage,
      filterLotSize,
      baseAssetStepSize
    });
  } else if (orderParams.type === 'limit' && side === 'sell') {
    orderParams.quantity = calculatePercentageLimitSell({
      baseAssetBalance,
      percentage,
      baseAssetStepSize,
      filterLotSize
    });
  } else if (
    orderParams.type === 'market' &&
    side === 'buy' &&
    orderParams.marketType === 'total'
  ) {
    orderParams.quoteOrderQty = calculatePercentageMarketBuyTotal({
      quoteAssetBalance,
      quoteAssetTickSize,
      percentage,
      filterPrice
    });
  } else if (
    orderParams.type === 'market' &&
    side === 'buy' &&
    orderParams.marketType === 'amount'
  ) {
    orderParams.marketQuantity = calculatePercentageMarketBuyAmount({
      quoteAssetBalance,
      baseAssetStepSize,
      percentage,
      filterLotSize
    });
  } else if (
    orderParams.type === 'market' &&
    side === 'sell' &&
    orderParams.marketType === 'total'
  ) {
    orderParams.quoteOrderQty = calculatePercentageMarketSellTotal({
      baseAssetBalance,
      quoteAssetTickSize,
      percentage,
      filterPrice
    });
  } else if (
    orderParams.type === 'market' &&
    side === 'sell' &&
    orderParams.marketType === 'amount'
  ) {
    orderParams.marketQuantity = calculatePercentageMarketSellAmount({
      baseAssetBalance,
      baseAssetStepSize,
      percentage,
      filterLotSize
    });
  }

  // Add market order percentage calculation logic here...
  const order = _.cloneDeep(initialOrder);
  order.side = side;
  order[side] = orderParams;
  order[side].price = currentPrice;
  logger.info(
    { order },
    `Building order payload for the ${side} automatic trading order`
  );
  return calculateTotal(logger, order, baseAssetBalance, quoteAssetBalance);
};
/**
 * Build automatic trade payload based on TradingView alert
 * @async
 * @function buildAutomaticTradePayload
 * @param {Object} logger - Logger instance
 * @param {Object} alert - TradingView alert
 * @returns {Promise<Object>} Trade payload for automatic trading
 */
const buildAutomaticTradePayload = async (logger, alert) => {
  const { ticker: symbol, bar } = alert;
  const action = alert.side.toLowerCase() === 'buy' ? 'buy' : 'sell';

  // TODO
  const alertCandle = alert.bar;
  // TODO
  const alertOrderType = alert.bar;

  let percent = 100 || parseInt(alert.amount, 10);

  const commission = 0.05;

  // If it is 100%, try to deduct commission 0.1%
  if (percent === 100) {
    percent -= commission;
  }
  logger.info(
    { action, symbol, bar },
    'Start automatic trade payload creation'
  );
  const payload = {
    command: 'automatic-trade',
    authToken: ' ',
    data: {
      symbol: alert.ticker,
      order: {
        side: action,
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
  };
  try {
    const calculatedOrder = await calculatePercentage(
      logger,
      action,
      percent,
      payload
    );
    payload.data.order = {
      ...payload.data.order,
      ...calculatedOrder
    };
    logger.info({ payload }, 'Automatic trade payload built');

  } catch (err) {
    logger.error(
      { err, action, symbol },
      'Error building automatic trade payload'
    );
  }

  return payload;
};

module.exports = { calculatePercentage, buildAutomaticTradePayload };
