/* eslint-disable global-require */
describe('index', () => {
  let index;

  let mockLogger;
  let mockApp;

  let mockHandleAuth;
  let mockHandleGridTradeArchiveGet;
  let mockHandleGridTradeArchiveDelete;
  let mockHandleClosedTradesSetPeriod;
  let mockHandleStatus;
  let mockHandleGridTradeLogsGet;
  let mockHandleGridTradeLogsExport;
  let mockHandleSymbolDelete;
  let mockHandleBackupGet;
  let mockHandleRestorePost;

  let mockHandle404;

  let mockLoginLimiter;

  beforeEach(async () => {
    jest.clearAllMocks().resetModules();

    // Add this to get the mocked logger
    const { logger } = require('../../../../helpers');
    mockLogger = logger;

    mockApp = {
      post: jest.fn(),
      use: jest.fn(),
      get: jest.fn(),
      route: jest.fn().mockReturnValue({
        post: jest.fn(),
        get: jest.fn(),
        delete: jest.fn()
      })
    };

    mockHandleAuth = jest.fn().mockResolvedValue(true);
    mockHandleGridTradeArchiveGet = jest.fn().mockResolvedValue(true);
    mockHandleGridTradeArchiveDelete = jest.fn().mockResolvedValue(true);
    mockHandleClosedTradesSetPeriod = jest.fn().mockResolvedValue(true);
    mockHandleStatus = jest.fn().mockResolvedValue(true);
    mockHandleGridTradeLogsGet = jest.fn().mockResolvedValue(true);
    mockHandleGridTradeLogsExport = jest.fn().mockResolvedValue(true);
    mockHandleSymbolDelete = jest.fn().mockResolvedValue(true);
    mockHandleBackupGet = jest.fn().mockResolvedValue(true);
    mockHandleRestorePost = jest.fn().mockResolvedValue(true);

    mockHandle404 = jest.fn().mockResolvedValue(true);

    mockLoginLimiter = jest.fn().mockReturnValue(true);

    jest.mock('../auth', () => ({
      handleAuth: mockHandleAuth
    }));

    jest.mock('../grid-trade-archive-get', () => ({
      handleGridTradeArchiveGet: mockHandleGridTradeArchiveGet
    }));

    jest.mock('../grid-trade-archive-delete', () => ({
      handleGridTradeArchiveDelete: mockHandleGridTradeArchiveDelete
    }));

    jest.mock('../closed-trades-set-period', () => ({
      handleClosedTradesSetPeriod: mockHandleClosedTradesSetPeriod
    }));

    jest.mock('../grid-trade-logs-get', () => ({
      handleGridTradeLogsGet: mockHandleGridTradeLogsGet
    }));

    jest.mock('../grid-trade-logs-export', () => ({
      handleGridTradeLogsExport: mockHandleGridTradeLogsExport
    }));

    jest.mock('../404', () => ({
      handle404: mockHandle404
    }));

    jest.mock('../status', () => ({
      handleStatus: mockHandleStatus
    }));

    jest.mock('../symbol-delete', () => ({
      handleSymbolDelete: mockHandleSymbolDelete
    }));

    jest.mock('../backup-get', () => ({
      handleBackupGet: mockHandleBackupGet
    }));

    jest.mock('../restore-post', () => ({
      handleRestorePost: mockHandleRestorePost
    }));

    index = require('../index');
    await index.setHandlers(mockLogger, mockApp, {
      loginLimiter: mockLoginLimiter
    });
  });

  it('triggers handleAuth', () => {
    expect(mockHandleAuth).toHaveBeenCalledWith(mockLogger, mockApp, {
      loginLimiter: mockLoginLimiter
    });
  });

  it('triggers handleGridTradeArchiveGet', () => {
    expect(mockHandleGridTradeArchiveGet).toHaveBeenCalledWith(
      mockLogger,
      mockApp
    );
  });

  it('triggers handleGridTradeArchiveDelete', () => {
    expect(mockHandleGridTradeArchiveDelete).toHaveBeenCalledWith(
      mockLogger,
      mockApp
    );
  });

  it('triggers handleClosedTradesSetPeriod', () => {
    expect(mockHandleClosedTradesSetPeriod).toHaveBeenCalledWith(
      mockLogger,
      mockApp
    );
  });

  it('triggers handleGridTradeLogsGet', () => {
    expect(mockHandleGridTradeLogsGet).toHaveBeenCalledWith(
      mockLogger,
      mockApp
    );
  });

  it('triggers handleGridTradeLogsExport', () => {
    expect(mockHandleGridTradeLogsExport).toHaveBeenCalledWith(
      mockLogger,
      mockApp
    );
  });

  it('triggers handleStatus', () => {
    expect(mockHandleStatus).toHaveBeenCalledWith(mockLogger, mockApp);
  });

  it('triggers handle404', () => {
    expect(mockHandle404).toHaveBeenCalledWith(mockLogger, mockApp);
  });

  it('triggers handleSymbolDelete', () => {
    expect(mockHandleSymbolDelete).toHaveBeenCalledWith(mockLogger, mockApp);
  });

  it('triggers handleBackupGet', () => {
    expect(mockHandleBackupGet).toHaveBeenCalledWith(mockLogger, mockApp);
  });

  it('triggers handleRestorePost', () => {
    expect(mockHandleRestorePost).toHaveBeenCalledWith(mockLogger, mockApp);
  });
});
