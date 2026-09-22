-- Static conformed dimension for the tracked FRED series.
with s as (
    select * from (values
        ('SP500',        'SPX',   'S&P 500 Index',          'equity_index'),
        ('NASDAQCOM',    'CCMP',  'NASDAQ Composite Index', 'equity_index'),
        ('DJIA',         'INDU',  'Dow Jones Industrial Avg','equity_index'),
        ('DCOILWTICO',   'CL',    'WTI Cushing Spot',       'crude_oil'),
        ('DCOILBRENTEU', 'CO',    'Brent Europe Spot',      'crude_oil'),
        ('DGS10',        'US10Y', '10-Year Treasury Yield', 'rates'),
        ('FEDFUNDS',     'FF',    'Effective Fed Funds Rate','rates')
    ) as t(series_id, ticker, series_name, asset_class)
)
select series_id, ticker, series_name, asset_class from s
