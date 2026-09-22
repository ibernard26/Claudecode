-- Invariant 2 (calendar gate): no settlement price may exist on a non-session date.
-- Returns offending rows; a clean run returns none.
select
    fp.price_key,
    fp.series_id,
    fp.observation_date,
    d.is_trading,
    d.holiday_reason
from {{ ref('fact_price') }} fp
join {{ ref('dim_date') }} d
    on fp.date_id = d.date_id
where d.is_trading = false
