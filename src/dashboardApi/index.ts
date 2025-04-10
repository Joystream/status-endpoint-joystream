import assert from "assert";
import { config } from "dotenv";
import { Octokit } from "octokit";
import { REST, Routes, GuildChannel } from "discord.js";

import { JoyApi } from "../joyApi";

import {
  fetchGenericAPIData,
  getNumberOfGithubItemsFromPageNumbers,
  getNumberOfQNItemsInLastWeek,
  getQNItemsSinceDate,
  getTotalPriceOfQNItemsInLastWeek,
  getTweetscoutLevel,
  hapiToJoy,
  paginatedQNFetch,
  separateQNDataByWeek,
  separateQNDataByWeekAndAmount,
} from "./utils";
import {
  GithubContributor,
  GenericQNTractionItem,
  ChannelsQueryData,
  VideosConnectionData,
  CommentsAndReactionsData,
  NFTBoughtEventsData,
  TeamWorkingGroupQNData,
  TeamCouncilQNData,
  TeamWorkingGroupResult,
  TeamCouncilResult,
  TweetScoutScoreData,
  TweetScoutGeneralData,
  TweetScoutTopFollowers,
  TelegramAPIResult,
  DiscordUser,
  DiscordAPIEvent,
  DiscordEvent,
  TweetScoutAPITopFollowers,
  TokenQNMintingData,
  CoingGeckoMarketChartRange,
  TimestampToValueTupleArray,
  ExchangeSpecificData,
  CoingGeckoExchangeData,
  FDVs,
  CoinGeckoMarketsData,
} from "./types";
import { TEAM_QN_QUERIES, TOKEN_MINTING_QN_QUERY, TRACTION_QN_QUERIES } from "./queries";
import {
  getDateWeeksAgo,
  getDateMonthsAgo,
  getTomorrowsDate,
  getUnixTimestampFromDate,
  getDateDaysAgo,
  getDateYearsAgo,
} from "../utils";

config();

assert(process.env.GITHUB_AUTH_TOKEN, "Missing environment variable: GITHUB_AUTH_TOKEN");
assert(process.env.TWEETSCOUT_API_KEY, "Missing environment variable: TWEETSCOUT_API_KEY");
assert(process.env.TELEGRAM_BOT_ID, "Missing e  nvironment variable: TELEGRAM_BOT_ID");
assert(process.env.DISCORD_BOT_TOKEN, "Missing environment variable: DISCORD_BOT_TOKEN");
assert(
  process.env.DISCORD_SERVER_GUILD_ID,
  "Missing environment variable: DISCORD_SERVER_GUILD_ID"
);
assert(process.env.COINGECKO_API_KEY, "Missing environment variable: COINGECKO_API_KEY");

const GITHUB_AUTH_TOKEN = process.env.GITHUB_AUTH_TOKEN;
const TWEETSCOUT_API_KEY = process.env.TWEETSCOUT_API_KEY;
const TELEGRAM_BOT_ID = process.env.TELEGRAM_BOT_ID;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_SERVER_GUILD_ID = process.env.DISCORD_SERVER_GUILD_ID;
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY;

const GITHUB_JOYSTREAM_ORGANIZATION_NAME = "joystream";
const BLOCKS_IN_A_WEEK = 10 * 60 * 24 * 7;

const DISCRETIONARY_PAYMENT_EXCLUSION_KEYWORDS = ["crew3", "zealy"];

const WORKING_GROUP_NAMES = {
  operationsWorkingGroupBeta: "Human Resources",
  contentWorkingGroup: "Content",
  operationsWorkingGroupAlpha: "Builders",
  distributionWorkingGroup: "Distribution",
  storageWorkingGroup: "Storage",
  operationsWorkingGroupGamma: "Marketing",
  forumWorkingGroup: "Forum",
  membershipWorkingGroup: "Membership",
  appWorkingGroup: "Apps",
};

const GITHUB_REPOS_TO_IGNORE = [
  "cosmos-sdk",
  "Web3-collaboration",
  "substrate",
  "polkadot-wiki",
  "rust-on-raspberry-docker",
  "warthog",
  "substrate-telemetry",
  "graphql-playground",
  "typeorm",
  "ss58-registry",
  "wallet-connect",
];

// This timestamp is for the earliest date JOY is saved on CMC. This date happens
// a bit later on CoinGecko, but we'll use this date as it works regardless.
// const UNIX_TIMESTAMP_OF_JOY_LAUNCH = 1685664000;

export class DashboardAPI {
  githubAPI: Octokit;
  joyAPI: JoyApi;
  discordAPI: REST;

  constructor() {
    this.githubAPI = new Octokit({ auth: GITHUB_AUTH_TOKEN });
    this.joyAPI = new JoyApi();
    this.discordAPI = new REST({ version: "10" }).setToken(DISCORD_BOT_TOKEN);
  }

  async fetchAllRepoCommits(repoName: string, since: string) {
    const MAX_COMMIT_NUMBER_PER_PAGE = 100;
    const data = [];
    let page = 1;

    while (true) {
      const { data: pageData } = await this.githubAPI.request(
        "GET /repos/{username}/{repo}/commits",
        {
          page,
          username: GITHUB_JOYSTREAM_ORGANIZATION_NAME,
          repo: repoName,
          per_page: MAX_COMMIT_NUMBER_PER_PAGE,
          since,
        }
      );

      data.push(...pageData);

      if (pageData.length < MAX_COMMIT_NUMBER_PER_PAGE) {
        break;
      }

      page++;
    }

    return data;
  }

  async fetchRepoInformation(repoName: string) {
    const twoMonthsAgoDate = getDateMonthsAgo(2);

    const [
      { data: generalRepoInformation },
      { headers: pullRequestHeaders },
      { headers: commitHeaders },
      { data: contributors },
      commits,
    ] = await Promise.all([
      this.githubAPI.request("GET /repos/{username}/{repo}", {
        username: GITHUB_JOYSTREAM_ORGANIZATION_NAME,
        repo: repoName,
      }),
      this.githubAPI.request("GET /repos/{owner}/{repo}/pulls", {
        owner: GITHUB_JOYSTREAM_ORGANIZATION_NAME,
        repo: repoName,
        per_page: 1,
        page: 1,
      }),
      this.githubAPI.request("GET /repos/{username}/{repo}/commits", {
        username: GITHUB_JOYSTREAM_ORGANIZATION_NAME,
        repo: repoName,
        per_page: 1,
        page: 1,
      }),
      this.githubAPI.request("GET /repos/{owner}/{repo}/contributors", {
        owner: GITHUB_JOYSTREAM_ORGANIZATION_NAME,
        repo: repoName,
        per_page: 5000,
      }),
      this.fetchAllRepoCommits(repoName, twoMonthsAgoDate.toISOString()),
    ]);

    const numberOfPullRequests = getNumberOfGithubItemsFromPageNumbers(pullRequestHeaders.link);

    return {
      name: repoName,
      numberOfStars: generalRepoInformation.stargazers_count,
      numberOfCommits: getNumberOfGithubItemsFromPageNumbers(commitHeaders.link),
      numberOfOpenIssues: generalRepoInformation.open_issues_count - numberOfPullRequests,
      numberOfPullRequests,
      contributors,
      commits,
    };
  }

  async fetchGithubUsersRealName(githubUsername: string) {
    const {
      data: { name },
    } = await this.githubAPI.request("GET /users/{username}", {
      username: githubUsername,
    });

    return name;
  }

  async getTokenMintingData() {
    let workerMintingPercentage = null;
    let creatorPayoutsMintingPercentage = null;
    let spendingProposalsMintingPercentage = null;
    let validatorMintingPercentage = null;

    const qnMintingData = await this.joyAPI.qnQuery<TokenQNMintingData>(TOKEN_MINTING_QN_QUERY());
    const validatorRewards = await this.joyAPI.getYearOfValidatorRewards();

    if (!qnMintingData) {
      return {
        workerMintingPercentage,
        creatorPayoutsMintingPercentage,
        spendingProposalsMintingPercentage,
        validatorMintingPercentage,
      };
    }

    const cumulativeCreatorPayoutsAmount = hapiToJoy(
      Number(
        qnMintingData.channelRewardClaimedEvents.reduce(
          (acc, event) => acc + BigInt(event.amount),
          BigInt(0)
        )
      )
    );

    const cumulativeSpendingProposalsAmount = hapiToJoy(
      Number(
        qnMintingData.requestFundedEvents.reduce(
          (acc, event) => acc + BigInt(event.amount),
          BigInt(0)
        )
      )
    );

    const oneYearAgo = getDateYearsAgo(1);

    const cumulativeWorkersRewardsAmount = hapiToJoy(
      Number(
        qnMintingData.workers.reduce(
          (acc, worker) =>
            acc +
            worker.payouts.reduce((acc, payout) => {
              if (new Date(payout.createdAt) > oneYearAgo) {
                return acc + BigInt(payout.amount);
              }

              return acc;
            }, BigInt(0)),
          BigInt(0)
        )
      )
    );

    const cumulativeCouncilorRewardsAmount = hapiToJoy(
      Number(
        qnMintingData.councilMembers.reduce(
          (acc, councilMember) =>
            acc +
            councilMember.rewardpaymenteventcouncilMember.reduce((acc, reward) => {
              if (new Date(reward.createdAt) > oneYearAgo) {
                return acc + BigInt(reward.paidBalance);
              }

              return acc;
            }, BigInt(0)),
          BigInt(0)
        )
      )
    );

    // Discretionary WG payments have not only been used to pay out workers but for auxiliary
    // actions as well (e.g., burning tokens or providing liqudity for JOY to USDT conversions).
    // We need to subtract those amounts from the total amount of minted tokens but they're not
    // tracked in the QN at the moment. That's why these values will be hardcoded for now.
    const cumulativeDiscretionaryPaymentAmount = hapiToJoy(
      Number(
        qnMintingData.budgetSpendingEvents.reduce((acc, event) => {
          for (let keyword of DISCRETIONARY_PAYMENT_EXCLUSION_KEYWORDS) {
            if (event.rationale?.toLowerCase().includes(keyword)) {
              return acc;
            }
          }

          return acc + BigInt(event.amount);
        }, BigInt(0))
      )
    );

    const cumulativeTotalWorkersRewardsAmount =
      cumulativeWorkersRewardsAmount +
      cumulativeCouncilorRewardsAmount +
      cumulativeDiscretionaryPaymentAmount;

    const totalMinting =
      cumulativeCreatorPayoutsAmount +
      cumulativeSpendingProposalsAmount +
      cumulativeTotalWorkersRewardsAmount +
      validatorRewards;

    workerMintingPercentage = (cumulativeTotalWorkersRewardsAmount / totalMinting) * 100;
    creatorPayoutsMintingPercentage = (cumulativeCreatorPayoutsAmount / totalMinting) * 100;
    spendingProposalsMintingPercentage = (cumulativeSpendingProposalsAmount / totalMinting) * 100;
    validatorMintingPercentage = (validatorRewards / totalMinting) * 100;

    return {
      workerMintingPercentage,
      creatorPayoutsMintingPercentage,
      spendingProposalsMintingPercentage,
      validatorMintingPercentage,
    };
  }

  async getTokenData() {
    let price: number | null = null;
    let priceWeeklyChange = null;
    let longTermPriceData: TimestampToValueTupleArray = [];
    let marketCap = null;
    let marketCapWeeklyChange = null;
    let volume = null;
    let volumeWeeklyChange = null;
    let longTermVolumeData: TimestampToValueTupleArray = [];
    let exchanges: ExchangeSpecificData | null = null;
    let fdvs: FDVs | null = null;
    let joyAnnualInflation = null;
    let percentSupplyStakedForValidation = null;

    const [weekPricingData, marketsData] = await Promise.all([
      fetchGenericAPIData<CoingGeckoMarketChartRange>({
        url: `https://api.coingecko.com/api/v3/coins/joystream/market_chart/range`,
        params: {
          vs_currency: "usd",
          to: getUnixTimestampFromDate(getTomorrowsDate()),
          from: getUnixTimestampFromDate(getDateWeeksAgo(1)),
        },
        headers: {
                  "Content-Type": "application/json",
                  "x-cg-demo-api-key": COINGECKO_API_KEY,
        }
      }),
      fetchGenericAPIData<CoinGeckoMarketsData>({
        url: `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=deso,theta-token,livepeer,cyberconnect&x-cg-demo-api-key=${COINGECKO_API_KEY}`,
      }),
    ]);

    if (weekPricingData) {
      const lastWeekPrice = Number(weekPricingData.prices[0][1]);
      price = Number(weekPricingData.prices.slice(-1)[0][1]);
      priceWeeklyChange = ((price - lastWeekPrice) / lastWeekPrice) * 100;
    }

    const [
      dailyLongTermTokenData,
      dailyShortTermTokenData,
      circulatingSupply,
      totalSupply,
      exchangeData,
      tokenMintingData,
      inflation,
      totalStaked,
      apr,
    ] = await Promise.all([
      fetchGenericAPIData<CoingGeckoMarketChartRange>({
        url: `https://api.coingecko.com/api/v3/coins/joystream/market_chart/range?vs_currency=usd&from=${getUnixTimestampFromDate(
          getDateYearsAgo(1)
        )}&to=${getUnixTimestampFromDate(new Date())}&x-cg-demo-api-key=${COINGECKO_API_KEY}`,
      }),
      fetchGenericAPIData<CoingGeckoMarketChartRange>({
        url: `https://api.coingecko.com/api/v3/coins/joystream/market_chart/range?vs_currency=usd&from=${getUnixTimestampFromDate(
          getDateDaysAgo(1)
        )}&to=${getUnixTimestampFromDate(new Date())}&x-cg-demo-api-key=${COINGECKO_API_KEY}`,
      }),
      this.joyAPI.calculateCirculatingSupply(),
      this.joyAPI.totalIssuanceInJOY(),
      await fetchGenericAPIData<CoingGeckoExchangeData>({
        url: `https://api.coingecko.com/api/v3/coins/joystream/tickers?depth=true&x-cg-demo-api-key=${COINGECKO_API_KEY}`,
      }),
      this.getTokenMintingData(),
      this.joyAPI.getInflationPercentValue(),
      this.joyAPI.totalStaked(),
      this.joyAPI.APR(),
    ]);

    if (dailyLongTermTokenData && dailyShortTermTokenData) {
      longTermPriceData = [...dailyLongTermTokenData.prices, [new Date().getTime(), price ?? 0]];

      const lastWeekVolume =
        dailyLongTermTokenData.total_volumes[dailyLongTermTokenData.total_volumes.length - 7][1];

      volume =
        dailyShortTermTokenData.total_volumes[dailyShortTermTokenData.total_volumes.length - 1][1];
      volumeWeeklyChange = ((volume - lastWeekVolume) / lastWeekVolume) * 100;
      longTermVolumeData = [
        ...dailyLongTermTokenData.total_volumes,
        [new Date().getTime(), volume],
      ];

      const lastWeekMarketCap =
        dailyLongTermTokenData.market_caps[dailyLongTermTokenData.market_caps.length - 7][1];

      marketCap = price ? circulatingSupply * price : null;
      marketCapWeeklyChange = (((marketCap ?? 0) - lastWeekMarketCap) / lastWeekMarketCap) * 100;
    }

    if (exchangeData) {
      exchanges = exchangeData.tickers.reduce((acc, curr) => {
        if (acc[curr.market.identifier] === undefined) {
          acc[curr.market.identifier] = {
            volume: curr.converted_volume.usd,
            plus2PercentDepth: curr.cost_to_move_up_usd,
            minus2PercentDepth: curr.cost_to_move_down_usd,
          };
        }

        return acc;
      }, {} as ExchangeSpecificData);
    }

    if (marketsData) {
      fdvs = marketsData.reduce((acc, curr) => {
        acc[curr.symbol] = curr.fully_diluted_valuation;

        return acc;
      }, {} as FDVs);
    }

    if (totalStaked) {
      joyAnnualInflation = inflation;
      percentSupplyStakedForValidation = (hapiToJoy(totalStaked) / totalSupply) * 100;
    }

    return {
      price,
      priceWeeklyChange,
      longTermPriceData,
      marketCap,
      marketCapWeeklyChange,
      volume,
      volumeWeeklyChange,
      longTermVolumeData,
      exchanges,
      fdvs,
      circulatingSupply,
      fullyDilutedValue: price ? totalSupply * price : null,
      totalSupply,
      tokenMintingData,
      joyAnnualInflation,
      percentSupplyStakedForValidation,
      apr,
    };
  }

  async getTractionData() {
    // ===============
    // QUERY NODE DATA
    // ===============
    let totalNumberOfChannels = null;
    let totalNumberOfChannelsWeeklyChange = null;
    let weeklyChannelData = null;
    let totalNumberOfVideos = null;
    let totalNumberOfVideosWeeklyChange = null;
    let weeklyVideoData = null;
    let totalNumberOfCommentsAndReactions = null;
    let totalNumberOfCommentsAndReactionsWeeklyChange = null;
    let weeklyCommentsAndReactionsData = null;
    let totalVolumeOfSoldNFTs = null;
    let totalVolumeOfSoldNFTsWeeklyChange = null;
    let weeklyVolumeOfSoldNFTs = null;

    const [
      channelsData,
      videosCountData,
      videosData,
      commentsAndReactionsData,
      nftBoughtEventsData,
      averageBlockTime,
      extrinsicData,
      accountsData,
      dailyActiveAccountData,
    ] = await Promise.all([
      this.joyAPI.qnQuery<ChannelsQueryData>(TRACTION_QN_QUERIES.CHANNELS()),
      this.joyAPI.qnQuery<VideosConnectionData>(TRACTION_QN_QUERIES.VIDEOS_CONNECTION),
      paginatedQNFetch<GenericQNTractionItem>(TRACTION_QN_QUERIES.VIDEOS),
      this.joyAPI.qnQuery<CommentsAndReactionsData>(TRACTION_QN_QUERIES.COMMENTS_AND_REACTIONS()),
      this.joyAPI.qnQuery<NFTBoughtEventsData>(TRACTION_QN_QUERIES.NFT_BOUGHT_EVENTS),
      this.joyAPI.avgBlockTime(),
      this.joyAPI.extrinsicsStats(),
      this.joyAPI.accountsStats(),
      this.joyAPI.dailyActiveAccountsStats()
    ]);

    if (channelsData) {
      const { channels } = channelsData;

      const numberOfChannelsAWeekAgo = channels.length - getNumberOfQNItemsInLastWeek(channels);

      totalNumberOfChannels = channels.length;
      totalNumberOfChannelsWeeklyChange =
        ((totalNumberOfChannels - numberOfChannelsAWeekAgo) / numberOfChannelsAWeekAgo) * 100;
      weeklyChannelData = separateQNDataByWeek(getQNItemsSinceDate(channels, getDateMonthsAgo(6)));
    }

    if (videosCountData && videosData) {
      const {
        videosConnection: { totalCount },
      } = videosCountData;

      const numberOfVideosAWeekAgo = totalCount - getNumberOfQNItemsInLastWeek(videosData);

      totalNumberOfVideos = videosCountData.videosConnection.totalCount;
      totalNumberOfVideosWeeklyChange =
        ((totalNumberOfVideos - numberOfVideosAWeekAgo) / numberOfVideosAWeekAgo) * 100;
      weeklyVideoData = separateQNDataByWeek(videosData);
    }

    if (commentsAndReactionsData) {
      const {
        commentsConnection: { totalCount: allTimeNumberOfComments },
        commentReactionsConnection: { totalCount: allTimeNumberOfCommentReactions },
        videoReactionsConnection: { totalCount: allTimeNumberOfVideoReactions },
        comments,
        commentReactions,
        videoReactions,
      } = commentsAndReactionsData;

      totalNumberOfCommentsAndReactions =
        allTimeNumberOfComments + allTimeNumberOfCommentReactions + allTimeNumberOfVideoReactions;

      const numberOfCommentsAndReactionsAWeekAgo =
        totalNumberOfCommentsAndReactions -
        getNumberOfQNItemsInLastWeek([...comments, ...commentReactions, ...videoReactions]);

      totalNumberOfCommentsAndReactionsWeeklyChange =
        ((totalNumberOfCommentsAndReactions - numberOfCommentsAndReactionsAWeekAgo) /
          numberOfCommentsAndReactionsAWeekAgo) *
        100;
      weeklyCommentsAndReactionsData = separateQNDataByWeek(
        [...comments, ...commentReactions, ...videoReactions].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        )
      );
    }

    if (nftBoughtEventsData) {
      const { nftBoughtEvents } = nftBoughtEventsData;

      totalVolumeOfSoldNFTs = hapiToJoy(
        nftBoughtEvents.reduce((acc: number, curr) => acc + Number(curr.price), 0)
      );

      const totalVolumeOfSoldNFTsAWeekAgo =
        totalVolumeOfSoldNFTs - getTotalPriceOfQNItemsInLastWeek(nftBoughtEvents);

      totalVolumeOfSoldNFTsWeeklyChange =
        ((totalVolumeOfSoldNFTs - totalVolumeOfSoldNFTsAWeekAgo) / totalVolumeOfSoldNFTsAWeekAgo) *
        100;
      weeklyVolumeOfSoldNFTs = separateQNDataByWeekAndAmount(nftBoughtEvents);
    }

    // ==================
    // SQUID ARCHIVE DATA
    // ==================
    let totalNumberOfTransactions = null;
    let totalNumberOfTransactionsWeeklyChange = null;
    let totalNumberOfAccountHolders = null;
    let totalNumberOfAccountHoldersWeeklyChange = null;
    let numberOfDailyActiveAccounts = null;
    let numberOfDailyActiveAccountsWeeklyChange = null;

    if (extrinsicData) {
      totalNumberOfTransactions = extrinsicData.now;
      totalNumberOfTransactionsWeeklyChange =
        ((extrinsicData.now - extrinsicData.weekAgo) / extrinsicData.weekAgo) * 100;
    }

    if (accountsData) {
      totalNumberOfAccountHolders = accountsData.now;
      totalNumberOfAccountHoldersWeeklyChange =
        ((accountsData.now - accountsData.weekAgo) / accountsData.weekAgo) * 100;
    }

    if (dailyActiveAccountData) {
      // `now` is actually the number of active accounts from yesterday till today,
      // as the data for today would not yet be complete.
      numberOfDailyActiveAccounts = dailyActiveAccountData.now;
      numberOfDailyActiveAccountsWeeklyChange =
        ((dailyActiveAccountData.now - dailyActiveAccountData.weekAgo) / dailyActiveAccountData.weekAgo) * 100;
    }

    return {
      totalNumberOfChannels,
      totalNumberOfChannelsWeeklyChange,
      weeklyChannelData,
      totalNumberOfVideos,
      totalNumberOfVideosWeeklyChange,
      weeklyVideoData,
      totalNumberOfCommentsAndReactions,
      totalNumberOfCommentsAndReactionsWeeklyChange,
      weeklyCommentsAndReactionsData,
      totalVolumeOfSoldNFTs,
      totalVolumeOfSoldNFTsWeeklyChange,
      weeklyVolumeOfSoldNFTs,
      averageBlockTime,
      totalNumberOfTransactions,
      totalNumberOfTransactionsWeeklyChange,
      totalNumberOfAccountHolders,
      totalNumberOfAccountHoldersWeeklyChange,
      numberOfDailyActiveAccounts,
      numberOfDailyActiveAccountsWeeklyChange,
    };
  }

  async fetchDiscordUsers() {
    let after = "0";
    let usersResult: DiscordUser[] = [];

    while (true) {
      const users = (await this.discordAPI.get(Routes.guildMembers(DISCORD_SERVER_GUILD_ID), {
        query: new URLSearchParams([
          ["limit", "1000"],
          ["after", after],
        ]),
      })) as DiscordUser[];

      usersResult = [...usersResult, ...users];

      if (users.length === 0) {
        break;
      }

      after = users[users.length - 1].user.id;
    }

    return usersResult;
  }

  async getDiscordEventLocation(channelId: string) {
    const channel = (await this.discordAPI.get(Routes.channel(channelId))) as GuildChannel;

    return channel.name;
  }

  async getCommunityData() {
    let twitterFollowerCount = null;
    let discordMemberCount = null;
    let discordMemberCountMonthlyChange = null;
    let telegramMemberCount = null;
    let tweetscoutScore = null;
    let tweetscoutLevel = null;
    let featuredFollowers: TweetScoutTopFollowers = [];
    let discordEvents: DiscordEvent[] = [];

    const [
      tweetScoutScoreData,
      joystreamDAOInfo,
      topFollowers,
      telegramMemberCountResult,
      events,
      discordUsers,
    ] = await Promise.all([
      fetchGenericAPIData<TweetScoutScoreData>({
        url: "https://api.tweetscout.io/v2/score/joystreamdao",
        headers: {
          ApiKey: TWEETSCOUT_API_KEY,
        },
      }),
      fetchGenericAPIData<TweetScoutGeneralData>({
        url: "https://api.tweetscout.io/v2/info/joystreamdao",
        headers: {
          ApiKey: TWEETSCOUT_API_KEY,
        },
      }),
      fetchGenericAPIData<TweetScoutAPITopFollowers>({
        url: "https://api.tweetscout.io/v2/top-followers/joystreamdao?from=db",
        headers: {
          ApiKey: TWEETSCOUT_API_KEY,
        },
      }),
      fetchGenericAPIData<TelegramAPIResult>({
        url: `https://api.telegram.org/bot${TELEGRAM_BOT_ID}/getChatMembersCount?chat_id=@JoystreamOfficial`,
      }),
      this.discordAPI.get(Routes.guildScheduledEvents(DISCORD_SERVER_GUILD_ID)) as Promise<
        DiscordAPIEvent[]
      >,
      this.fetchDiscordUsers(),
    ]);

    if (tweetScoutScoreData) {
      tweetscoutScore = tweetScoutScoreData.score;
      tweetscoutLevel = getTweetscoutLevel(tweetScoutScoreData.score);
    }

    if (joystreamDAOInfo) {
      twitterFollowerCount = joystreamDAOInfo.followers_count;
    }

    if (topFollowers) {
      featuredFollowers = topFollowers.map(({ avatar, name, screeName, followersCount }) => ({
        avatar,
        name,
        screenName: screeName,
        followersCount,
      }));
    }

    if (telegramMemberCountResult) {
      telegramMemberCount = telegramMemberCountResult.result;
    }

    if (events.length != 0) {
      discordEvents = await Promise.all(
        events.map(async (event) => ({
          image: event.image
            ? `https://cdn.discordapp.com/guild-events/${event.id}/${event.image}.png?size=1024`
            : null,
          name: event.name,
          scheduledStartTime: event.scheduled_start_time,
          description: event.description,
          location: event.channel_id ? await this.getDiscordEventLocation(event.channel_id) : null,
        }))
      );
    }

    if (discordUsers.length != 0) {
      const oneMonthAgo = getDateMonthsAgo(1);

      const numberOfUsersJoinedInLastMonth = discordUsers.filter(
        (user) => new Date(user.joined_at) > oneMonthAgo
      ).length;
      const usersLastMonth = discordUsers.length - numberOfUsersJoinedInLastMonth;
      const percentChange = ((discordUsers.length - usersLastMonth) / usersLastMonth) * 100;

      discordMemberCount = discordUsers.length;
      discordMemberCountMonthlyChange = percentChange;
    }

    return {
      twitterFollowerCount,
      discordMemberCount,
      discordMemberCountMonthlyChange,
      telegramMemberCount,
      tweetscoutScore,
      tweetscoutLevel,
      featuredFollowers,
      discordEvents,
    };
  }

  async getTeamData() {
    let workingGroups: TeamWorkingGroupResult = {};
    let councilMembers: TeamCouncilResult = [];
    let currentCouncilTerm = null;
    let councilTermLengthInDays = null;
    let startOfCouncilElectionRound = null;
    let endOfCouncilElectionRound = null;
    let weeklyCouncilorSalaryInJOY = null;

    const [
      idlePeriodDuration,
      councilorReward,
      voteStageDuration,
      revealStageDuration,
      announcingPeriodDuration,
      councilData,
      workersData,
    ] = await Promise.all([
      this.joyAPI.api.consts.council.idlePeriodDuration.toNumber(),
      (await this.joyAPI.api.query.council.councilorReward()).toNumber(),
      this.joyAPI.api.consts.referendum.voteStageDuration.toNumber(),
      this.joyAPI.api.consts.referendum.revealStageDuration.toNumber(),
      this.joyAPI.api.consts.council.announcingPeriodDuration.toNumber(),
      this.joyAPI.qnQuery<TeamCouncilQNData>(TEAM_QN_QUERIES.COUNCIL),
      this.joyAPI.qnQuery<TeamWorkingGroupQNData>(TEAM_QN_QUERIES.WORKERS),
    ]);

    if (councilData) {
      const electionRound = councilData.electionRounds[0] ?? councilData.electionRounds[1];
      const combinedLengthOfCouncilStages =
        idlePeriodDuration + voteStageDuration + revealStageDuration + announcingPeriodDuration;
      const approximatedLengthInSeconds = combinedLengthOfCouncilStages * 6;
      const startOfElectionRound = new Date(electionRound.createdAt);
      const endOfElectionRound = new Date(electionRound.createdAt);
      endOfElectionRound.setSeconds(
        startOfElectionRound.getSeconds() + approximatedLengthInSeconds
      );

      // TODO: This might potentially need to be changed as it might show stale ids with new system:
      currentCouncilTerm = councilData.electionRounds[1].cycleId;
      councilTermLengthInDays = Math.round(approximatedLengthInSeconds / (60 * 60 * 24));
      startOfCouncilElectionRound = startOfElectionRound.toISOString();
      endOfCouncilElectionRound = endOfElectionRound.toISOString();
      weeklyCouncilorSalaryInJOY = hapiToJoy(councilorReward * BLOCKS_IN_A_WEEK);

      councilMembers = councilData.councilMembers.map(({ member }) => ({
        avatar: member.metadata.avatar?.avatarUri,
        handle: member.handle,
        socials: member.metadata.externalResources,
        timesServed: member.councilMembers.length,
        link: `https://pioneerapp.xyz/#/members/${member.id}`,
      }));
    }

    if (workersData) {
      workingGroups = workersData.workingGroups.reduce((acc, wg) => {
        acc[wg.id] = {
          name: WORKING_GROUP_NAMES[wg.id as keyof typeof WORKING_GROUP_NAMES],
          workers: wg.workers
            .filter((w) => w.isActive)
            .map((w) => ({
              handle: w.membership.handle,
              isLead: w.isLead,
              avatar: w.membership.metadata.avatar?.avatarUri ?? null,
            })),
          budget: hapiToJoy(Number(wg.budget)),
        };

        return acc;
      }, {} as TeamWorkingGroupResult);
    }

    return {
      council: {
        currentTerm: currentCouncilTerm,
        termLength: councilTermLengthInDays,
        electedOnDate: startOfCouncilElectionRound,
        nextElectionDate: endOfCouncilElectionRound,
        weeklySalaryInJOY: weeklyCouncilorSalaryInJOY,
        currentCouncil: councilMembers,
      },
      workingGroups,
    };
  }

  async getEngineeringData() {
    let totalNumberOfStars = 0;
    let totalNumberOfCommits = 0;
    let totalNumberOfCommitsThisWeek = 0;
    let totalNumberOfOpenPRs = 0;
    let totalNumberOfOpenIssues = 0;
    const githubContributors: { [key: string]: GithubContributor } = {};
    const commitData: { [key: string]: { [key: string]: number } } = {};

    const [
      {
        data: { public_repos, followers },
      },
      { data: repos },
    ] = await Promise.all([
      this.githubAPI.request("GET /orgs/{org}", {
        org: GITHUB_JOYSTREAM_ORGANIZATION_NAME,
      }),
      this.githubAPI.request("GET /orgs/{org}/repos", {
        org: GITHUB_JOYSTREAM_ORGANIZATION_NAME,
        per_page: 1000,
      }),
    ]);

    const reposInformation = await Promise.all(
      repos
        .filter((repo) => !GITHUB_REPOS_TO_IGNORE.includes(repo.name))
        .map((repo) => this.fetchRepoInformation(repo.name))
    );

    for (const repoInformation of reposInformation) {
      const {
        numberOfCommits,
        numberOfOpenIssues,
        numberOfPullRequests,
        numberOfStars,
        contributors,
        commits,
      } = repoInformation;

      totalNumberOfStars += numberOfStars;
      totalNumberOfCommits += numberOfCommits;
      totalNumberOfOpenIssues += numberOfOpenIssues;
      totalNumberOfOpenPRs += numberOfPullRequests;

      const weekAgoDate = getDateWeeksAgo(1);

      commits.forEach((commit) => {
        if (new Date(commit.commit.author.date) > weekAgoDate) {
          totalNumberOfCommitsThisWeek++;
        }

        const [_, month, day] = commit.commit.author.date.split("T")[0].split("-");

        if (!commitData[month]) {
          commitData[month] = {};
        }

        if (!commitData[month][day]) {
          commitData[month][day] = 0;
        }

        commitData[month][day]++;
      });

      contributors.forEach((contributor) => {
        if (contributor.login) {
          if (githubContributors[contributor.login]) {
            githubContributors[contributor.login].numberOfCommits += contributor.contributions;
          } else {
            githubContributors[contributor.login] = {
              numberOfCommits: contributor.contributions,
              id: contributor.login,
              avatar: contributor.avatar_url,
            };
          }
        }
      });
    }

    const topGithubContributors = await Promise.all(
      Object.values(githubContributors)
        .sort((a, b) => b.numberOfCommits - a.numberOfCommits)
        .slice(0, 33)
        .filter((contributor) => contributor.id !== "actions-user")
        .map(async (contributor) => ({
          ...contributor,
          name: await this.fetchGithubUsersRealName(contributor.id),
        }))
    );

    return {
      numberOfRepositories: public_repos - GITHUB_REPOS_TO_IGNORE.length,
      numberOfFollowers: followers,
      numberOfStars: totalNumberOfStars,
      numberOfCommits: totalNumberOfCommits,
      totalNumberOfCommitsThisWeek,
      numberOfOpenIssues: totalNumberOfOpenIssues,
      numberOfOpenPRs: totalNumberOfOpenPRs,
      totalNumberOfContributors: Object.keys(githubContributors).length,
      contributors: topGithubContributors,
      commits: commitData,
    };
  }

  async getFullData() {
    await this.joyAPI.init;

    const [token, traction, engineering, community, team] = await Promise.all([
      this.getTokenData(),
      this.getTractionData(),
      this.getEngineeringData(),
      this.getCommunityData(),
      this.getTeamData(),
    ]);

    return {
      token,
      traction,
      engineering,
      community,
      team,
    };
  }
}
