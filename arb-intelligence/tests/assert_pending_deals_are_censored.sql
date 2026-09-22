-- Invariant 4 (censoring): a pending deal must be censored from metrics and must
-- carry no ground-truth label. Fails on any pending deal that leaks into scoring.
select
    deal_id,
    status,
    is_censored_from_metrics,
    ground_truth_break_label
from {{ ref('mart_deal_scorecard') }}
where status = 'pending'
  and (is_censored_from_metrics = false or ground_truth_break_label is not null)
