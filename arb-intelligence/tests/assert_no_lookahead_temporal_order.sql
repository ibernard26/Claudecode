-- Invariant 3 (no lookahead): a fact's market effective time must never be after
-- the time we loaded it. Fails if valid_time > system_time.
select
    price_key,
    series_id,
    observation_date,
    valid_time,
    system_time
from {{ ref('fact_price') }}
where cast(valid_time as timestamp) > system_time
