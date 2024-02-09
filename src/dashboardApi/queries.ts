import { getDateMonthsAgo, getDateYearsAgo } from "../utils";

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
    channelsConnection {
      totalCount
    }
    channels(limit: 1000000, where: { createdAt_gt: "${getDateMonthsAgo(
      6
    ).toISOString()}" }, orderBy: createdAt_ASC) {
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
      endedAtTime
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
