-- Passthrough staging view over the landed NYSE calendar.
select
    calendar_date,
    is_trading,
    holiday_reason
from {{ source('silver_sources', 'stg_nyse_calendar') }}
