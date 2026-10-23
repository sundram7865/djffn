// Business-language explanations used in metric tooltips. Sign convention: error = forecast − actual.

export const glossary = {
  cutoff:
    "The moment the buying decision is locked in on the day before delivery (D-1). Only forecasts published at or before this time are used — later updates did not exist yet when you had to bid.",
  mae: "Mean absolute error: the typical size of a miss in MW, regardless of direction. If MAE is 2 GW, the forecast was on average 2 GW away from what wind actually produced.",
  rmse: "Root-mean-square error: like MAE but penalises big misses more. When RMSE is much larger than MAE, a few hours had very large errors.",
  bias: "Average signed error (forecast − actual). Positive means the forecast was too high on average — wind under-delivered, leaving you short.",
  wape: "Total absolute error as a share of total wind energy. A robust 'percent error' that does not blow up when wind is low.",
  mape: "Mean absolute percentage error. Unreliable when wind output is near zero (tiny denominators inflate it); hours below 500 MW are excluded. Prefer WAPE.",
  buffer:
    "The 90th percentile of shortfall (forecast − actual). Planning with wind at 'forecast minus this buffer' would have covered the shortfall in 9 out of 10 hours.",
  p95: "95th percentile of the absolute error: only 1 hour in 20 missed by more than this, in either direction.",
  shortfallShare:
    "Share of hours where wind delivered less than forecast, i.e. hours in which you would have been short.",
  planningRange:
    "The range actual wind fell within in 8 of 10 comparable hours (same cutoff, similar forecast level) on other days of the pilot. The lower edge is the 'firm wind' you could count on 9 times in 10.",
  firm: "Energy wind delivered in at least 9 of 10 comparable hours: the forecast minus the 90th-percentile shortfall for each hour's wind level.",
  horizon:
    "How far ahead the forecast was made: the gap between its publish time and the hour it predicts. Older forecasts are less accurate.",
  peakObserved:
    "MAE relative to the highest wind output seen in the period, a proxy for installed capacity.",
} as const;
