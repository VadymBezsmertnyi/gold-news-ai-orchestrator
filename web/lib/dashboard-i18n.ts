/** Ukrainian labels and value mappings for the local demo dashboard. */

/** Compact header chip labels (terminal-style). */
export const HEADER_STAT_CHIPS = {
  news: "новин",
  pendingAnalysis: "очік. аналіз",
  analyzed: "проаналіз.",
  analysisFailed: "помилки аналізу",
  pendingPredictions: "очік. прогноз",
  activePredictions: "активні",
  success: "успішні",
  failed: "неуспішні",
} as const;

export const SECTION_TITLES = {
  globalContext: "Глобальний контекст ринку",
  predictions: "Прогнози",
  recentNews: "Останні новини",
  promptImprovements: "Покращення промптів",
  deprecatedRules: "Застарілі (ринкові) правила",
  logs: "Фонові процеси / логи сервера",
} as const;

export const ROW_DETAILS_LABELS = {
  expand: "Деталі",
  collapse: "Згорнути",
} as const;

export const PREDICTION_DETAIL_LABELS = {
  source: "Тип прогнозу",
  baselineSource: "Джерело стартової ціни",
  eventDuration: "Тривалість події",
  eventStart: "Старт події",
  eventEnd: "Кінець події",
  pricePrediction: "Ціна на момент прогнозу",
  priceEventStart: "Стартова ціна",
  liveEvaluation: "Live оцінка",
  moveAccuracy: "Точність руху",
  finalScore: "Підсумкова оцінка",
  directionGuess: "Напрям вгадано",
} as const;

export const NEWS_DETAIL_LABELS = {
  source: "Джерело",
  published: "Опубліковано",
  category: "Категорія",
  summary: "Аналіз",
} as const;

export const PREDICTION_HEADERS = {
  news: "Новина",
  impact: "Вплив",
  direction: "Напрям",
  confidence: "Впевн.",
  status: "Статус",
  eventState: "Стан події",
  startPrice: "Стартова ціна",
  expectedPrice: "Ціль",
  finalPrice: "Поточна / фінальна",
  expectedMove: "Очік.%",
  actualMove: "Факт%",
  goalCompletion: "Виконання цілі",
  liveEvaluation: "Live",
} as const;

export const GOAL_COMPLETION_TOOLTIP =
  "Показує, який відсоток очікуваного руху вже досягнуто ринком.";

export const CURRENT_OR_FINAL_PRICE_TOOLTIP =
  "Для активних і майбутніх прогнозів — поточна ринкова ціна. Для завершених — ціна на момент оцінки.";

export function translateDirectionGuessBadge(value: boolean | null): {
  label: string;
  tone: "ok" | "fail" | "muted";
} {
  if (value == null) return { label: "—", tone: "muted" };
  if (value) return { label: "Вгадано", tone: "ok" };
  return { label: "Не вгадано", tone: "fail" };
}

export function scorePercentTone(
  value: number | null,
): "low" | "mid" | "high" | "muted" {
  if (value == null) return "muted";
  if (value <= 30) return "low";
  if (value <= 70) return "mid";
  return "high";
}

export const NEWS_HEADERS = {
  title: "Заголовок",
  source: "Джерело",
  published: "Опубліковано",
  status: "Статус",
  category: "Категорія",
  impact: "Вплив",
  gold: "Золото",
  summary: "Короткий аналіз",
} as const;

export const LOG_HEADERS = {
  time: "Час",
  level: "Рівень",
  type: "Тип",
  message: "Повідомлення",
  meta: "Meta",
} as const;

const ANALYSIS_STATUS_UA: Record<string, string> = {
  PENDING: "Очікує",
  ANALYZED: "Готово",
  FAILED: "Помилка",
};

export const CHIP_LABELS = {
  highImpact: "HIGH / глобальні",
  success: "Успішних",
  failed: "Неуспішних",
  pending: "Очікують",
  missingBaseline: "Без стартової ціни",
} as const;

export function translateImpactLevel(level: string | null): string {
  if (!level) return "—";
  const key = level.toUpperCase();
  if (key === "HIGH") return "Високий вплив";
  if (key === "MEDIUM") return "Середній вплив";
  if (key === "LOW") return "Низький вплив";
  return level;
}

const RESULT_UA: Record<string, string> = {
  SUCCESS: "Успіх",
  FAILED: "Помилка",
};

const LOG_MESSAGE_UA: Record<string, string> = {
  "Scheduled news sync started": "Синхронізацію новин запущено",
  "Scheduled news sync completed": "Синхронізацію новин завершено",
  "Pending news analysis started": "Аналіз новин запущено",
  "Pending news analysis completed": "Аналіз новин завершено",
  "Due prediction evaluation started": "Перевірку прогнозів запущено",
  "Due prediction evaluation completed": "Перевірку прогнозів завершено",
  "MetaAPI streaming connect started": "Підключення MetaAPI запущено",
  "MetaAPI websocket connected": "MetaAPI websocket підключено",
  "MetaAPI terminal state ready": "MetaAPI синхронізовано",
  "MetaAPI live price stream ready for XAUUSD": "Потік цін MetaAPI готовий",
  "MetaAPI disconnected": "MetaAPI відключено",
  "Scheduler started — running initial background jobs":
    "Планувальник запущено — початкові задачі",
};

export function translateAnalysisStatus(status: string): string {
  return ANALYSIS_STATUS_UA[status] ?? status;
}

export type PredictionStatusTone =
  | "success"
  | "failed"
  | "pending"
  | "overdue"
  | "noBaseline"
  | "muted";

/** Single unified status for the predictions table (replaces duplicate status/result columns). */
export function translatePredictionDisplayStatus(row: {
  result: string | null;
  status: string;
  isOverdue: boolean;
  missingEventStartPrice: boolean;
}): { label: string; tone: PredictionStatusTone } {
  if (row.missingEventStartPrice) {
    return { label: "Немає стартової ціни", tone: "noBaseline" };
  }
  if (row.result === "SUCCESS" || row.status === "SUCCESS") {
    return { label: "Успіх", tone: "success" };
  }
  if (row.result === "FAILED" || row.status === "FAILED") {
    return { label: "Помилка", tone: "failed" };
  }
  if (row.status === "PENDING" && row.isOverdue) {
    return { label: "Не оцінено", tone: "overdue" };
  }
  if (row.status === "PENDING") {
    return { label: "Очікує", tone: "pending" };
  }
  if (row.status === "EXPIRED") {
    return { label: "Прострочено", tone: "overdue" };
  }
  return { label: "—", tone: "muted" };
}

export type LiveEvalTone = "confirm" | "deny" | "insufficient";

export function translateResult(result: string | null): string {
  if (!result) return "—";
  return RESULT_UA[result] ?? result;
}

export function translateLogMessage(message: string): string {
  if (LOG_MESSAGE_UA[message]) return LOG_MESSAGE_UA[message];
  for (const [en, ua] of Object.entries(LOG_MESSAGE_UA)) {
    if (message.startsWith(en)) return message.replace(en, ua);
  }
  if (message.startsWith("MetaAPI connect failed:"))
    return message.replace("MetaAPI connect failed:", "Помилка MetaAPI:");
  if (message.startsWith("Using mock XAUUSD price"))
    return "Використовується mock-ціна XAUUSD";
  return message;
}

export function sourceBadgeLabel(source: "metaapi" | "mock"): string {
  return source === "metaapi" ? "MetaAPI" : "Mock";
}

export function connectionBadgeLabel(connected: boolean): string {
  return connected ? "Підключено" : "Немає зʼєднання";
}

export function predictionSourceLabel(sourceType: string): string {
  if (sourceType === "GLOBAL_CONTEXT") return "Глобальний";
  if (sourceType === "SINGLE_NEWS") return "Новина";
  return sourceType;
}

const BASELINE_SOURCE_UA: Record<string, string> = {
  live_at_event_start: "Live",
  metaapi_history: "MetaAPI",
  snapshot_before: "Snapshot",
  snapshot_after: "Snapshot",
  priceAtEventStart: "Збережена",
  priceAtPrediction: "Ціна прогнозу",
  missing: "немає",
};

export const GLOBAL_CONTEXT_LABELS = {
  drivers: "Основні драйвери",
  risks: "Ризики",
  showFull: "Показати повний аналіз",
  hideFull: "Сховати повний аналіз",
} as const;

export function translateBaselineSource(source: string | null): string {
  if (!source) return "немає";
  return BASELINE_SOURCE_UA[source] ?? source;
}
