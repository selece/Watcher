const request = require('es6-request');

request.get('https://www.alphavantage.co/query')
  .query({
    'function': 'TIME_SERIES_DAILY',
    'symbol': 'TSX:T',
    'apikey': '5GZB61X62WLKWE82'
  })
  .then(([body, res]) => {
    console.log(body);
  });
