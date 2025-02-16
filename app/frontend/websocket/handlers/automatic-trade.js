const handleAutomaticTrade = async (logger, ws, payload) => {
  logger.info({ payload }, 'Start automatic trade');
};

module.exports = { handleAutomaticTrade };
