import axios from "axios";

import { getDateWeeksAgo } from "../utils";

export const hapiToJoy = (hapi: number) => {
  return hapi / 10_000_000_000;
};

export const getNumberOfGithubItemsFromPageNumbers = (linkString: string | undefined) => {
  const result = linkString
    ?.split(",")[1]
    ?.match(/&page=(\d+)/g)?.[0]
    .replace(/&page=(\d+)/g, "$1");

  return result ? parseInt(result) : 0;
};

export const separateQNDataByWeek = (data: { createdAt: string }[]) => {
  let weekIndex = 0;
  let weeks = [];

  let firstDate = new Date(data[0].createdAt);
  let secondDate = new Date(firstDate.getTime());
  secondDate = new Date(firstDate.getTime() + 7 * 24 * 60 * 60 * 1000);

  for (let item of data) {
    if (new Date(item.createdAt) >= firstDate && new Date(item.createdAt) < secondDate) {
      if (!weeks[weekIndex]) {
        weeks[weekIndex] = { from: firstDate, to: secondDate, numberOfItems: 0 };

        if (secondDate > new Date()) {
          weeks[weekIndex].to = new Date();
        }
      }

      weeks[weekIndex].numberOfItems++;
    } else {
      weekIndex++;
      firstDate = new Date(secondDate.getTime());
      secondDate = new Date(firstDate.getTime() + 7 * 24 * 60 * 60 * 1000);

      if (!weeks[weekIndex]) {
        weeks[weekIndex] = { from: firstDate, to: secondDate, numberOfItems: 0 };

        if (secondDate > new Date()) {
          weeks[weekIndex].to = new Date();
        }
      }

      weeks[weekIndex].numberOfItems++;
    }
  }

  return weeks;
};

export const separateQNDataByWeekAndAmount = (data: { createdAt: string; price: string }[]) => {
  let weekIndex = 0;
  let weeks = [];
  let firstDate = new Date(data[0].createdAt);
  let secondDate = new Date(firstDate.getTime());
  secondDate = new Date(firstDate.getTime() + 7 * 24 * 60 * 60 * 1000);

  for (let item of data) {
    if (new Date(item.createdAt) >= firstDate && new Date(item.createdAt) < secondDate) {
      if (!weeks[weekIndex]) {
        weeks[weekIndex] = { from: firstDate, to: secondDate, numberOfItems: 0, amount: 0 };

        if (secondDate > new Date()) {
          weeks[weekIndex].to = new Date();
        }
      }

      weeks[weekIndex].numberOfItems++;
      weeks[weekIndex].amount += hapiToJoy(Number(item.price));
    } else {
      weekIndex++;
      firstDate = new Date(secondDate.getTime());
      secondDate = new Date(firstDate.getTime() + 7 * 24 * 60 * 60 * 1000);

      if (!weeks[weekIndex]) {
        weeks[weekIndex] = { from: firstDate, to: secondDate, numberOfItems: 0, amount: 0 };

        if (secondDate > new Date()) {
          weeks[weekIndex].to = new Date();
        }
      }

      weeks[weekIndex].numberOfItems++;
      weeks[weekIndex].amount += hapiToJoy(Number(item.price));
    }
  }

  return weeks;
};

export const paginatedQNFetch = async <T>(
  queryFunction: (offset: number, limit: number) => string
) => {
  let resultItems: T[] = [];
  let offset = 0;
  const NUMBER_OF_ITEMS_TO_FETCH = 100_000;

  while (true) {
    try {
      const {
        data: { data },
      } = await axios({
        url: "https://query.joystream.org/graphql",
        method: "post",
        data: {
          query: queryFunction(offset, NUMBER_OF_ITEMS_TO_FETCH),
        },
      });

      const key = Object.keys(data)[0];
      const items = data[key];

      resultItems = [...resultItems, ...items];

      if (items.length < NUMBER_OF_ITEMS_TO_FETCH) {
        break;
      }

      offset += NUMBER_OF_ITEMS_TO_FETCH;
    } catch (e) {
      console.log(e);
      return resultItems;
    }
  }

  return resultItems;
};

export const getNumberOfQNItemsInLastWeek = (data: { createdAt: string }[]) => {
  const lastWeek = getDateWeeksAgo(1);

  return data.filter((item) => new Date(item.createdAt) > lastWeek).length;
};

export const getQNItemsSinceDate = (data: { createdAt: string }[], date: Date) => {
  return data.filter((item) => new Date(item.createdAt) > date);
};

export const getTotalPriceOfQNItemsInLastWeek = (data: { createdAt: string; price: string }[]) => {
  const lastWeek = getDateWeeksAgo(1);

  return data.reduce((acc, curr) => {
    if (new Date(curr.createdAt) > lastWeek) {
      return acc + hapiToJoy(Number(curr.price));
    }

    return acc;
  }, 0);
};

export const fetchGenericAPIData = async <T>({
  url,
  headers,
}: {
  url: string;
  headers?: { [key: string]: string };
}) => {
  try {
    const { data } = await axios.get(url, {
      headers,
    });
    return data as T;
  } catch (e) {
    console.log(e);
    return null;
  }
};

export const getTweetscoutLevel = (tweetscoutScore: number) => {
  if (tweetscoutScore < 100) {
    return 1;
  } else if (tweetscoutScore < 500) {
    return 2;
  } else if (tweetscoutScore < 1000) {
    return 3;
  } else if (tweetscoutScore < 2000) {
    return 4;
  }

  return 5;
};
