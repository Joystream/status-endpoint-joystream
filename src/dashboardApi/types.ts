// GITHUB

export type GithubContributor = {
  numberOfCommits: number;
  id: string;
  avatar: string | undefined;
};

export type SubscanBlockchainMetadata = {
  avgBlockTime: string;
};

export type SubscanDailyActiveAccountData = {
  list: Array<{
    total: number;
  }>;
};
