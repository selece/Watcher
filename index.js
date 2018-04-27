const req = require('request-promise');
const _ = require('lodash');
const config = require('./config.js');

const options = {
  uri: 'https://www.alphavantage.co/query',
  qs: {
    'function': 'TIME_SERIES_INTRADAY',
    'outputsize': 'compact',
    'datatype': 'json',
    'apikey': config.apikeys.alphavantage,
    'symbol': 'TSX:T',
    'interval': '60min'
  },
  headers: {
    'User-Agent': 'Watcher'
  },
  json: true
};

req(options)
  .then(resp => {
    console.log('request good!', resp);
  })
  .catch(err => {
    console.log('request failed!', err);
  });
