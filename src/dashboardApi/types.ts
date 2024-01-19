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
