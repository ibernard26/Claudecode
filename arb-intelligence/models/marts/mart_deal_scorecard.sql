-- VP-facing scorecard. Pending deals are censored: no ground-truth label and no
-- Brier term (Invariant 4). Brier is computed ONLY for resolved deals.
with cur as (
    select *
    from {{ ref('fact_deal_state') }}
    where is_current = true
),
labelled as (
    select
        deal_id,
        status,
        p_break_at_announce,
        resolution_date,
        (status = 'pending') as is_censored_from_metrics,
        case
            when status = 'broken' then 1
            when status = 'closed' then 0
            else null
        end as ground_truth_break_label
    from cur
)
select
    deal_id,
    status,
    is_censored_from_metrics,
    p_break_at_announce,
    ground_truth_break_label,
    resolution_date,
    case
        when ground_truth_break_label is null then null
        else pow(p_break_at_announce - ground_truth_break_label, 2)
    end as squared_error_brier
from labelled
