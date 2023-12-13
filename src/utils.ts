export const calculateSecondsUntilNextInterval = (seconds: number) => {
  const MINUTES_IN_MILLISECONDS = 1000 * 60 * seconds;

  const now = new Date();
  const next5MinuteInterval = new Date(
    Math.ceil(now.getTime() / MINUTES_IN_MILLISECONDS) * MINUTES_IN_MILLISECONDS
  );

  return Math.floor((next5MinuteInterval.getTime() - now.getTime()) / 1000);
};
