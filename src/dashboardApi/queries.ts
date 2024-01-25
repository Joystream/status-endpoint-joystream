import { getDateMonthsAgo, getDateYearsAgo } from "../utils";

// Sets the initial date for traction data to 6 months ago.
const TRACTION_DATA_INITIAL_DATE_SIX_MONTHS_AGO = getDateMonthsAgo(6);
const TRACTION_DATA_INITIAL_DATE_ONE_YEAR_AGO = getDateYearsAgo(1);

// TODO: This needs to be fixed to use dates passed into the query. These can go stale.

export const TOKEN_MINTING_QN_QUERY = `{
  channelRewardClaimedEvents(
    limit:1000000,
    where: { createdAt_gte: "${TRACTION_DATA_INITIAL_DATE_ONE_YEAR_AGO.toISOString()}" }
  ) {
    amount
  }
  requestFundedEvents(
    limit: 1000000,
    where: { createdAt_gte: "${TRACTION_DATA_INITIAL_DATE_ONE_YEAR_AGO.toISOString()}" }
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
  budgetSpendingEvents(limit: 1000000, where: { createdAt_gte: "${TRACTION_DATA_INITIAL_DATE_ONE_YEAR_AGO.toISOString()}" }) {
    createdAt
    amount
  }
}`;

export const TRACTION_QN_QUERIES = {
  CHANNELS: `{
    channelsConnection {
      totalCount
    }
    channels(limit: 1000000, where: { createdAt_gt: "${TRACTION_DATA_INITIAL_DATE_SIX_MONTHS_AGO.toISOString()}" }, orderBy: createdAt_ASC) {
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
    videos(offset: ${offset}, limit: ${limit}, where: { createdAt_gt: "${TRACTION_DATA_INITIAL_DATE_SIX_MONTHS_AGO.toISOString()}" }, orderBy: createdAt_ASC) {
      createdAt
    }
  }
  `,
  COMMENTS_AND_REACTIONS: `{
    commentsConnection {
      totalCount
    }
    commentReactionsConnection {
      totalCount
    }
    videoReactionsConnection {
      totalCount
    }
    comments (limit:1000000, where: { createdAt_gt: "${TRACTION_DATA_INITIAL_DATE_SIX_MONTHS_AGO.toISOString()}" }, orderBy: createdAt_ASC) {
      createdAt
    }
    commentReactions (limit:1000000, where: { createdAt_gt: "${TRACTION_DATA_INITIAL_DATE_SIX_MONTHS_AGO.toISOString()}" }, orderBy: createdAt_ASC) {
      createdAt
    }
    videoReactions (limit:1000000, where: { createdAt_gt: "${TRACTION_DATA_INITIAL_DATE_SIX_MONTHS_AGO.toISOString()}" }, orderBy: createdAt_ASC) {
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
    councilMembers(limit: 3, orderBy: updatedAt_DESC) {
      member {
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
