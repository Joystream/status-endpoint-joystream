export const calculateSecondsUntilNext5MinuteInterval = () => {
  const FIVE_MINUTES_IN_MILLISECONDS = 1000 * 60 * 5;

  const now = new Date();
  const next5MinuteInterval = new Date(
    Math.ceil(now.getTime() / FIVE_MINUTES_IN_MILLISECONDS) * FIVE_MINUTES_IN_MILLISECONDS
  );

  return Math.floor((next5MinuteInterval.getTime() - now.getTime()) / 1000);
};
