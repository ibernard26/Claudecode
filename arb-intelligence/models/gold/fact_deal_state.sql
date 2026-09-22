-- Bitemporal deal-state fact. Each row is a deal's state as-of a business date,
-- with system_time recording when we learned it (Invariants 3 & 5). is_censored
-- marks pending deals so downstream metrics can exclude them (Invariant 4).
with sat as (
    select *
    from {{ source('silver_sources', 'silver_sat_deal') }}
),
joined as (
    select
        s.deal_id,
        s.status,
        s.p_break            as p_break_at_announce,
        s.resolution_date,
        s.valid_from,
        s.valid_to,
        s.is_current,
        s.system_time,
        d.date_id            as as_of_date_id
    from sat s
    left join {{ ref('dim_date') }} d
        on s.valid_from = d.calendar_date
)
select
    md5(deal_id || '_' || status || '_' || cast(valid_from as varchar)) as deal_state_key,
    deal_id,
    as_of_date_id,
    status,
    (status = 'pending')  as is_censored,
    p_break_at_announce,
    resolution_date,
    valid_from,
    valid_to,
    is_current,
    system_time
from joined
