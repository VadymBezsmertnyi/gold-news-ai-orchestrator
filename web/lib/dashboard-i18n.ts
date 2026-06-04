/** Ukrainian labels and value mappings for the local demo dashboard. */

export const STATS_LABELS = {
  totalNews: "Новин всього",
  pendingAnalysis: "Очікують аналізу",
  analyzed: "Проаналізовано",
  failedAnalysis: "Помилки аналізу",
  pendingPredictions: "Очікують прогнозу",
  activePredictions: "Активні прогнози",
  successful: "Успішні",
  failed: "Неуспішні",
} as const;

export const SECTION_TITLES = {
  globalContext: "Глобальний контекст ринку",
  predictions: "Прогнози",
  recentNews: "Останні новини",
  pendingNews: "Новини в черзі на аналіз",
  learningRules: "Правила навчання",
  logs: "Фонові процеси / логи сервера",
} as const;

export const PREDICTION_HEADERS = {
  news: "Новина",
  source: "Джерело",
  direction: "Напрям",
  confidence: "Впевненість",
  move: "Очікуваний рух",
  tf: "TF",
  entry: "Ціна входу",
  current: "Поточна",
  check: "Перевірка",
  status: "Статус",
  result: "Результат",
} as const;

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

const PREDICTION_STATUS_UA: Record<string, string> = {
  PENDING: "Очікує",
  SUCCESS: "Успіх",
  FAILED: "Помилка",
  EXPIRED: "Прострочено",
};

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

export function translatePredictionStatus(status: string): string {
  return PREDICTION_STATUS_UA[status] ?? status;
}

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
