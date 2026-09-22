{{ config(materialized='incremental', unique_key='price_key') }}

-- Daily settlement fact. The INNER JOIN to dim_date with is_trading = TRUE is
-- the calendar gate (Invariant 2): a print on a non-session date cannot survive.
-- raw_value flows straight to settlement_price with no coercion (Invariant 1):
-- a missing print stays NULL. valid_time = market effective date; system_time =
-- load timestamp (Invariant 3: effective vs. load time are kept distinct).
with prices as (
    select series_id, observation_date, raw_value, load_timestamp
    from {{ ref('stg_fred_prices') }}
),
gated as (
    select
        p.series_id,
        p.observation_date,
        p.raw_value,
        p.load_timestamp,
        d.date_id
    from prices p
    inner join {{ ref('dim_date') }} d
        on p.observation_date = d.calendar_date
    where d.is_trading = true
)
select
    md5(series_id || '_' || cast(observation_date as varchar)) as price_key,
    series_id,
    date_id,
    observation_date,
    cast(raw_value as double)                    as settlement_price,
    cast(observation_date as timestamp)          as valid_time,
    load_timestamp                               as system_time
from gated
{% if is_incremental() %}
where md5(series_id || '_' || cast(observation_date as varchar)) not in (
    select price_key from {{ this }}
)
{% endif %}
