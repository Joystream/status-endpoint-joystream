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

const PROPOSAL_STATUS = "ProposalStatus";

const getCarouselData = async () => {
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
      proposals(limit: 10, orderBy: createdAt_DESC) {
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

  result.proposals = response.proposals.map(
    ({
      title,
      status: { __typename: status },
      id,
      creator: {
        metadata: {
          avatar: { avatarUri },
        },
      },
    }) => ({
      title,
      status: status.substring(PROPOSAL_STATUS.length),
      link: `https://pioneerapp.xyz/#/proposals/preview/${id}`,
      img: avatarUri,
    })
  );

  return result;
};

export default getCarouselData;
