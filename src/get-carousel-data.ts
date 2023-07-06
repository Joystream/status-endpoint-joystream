import axios from "axios";
import { JoyApi } from "./joyApi";

const NUMBER_OF_ITMES_TO_FETCH = 10;

const api = new JoyApi();

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
    ) as unknown as (typeof ProposalParameterString)[number];
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
      ).toJSON() as ProposalParameter;

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

const findAllValidPotentialAssets = async (storageBag?: StorageBag, assetId?: string) => {
  if (!storageBag || !assetId) return [];

  const resultArr = [];

  for (let { operators } of storageBag.distributionBuckets) {
    if (operators.length === 0) continue;

    const nodeEndpoint = operators[0].metadata.nodeEndpoint;
    const url = `${nodeEndpoint}api/v1/assets/${assetId}`;

    try {
      // TODO: It might make sense to increase the timeout here.
      await axios.head(url, { timeout: 1000 });

      resultArr.push(url);
    } catch (e: unknown) {
      // Axios throws an error if the response is not 2xx. We can use this
      // and catch the error to filter out payouts with invalid images.
      continue;
    }
  }

  return resultArr;
};

const getCarouselData = async () => {
  await api.init;

  const result: { nfts: Array<{}>; proposals: Array<{}>; payouts: Array<{}> } = {
    nfts: [],
    proposals: [],
    payouts: [],
  };

  const response = await api.qnQuery<{
    ownedNfts: Array<NFT>;
    proposals: Array<Proposal>;
    channelPaymentMadeEvents: Array<ChannelPaymentEvent>;
  }>(`
    {
      ownedNfts(
        limit: ${NUMBER_OF_ITMES_TO_FETCH}
        orderBy: lastSaleDate_DESC
        where: { lastSalePrice_gt: 0 }
      ) {
        lastSaleDate
        lastSalePrice
        creatorChannel {
          title
        }
        video {
          id
          title
          thumbnailPhotoId
          thumbnailPhoto {
            storageBag {
              distributionBuckets {
                operators {
                  metadata {
                    nodeEndpoint
                  }
                }
              }
            }
          }
        }
      },
      proposals(limit: ${NUMBER_OF_ITMES_TO_FETCH}, orderBy: statusSetAtTime_DESC) {
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
      },
      channelPaymentMadeEvents(limit: 30, orderBy: createdAt_DESC) {
        createdAt
        amount
        payeeChannel {
          id
          title
          rewardAccount
          ownerMember {
            id
            handle
          }
          avatarPhoto {
            id,
            storageBag {
              distributionBuckets {
                operators {
                  metadata {
                    nodeEndpoint
                  }
                }
              }
            }
          }
        }
      }
    }
  `);

  if (!response) return result;

  result.nfts = await Promise.all(
    response.ownedNfts.map(
      async ({
        lastSaleDate,
        lastSalePrice,
        creatorChannel: { title: channelName },
        video: {
          id: videoId,
          title: nftTitle,
          thumbnailPhotoId,
          thumbnailPhoto: { storageBag },
        },
      }) => ({
        nftTitle,
        channelName,
        joyAmount: Math.round(Number(lastSalePrice) / 10_000_000_000).toString(),
        lastSaleDate,
        imageUrl: await findAllValidPotentialAssets(storageBag, thumbnailPhotoId),
        videoUrl: `https://gleev.xyz/video/${videoId}`,
      })
    )
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

  result.payouts = (
    await Promise.all(
      response.channelPaymentMadeEvents.map(
        async ({ amount, payeeChannel: { id: channelId, avatarPhoto, title }, createdAt }) => ({
          joyAmount: Math.round(Number(amount) / 10_000_000_000).toString(),
          createdAt,
          imageUrl: await findAllValidPotentialAssets(avatarPhoto?.storageBag, avatarPhoto?.id),
          channelName: title,
          channelUrl: `https://gleev.xyz/channel/${channelId}`,
        })
      )
    )
  )
    .filter((payout: any) => payout.imageUrl.length > 0)
    .slice(0, NUMBER_OF_ITMES_TO_FETCH);

  return result;
};

export default getCarouselData;
