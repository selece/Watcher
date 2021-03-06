// imports
const RequestPromise = require('request-promise');
const Winston = require('winston');
const _ = require('lodash');
const Moment = require('moment');
const Twilio = require('twilio');
const PouchDB = require('pouchdb');

// pull cmdline options using yargs
const { argv } = require('yargs')
  .usage('Usage: $0 [--test] [--timeout num(ms)] [--single SYM.BOL]');

// pull config in for api keys, etc.
const config = require('./config.js');

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

const db = new PouchDB(config.pouchdb.db);

// configure Winston for logging
// TODO: prettify the json output - it's quite horrific
const logger = Winston.createLogger({
  level: 'info',
  transports: [
    new Winston.transports.Console({
      format: Winston.format.combine(
        Winston.format.timestamp(),
        Winston.format.json(),
        Winston.format.prettyPrint(),
      ),
    }),
    new Winston.transports.File({
      filename: 'watcher-errors.log',
      level: 'error',
    }),
    new Winston.transports.File({
      filename: 'watcher-info.log',
      level: 'info',
    }),
  ],
});

// twilio api access
const twilioClient = new Twilio(config.twilio.sid, config.twilio.auth);

// functions & helpers
const buildRequestPromiseOptions = ({ symbol }) => (
  {
    uri: config.alphavantage.uri,
    qs: {
      ...config.alphavantage.query,
      apikey: config.alphavantage.apikey,
      symbol,
    },
    headers: config.alphavantage.headers,
    json: config.alphavantage.json,
  }
);

const buildAVSeries = () => `Time Series (${config.alphavantage.query.interval})`;

const sendTwilioAlert = (body) => {
  if (!argv.test) {
    twilioClient.messages
      .create({
        body,
        to: config.twilio.to,
        from: config.twilio.from,
      })
      .then(() => logger.info(`TWILIO :: twilio alert successful @ ${config.twilio.to}`))
      .catch(err => logger.error('TWILIO :: failed to send twilio alert', err.message));
  } else {
    logger.info('TWILIO :: triggered twiliio alert -- test mode, no sms sent');
  }
};

const handleOneStock = (symbol, response) => {
  // response contains last 100 points of data - we're only interested in the most
  // recent data, so we need to get the most recent date in the series
  const dates = _.keys(response[buildAVSeries()]);
  const recent = Moment
    .max(dates.map(dateString => Moment(dateString, config.alphavantage.dateFormat)))
    .format(config.alphavantage.dateFormat);
  const data = response[buildAVSeries()][recent];

  // destructure the data from the api call
  const { '4. close': close } = data;

  // lookup the current values from the collection (db)
  db.get(symbol).then((local) => {
    // set up buy/sell deltas, even if we don't use them
    const deltaAmount = local.holding * local.delta;
    const deltaPool = deltaAmount * close;
    let updateRequired = false;
    const update = { ...local };

    if (close >= local.initial * (1 + local.threshold)) {
      logger.info(`HANDLE_ONE :: sell trigger for ${symbol}`);

      update.holding -= deltaAmount;
      update.pool += deltaPool;
      update.initial = close;
      updateRequired = true;
      sendTwilioAlert(`SELL -> ${symbol}; ${deltaAmount} UNITS @ ${close}. HOLDING ${update.holding} UNITS, POOL @ ${update.pool}`);
    } else if (close <= local.initial * (1 - local.threshold)) {
      logger.info(`HANDLE_ONE :: buy trigger for ${symbol}`);

      update.holding += deltaAmount;
      update.pool -= deltaPool;
      update.initial = close;
      updateRequired = true;
      sendTwilioAlert(`BUY -> ${symbol}; ${deltaAmount} UNITS @ ${close}. HOLDING ${update.holding} UNITS, POOL @ ${update.pool}`);
    } else {
      logger.info(`HANDLE_ONE :: no action for ${symbol}, current value @ ${close}`);
    }

    if (updateRequired) {
      db.put(update).then(() => {
        logger.info(`HANDLE_ONE :: write to DB > ${symbol}`);
      }).catch(err => logger.error(err));
    }
  }).catch(err => logger.error(err.message));
};

const handleAllStocks = () => {
  db.allDocs({ include_docs: true }).then((stocks) => {
    stocks.rows.forEach((result) => {
      const { doc } = result;
      const { doc: { symbol } } = result;

      RequestPromise(buildRequestPromiseOptions(doc))
        .then(response => handleOneStock(symbol, response))
        .catch(() => logger.error(`HANDLE_ALL :: request failed for ${symbol}`));
    });
  }).catch(err => logger.error(err.message));
};

function main() {
  logger.info('STARTUP :: ** process started **');
  if (!argv.single) {
    // if we're running normal mode...
    // check all stocks exist, create if they don't
    config.stocks.forEach((stock) => {
      db.get(stock.symbol).then((search) => {
        logger.info(`INIT :: found record for ${stock.symbol}: ${JSON.stringify(search)}`);
      }).catch((err) => {
        if (err.status === 404) {
          logger.info(`INIT :: ${stock.symbol} not found, creating record`);
          db.put({ ...stock })
            .then(() => logger.info(`INIT :: ${stock.symbol} write to DB success!`))
            .catch(error => logger.error(`INIT :: ${stock.symbol} failed to write to DB : ${error.message}`));
        }
      });
    });

    setInterval(() => handleAllStocks(), argv.timeout ? argv.timeout : config.alphavantage.timeout);
  } else {
    // otherwise if we're running in single fetch (test AV api) mode
    RequestPromise(buildRequestPromiseOptions({ symbol: argv.single }))
      .then(response => logger.info(response))
      .catch(err => logger.error(err.message));
  }
}

main();
