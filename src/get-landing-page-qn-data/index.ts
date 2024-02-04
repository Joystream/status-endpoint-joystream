import axios from "axios";
import { JoyApi } from "../joyApi";
import { landingPageQueries } from "./query";
import {
  NFT,
  Proposal,
  ChannelPaymentEvent,
  ProposalParameter,
  GenericObject,
  SimpleChannelPaymentEvent,
  OrionChannelGenericObject,
  OrionChannelFollows,
} from "./types";

if (process.env.ORION_OPERATOR_SECRET === undefined) {
  throw new Error("Missing QUERY_NODE in .env!");
}
if (process.env.SUBSCAN_API_KEY === undefined) {
  throw new Error("Missing SUBSCAN_API_KEY in .env!");
}
const ORION_OPERATOR_SECRET = process.env.ORION_OPERATOR_SECRET;
const SUBSCAN_API_KEY = process.env.SUBSCAN_API_KEY;

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
        video: { id: videoId, title: nftTitle },
      }) => ({
        nftTitle,
        channelName,
        joyAmount: Math.round(Number(lastSalePrice) / 10_000_000_000).toString(),
        lastSaleDate,
        imageUrl: [`https://assets.joyutils.org/video/${videoId}/thumbnail`],
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
          imageUrl: [`https://assets.joyutils.org/channel/${channelId}/avatar`],
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
      amount: Number(channelPaymentMadeEvent.amount),
    };
  }

  const creators = await Promise.all(
    Object.values(creatorsObject)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, NUMBER_OF_ITEMS_TO_FETCH_WITH_BUFFER)
      .map(async ({ amount, id, ...rest }) => ({
        followsNum: orionChannels.find((channel) => channel.id === id)?.followsNum ?? 0,
        amount: Math.round(Number(amount) / 10_000_000_000).toString(),
        imageUrl: [`https://assets.joyutils.org/channel/${id}/avatar`],
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

const getPriceData = async () => {
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);

  const end = endDate.toISOString().split("T")[0];
  const start = startDate.toISOString().split("T")[0];

  try {
    const priceResponse = await axios.post(
      `https://joystream.api.subscan.io/api/scan/price/history`,
      {
        currency: "string",
        end,
        format: "hour",
        start,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": SUBSCAN_API_KEY,
        },
      }
    );

    const tokenPrices = priceResponse.data.data.list;
    const lastWeekValue = Number(tokenPrices[0].price);
    const currentValue = Number(tokenPrices[tokenPrices.length - 1].price);
    const lastWeekChange = ((currentValue - lastWeekValue) / lastWeekValue) * 100;

    return {
      tokenPrices,
      lastWeekChange,
    };
  } catch (e) {
    return null;
  }
};

// Due to sheer amount of objects needed to be queried, the following function
// aims to fetch them in a paginated manner to avoid 502 and 504 errors.
const fetchVideos = async () => {
  let resultVideos: GenericObject[] = [];
  let offset = 0;
  const NUMBER_OF_VIDEOS_TO_FETCH = 200_000;

  while (true) {
    const videosResponse = await api.qnQuery<{
      videos: Array<GenericObject>;
    }>(landingPageQueries["videos"](offset, NUMBER_OF_VIDEOS_TO_FETCH));

    if (!videosResponse) {
      return [];
    }

    const { videos } = videosResponse;

    resultVideos = [...resultVideos, ...videos];

    if (videos.length < NUMBER_OF_VIDEOS_TO_FETCH) {
      break;
    }

    offset += NUMBER_OF_VIDEOS_TO_FETCH;
  }

  return resultVideos;
};

const getCarouselData = async () => {
  const videos = await fetchVideos();
  const [carouselDataResponse, auxiliaryDataResponse, simpleChannelPaymentEventsResponse] =
    await Promise.all([
      api.qnQuery<{
        ownedNfts: Array<NFT>;
        proposals: Array<Proposal>;
        channelPaymentMadeEvents: Array<ChannelPaymentEvent>;
      }>(landingPageQueries["carouselData"](NUMBER_OF_ITEMS_TO_FETCH)),
      api.qnQuery<{
        memberships: Array<GenericObject>;
        comments: Array<GenericObject>;
        videoReactions: Array<GenericObject>;
        commentReactions: Array<GenericObject>;
        channels: Array<GenericObject>;
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

  const channels = orionResponse?.data?.data?.channels ?? ([] as Array<OrionChannelGenericObject>);
  const channelFollows =
    orionResponse?.data?.data?.channelFollows ?? ([] as Array<OrionChannelFollows>);
  const channelPaymentMadeEvents =
    simpleChannelPaymentEventsResponse?.channelPaymentMadeEvents ?? [];

  const { nfts, proposals, payouts, creators } = await parseCarouselData(
    carouselDataResponse ?? { ownedNfts: [], proposals: [], channelPaymentMadeEvents: [] },
    channels,
    simpleChannelPaymentEventsResponse?.channelPaymentMadeEvents ?? []
  );

  const auxiliaryData = parseAuxiliaryData({
    orionChannels: channels,
    videos,
    orionChannelFollows: channelFollows,
    channelPaymentMadeEvents,
    ...(auxiliaryDataResponse ?? {
      memberships: [],
      comments: [],
      videoReactions: [],
      commentReactions: [],
      channels: [],
    }),
  });

  return { nfts, proposals, payouts, creators, auxiliaryData };
};

const getLandingPageQNData = async () => {
  await api.init;

  const priceData = (await getPriceData()) ?? { tokenPrices: [], lastWeekChange: 0 };
  const { nfts, proposals, payouts, creators, auxiliaryData } = await getCarouselData();

  return {
    nfts,
    proposals,
    payouts,
    creators,
    ...auxiliaryData,
    ...priceData,
  };
};

export default getLandingPageQNData;
