-- Passthrough staging view over the landed FRED prices.
-- No coercion: a missing print stays NULL (Invariant 1, no fabrication).
select
    series_id,
    observation_date,
    raw_value,
    load_timestamp
from {{ source('silver_sources', 'stg_fred_prices') }}
