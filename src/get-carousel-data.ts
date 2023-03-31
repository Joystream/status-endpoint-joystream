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
        distributionBuckets: Array<{ operators: Array<{ metadata: { nodeEndpoint: string } }> }>;
      };
    };
  };
};

const getCarouselData = async () => {
  const response = await api.qnQuery<{ ownedNfts: Array<NFT> }>(`
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
      }
    }
  `);

  if (!response) return [];

  return response.ownedNfts.map(
    ({
      lastSaleDate,
      lastSalePrice,
      creatorChannel: { title: channelName },
      video: {
        id: videoId,
        title: nftTitle,
        thumbnailPhotoId,
        thumbnailPhoto: {
          storageBag: { distributionBuckets }
        }
      }
    }) => ({
      nftTitle,
      channelName,
      joyAmount: (Number(lastSalePrice) / 10_000_000_000).toString(),
      lastSaleDate,
      imageUrl: `${distributionBuckets[0].operators[0].metadata.nodeEndpoint}api/v1/assets/${thumbnailPhotoId}`,
      videoUrl: `https://gleev.xyz/video/${videoId}`
    })
  );
};

export default getCarouselData;
