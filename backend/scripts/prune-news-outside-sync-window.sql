-- Local demo only (run manually). Defaults: 6h past, 12h future — match NEWS_SYNC_PAST_HOURS / NEWS_SYNC_FUTURE_HOURS.
-- Targets ForexFactory rows (legacy + indicator + news sources).

DELETE FROM "PredictionResult"
WHERE "predictionId" IN (
  SELECT p."id"
  FROM "Prediction" p
  LEFT JOIN "NewsItem" n ON n."id" = p."newsItemId"
  WHERE n."source" IN ('forexfactory', 'forexfactory:indicator', 'forexfactory:news')
    AND (
      n."eventStartAt" < NOW() - interval '6 hours'
      OR n."eventStartAt" > NOW() + interval '12 hours'
    )
);

DELETE FROM "Prediction"
WHERE "newsItemId" IN (
  SELECT "id"
  FROM "NewsItem"
  WHERE "source" IN ('forexfactory', 'forexfactory:indicator', 'forexfactory:news')
    AND (
      "eventStartAt" < NOW() - interval '6 hours'
      OR "eventStartAt" > NOW() + interval '12 hours'
    )
);

DELETE FROM "NewsItem"
WHERE "source" IN ('forexfactory', 'forexfactory:indicator', 'forexfactory:news')
  AND (
    "eventStartAt" < NOW() - interval '6 hours'
    OR "eventStartAt" > NOW() + interval '12 hours'
  );
