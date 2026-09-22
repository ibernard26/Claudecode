-- Conformed date dimension. Carries is_trading so every fact can be
-- calendar-gated by joining here (Invariant 2).
select
    cast(strftime(calendar_date, '%Y%m%d') as integer) as date_id,
    calendar_date,
    dayname(calendar_date)                              as day_of_week,
    is_trading,
    holiday_reason
from {{ ref('stg_nyse_calendar') }}
