import config from "./fitting-schedule.json" with { type: "json" };
export const SCHEDULE = config;
export const SLOTS = Array.from(
  { length: config.endHour - config.startHour + 1 },
  (_, i) => `${String(config.startHour + i).padStart(2, "0")}:00`,
);
