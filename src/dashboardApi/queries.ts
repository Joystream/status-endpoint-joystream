import { getDateDaysAgo, getDateMonthsAgo, getDateWeeksAgo, getDateYearsAgo, getYearMonthDayString } from "../utils";

export const TOKEN_MINTING_QN_QUERY = () => `{
  channelRewardClaimedEvents(
    limit:1000000,
    where: { createdAt_gte: "${getDateYearsAgo(1).toISOString()}" }
  ) {
    amount
  }
  requestFundedEvents(
    limit: 1000000,
    where: { createdAt_gte: "${getDateYearsAgo(1).toISOString()}" }
  ) {
    amount
  }
  workers (limit: 1000000) {
    payouts {
      amount
      createdAt
    }
  }
  councilMembers(limit: 1000000) {
    rewardpaymenteventcouncilMember {
      paidBalance
      createdAt
    }
  }
  budgetSpendingEvents(limit: 1000000, where: { createdAt_gte: "${getDateYearsAgo(
    1
  ).toISOString()}" }) {
    createdAt
    amount
    rationale
  }
}`;

export const TRACTION_QN_QUERIES = {
  CHANNELS: () => `{
    channels(limit: 1000000, where: { totalVideosCreated_gt: 0 }, orderBy: createdAt_ASC) {
      createdAt
    }
  }
  `,
  VIDEOS_CONNECTION: `{
    videosConnection {
      totalCount
    }
  }`,
  VIDEOS: (offset: number, limit: number) => `{
    videos(offset: ${offset}, limit: ${limit}, where: { createdAt_gt: "${getDateMonthsAgo(
    6
  ).toISOString()}" }, orderBy: createdAt_ASC) {
      createdAt
    }
  }
  `,
  COMMENTS_AND_REACTIONS: () => `{
    commentsConnection {
      totalCount
    }
    commentReactionsConnection {
      totalCount
    }
    videoReactionsConnection {
      totalCount
    }
    comments (limit:1000000, where: { createdAt_gt: "${getDateMonthsAgo(
      6
    ).toISOString()}" }, orderBy: createdAt_ASC) {
      createdAt
    }
    commentReactions (limit:1000000, where: { createdAt_gt: "${getDateMonthsAgo(
      6
    ).toISOString()}" }, orderBy: createdAt_ASC) {
      createdAt
    }
    videoReactions (limit:1000000, where: { createdAt_gt: "${getDateMonthsAgo(
      6
    ).toISOString()}" }, orderBy: createdAt_ASC) {
      createdAt
    }
  }
  `,
  NFT_BOUGHT_EVENTS: `{
    nftBoughtEvents (limit: 1000000) {
      price
      createdAt
      video {
        title
      }
      member {
        handle
      }
    }
  }`,
};

export const TEAM_QN_QUERIES = {
  COUNCIL: `{
    electionRounds(limit: 2, orderBy: cycleId_DESC) {
      cycleId
      createdAt
    }
    councilMembers(limit: 3, orderBy: createdAt_DESC) {
      member {
        id
        handle
        metadata {
          avatar {
            ...on AvatarUri {
              avatarUri
            }
          }
          externalResources {
            type
            value
          }
        }
        councilMembers {
          id
        }
      }
    }
  }`,
  WORKERS: `{
    workingGroups {
      id
      budget
      workers {
        isActive
        isLead
        membership {
          handle
          metadata {
            avatar {
              ...on AvatarUri {
                avatarUri
              }
            }
          }
        }
      }
    }
  }`,
};

export const ACCOUNTS_QUERY = `{
  newAccountsWeekAgo: eventsConnection(
    where: {
      name_eq: "System.NewAccount",
      block: {
        timestamp_lt: "${getDateWeeksAgo(1).toISOString()}"
      },
    },
    orderBy: id_ASC
  ) {
    totalCount
  }
  killedAccountsWeekAgo: eventsConnection(
    where: {
      name_eq: "System.KilledAccount",
      block: {
        timestamp_lt: "${getDateWeeksAgo(1).toISOString()}"
      }
    },
    orderBy: id_ASC
  ) {
    totalCount
  }
  newAccountsNow: eventsConnection(
    where: { name_eq: "System.NewAccount" },
    orderBy: id_ASC
  ) {
    totalCount
  }
  killedAccountsNow: eventsConnection(
    where: { name_eq: "System.KilledAccount" },
    orderBy: id_ASC
  ) {
    totalCount
  }
}`

export const DAILY_ACTIVE_ACCOUNTS_QUERY = `{
  dailyActiveAccountsWeekAgo: events(
    where: {
      name_eq: "Balances.Withdraw",
      block: {
        timestamp_gt: "${new Date(getYearMonthDayString(getDateDaysAgo(8))).toISOString()}",
        timestamp_lt: "${new Date(getYearMonthDayString(getDateDaysAgo(7))).toISOString()}"
      }
  	},
  	limit: 10000
  ) {
    args
  }
  dailyActiveAccountsNow: events(
    where: {
      name_eq: "Balances.Withdraw",
      block: {
        timestamp_gt: "${new Date(getYearMonthDayString(getDateDaysAgo(1))).toISOString()}",
        timestamp_lt: "${new Date(getYearMonthDayString(new Date())).toISOString()}"
      }
  	},
  	limit: 10000
  ) {
    args
  }
}`

export const EXTRINSICS_QUERY = `{
  extrinsicsWeekAgo: extrinsicsConnection(
    where: {
      block: {
        timestamp_lt: "${getDateWeeksAgo(1).toISOString()}"
      },
      signature_isNull: false
    },
    orderBy: id_ASC
  ) {
    totalCount
  }
  extrinsicsNow: extrinsicsConnection(
    where: { signature_isNull: false },
    orderBy: id_ASC
  ) {
    totalCount
  }
}`