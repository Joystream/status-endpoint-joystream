import { BN } from "@polkadot/util";

export const calculateMinutesUntilNextInterval = (minutes: number) => {
  const MINUTES_IN_MILLISECONDS = 1000 * 60 * minutes;

  const now = new Date();
  const nextMinuteInterval = new Date(
    Math.ceil(now.getTime() / MINUTES_IN_MILLISECONDS) * MINUTES_IN_MILLISECONDS
  );

  return Math.floor((nextMinuteInterval.getTime() - now.getTime()) / 1000);
};

export const perbillToPercent = (perbill: BN) => perbill.toNumber() / 10 ** 7;

export const percentToPerbill = (percent: number) => new BN(percent * 10 ** 7);

export const getUnixTimestampFromDate = (date: Date) => {
  return Math.floor(date.getTime() / 1000);
};

export const getTomorrowsDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date;
};

export const getDateDaysAgo = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
};

export const getDateWeeksAgo = (weeks: number) => {
  const date = new Date();
  date.setDate(date.getDate() - weeks * 7);
  return date;
};

export const getDateMonthsAgo = (months: number) => {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return date;
};

export const getDateYearsAgo = (years: number) => {
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  return date;
};

export const getYearMonthDayString = (date: Date) => {
  return date.toISOString().split("T")[0];
};

export const getYearMonthDay = (date: Date) => {
  const [year, month, day] = getYearMonthDayString(date).split("-");
  return { year, month, day };
};
