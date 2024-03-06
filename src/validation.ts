import { z } from "zod";

const landingPageDataSchema = z.object({
  price: z.number(),
  circulatingSupply: z.number(),
  totalSupply: z.number(),
  carouselData: z.object({
    nfts: z.any().array().nonempty(),
    proposals: z.any().array().nonempty(),
    payouts: z.any().array().nonempty(),
    creators: z.any().array().nonempty(),
  }),
  numberOfVideos: z.number(),
  numberOfVideosChange: z.number(),
  numberOfCommentsAndReactions: z.number(),
  numberOfCommentsAndReactionsChange: z.number(),
  numberOfChannels: z.number(),
  numberOfChannelsChange: z.number(),
  numberOfFollowers: z.number(),
  numberOfFollowersChange: z.number(),
  numberOfMemberships: z.number(),
  numberOfMembershipsChange: z.number(),
  totalPayouts: z.number(),
  totalPayoutsChange: z.number(),
  tokenPrices: z.any().array().nonempty(),
  lastWeekChange: z.number(),
});

const dashboardDataSchema = z.object({
  token: z.object({
    price: z.number(),
    priceWeeklyChange: z.number(),
    longTermPriceData: z.any().array().nonempty(),
    marketCap: z.number(),
    marketCapWeeklyChange: z.number(),
    volume: z.number(),
    volumeWeeklyChange: z.number(),
    longTermVolumeData: z.any().array().nonempty(),
    exchanges: z.record(
      z.string(),
      z.object({
        volume: z.number(),
        plus2PercentDepth: z.number(),
        minus2PercentDepth: z.number(),
      })
    ),
    fdvs: z.record(z.string(), z.number()),
    circulatingSupply: z.number(),
    fullyDilutedValue: z.number(),
    totalSupply: z.number(),
    tokenMintingData: z.object({
      workerMintingPercentage: z.number(),
      creatorPayoutsMintingPercentage: z.number(),
      spendingProposalsMintingPercentage: z.number(),
      validatorMintingPercentage: z.number(),
    }),
    joyAnnualInflation: z.number(),
    percentSupplyStakedForValidation: z.number(),
    apr: z.number(),
    roi: z.record(z.string(), z.number()),
    supplyDistribution: z.record(
      z.string(),
      z.object({ supply: z.number(), percentOfCirculatingSupply: z.number() })
    ),
  }),
  traction: z.object({
    totalNumberOfChannels: z.number(),
    totalNumberOfChannelsWeeklyChange: z.number(),
    weeklyChannelData: z.any().array().nonempty(),
    totalNumberOfVideos: z.number(),
    totalNumberOfVideosWeeklyChange: z.number(),
    weeklyVideoData: z.any().array().nonempty(),
    totalNumberOfCommentsAndReactions: z.number(),
    totalNumberOfCommentsAndReactionsWeeklyChange: z.number(),
    weeklyCommentsAndReactionsData: z.any().array().nonempty(),
    totalVolumeOfSoldNFTs: z.number(),
    totalVolumeOfSoldNFTsWeeklyChange: z.number(),
    weeklyVolumeOfSoldNFTs: z.any().array().nonempty(),
    averageBlockTime: z.string(),
    totalNumberOfTransactions: z.number(),
    totalNumberOfTransactionsWeeklyChange: z.number(),
    totalNumberOfAccountHolders: z.number(),
    totalNumberOfAccountHoldersWeeklyChange: z.number(),
    numberOfDailyActiveAccounts: z.number(),
    numberOfDailyActiveAccountsWeeklyChange: z.number(),
  }),
  engineering: z.object({
    numberOfRepositories: z.number(),
    numberOfFollowers: z.number(),
    numberOfStars: z.number(),
    numberOfCommits: z.number(),
    totalNumberOfCommitsThisWeek: z.number(),
    numberOfOpenIssues: z.number(),
    numberOfOpenPRs: z.number(),
    totalNumberOfContributors: z.number(),
    contributors: z.any().array().nonempty(),
    commits: z.record(z.string(), z.record(z.string(), z.number())),
  }),
  community: z.object({
    twitterFollowerCount: z.number(),
    discordMemberCount: z.number(),
    discordMemberCountMonthlyChange: z.number(),
    telegramMemberCount: z.number(),
    tweetscoutScore: z.number(),
    tweetscoutLevel: z.number(),
    featuredFollowers: z.any().array().nonempty(),
    discordEvents: z.any().array().nonempty(),
  }),
  team: z.object({
    council: z.object({
      currentTerm: z.number(),
      termLength: z.number(),
      electedOnDate: z.string(),
      nextElectionDate: z.string(),
      weeklySalaryInJOY: z.number(),
      currentCouncil: z.any().array().nonempty(),
    }),
    workingGroups: z.record(
      z.string(),
      z.object({
        name: z.string(),
        workers: z.any().array(),
        budget: z.number(),
      })
    ),
  }),
});

export { landingPageDataSchema, dashboardDataSchema };
