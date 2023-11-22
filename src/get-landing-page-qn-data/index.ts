import axios from "axios";
import { JoyApi } from "../joyApi";
import { landingPageQueries, getStorageBag } from "./query";
import {
  NFT,
  Proposal,
  ChannelPaymentEvent,
  StorageBag,
  ProposalParameter,
  GenericObject,
  SimpleChannelPaymentEvent,
  OrionChannelGenericObject,
  OrionChannelFollows,
} from "./types";

if (process.env.ORION_OPERATOR_SECRET === undefined) {
  throw new Error("Missing QUERY_NODE in .env!");
}
const ORION_OPERATOR_SECRET = process.env.ORION_OPERATOR_SECRET;

const api = new JoyApi();

const NUMBER_OF_ITEMS_TO_FETCH = 10;
const NUMBER_OF_ITEMS_TO_FETCH_WITH_BUFFER = NUMBER_OF_ITEMS_TO_FETCH + 20;
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

    const nodeEndpoint = operators[0]?.metadata?.nodeEndpoint;
    const url = `${nodeEndpoint}api/v1/assets/${assetId}`;

    try {
      await axios.head(url, { timeout: 2500 });

      resultArr.push(url);
    } catch (e: unknown) {
      // Axios throws an error if the response is not 2xx. We can use this
      // and catch the error to filter out payouts with invalid images.
      continue;
    }
  }

  return resultArr;
};

const findStorageBagAndAssets = async (storageBagId?: string, avatarPhotoId?: string) => {
  if (!storageBagId || !avatarPhotoId) return [];

  const data = await api.qnQuery<{
    storageBags: Array<StorageBag>;
  }>(getStorageBag(storageBagId));

  if (!data) return [];

  const storageBag = data.storageBags[0];

  return await findAllValidPotentialAssets(storageBag, avatarPhotoId);
};

const parseCarouselData = async (
  response: {
    ownedNfts: Array<NFT>;
    proposals: Array<Proposal>;
    channelPaymentMadeEvents: Array<ChannelPaymentEvent>;
  },
  orionChannels: Array<OrionChannelGenericObject>,
  simpleChannelPaymentEvents: Array<SimpleChannelPaymentEvent>
) => {
  const nfts = await Promise.all(
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

  const proposals = (await incorporateProposalExpiryDate(response.proposals)).map(
    ({
      title,
      status: { __typename: statusType },
      id,
      creator: {
        metadata: { avatar },
      },
      statusSetAtTime,
      createdAt,
      timeLeftUntil,
    }) => ({
      title,
      status: getStatusFromStatusType(statusType),
      link: `https://pioneerapp.xyz/#/proposals/preview/${id}`,
      img: avatar?.avatarUri,
      statusSetAtTime,
      createdAt,
      timeLeftUntil,
    })
  );

  const payouts = (
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
    .slice(0, NUMBER_OF_ITEMS_TO_FETCH);

  const creatorsObject: Record<
    string,
    {
      id: string;
      title: string;
      avatarPhoto: { storageBag?: { id: string }; id?: string };
      amount: number;
    }
  > = {};

  for (let channelPaymentMadeEvent of simpleChannelPaymentEvents) {
    if (creatorsObject[channelPaymentMadeEvent.payeeChannel.id]) {
      creatorsObject[channelPaymentMadeEvent.payeeChannel.id].amount += Number(
        channelPaymentMadeEvent.amount
      );
    }

    creatorsObject[channelPaymentMadeEvent.payeeChannel.id] = {
      id: channelPaymentMadeEvent.payeeChannel.id,
      title: channelPaymentMadeEvent.payeeChannel.title,
      avatarPhoto: channelPaymentMadeEvent.payeeChannel.avatarPhoto,
      amount: Number(channelPaymentMadeEvent.amount),
    };
  }

  const creators = await Promise.all(
    Object.values(creatorsObject)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, NUMBER_OF_ITEMS_TO_FETCH_WITH_BUFFER)
      .map(async ({ amount, avatarPhoto, id, ...rest }) => ({
        followsNum: orionChannels.find((channel) => channel.id === id)?.followsNum,
        amount: Math.round(Number(amount) / 10_000_000_000).toString(),
        imageUrl: await findStorageBagAndAssets(avatarPhoto?.storageBag?.id, avatarPhoto?.id),
        channelUrl: `https://gleev.xyz/channel/${id}`,
        ...rest,
      }))
      .slice(0, NUMBER_OF_ITEMS_TO_FETCH)
  );

  return { nfts, proposals, payouts, creators };
};

const calculateCurrentWeekChange = (
  items: Array<{ createdAt?: string; timestamp?: string; amount?: string; id?: string }>,
  totalAmount: number
) => {
  if (items.length === 0) return 0;

  const currentWeekAmount = items.reduce((acc: number, prev) => {
    const inputDateString = (prev?.createdAt ? prev.createdAt : prev?.timestamp) as string;

    const inputDate = new Date(inputDateString);
    const currentDate = new Date();
    const oneWeekAgo = new Date(currentDate.getTime() - 7 * 24 * 60 * 60 * 1000);

    if (inputDate >= oneWeekAgo && inputDate <= currentDate) {
      if (prev?.amount) {
        return acc + Number(prev.amount);
      }

      return acc + 1;
    }

    return acc;
  }, 0);

  return Math.round((currentWeekAmount / totalAmount) * 100);
};

const parseAuxiliaryData = (response: {
  videos: Array<GenericObject>;
  channels: Array<GenericObject>;
  memberships: Array<GenericObject>;
  comments: Array<GenericObject>;
  videoReactions: Array<GenericObject>;
  commentReactions: Array<GenericObject>;
  channelPaymentMadeEvents: Array<SimpleChannelPaymentEvent>;
  orionChannels: Array<OrionChannelGenericObject>;
  orionChannelFollows: Array<OrionChannelFollows>;
}) => {
  const {
    videos,
    channels,
    memberships,
    comments,
    videoReactions,
    commentReactions,
    channelPaymentMadeEvents,
    orionChannelFollows,
  } = response;

  const numberOfVideos = videos.length;
  const numberOfCommentsAndReactions =
    comments.length + videoReactions.length + commentReactions.length;
  const numberOfChannels = channels.length;
  const numberOfFollowers = orionChannelFollows.length;
  const numberOfMemberships = memberships.length;
  const totalPayouts = channelPaymentMadeEvents.reduce(
    (acc: number, prev: SimpleChannelPaymentEvent) => acc + Number(prev.amount),
    0
  );

  return {
    numberOfVideos,
    numberOfVideosChange: calculateCurrentWeekChange(videos, numberOfVideos),
    numberOfCommentsAndReactions,
    numberOfCommentsAndReactionsChange: calculateCurrentWeekChange(
      [...comments, ...videoReactions, ...commentReactions],
      numberOfCommentsAndReactions
    ),
    numberOfChannels,
    numberOfChannelsChange: calculateCurrentWeekChange(channels, numberOfChannels),
    numberOfFollowers,
    numberOfFollowersChange: calculateCurrentWeekChange(orionChannelFollows, numberOfFollowers),
    numberOfMemberships,
    numberOfMembershipsChange: calculateCurrentWeekChange(memberships, numberOfMemberships),
    totalPayouts: Math.round(totalPayouts / 10_000_000_000),
    totalPayoutsChange: calculateCurrentWeekChange(channelPaymentMadeEvents, totalPayouts),
  };
};

const getLandingPageQNData = async () => {
  await api.init;

  const [
    carouselDataResponse,
    videosAndChannelsResponse,
    auxiliaryDataResponse,
    simpleChannelPaymentEventsResponse,
  ] = await Promise.all([
    api.qnQuery<{
      ownedNfts: Array<NFT>;
      proposals: Array<Proposal>;
      channelPaymentMadeEvents: Array<ChannelPaymentEvent>;
    }>(landingPageQueries["carouselData"](NUMBER_OF_ITEMS_TO_FETCH)),
    api.qnQuery<{
      videos: Array<GenericObject>;
      channels: Array<GenericObject>;
    }>(landingPageQueries["videosAndChannels"]),
    api.qnQuery<{
      memberships: Array<GenericObject>;
      comments: Array<GenericObject>;
      videoReactions: Array<GenericObject>;
      commentReactions: Array<GenericObject>;
    }>(landingPageQueries["auxiliaryData"]),
    api.qnQuery<{
      channelPaymentMadeEvents: Array<SimpleChannelPaymentEvent>;
    }>(landingPageQueries["simplePayments"]),
  ]);

  let orionResponse = null;
  try {
    const res = await axios.post("https://auth.gleev.xyz/api/v1/anonymous-auth", {
      userId: ORION_OPERATOR_SECRET,
    });

    orionResponse = await axios.post(
      "https://orion.gleev.xyz/graphql",
      {
        query: landingPageQueries["orionData"],
      },
      {
        headers: {
          Cookie: (res.headers["set-cookie"] as unknown as string[])[0].replace(
            "SameSite=Strict",
            "SameSite=None"
          ),
        },
        withCredentials: true,
      }
    );
  } catch (e) {}

  // The reasoning behind checking each one separately is for typescript type inference
  if (
    !orionResponse ||
    !carouselDataResponse ||
    !videosAndChannelsResponse ||
    !auxiliaryDataResponse ||
    !simpleChannelPaymentEventsResponse
  ) {
    return {
      nfts: [],
      proposals: [],
      payouts: [],
      creators: [],
    };
  }

  const { channels, channelFollows } = orionResponse.data.data as {
    channels: Array<OrionChannelGenericObject>;
    channelFollows: Array<OrionChannelFollows>;
  };

  const { nfts, proposals, payouts, creators } = await parseCarouselData(
    carouselDataResponse,
    channels,
    simpleChannelPaymentEventsResponse.channelPaymentMadeEvents
  );

  const auxiliaryData = parseAuxiliaryData({
    orionChannels: channels,
    ...videosAndChannelsResponse,
    orionChannelFollows: channelFollows,
    channelPaymentMadeEvents: simpleChannelPaymentEventsResponse.channelPaymentMadeEvents,
    ...auxiliaryDataResponse,
  });

  return {
    nfts,
    proposals,
    payouts,
    creators,
    ...auxiliaryData,
  };
};

export default getLandingPageQNData;
