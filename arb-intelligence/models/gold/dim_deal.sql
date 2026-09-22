-- Current-state deal dimension: distinct active attributes only.
select
    deal_id,
    target,
    acquirer,
    sponsor,
    value_usd_mm,
    sector,
    geography,
    deal_type,
    primary_break_vector,
    announce_date,
    model_version
from {{ source('silver_sources', 'silver_sat_deal') }}
where is_current = true
