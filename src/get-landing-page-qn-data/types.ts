type StorageBag = {
  distributionBuckets: Array<{
    operators: Array<{ metadata: { nodeEndpoint: string } }>;
  }>;
};

type NFT = {
  lastSaleDate: string;
  lastSalePrice: string;
  creatorChannel: {
    title: string;
  };
  video: {
    id: string;
    title: string;
    thumbnailPhotoId: string;
    thumbnailPhoto: {
      storageBag: StorageBag;
    };
  };
};

type Proposal = {
  details: {
    __typename: string;
  };
  title: string;
  createdAt: string;
  isFinalized: boolean;
  status: {
    __typename: string;
  };
  id: string;
  statusSetAtTime: string;
  creator: {
    metadata: {
      avatar: {
        avatarUri: string;
      };
    };
  };
};

type ChannelPaymentEvent = {
  createdAt: string;
  amount: string;
  payeeChannel: {
    id: string;
    title: string;
    avatarPhoto: {
      id: string;
      storageBag: StorageBag;
    };
  };
};

type ProposalParameter = {
  votingPeriod: number;
  gracePeriod: number;
  approvalQuorumPercentage: number;
  approvalThresholdPercentage: number;
  slashingQuorumPercentage: number;
  slashingThresholdPercentage: number;
  requiredStake: number;
  constitutionality: number;
};

type GenericObject = {
  createdAt: string;
  id: string;
};

type ChannelPaymentGenericObject = {
  createdAt: string;
  amount: string;
};

export {
  StorageBag,
  NFT,
  Proposal,
  ChannelPaymentEvent,
  ProposalParameter,
  GenericObject,
  ChannelPaymentGenericObject,
};
