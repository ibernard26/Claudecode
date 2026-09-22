-- Invariant 1 (no fabrication): a real market series should never settle at
-- exactly 0.0 — that value is the fingerprint of a NULL coerced to zero.
-- Fails if any key series shows a 0.0 settlement.
select
    price_key,
    series_id,
    observation_date,
    settlement_price
from {{ ref('fact_price') }}
where settlement_price = 0.0
  and series_id in ('DCOILWTICO', 'DCOILBRENTEU', 'SP500', 'NASDAQCOM')
