// imports
const RequestPromise = require('request-promise');
const winston = require('winston');
const _ = require('lodash');
const moment = require('moment');

// pull config in for api keys, etc.
const config = require('./config.js');

// configure winston for logging
// TODO: prettify the json output - it's quite horrific
const logger = winston.createLogger({
  level: 'info',
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
        winston.format.prettyPrint(),
      ),
    }),
  ],
});

/* stock config structure
  {
    symbol: EXCHANGE_SYMBOL:STOCK_SYMBOL
    pool: amount of money allocated
    threshold: buy/sell if price goes above/below this percentage
    delta: amount to buy/sell if threshold is met
    holding: amount of stock currently on hand
    initial: initial amount to base threshold from
  }
*/

/* api get structure

  Meta Data
    1. Information
    2. Symbol
    3. Last Refreshed
    4. Interval
    5. Output Size
    6. Time Zone

  Time Series (?min)
    YYYY-MM-DD HH:mm:ss
      1. open
      2. high
      3. low
      4. close
      5. volume
*/

// function declarations
function getOptions({ symbol }) {
  return {
    uri: 'https://www.alphavantage.co/query',
    qs: {
      ...config.alphavantage.query,
      apikey: config.alphavantage.apikey,
      symbol,
    },
    headers: { 'User-Agent': 'Watcher' },
    json: true,
  };
}

function getSeriesString() {
  return `Time Series (${config.alphavantage.query.interval})`;
}

function handleStock(stock, response) {
  const dates = _.keys(response[getSeriesString()]);
  const recent = moment
    .max(dates.map(dateString => moment(dateString, config.alphavantage.dateFormat)))
    .format(config.alphavantage.dateFormat);
  const data = response[getSeriesString()][recent];

  // TODO: can we move the strings out to config.js?
  const {
    // '1. open': open,
    // '2. high': high,
    // '3. low': low,
    '4. close': close,
    // '5. volume': volume,
  } = data;

  logger.info(`${stock.symbol} closed @ ${close}`);

  if (close >= stock.initial * (1 + stock.threshold)) {
    logger.info(`sell triggered for ${stock.symbol}`);
  } else if (close <= stock.initial * (1 - stock.threshold)) {
    logger.info(`buy trigger for ${stock.symbol}`);
  } else {
    logger.info(`no action required for ${stock.symbol}`);
  }
}

function handleAllStocks() {
  config.stocks.forEach((stock) => {
    RequestPromise(getOptions(stock))
      .then(response => handleStock(stock, response))
      .catch(() => {
        logger.info('request failed!');
      });
  });
}

setInterval(handleAllStocks, config.alphavantage.timeout);
logger.info('startup complete');
