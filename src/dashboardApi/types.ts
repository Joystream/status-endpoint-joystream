// GITHUB

export type GithubContributor = {
  numberOfCommits: number;
  id: string;
  avatar: string | undefined;
};

export type SubscanBlockchainMetadata = {
  avgBlockTime: string;
};

export type GeneralSubscanDailyListData = {
  list: Array<{
    total: number;
  }>;
};

export type GenericQNTractionConnection = {
  totalCount: number;
};

export type GenericQNTractionItem = {
  createdAt: string;
};

export type ChannelsQueryData = {
  channelsConnection: GenericQNTractionConnection;
  channels: GenericQNTractionItem[];
};

export type VideosConnectionData = {
  videosConnection: GenericQNTractionConnection;
};

export type VideosQueryData = {
  videos: GenericQNTractionItem[];
};

export type CommentsAndReactionsData = {
  commentsConnection: GenericQNTractionConnection;
  commentReactionsConnection: GenericQNTractionConnection;
  videoReactionsConnection: GenericQNTractionConnection;
  comments: GenericQNTractionItem[];
  commentReactions: GenericQNTractionItem[];
  videoReactions: GenericQNTractionItem[];
};

export type NFTBoughtEventsData = {
  nftBoughtEvents: Array<{
    price: string;
    createdAt: string;
  }>;
};

export type Avatar = {
  avatarUri: string;
} | null;

export type TeamCouncilQNData = {
  electionRounds: Array<{
    cycleId: number;
    endedAtTime: string | null;
  }>;
  councilMembers: Array<{
    member: {
      handle: string;
      metadata: {
        avatar: Avatar;
        externalResources: Array<{
          type: string;
          value: string;
        }>;
      };
      councilMembers: Array<{ id: string }>;
    };
  }>;
};

export type TeamWorkingGroupQNData = {
  workingGroups: Array<{
    id: string;
    budget: string;
    workers: Array<{
      isActive: boolean;
      isLead: boolean;
      membership: {
        handle: string;
        metadata: {
          avatar: Avatar;
        };
      };
    }>;
  }>;
};

export type TeamWorkingGroupResult = {
  [key: string]: {
    workers: Array<{ handle: string; isLead: boolean; avatar?: string }>;
    budget: number;
  };
};
