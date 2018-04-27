const request = require('es6-request');
const _ = require('lodash');
const config = require('./config.js');

request.get('https://www.alphavantage.co/query')
  .query({
    'function': 'TIME_SERIES_INTRADAY',
    'outputsize': 'compact',
    'datatype': 'json',
    'apikey': config.apikeys.alphavantage,
    'symbol': 'TSX:T',
    'interval': '60min'
  })
  .then(([body, res]) => {
    console.log(body);
  });
