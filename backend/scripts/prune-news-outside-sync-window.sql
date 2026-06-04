-- Local demo: remove synced news outside the rolling sync window (defaults: 6h past, 12h future).
-- Match env NEWS_SYNC_PAST_HOURS / NEWS_SYNC_FUTURE_HOURS if you changed them.

DELETE FROM "PredictionResult"
WHERE "predictionId" IN (
  SELECT p."id"
  FROM "Prediction" p
  LEFT JOIN "NewsItem" n ON n."id" = p."newsItemId"
  WHERE n."eventStartAt" < NOW() - interval '6 hours'
     OR n."eventStartAt" > NOW() + interval '12 hours'
);

DELETE FROM "Prediction"
WHERE "newsItemId" IN (
  SELECT "id"
  FROM "NewsItem"
  WHERE "eventStartAt" < NOW() - interval '6 hours'
     OR "eventStartAt" > NOW() + interval '12 hours'
);

DELETE FROM "NewsItem"
WHERE "eventStartAt" < NOW() - interval '6 hours'
   OR "eventStartAt" > NOW() + interval '12 hours';
