import { JoyApi } from "./joyApi";

const api = new JoyApi();

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
      storageBag: {
        distributionBuckets: Array<{
          operators: Array<{ metadata: { nodeEndpoint: string } }>;
        }>;
      };
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

type PropsalParameter = {
  votingPeriod: number;
  gracePeriod: number;
  approvalQuorumPercentage: number;
  approvalThresholdPercentage: number;
  slashingQuorumPercentage: number;
  slashingThresholdPercentage: number;
  requiredStake: number;
  constitutionality: number;
};

const BLOCK_INTERVAL_IN_SECONDS = 6;

const PROPOSAL_STATUS = "ProposalStatus";
const GRACING = "Gracing";
const DECIDING = "Deciding";

const ProposalParameterString = [
  "amendConstitutionProposalParameters",
  "cancelWorkingGroupLeadOpeningProposalParameters",
  "createWorkingGroupLeadOpeningProposalParameters",
  "decreaseWorkingGroupLeadStakeProposalParameters",
  "fillWorkingGroupOpeningProposalParameters",
  "fundingRequestProposalMaxAccounts",
  "fundingRequestProposalMaxTotalAmount",
  "fundingRequestProposalParameters",
  "runtimeUpgradeProposalParameters",
  "setCouncilBudgetIncrementProposalParameters",
  "setCouncilorRewardProposalParameters",
  "setInitialInvitationBalanceProposalParameters",
  "setInvitationCountProposalParameters",
  "setMaxValidatorCountProposalMaxValidators",
  "setMaxValidatorCountProposalParameters",
  "setMembershipLeadInvitationQuotaProposalParameters",
  "setMembershipPriceProposalParameters",
  "setReferralCutProposalParameters",
  "setWorkingGroupLeadRewardProposalParameters",
  "signalProposalParameters",
  "slashWorkingGroupLeadProposalParameters",
  "terminateWorkingGroupLeadProposalParameters",
  "updateChannelPayoutsProposalParameters",
  "updateGlobalNftLimitProposalParameters",
  "updateWorkingGroupBudgetProposalParameters",
  "vetoProposalProposalParameters",
] as const;

const getProposalParameterKeyFromType = (string: string) => {
  // NOTE: The last replace here is because of a mismatch between the type fetched
  // from graphql and the key actually used to query the necessary proposal data.

  return (string.charAt(0).toLowerCase() + string.slice(1))
    .replace("Details", "Parameters")
    .replace(
      "fillWorkingGroupLeadOpeningProposalParameters",
      "fillWorkingGroupOpeningProposalParameters"
    ) as unknown as typeof ProposalParameterString[number];
};

const getStatusFromStatusType = (status: string) => status.substring(PROPOSAL_STATUS.length);

const getSecondsFromBlocks = (blocks: number) => blocks * BLOCK_INTERVAL_IN_SECONDS;

const incorporateProposalExpiryDate = (proposals: Array<Proposal>) => {
  return Promise.all(
    proposals.map(async (proposal) => {
      const {
        details: { __typename: proposalType },
        status: { __typename: statusType },
        statusSetAtTime,
      } = proposal;

      const status = getStatusFromStatusType(statusType);
      const statusSetAtDate = new Date(statusSetAtTime);
      const proposalParameterKey = getProposalParameterKeyFromType(proposalType);
      const proposalParameter = (
        await api.api.consts.proposalsCodex[proposalParameterKey]
      ).toJSON() as PropsalParameter;

      if (status === GRACING) {
        statusSetAtDate.setSeconds(getSecondsFromBlocks(proposalParameter.gracePeriod));
      }

      if (status === DECIDING) {
        statusSetAtDate.setSeconds(getSecondsFromBlocks(proposalParameter.votingPeriod));
      }

      return {
        ...proposal,
        ...((status === DECIDING || status === GRACING) && {
          timeLeftUntil: statusSetAtDate.toISOString(),
        }),
      };
    })
  );
};

const getCarouselData = async () => {
  await api.init;

  const result: { nfts: Array<{}>; proposals: Array<{}> } = {
    nfts: [],
    proposals: [],
  };

  const response = await api.qnQuery<{
    ownedNfts: Array<NFT>;
    proposals: Array<Proposal>;
  }>(`
    {
      ownedNfts(limit: 10, orderBy: lastSaleDate_DESC, where: { lastSalePrice_gt: 0 }){
        lastSaleDate,
        lastSalePrice,
        creatorChannel {
          title
        },
        video {
          id,
          title,
          thumbnailPhotoId,
          thumbnailPhoto {
            storageBag {
              distributionBuckets {
                operators {
                  metadata {
                    nodeEndpoint,
                  }
                }
              }
            }
          }
        }
      },
      proposals(limit: 10, orderBy: statusSetAtTime_DESC) {
        details {
          __typename
        }
        title
        createdAt
        isFinalized
        status {
          __typename
        }
        id
        statusSetAtTime
        creator {
          metadata {
            avatar {
              ... on AvatarUri {
                avatarUri
              }
            }
          }
        }
      }
    }
  `);

  if (!response) return result;

  result.nfts = response.ownedNfts.map(
    ({
      lastSaleDate,
      lastSalePrice,
      creatorChannel: { title: channelName },
      video: {
        id: videoId,
        title: nftTitle,
        thumbnailPhotoId,
        thumbnailPhoto: {
          storageBag: { distributionBuckets },
        },
      },
    }) => ({
      nftTitle,
      channelName,
      joyAmount: (Number(lastSalePrice) / 10_000_000_000).toString(),
      lastSaleDate,
      imageUrl: `${distributionBuckets[0].operators[0].metadata.nodeEndpoint}api/v1/assets/${thumbnailPhotoId}`,
      videoUrl: `https://gleev.xyz/video/${videoId}`,
    })
  );

  result.proposals = (await incorporateProposalExpiryDate(response.proposals)).map(
    ({
      title,
      status: { __typename: statusType },
      id,
      creator: {
        metadata: {
          avatar: { avatarUri },
        },
      },
      statusSetAtTime,
      createdAt,
      timeLeftUntil,
    }) => ({
      title,
      status: getStatusFromStatusType(statusType),
      link: `https://pioneerapp.xyz/#/proposals/preview/${id}`,
      img: avatarUri,
      statusSetAtTime,
      createdAt,
      timeLeftUntil,
    })
  );

  return result;
};

export default getCarouselData;
